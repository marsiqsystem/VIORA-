// Background warm-up for the free-OSM pincode geo cache (geoPincode.js).
//
// The address engine reads pincode geo (locality + nearest landmark) ONLY from a
// KV cache, because the landmark source (Overpass) is far too slow to call inline.
// This cron fills that cache: it finds the distinct pincodes of the still-to-ship
// orders, and for each one that isn't fully cached yet it does the Nominatim +
// Overpass lookups and stores the result (6-month TTL). Each pincode is fetched
// AT MOST ONCE, ever (then it's served from cache for every future order in that
// area), so over a few runs the whole active footprint is warm and stays warm.
//
// Overpass is slow/flaky, so we process a handful per run under a wall-clock budget
// and let the schedule chip away. Fully idempotent; never throws.
//
//   GET /api/cron/geo-fill            (Vercel Cron; Authorization: Bearer CRON_SECRET)
//   GET /api/cron/geo-fill?limit=5    tune how many pincodes to warm this run
//   GET /api/cron/geo-fill?pin=700057 warm one specific pincode (manual, force)

import { NextRequest, NextResponse } from "next/server";
import * as ordersStore from "@/lib/crm/orders-store";
import { isPendingShip } from "@/lib/crm/addressPipeline";
import { getPincodeGeo, fillPincodeGeo } from "@/lib/crm/geoPincode";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const pinOf = (o: any) => String(o?.address?.postalCode || "").match(/[1-9]\d{5}/)?.[0] || "";

async function run(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const key = req.nextUrl.searchParams.get("key") || "";
  const authHeaderOk = !secret || req.headers.get("authorization") === `Bearer ${secret}`;
  // Allow a manual trigger with ?key=CRON_SECRET too (so it can be warmed by hand).
  if (!authHeaderOk && !(secret && key === secret)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const sp = req.nextUrl.searchParams;
  const onePin = String(sp.get("pin") || "").replace(/\D/g, "");
  const limit = Math.min(30, Math.max(1, parseInt(sp.get("limit") || "5", 10)));
  const started = Date.now();
  const BUDGET_MS = 240_000; // leave headroom under maxDuration

  try {
    // Manual single-pincode warm (forced refresh).
    if (onePin.length === 6) {
      const rec = await fillPincodeGeo(onePin, { force: true });
      return NextResponse.json({
        ok: true,
        mode: "single",
        pin: onePin,
        record: rec && { localityLine: rec.localityLine, bestLandmark: rec.bestLandmark, landmarks: rec.landmarks?.length || 0, lmOk: rec.lmOk },
      });
    }

    // Distinct pincodes of the still-to-ship orders, most-recent order first.
    const { orders } = await ordersStore.listOrders({ limit: 3000 });
    const pending = orders
      .filter((o: any) => isPendingShip(o))
      .sort((a: any, b: any) => (parseInt(b.orderId, 10) || 0) - (parseInt(a.orderId, 10) || 0));
    const seen = new Set<string>();
    const pins: string[] = [];
    for (const o of pending) {
      const p = pinOf(o);
      if (p && !seen.has(p)) { seen.add(p); pins.push(p); }
    }

    // Keep only pincodes not already fully cached (no locality, or Overpass hasn't
    // answered yet). getPincodeGeo is a fast cache read.
    const todo: string[] = [];
    for (const p of pins) {
      const g = await getPincodeGeo(p);
      if (!g || g.localityLine == null || !g.lmOk) todo.push(p);
      if (todo.length >= limit) break;
    }

    const filled: any[] = [];
    for (const p of todo) {
      if (Date.now() - started > BUDGET_MS) break;
      const rec = await fillPincodeGeo(p);
      if (rec) filled.push({ pin: p, localityLine: rec.localityLine, bestLandmark: rec.bestLandmark, landmarks: rec.landmarks?.length || 0, lmOk: rec.lmOk });
    }

    const counts = { distinctPending: pins.length, needed: todo.length, filled: filled.length };
    console.log("[cron/geo-fill]", JSON.stringify(counts));
    return NextResponse.json({ ok: true, counts, filled });
  } catch (err: any) {
    console.error("[cron/geo-fill] error:", err?.message || err);
    return NextResponse.json({ ok: false, error: err?.message || String(err) }, { status: 500 });
  }
}

export const GET = run;
export const POST = run;
