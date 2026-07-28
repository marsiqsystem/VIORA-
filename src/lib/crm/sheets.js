// Lead logger — appends every incoming WhatsApp chat to a Google Sheet.
//
// Approach: a Google Apps Script Web App acts as the "Sheets API", so we avoid
// service-account JSON keys and OAuth. You deploy a tiny script bound to your
// sheet, and we just POST rows to its URL. Set SHEETS_WEBHOOK_URL in .env.
//
// ---------------------------------------------------------------------------
// One-time setup (Apps Script):
//   1. Open your Google Sheet → Extensions → Apps Script.
//   2. Paste and save:
//
//        function doPost(e) {
//          var token = PropertiesService.getScriptProperties().getProperty('TOKEN');
//          var body  = JSON.parse(e.postData.contents);
//          if (token && e.parameter.token !== token) {
//            return ContentService.createTextOutput('unauthorized');
//          }
//          var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
//          sheet.appendRow([body.timestamp, body.name, body.phone, body.message]);
//          return ContentService.createTextOutput('ok');
//        }
//
//   3. (optional) Project Settings → Script Properties → add TOKEN = <secret>,
//      and put the same value in SHEETS_WEBHOOK_TOKEN.
//   4. Deploy → New deployment → Web app → Execute as "me",
//      Who has access "Anyone" → copy the /exec URL into SHEETS_WEBHOOK_URL.
// ---------------------------------------------------------------------------
//
// Never throws — a logging failure must not break the reply flow.

function config() {
  return {
    url: process.env.SHEETS_WEBHOOK_URL,
    token: process.env.SHEETS_WEBHOOK_TOKEN,
  };
}

const isConfigured = () => Boolean(config().url);

/**
 * Append one lead/interaction row to the sheet.
 * @param {object} row
 * @param {string} row.name
 * @param {string} row.phone
 * @param {string} row.message
 * @param {string|number} [row.timestamp]  ISO string or epoch; defaults to now.
 * @returns {Promise<{ok:boolean, skipped?:boolean, error?:any}>}
 */
async function logLead({ name, phone, message, timestamp } = {}) {
  const { url, token } = config();
  if (!url) {
    console.log("[sheets] SHEETS_WEBHOOK_URL not set — skipping lead log.");
    return { ok: false, skipped: true };
  }

  const payload = {
    timestamp: timestamp || new Date().toISOString(),
    name: name || "",
    phone: phone || "",
    message: message || "",
  };

  const target = token ? `${url}?token=${encodeURIComponent(token)}` : url;
  try {
    const res = await fetch(target, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      redirect: "follow", // Apps Script /exec responds via a 302 redirect
    });
    if (!res.ok) {
      console.error(`[sheets] append failed (HTTP ${res.status}).`);
      return { ok: false, error: `HTTP ${res.status}` };
    }
    console.log(`[sheets] logged lead: ${phone} — "${String(message).slice(0, 40)}"`);
    return { ok: true };
  } catch (error) {
    console.error("[sheets] network error:", error);
    return { ok: false, error };
  }
}

export { logLead, isConfigured };
