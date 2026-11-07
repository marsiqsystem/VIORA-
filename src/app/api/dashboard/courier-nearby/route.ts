// Nearest-courier-branch finder for the dashboard (boss's "bagal me kaunsa
// courier counter hai" ask). Grounded-LLM lookup, cached per pincode.
//
//   GET/POST /api/dashboard/courier-nearby?key=<INBOX_SECRET>&pin=122017[&force=1]
//        optional: &state=Haryana&city=Gurugram&locality=Palam%20Vihar
//        or &orderId=<num> to pull pin/locality/state from the stored order.
//     -> { ok, pin, record:{counters,grounded,sources,...}, suggestion:{...} }
//
// `force=1` does the (expensive) grounded Gemini call and caches it; without
// force it reuses the per-pincode cache. This same endpoint is how we verify, on
// the real prod key, whether Google-Search grounding is available on the free tier
// (the record carries `grounded` + `aiError`). Read-only: never ships/writes.

import { NextRequest, NextResponse } from "next/server";
import { authOk, authConfigured, keyFromRequest } from "@/lib/crm/inbox-store";
import * as ordersStore from "@/lib/crm/orders-store";
import { getCourierProximity, fillCourierProximity, suggestNearestCourier } from "@/lib/crm/courierProximity";
import { getPincodeGeo } from "@/lib/crm/geoPincode";
import { best3, fullState } from "@/lib/crm/carrierEngine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function handle(req: NextRequest) {
  if (!authConfigured()) return NextResponse.json({ ok: false, error: "INBOX_SECRET not set" }, { status: 503 });
  if (!authOk(keyFromRequest(req))) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  let pin = sp.get("pin") || "";
  let state = sp.get("state") || "";
  let city = sp.get("city") || "";
  let locality = sp.get("locality") || "";
  const orderId = (sp.get("orderId") || "").trim();
  let force = sp.get("force") === "1";
  if (req.method === "POST") {
    try {
      const b = await req.json();
      pin = String(b?.pin || pin);
      state = String(b?.state || state);
      city = String(b?.city || city);
      locality = String(b?.locality || locality);
      if (b?.force) force = true;
    } catch {
      /* query params only */
    }
  }

  // Pull address context from a stored order when given (nicer grounding).
  if (orderId && !pin) {
    const order: any = await ordersStore.getOrder(orderId);
    const a = order?.address || {};
    pin = pin || String(a.postalCode || a.pincode || "");
    state = state || String(a.state || "");
    city = city || String(a.city || "");
    locality = locality || String(a.line2 || "");
  }

  pin = String(pin).replace(/\D/g, "");
  if (pin.length !== 6) return NextResponse.json({ ok: false, error: "valid 6-digit pin required" }, { status: 400 });

  // Fill from our free OSM geo cache if locality is still unknown.
  if (!locality || !city) {
    const geo: any = await getPincodeGeo(pin);
    if (geo) {
      locality = locality || geo.localityLine || "";
      city = city || geo?.locality?.town || geo?.locality?.cityDistrict || "";
      state = state || geo?.locality?.state || "";
    }
  }

  // Diagnostics (isolate a 429 as grounding-specific vs model-specific):
  //   &nogrounding=1  -> call without the google_search tool
  //   &model=gemini-3.5-flash-lite -> override the model
  const grounding = sp.get("nogrounding") === "1" ? false : undefined;
  const modelOverride = sp.get("model") || undefined;

  const record = force
    ? await fillCourierProximity(pin, { force: true, locality, city, state, grounding, model: modelOverride })
    : (await getCourierProximity(pin)) || (await fillCourierProximity(pin, { locality, city, state, grounding, model: modelOverride }));

  const suggestion = await suggestNearestCourier(pin, fullState(state), { best3 });

  return NextResponse.json({ ok: true, pin, context: { state, city, locality }, record, suggestion });
}

export async function GET(req: NextRequest) {
  return handle(req);
}
export async function POST(req: NextRequest) {
  return handle(req);
}
