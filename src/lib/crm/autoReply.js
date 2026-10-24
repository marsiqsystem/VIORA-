// Orchestrates what happens for each incoming WhatsApp customer message:
//   1. Log the interaction to Google Sheets (lead tracking).
//   2. If AI auto-reply is enabled, ask Gemini for a reply using the Viora
//      persona, and send it back via WhatsApp.
//
// Both steps are independently gated and failure-isolated: Sheets logging runs
// even if AI is off, and an AI/send failure never stops logging (or crashes).
//
// Gating:
//   AI_AUTOREPLY_ENABLED=true   -> actually call Gemini
//   WHATSAPP_SEND_ENABLED=true  -> actually deliver the reply (else dry-run log)
// So with both false (the default), an inbound message is parsed, logged (if a
// sheet URL is set), and the intended AI reply is simulated — nothing is sent.

import { parseInbound } from "./whatsappInbound";
import { logLead } from "./sheets";
import { generateReply, isConfigured as aiConfigured } from "./gemini";
import { sendText } from "./whatsapp";
import { VIORA_SYSTEM_PROMPT } from "./prompts";
import {
  recordOutbound,
  setAwaitingAddress,
  getAwaitingAddress,
  clearAwaitingAddress,
} from "./inbox-store";
import { findLatestOrderByPhone, updateOrder, getOrder } from "./orders-store";
import { extractPincode, lookupPincode, buildStructuredAddress } from "./pincode";

const aiEnabled = () =>
  String(process.env.AI_AUTOREPLY_ENABLED).toLowerCase() === "true";

// Fixed acknowledgements for the order-confirmation quick-reply buttons. These
// are NOT AI — they fire whenever the customer taps Confirm/Cancel, regardless
// of AI_AUTOREPLY_ENABLED. The tap opens the 24h service window, so a free-form
// text reply is allowed. Override via env if you want different wording.
const CONFIRM_REPLY =
  process.env.WA_CONFIRM_REPLY ||
  "Thank you for confirming your order! 🎉 We're preparing it now and will notify you the moment it's dispatched. — Team Viora Jewels";
const CANCEL_REPLY =
  process.env.WA_CANCEL_REPLY ||
  "We've received your cancellation request. Our team will reach out to you shortly. If you tapped this by mistake, just reply here and we'll keep your order safe. — Team Viora Jewels";
// Shown when the customer taps ✏️ Change address — we then capture their very
// next message as the corrected delivery address (see handleAddressCapture).
const CHANGE_ADDR_PROMPT =
  process.env.WA_CHANGE_ADDR_PROMPT ||
  "No problem! 📍 Please reply to this chat with your full delivery address — house/flat, street, area, city, state and your 6-digit pincode. We'll update your order right away. — Team Viora Jewels";

/**
 * Classify a message as an order_confirmation button tap. Quick-reply taps arrive
 * as type "button" (button.text) or "interactive" (button_reply.title);
 * parseInbound already put that title into msg.text. The v2 template has three
 * buttons — ✅ Confirm order, ❌ Cancel order, ✏️ Change address.
 * Returns "CONFIRM" | "CANCEL" | "CHANGE_ADDRESS" | null. Order matters: "change
 * address" is checked before "cancel"/"confirm" so its wording can't collide.
 */
function buttonIntent(msg) {
  if (msg.type !== "button" && msg.type !== "interactive") return null;
  const t = String(msg.text || "").toLowerCase();
  if (t.includes("address") || t.includes("change")) return "CHANGE_ADDRESS";
  if (t.includes("cancel")) return "CANCEL";
  if (t.includes("confirm")) return "CONFIRM";
  return null;
}

/**
 * Mark the order a Confirm/Cancel tap refers to. The button tap only tells us
 * the sender's phone, so we resolve it to their latest open order. Mirrors the
 * dashboard call-resolve semantics: CONFIRM stamps callOutcome=confirmed (the
 * order leaves the Call Queue and is ship-ready); CANCEL sets status=cancelled.
 * Best-effort — a missing order or KV blip just means no status change (the
 * customer still gets the acknowledgement). Never throws.
 */
// Statuses past the point where a customer button tap should still flip the
// order: it's already shipped or finished. A late ❌ Cancel tap must NOT turn a
// dispatched/delivered parcel into "cancelled" in our books — the operator
// handles those by hand. CONFIRM on such an order is just a no-op.
const SHIPPED_OR_DONE = new Set([
  "dispatched",
  "out_for_delivery",
  "delivered",
  "rto",
  "cancelled",
]);

async function markOrderFromButton(phone, intent) {
  try {
    const order = await findLatestOrderByPhone(phone);
    if (!order?.orderId) {
      console.log(`[auto-reply] ${intent}: no order matched phone ${phone} — ack only.`);
      return null;
    }
    const status = String(order.status || "").toLowerCase();
    // Never flip an already-shipped/finished order from a stray button tap.
    if (SHIPPED_OR_DONE.has(status)) {
      console.log(
        `[auto-reply] ${intent}: order #${order.orderId} is '${status}' — no status change (safety).`
      );
      return { ...order, _skipped: true };
    }
    const now = Date.now();
    if (intent === "CANCEL") {
      await updateOrder(order.orderId, {
        status: "cancelled",
        statusAt: now,
        callOutcome: "cancelled",
        callNote: "Customer tapped ❌ Cancel on the WhatsApp confirmation.",
        callResolvedAt: now,
      });
    } else {
      await updateOrder(order.orderId, {
        callOutcome: "confirmed",
        callNote: "Customer tapped ✅ Confirm on the WhatsApp confirmation.",
        callResolvedAt: now,
      });
    }
    console.log(`[auto-reply] ${intent} applied to order #${order.orderId}.`);
    return order;
  } catch (e) {
    console.error("[auto-reply] markOrderFromButton failed:", e?.message || e);
    return null;
  }
}

/**
 * Fold a free-text message into the awaiting order's delivery address. Fires only
 * when the customer earlier tapped ✏️ Change address (we stored the order id
 * against their phone). Resolves any 6-digit pincode in the text to city+state,
 * saves a structured address, stamps the order confirmed, clears the wait, and
 * acknowledges with the captured address. Returns true when it handled the
 * message (so the caller skips the AI path). Never throws.
 */
async function handleAddressCapture(msg) {
  if (!msg.text) return false;
  let orderId = "";
  try { orderId = await getAwaitingAddress(msg.from); } catch { orderId = ""; }
  if (!orderId) return false;

  const text = String(msg.text).trim();

  // Guard against a non-address reply ("ok", "yes", "thanks", an emoji) being
  // written over the delivery address. A real address has a 6-digit pincode OR
  // is at least a dozen characters long. If it's neither, keep waiting and
  // re-ask once — do NOT overwrite the order.
  const hasPin = !!extractPincode(text);
  if (!hasPin && text.replace(/\s/g, "").length < 12) {
    const nudge =
      "Please send your FULL delivery address in one message — house/flat, street, " +
      "area, city, state and your 6-digit pincode. — Team Viora Jewels";
    const s = await sendText({ to: msg.from, body: nudge });
    await recordOutbound({
      to: msg.from, text: nudge, wamid: s?.data?.messages?.[0]?.id,
      status: s?.dryRun ? "pending" : "sent",
    });
    console.log(`[auto-reply] address capture: reply from ${msg.from} too thin — re-asked, still waiting.`);
    return true; // handled (kept awaiting state), don't run AI
  }

  // Validate the pincode in the new address. A 6-digit pincode that India Post
  // doesn't recognise (e.g. "Kolkata 810046" — no such PIN), or no pincode at
  // all, means we must NOT auto-confirm and ship: we save the address but leave
  // the order OPEN so the Call Queue surfaces it for a human to verify. Only a
  // real, resolvable pincode auto-confirms the order.
  let pinValid = false;
  let city = "";
  let state = "";
  let pin = extractPincode(text);
  try {
    const order = (await getOrder(orderId)) || {};
    const a = order.address || {};
    if (!pin) pin = String(a.postalCode || "").replace(/\D/g, "");
    city = a.city || "";
    state = a.state || "";
    if (pin && pin.length === 6) {
      try {
        const looked = await lookupPincode(pin);
        if (looked && looked.state) {
          pinValid = true;
          if (looked.city) city = looked.city;
          if (looked.state) state = looked.state;
        }
      } catch { /* lookup blip — treat as unverified, flag for review */ }
    }
    const address = buildStructuredAddress(text, { pincode: pin, city, state, country: "India" });
    const now = Date.now();
    const patch = {
      address,
      addressText: text,
      addressEdited: true,
      callResolvedAt: now,
    };
    if (pinValid) {
      // Good address → confirm + ship-ready.
      patch.callOutcome = "confirmed";
      patch.callNote = "Customer sent a corrected address via WhatsApp (Change address).";
      patch.addressNeedsReview = false;
    } else {
      // Bad / unresolvable pincode → keep OPEN for Call Queue review, do NOT confirm.
      patch.addressNeedsReview = true;
      patch.callNote = `Customer sent a new address via WhatsApp but the pincode (${pin || "none"}) could not be verified — needs a human check before shipping.`;
      // Clear any prior "confirmed" so it re-enters the Call Queue.
      if (order.callOutcome === "confirmed") patch.callOutcome = "";
    }
    await updateOrder(orderId, patch);
  } catch (e) {
    console.error("[auto-reply] handleAddressCapture update failed:", e?.message || e);
    // fall through to still clear the wait + acknowledge, so we don't loop.
  }

  await clearAwaitingAddress(msg.from);
  const ack = pinValid
    ? "Thank you! ✅ We've updated your delivery address to:\n" +
      `“${text}”\n` +
      "Your order is confirmed and we'll ship it here. If anything looks wrong, just reply. — Team Viora Jewels"
    : "Thank you! 📍 We've noted your address:\n" +
      `“${text}”\n` +
      "Our team will quickly verify the pincode and confirm your order shortly. — Team Viora Jewels";
  const sent = await sendText({ to: msg.from, body: ack });
  await recordOutbound({
    to: msg.from,
    text: ack,
    wamid: sent?.data?.messages?.[0]?.id,
    status: sent?.dryRun ? "pending" : "sent",
  });
  console.log(`[auto-reply] address captured for order #${orderId} from ${msg.from} (pinValid=${pinValid}).`);
  return true;
}

/** Handle one parsed inbound message. Never throws. */
async function handleMessage(msg) {
  const iso = msg.timestamp
    ? new Date(Number(msg.timestamp) * 1000).toISOString()
    : new Date().toISOString();

  console.log(
    `[auto-reply] from=${msg.from} name="${msg.name}" type=${msg.type} text="${msg.text}"`
  );

  // 1) Lead logging (independent of AI).
  await logLead({ name: msg.name, phone: msg.from, message: msg.text, timestamp: iso });

  // 2) Order-confirmation button taps (order_confirmation_v2: ✅ Confirm /
  //    ❌ Cancel / ✏️ Change address) get a fixed acknowledgement (no AI) AND
  //    update the order so the dashboard reflects the customer's choice.
  const intent = buttonIntent(msg);
  if (intent) {
    if (intent === "CHANGE_ADDRESS") {
      // Remember which order to attach the next reply to, then ask for the
      // address. If we can't match an order, still ask (capture just won't fire).
      const order = await findLatestOrderByPhone(msg.from);
      if (order?.orderId) await setAwaitingAddress(msg.from, order.orderId);
      const sent = await sendText({ to: msg.from, body: CHANGE_ADDR_PROMPT });
      await recordOutbound({
        to: msg.from,
        text: CHANGE_ADDR_PROMPT,
        wamid: sent?.data?.messages?.[0]?.id,
        status: sent?.dryRun ? "pending" : "sent",
      });
      console.log(
        `[auto-reply] CHANGE_ADDRESS: awaiting new address from ${msg.from}` +
          (order?.orderId ? ` for order #${order.orderId}.` : " (no order matched).")
      );
      return; // handled
    }

    // Confirm / Cancel: mark the order, then acknowledge.
    await markOrderFromButton(msg.from, intent);
    const body = intent === "CONFIRM" ? CONFIRM_REPLY : CANCEL_REPLY;
    const sent = await sendText({ to: msg.from, body });
    if (sent.dryRun)
      console.log(`[auto-reply] ${intent} ack simulated (WHATSAPP_SEND_ENABLED=false).`);
    else if (sent.ok) console.log(`[auto-reply] ${intent} ack delivered to ${msg.from}.`);
    else console.error(`[auto-reply] ${intent} ack send failed:`, sent.error || sent.data);
    // Mirror the ack into the inbox thread (best-effort, never blocks).
    await recordOutbound({
      to: msg.from,
      text: body,
      wamid: sent?.data?.messages?.[0]?.id,
      status: sent?.dryRun ? "pending" : "sent",
    });
    return; // handled — don't also run the AI path on a button tap
  }

  // 2b) If the customer earlier tapped ✏️ Change address, their next text is
  //     their corrected address — capture it into the order (no AI). This runs
  //     before the AI path so the address never gets treated as a chat message.
  if (await handleAddressCapture(msg)) return;

  // Only text-bearing messages get an AI reply.
  if (!msg.text) {
    console.log("[auto-reply] non-text message — logged only, no AI reply.");
    return;
  }

  // 3) AI reply.
  if (!aiEnabled()) {
    console.log("[auto-reply] AI_AUTOREPLY_ENABLED=false — skipping Gemini (dry).");
    return;
  }
  if (!aiConfigured()) {
    console.warn("[auto-reply] AI enabled but GEMINI_API_KEY missing — cannot reply.");
    return;
  }

  const ai = await generateReply(msg.text, { systemPrompt: VIORA_SYSTEM_PROMPT });
  if (!ai.ok) {
    console.error("[auto-reply] Gemini failed — no reply sent:", ai.error);
    return;
  }
  console.log(`[auto-reply] Gemini: "${ai.text}"`);

  // 3) Send back to the customer. Free-form text is allowed here because the
  // customer just messaged us (their 24-hour window is open). Send is itself
  // gated by WHATSAPP_SEND_ENABLED inside sendText().
  const sent = await sendText({ to: msg.from, body: ai.text });
  if (sent.dryRun) console.log("[auto-reply] reply simulated (WHATSAPP_SEND_ENABLED=false).");
  else if (sent.ok) console.log("[auto-reply] reply delivered.");
  else console.error("[auto-reply] reply send failed:", sent.error || sent.data);
  // Mirror the AI reply into the inbox thread (best-effort, never blocks).
  await recordOutbound({
    to: msg.from,
    text: ai.text,
    wamid: sent?.data?.messages?.[0]?.id,
    status: sent?.dryRun ? "pending" : "sent",
  });
}

/** Entry point: parse a raw webhook body and handle every inbound message. */
async function handleInbound(body) {
  const { messages, statusCount } = parseInbound(body);
  if (statusCount && !messages.length) {
    // Delivery/read receipt only — nothing to do.
    return;
  }
  for (const msg of messages) {
    try {
      await handleMessage(msg);
    } catch (err) {
      console.error("[auto-reply] handler error:", err);
    }
  }
}

export { handleInbound, handleMessage };
