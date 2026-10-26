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
  setAwaitingChoice,
  getAwaitingChoice,
  clearAwaitingChoice,
  setLastTap,
  getLastTap,
  clearLastTap,
} from "./inbox-store";
import { findLatestOrderByPhone, updateOrder, getOrder } from "./orders-store";
import { extractPincode, lookupPincode, buildStructuredAddress } from "./pincode";
import { sendOrderCancelled } from "./notify";
import { handleReviewReply } from "./reviewCapture";

const aiEnabled = () =>
  String(process.env.AI_AUTOREPLY_ENABLED).toLowerCase() === "true";

// Fixed acknowledgements for the order-confirmation quick-reply buttons. These
// are NOT AI — they fire whenever the customer taps Confirm/Cancel, regardless
// of AI_AUTOREPLY_ENABLED. The tap opens the 24h service window, so a free-form
// text reply is allowed. Override via env if you want different wording.
const CONFIRM_REPLY =
  process.env.WA_CONFIRM_REPLY ||
  "Thank you for confirming your order! 🎉 We're preparing it now and will notify you the moment it's dispatched. — Team Viora Jewels";
// Two-step cancel: a ❌ Cancel tap no longer cancels on its own — we ask the
// customer to confirm. Only a "CANCEL" text reply actually cancels the order
// (and triggers the firm order_cancelled_v1 message); "CONFIRM" keeps it. This
// prevents a mis-tap (or the multi-button glitch) from silently killing a live
// order.
const CANCEL_CONFIRM_PROMPT =
  process.env.WA_CANCEL_CONFIRM_PROMPT ||
  "Are you sure you want to *cancel* this order? 😟\n\nReply *CANCEL* to confirm the cancellation, or *CONFIRM* to keep your order and we'll ship it. — Team Viora Jewels";
// Sent when the customer taps conflicting buttons (e.g. ✅ Confirm and then
// ❌ Cancel within a few minutes). We take NO automatic action and ask them to
// clarify; the order is also flagged in the dashboard Call Queue for a human.
const CONFLICT_CLARIFY_PROMPT =
  process.env.WA_CONFLICT_CLARIFY_PROMPT ||
  "We noticed a couple of taps on your order and want to get it right 🙏\n\nDo you want to *keep* this order or *cancel* it?\n\nReply *CONFIRM* to keep it (we'll ship it), or *CANCEL* to cancel. — Team Viora Jewels";
// Final acknowledgement after the customer confirms they really want to cancel
// (the firm order_cancelled_v1 template is also sent — this is the inline ack).
const CANCELLED_DONE_REPLY =
  process.env.WA_CANCELLED_DONE_REPLY ||
  "Your order has been cancelled. 💛 If this was a mistake or you'd like to reorder, just reply here — we're happy to help. — Team Viora Jewels";
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
        // A clean Confirm clears any earlier conflicting-taps flag.
        tapConflict: false,
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
 * Actually cancel an order the customer has confirmed they want cancelled (typed
 * "CANCEL" after the two-step prompt). Respects the shipped/finished safety guard
 * — a parcel already on its way is never turned into "cancelled" from a chat
 * reply; the operator handles those by hand. Sends the firm order_cancelled_v1
 * message on a real cancellation. Returns "cancelled" | "too-late" | "no-order".
 * Never throws.
 */
async function hardCancelOrder(orderId) {
  try {
    const order = (await getOrder(orderId)) || null;
    if (!order?.orderId) return "no-order";
    const status = String(order.status || "").toLowerCase();
    if (SHIPPED_OR_DONE.has(status) && status !== "cancelled") {
      console.log(`[auto-reply] hardCancel: order #${orderId} is '${status}' — too late, operator handles.`);
      return "too-late";
    }
    const now = Date.now();
    await updateOrder(orderId, {
      status: "cancelled",
      statusAt: now,
      callOutcome: "cancelled",
      callNote: "Customer confirmed cancellation via WhatsApp (two-step Cancel).",
      callResolvedAt: now,
      tapConflict: false,
    });
    // Firm, branded cancellation message (order_cancelled_v1) — logs itself into
    // the inbox thread. Best-effort; never blocks the flow.
    try { await sendOrderCancelled({ ...order, status: "cancelled" }); } catch (e) {
      console.error("[auto-reply] sendOrderCancelled failed:", e?.message || e);
    }
    console.log(`[auto-reply] order #${orderId} cancelled (customer-confirmed).`);
    return "cancelled";
  } catch (e) {
    console.error("[auto-reply] hardCancelOrder failed:", e?.message || e);
    return "no-order";
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

  // Never let a late address reply REVIVE an order that's already cancelled (or
  // otherwise shipped/finished). If the customer cancelled and then sends an
  // address, the order stays cancelled — we don't silently re-open and ship it.
  try {
    const existing = (await getOrder(orderId)) || {};
    const st = String(existing.status || "").toLowerCase();
    if (SHIPPED_OR_DONE.has(st)) {
      await clearAwaitingAddress(msg.from);
      const note =
        st === "cancelled"
          ? "This order was cancelled, so we haven't changed its address. If you'd like to reorder or need help, just reply here. — Team Viora Jewels"
          : "This order is already on its way, so the delivery address can't be changed here. Reply if you need help and our team will assist. — Team Viora Jewels";
      const s = await sendText({ to: msg.from, body: note });
      await recordOutbound({
        to: msg.from, text: note, wamid: s?.data?.messages?.[0]?.id,
        status: s?.dryRun ? "pending" : "sent",
      });
      console.log(`[auto-reply] address capture skipped for #${orderId} — status '${st}' (no revive).`);
      return true;
    }
  } catch { /* if we can't read it, fall through to the normal capture */ }

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

// Send a text reply AND mirror it into the inbox thread (best-effort). Keeps the
// three near-identical send+record blocks below to one line each.
async function replyText(to, body) {
  const sent = await sendText({ to, body });
  if (sent?.dryRun) console.log(`[auto-reply] reply simulated (WHATSAPP_SEND_ENABLED=false).`);
  else if (sent?.ok) console.log(`[auto-reply] reply delivered to ${to}.`);
  else console.error(`[auto-reply] reply send failed:`, sent?.error || sent?.data);
  await recordOutbound({
    to, text: body, wamid: sent?.data?.messages?.[0]?.id,
    status: sent?.dryRun ? "pending" : "sent",
  });
  return sent;
}

// A ✅ Confirm then ❌ Cancel (or vice-versa) landing within this window is read
// as a CONFLICT rather than "the last tap wins".
const TAP_CONFLICT_WINDOW_MS = 15 * 60 * 1000;
const isOppositeTap = (prev, next) =>
  (prev === "CONFIRM" && next === "CANCEL") || (prev === "CANCEL" && next === "CONFIRM");

/**
 * Handle one order_confirmation_v2 button tap (✅ Confirm / ❌ Cancel / ✏️ Change
 * address) with conflict-awareness and a two-step Cancel:
 *  - While a cancel/keep decision is already pending, a tap RESOLVES it (Confirm
 *    keeps; Cancel is nudged to a typed CANCEL so a stray tap can't kill a live
 *    order; Change address drops the pending cancel and fixes the address).
 *  - A quick OPPOSITE tap (Confirm↔Cancel) is a CONFLICT: no auto-action, ask the
 *    customer to clarify, and flag the order in the Call Queue for a human.
 *  - ❌ Cancel is two-step: it asks to confirm instead of cancelling outright.
 * Never throws.
 */
async function handleButtonTap(msg, intent) {
  const phone = msg.from;

  // (a) Already waiting on a cancel/keep decision? A tap resolves THAT, and is
  //     never re-interpreted as a fresh (possibly conflicting) tap.
  let pending = "";
  try { pending = await getAwaitingChoice(phone); } catch { pending = ""; }
  if (pending) {
    if (intent === "CONFIRM") {
      await clearAwaitingChoice(phone);
      await clearLastTap(phone);
      await markOrderFromButton(phone, "CONFIRM");
      await replyText(phone, CONFIRM_REPLY);
      console.log(`[auto-reply] pending choice -> KEEP (Confirm tap) for #${pending}.`);
      return;
    }
    if (intent === "CANCEL") {
      // Don't cancel on a button tap — a stray tap must never kill the order.
      // Require a typed CANCEL to actually cancel.
      await replyText(
        phone,
        "To cancel, please *type* the word CANCEL and send it. Or tap/type *CONFIRM* to keep your order. — Team Viora Jewels"
      );
      console.log(`[auto-reply] pending choice: Cancel tap for #${pending} — asked to TYPE cancel.`);
      return;
    }
    // CHANGE_ADDRESS while pending: they clearly want the order — fall through to
    // the change-address branch, which clears the pending cancel first.
  }

  // (b) Conflict detection (only for a brand-new tap, not a pending resolution).
  const prev = await getLastTap(phone);
  const conflict =
    prev && isOppositeTap(prev.intent, intent) &&
    Date.now() - Number(prev.at || 0) < TAP_CONFLICT_WINDOW_MS;
  await setLastTap(phone, intent);

  if (conflict) {
    await clearAwaitingAddress(phone);
    const order = await findLatestOrderByPhone(phone);
    if (order?.orderId) {
      await setAwaitingChoice(phone, order.orderId); // a CONFIRM/CANCEL reply resolves it
      await updateOrder(order.orderId, {
        callOutcome: "", // re-enter the Call Queue
        tapConflict: true,
        callNote:
          "⚠️ Conflicting WhatsApp taps (Confirm & Cancel) within minutes — call to clarify whether to ship or cancel.",
      });
    }
    await replyText(phone, CONFLICT_CLARIFY_PROMPT);
    console.log(`[auto-reply] CONFLICT ${prev.intent}->${intent} from ${phone} — clarify asked, flagged.`);
    return;
  }

  // (c) Change address: fixing the address means they want the order.
  if (intent === "CHANGE_ADDRESS") {
    await clearAwaitingChoice(phone);
    const order = await findLatestOrderByPhone(phone);
    if (order?.orderId) await setAwaitingAddress(phone, order.orderId);
    await replyText(phone, CHANGE_ADDR_PROMPT);
    console.log(
      `[auto-reply] CHANGE_ADDRESS: awaiting new address from ${phone}` +
        (order?.orderId ? ` for order #${order.orderId}.` : " (no order matched).")
    );
    return;
  }

  // (d) Cancel: two-step — ask to confirm, don't cancel yet.
  if (intent === "CANCEL") {
    const order = await findLatestOrderByPhone(phone);
    if (order?.orderId) {
      const st = String(order.status || "").toLowerCase();
      if (SHIPPED_OR_DONE.has(st) && st !== "cancelled") {
        await replyText(
          phone,
          "Your order is already on its way, so it can't be auto-cancelled here. Our team will reach out to help. — Team Viora Jewels"
        );
        console.log(`[auto-reply] CANCEL tap on '${st}' order #${order.orderId} — not auto-cancelled (safety).`);
        return;
      }
      await setAwaitingChoice(phone, order.orderId);
    }
    await replyText(phone, CANCEL_CONFIRM_PROMPT);
    console.log(`[auto-reply] CANCEL tap from ${phone} — asked to confirm (two-step).`);
    return;
  }

  // (e) Confirm: clean confirm.
  await clearAwaitingChoice(phone);
  await markOrderFromButton(phone, "CONFIRM");
  await replyText(phone, CONFIRM_REPLY);
  console.log(`[auto-reply] CONFIRM tap from ${phone} — order confirmed.`);
}

/**
 * Resolve a pending cancel/keep decision from the customer's TEXT reply (they
 * tapped ❌ Cancel, or we flagged conflicting taps). A typed "CANCEL" cancels the
 * order and sends the firm cancellation message; "CONFIRM"/"keep"/"yes" keeps it;
 * anything ambiguous re-asks once. Returns true when handled. Never throws.
 */
async function handleChoiceReply(msg) {
  if (!msg.text) return false;
  let orderId = "";
  try { orderId = await getAwaitingChoice(msg.from); } catch { orderId = ""; }
  if (!orderId) return false;

  const t = String(msg.text).trim().toLowerCase();
  const saysCancel = /\bcancel/.test(t);
  const saysKeep =
    /\b(confirm|keep|ship|haan|haa|rakh|rakho|chahiye|yes|yess|y)\b/.test(t) ||
    /\bdon'?t cancel\b/.test(t);

  if (saysCancel && !saysKeep) {
    await clearAwaitingChoice(msg.from);
    await clearLastTap(msg.from);
    const outcome = await hardCancelOrder(orderId);
    const body =
      outcome === "too-late"
        ? "Your order is already on its way, so it can't be cancelled here — our team will reach out to help. — Team Viora Jewels"
        : CANCELLED_DONE_REPLY;
    await replyText(msg.from, body); // firm template already sent by hardCancelOrder on a real cancel
    console.log(`[auto-reply] choice=CANCEL for #${orderId} (${outcome}).`);
    return true;
  }
  if (saysKeep && !saysCancel) {
    await clearAwaitingChoice(msg.from);
    await clearLastTap(msg.from);
    await markOrderFromButton(msg.from, "CONFIRM");
    await replyText(msg.from, CONFIRM_REPLY);
    console.log(`[auto-reply] choice=KEEP for #${orderId} — confirmed.`);
    return true;
  }
  // Ambiguous — keep waiting, re-ask once.
  await replyText(
    msg.from,
    "Just to confirm — reply *CANCEL* to cancel this order, or *CONFIRM* to keep it. — Team Viora Jewels"
  );
  console.log(`[auto-reply] choice reply from ${msg.from} ambiguous ("${t}") — re-asked.`);
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
  //    ❌ Cancel / ✏️ Change address). Conflict-aware, two-step Cancel — see
  //    handleButtonTap. Marks the order so the dashboard reflects the choice.
  const intent = buttonIntent(msg);
  if (intent) {
    await handleButtonTap(msg, intent);
    return; // handled — don't also run the AI path on a button tap
  }

  // 2a) If a cancel/keep decision is pending (they tapped ❌ Cancel, or we flagged
  //     conflicting taps), interpret their typed CANCEL / CONFIRM reply.
  if (await handleChoiceReply(msg)) return;

  // 2b) If the customer earlier tapped ✏️ Change address, their next text is
  //     their corrected address — capture it into the order (no AI). This runs
  //     before the AI path so the address never gets treated as a chat message.
  if (await handleAddressCapture(msg)) return;

  // 2c) WhatsApp-native review capture (gated by REVIEW_CAPTURE_ENABLED): after a
  //     review request, fold the customer's rating / words / photo into a review
  //     and post it to the website. Runs before the (text-only) AI guard so a
  //     photo-only reply is still captured. No-op when the feature is off.
  if (await handleReviewReply(msg)) return;

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
