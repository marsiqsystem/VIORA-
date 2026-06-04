import { NextRequest, NextResponse } from "next/server";
import { cookies, headers } from "next/headers";
import crypto from "crypto";

export const runtime = "nodejs";

type CapiRequestBody = {
  eventName: string;
  eventId: string;
  eventSourceUrl?: string;
  customData?: Record<string, unknown>;
  userData?: {
    email?: string;
    phone?: string;
    firstName?: string;
    lastName?: string;
    city?: string;
    state?: string;
    zip?: string;
    country?: string;
  };
};

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value.trim().toLowerCase()).digest("hex");
}

function hashUserData(userData?: CapiRequestBody["userData"]) {
  if (!userData) return {};
  const hashed: Record<string, string> = {};

  if (userData.email) {
    hashed.em = sha256(userData.email);
  }
  if (userData.phone) {
    let phoneDigits = userData.phone.replace(/[^0-9]/g, "");
    if (phoneDigits.length === 10) {
      phoneDigits = "91" + phoneDigits;
    }
    hashed.ph = sha256(phoneDigits);
  }
  if (userData.firstName) {
    hashed.fn = sha256(userData.firstName);
  }
  if (userData.lastName) {
    hashed.ln = sha256(userData.lastName);
  }
  if (userData.city) {
    hashed.ct = sha256(userData.city);
  }
  if (userData.state) {
    hashed.st = sha256(userData.state);
  }
  if (userData.zip) {
    hashed.zp = sha256(userData.zip);
  }
  if (userData.country) {
    hashed.country = sha256(userData.country);
  }

  return hashed;
}

export async function POST(req: NextRequest) {
  const pixelId = process.env.NEXT_PUBLIC_META_PIXEL_ID;
  const accessToken = process.env.META_CAPI_TOKEN;
  const testEventCode = process.env.META_TEST_EVENT_CODE;

  if (!pixelId || !accessToken) {
    return NextResponse.json(
      { ok: false, error: "Meta CAPI not configured" },
      { status: 200 }
    );
  }

  let body: CapiRequestBody;
  try {
    body = (await req.json()) as CapiRequestBody;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const { eventName, eventId, eventSourceUrl, customData, userData } = body;
  if (!eventName || !eventId) {
    return NextResponse.json(
      { ok: false, error: "eventName and eventId are required" },
      { status: 400 }
    );
  }

  const cookieStore = cookies();
  const fbp = cookieStore.get("_fbp")?.value;
  const fbc = cookieStore.get("_fbc")?.value;

  const h = headers();
  const userAgent = h.get("user-agent") || undefined;
  const forwardedFor = h.get("x-forwarded-for") || "";
  const clientIp =
    forwardedFor.split(",")[0].trim() ||
    h.get("x-real-ip") ||
    undefined;

  const payload: Record<string, unknown> = {
    data: [
      {
        event_name: eventName,
        event_time: Math.floor(Date.now() / 1000),
        event_id: eventId,
        event_source_url: eventSourceUrl,
        action_source: "website",
        user_data: {
          ...(fbp && { fbp }),
          ...(fbc && { fbc }),
          ...(clientIp && { client_ip_address: clientIp }),
          ...(userAgent && { client_user_agent: userAgent }),
          ...hashUserData(userData),
        },
        custom_data: customData || {},
      },
    ],
  };

  if (testEventCode) {
    payload.test_event_code = testEventCode;
  }

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

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      console.error("Meta CAPI error:", data);
      return NextResponse.json({ ok: false, status: res.status, data }, { status: 200 });
    }

    return NextResponse.json({ ok: true, data });
  } catch (err) {
    console.error("Meta CAPI request failed:", err);
    return NextResponse.json(
      { ok: false, error: String(err) },
      { status: 200 }
    );
  }
}
