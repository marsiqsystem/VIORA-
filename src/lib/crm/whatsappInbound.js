// Parses Meta's WhatsApp webhook POST body into a simple list of inbound
// customer messages. Pure function — testable against sample payloads.
//
// Meta sends deeply nested payloads:
//   entry[].changes[].value.messages[]   <- actual customer messages
//   entry[].changes[].value.contacts[]   <- sender profile name + wa_id
//   entry[].changes[].value.statuses[]   <- delivery/read receipts (NOT messages)
//
// We surface only real inbound messages; status callbacks are ignored so we
// don't AI-reply to our own delivery receipts.

/** Extract the human-readable text from a message of any supported type. */
function messageText(msg) {
  switch (msg.type) {
    case "text":
      return msg.text?.body || "";
    case "button":
      return msg.button?.text || "";
    case "interactive":
      return (
        msg.interactive?.button_reply?.title ||
        msg.interactive?.list_reply?.title ||
        ""
      );
    default:
      // image / audio / location / etc. — no plain text to reply to.
      return "";
  }
}

/**
 * @returns {{messages: Array<{from:string,name:string,text:string,type:string,messageId:string,timestamp:string}>, statusCount:number}}
 */
function parseInbound(body) {
  const messages = [];
  let statusCount = 0;

  for (const entry of body?.entry || []) {
    for (const change of entry?.changes || []) {
      const value = change?.value || {};

      // Map wa_id -> profile name from the contacts array.
      const nameByWaId = {};
      for (const c of value.contacts || []) {
        if (c?.wa_id) nameByWaId[c.wa_id] = c?.profile?.name || "";
      }

      statusCount += (value.statuses || []).length;

      for (const msg of value.messages || []) {
        // For image messages, surface the media id + caption too, so downstream
        // handlers (e.g. the WhatsApp-native review capture) can download the
        // photo and read any text the customer typed alongside it. messageText()
        // deliberately returns "" for images (nothing to AI-reply to), so caption
        // is carried separately and never changes the AI path.
        const image = msg.type === "image" ? msg.image : null;
        messages.push({
          from: msg.from, // sender phone, international digits (no +)
          name: nameByWaId[msg.from] || "",
          text: messageText(msg),
          type: msg.type,
          messageId: msg.id,
          timestamp: msg.timestamp, // epoch seconds as string
          ...(image?.id ? { imageId: image.id } : {}),
          ...(image?.caption ? { caption: image.caption } : {}),
        });
      }
    }
  }

  return { messages, statusCount };
}

export { parseInbound, messageText };
