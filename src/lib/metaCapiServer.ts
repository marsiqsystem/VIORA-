import crypto from "crypto";

// Server-side Meta Conversions API sender. Used for high-value events like
// Purchase where the browser-side Pixel/CAPI call can race with the redirect
// to /success. Firing a second, deterministic CAPI event from the server —
// with the SAME event_id the browser used — makes the event guaranteed to
// land, and Meta dedupes on event_id so no double-counting.

const sha256 = (value: string): string =>
  crypto.createHash("sha256").update(value.trim().toLowerCase()).digest("hex");

export type ServerCapiUserData = {
  email?: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
};

export type ServerCapiOptions = {
  eventName: string;
  eventId: string;
  eventSourceUrl?: string;
  fbp?: string;
  fbc?: string;
  clientIp?: string;
  userAgent?: string;
  userData?: ServerCapiUserData;
  customData?: Record<string, unknown>;
};

export async function sendServerCapi(opts: ServerCapiOptions): Promise<boolean> {
  const pixelId = process.env.NEXT_PUBLIC_META_PIXEL_ID;
  const accessToken = process.env.META_CAPI_TOKEN;
  const testEventCode = process.env.META_TEST_EVENT_CODE;
  if (!pixelId || !accessToken) return false;

  const user_data: Record<string, string> = {};
  if (opts.fbp) user_data.fbp = opts.fbp;
  if (opts.fbc) user_data.fbc = opts.fbc;
  if (opts.clientIp) user_data.client_ip_address = opts.clientIp;
  if (opts.userAgent) user_data.client_user_agent = opts.userAgent;

  const ud = opts.userData;
  if (ud?.email) user_data.em = sha256(ud.email);
  if (ud?.phone) {
    let phone = ud.phone.replace(/[^0-9]/g, "");
    if (phone.length === 10) phone = "91" + phone;
    user_data.ph = sha256(phone);
  }
  if (ud?.firstName) user_data.fn = sha256(ud.firstName);
  if (ud?.lastName) user_data.ln = sha256(ud.lastName);
  if (ud?.city) user_data.ct = sha256(ud.city);
  if (ud?.state) user_data.st = sha256(ud.state);
  if (ud?.zip) user_data.zp = sha256(ud.zip);
  if (ud?.country) user_data.country = sha256(ud.country);

  const payload: Record<string, unknown> = {
    data: [
      {
        event_name: opts.eventName,
        event_time: Math.floor(Date.now() / 1000),
        event_id: opts.eventId,
        event_source_url: opts.eventSourceUrl,
        action_source: "website",
        user_data,
        custom_data: opts.customData || {},
      },
    ],
  };
  if (testEventCode) payload.test_event_code = testEventCode;

  try {
    const res = await fetch(
      `https://graph.facebook.com/v19.0/${pixelId}/events?access_token=${encodeURIComponent(
        accessToken
      )}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }
    );
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      console.error("Server CAPI error:", data);
      return false;
    }
    return true;
  } catch (err) {
    console.error("Server CAPI request failed:", err);
    return false;
  }
}
