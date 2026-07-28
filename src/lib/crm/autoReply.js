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

/**
 * Classify a message as a Confirm/Cancel button tap. Quick-reply taps arrive as
 * type "button" (button.text) or "interactive" (button_reply.title); parseInbound
 * already put that title into msg.text. Returns "CONFIRM" | "CANCEL" | null.
 */
function buttonIntent(msg) {
  if (msg.type !== "button" && msg.type !== "interactive") return null;
  const t = String(msg.text || "").toLowerCase();
  if (t.includes("confirm")) return "CONFIRM";
  if (t.includes("cancel")) return "CANCEL";
  return null;
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

  // 2) Order-confirmation button taps get a fixed acknowledgement (no AI). This
  //    is the "Confirm Order" / "Cancel Order" flow from order_confirmation_v1.
  const intent = buttonIntent(msg);
  if (intent) {
    const body = intent === "CONFIRM" ? CONFIRM_REPLY : CANCEL_REPLY;
    const sent = await sendText({ to: msg.from, body });
    if (sent.dryRun)
      console.log(`[auto-reply] ${intent} ack simulated (WHATSAPP_SEND_ENABLED=false).`);
    else if (sent.ok) console.log(`[auto-reply] ${intent} ack delivered to ${msg.from}.`);
    else console.error(`[auto-reply] ${intent} ack send failed:`, sent.error || sent.data);
    return; // handled — don't also run the AI path on a button tap
  }

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
