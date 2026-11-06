// Free-OSM geo enrichment for Indian pincodes.
//
// India Post (pincode.js) gives us the district/state + post-office AREA names,
// but NOT a map position or real on-the-ground landmarks (a hospital, school,
// temple, market, station a delivery boy actually navigates by). This module adds
// that, for FREE, from OpenStreetMap:
//
//   • Nominatim  — pincode -> centroid {lat,lon}, and reverse-geocode that point
//                  into a rich locality (suburb / neighbourhood / town / district).
//                  Fast (~1-2s) and reliable.
//   • Overpass   — named POIs around the centroid = real delivery landmarks.
//                  SLOW and flaky (20-60s, frequent 502/timeout), so it is ONLY
//                  ever called from the background fill (cron), NEVER inline in an
//                  order/ship request. The order pipeline reads the KV cache only.
//
// Everything is cached PER PINCODE in KV (there are only a few hundred distinct
// pincodes we ever ship to), so each pincode costs at most one fill, ever. All
// functions are best-effort and NEVER throw — on any miss the caller simply keeps
// what it had (India Post areas etc.).
//
//   getPincodeGeo(pin)            -> cached record | null   (fast, cache-only read)
//   fillPincodeGeo(pin,{force})   -> record                 (does the network work)
//
// Record shape:
//   { pin, lat, lon, locality:{suburb,neighbourhood,town,cityDistrict,district,state},
//     localityLine:"Dakshineswar, Kamarhati", landmarks:[{name,type,dist}],
//     bestLandmark:"Sagore Dutta Hospital", filledAt }

const GEO_PREFIX = "geo:pin:v1:";
const GEO_TTL_S = 60 * 60 * 24 * 180; // 6 months — a pincode's area/landmarks are stable
const UA = "viora-shipping-address-engine/1.0 (viorajewel.in)";

// Overpass is slow + frequently down; try mirrors in order. de is most complete.
const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];
// Only these POI classes make good, unambiguous delivery landmarks.
const LANDMARK_FILTER =
  'amenity~"place_of_worship|hospital|clinic|school|college|university|bank|marketplace|community_centre|townhall|police|cinema|bus_station|fuel|post_office|library"';
const MAX_LANDMARK_DIST = 1200; // metres — "nearby", matches the ≤1km add-a-landmark rule

function kvCfg() {
  return {
    url: (process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || "").trim().replace(/\/$/, ""),
    token: (process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || "").trim(),
  };
}
async function kv(args) {
  const { url, token } = kvCfg();
  if (!url || !token) return null;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(args),
    });
    const data = await res.json().catch(() => ({}));
    return res.ok ? (data?.result ?? null) : null;
  } catch {
    return null;
  }
}

const normPin = (pin) => String(pin || "").replace(/\D/g, "");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function haversine(aLat, aLon, bLat, bLon) {
  const R = 6371000;
  const t = (x) => (x * Math.PI) / 180;
  const dLa = t(bLat - aLat);
  const dLo = t(bLon - aLon);
  const h = Math.sin(dLa / 2) ** 2 + Math.cos(t(aLat)) * Math.cos(t(bLat)) * Math.sin(dLo / 2) ** 2;
  return Math.round(R * 2 * Math.asin(Math.sqrt(h)));
}

async function nominatim(path) {
  const r = await fetch(`https://nominatim.openstreetmap.org/${path}`, {
    headers: { "User-Agent": UA, Accept: "application/json" },
    signal: AbortSignal.timeout(12000),
  });
  if (!r.ok) return null;
  return r.json().catch(() => null);
}

// Pincode -> { lat, lon } centroid (Nominatim). Null on miss.
async function pincodeCentroid(pin) {
  const j = await nominatim(`search?postalcode=${pin}&country=India&format=json&limit=1`);
  const hit = Array.isArray(j) ? j[0] : null;
  if (!hit) return null;
  const lat = Number(hit.lat);
  const lon = Number(hit.lon);
  return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null;
}

// Reverse-geocode a point into a rich locality object + a human locality line.
async function reverseLocality(lat, lon) {
  const j = await nominatim(`reverse?lat=${lat}&lon=${lon}&format=json&addressdetails=1&zoom=18`);
  const a = j?.address || {};
  const locality = {
    suburb: a.suburb || a.quarter || a.residential || "",
    neighbourhood: a.neighbourhood || a.hamlet || "",
    town: a.town || a.village || a.municipality || a.city || "",
    cityDistrict: a.city_district || a.county || "",
    district: a.state_district || a.county || "",
    state: a.state || "",
  };
  // A compact "locality, town" line a courier can read, most-specific first,
  // de-duplicated, never repeating the district/state (those go on their own line).
  const parts = [];
  for (const v of [locality.suburb, locality.neighbourhood, locality.town]) {
    const s = String(v || "").trim();
    if (s && !parts.some((p) => p.toLowerCase() === s.toLowerCase())) parts.push(s);
  }
  return { locality, localityLine: parts.slice(0, 2).join(", ") };
}

async function overpassLandmarks(lat, lon) {
  const q =
    `[out:json][timeout:60];(` +
    `node(around:${MAX_LANDMARK_DIST},${lat},${lon})[${LANDMARK_FILTER}][name];` +
    `way(around:${MAX_LANDMARK_DIST},${lat},${lon})[${LANDMARK_FILTER}][name];` +
    `node(around:${MAX_LANDMARK_DIST},${lat},${lon})[railway=station][name];` +
    `node(around:${MAX_LANDMARK_DIST},${lat},${lon})[shop~"mall|supermarket|department_store"][name];` +
    `);out center 80;`;
  for (const ep of OVERPASS_ENDPOINTS) {
    try {
      const r = await fetch(ep, {
        method: "POST",
        headers: { "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded" },
        body: "data=" + encodeURIComponent(q),
        signal: AbortSignal.timeout(65000),
      });
      const txt = await r.text();
      if (!r.ok || !txt.trim().startsWith("{")) continue;
      let j;
      try { j = JSON.parse(txt); } catch { continue; }
      const out = (j.elements || [])
        .map((e) => {
          const la = e.lat ?? e.center?.lat;
          const lo = e.lon ?? e.center?.lon;
          const name = String(e.tags?.name || "").trim();
          if (!name || la == null) return null;
          return {
            name,
            type: e.tags?.amenity || e.tags?.railway || e.tags?.shop || "poi",
            dist: haversine(lat, lon, la, lo),
          };
        })
        .filter((x) => x && x.dist <= MAX_LANDMARK_DIST)
        // de-dupe by name, keep the closest of each
        .reduce((m, x) => {
          const k = x.name.toLowerCase();
          if (!m.has(k) || m.get(k).dist > x.dist) m.set(k, x);
          return m;
        }, new Map());
      return [...out.values()].sort((a, b) => a.dist - b.dist).slice(0, 12);
    } catch {
      /* try next mirror */
    }
  }
  return null; // null = every mirror failed (retry later); [] would mean "really none"
}

// A landmark worth putting on a label: a clearly-named place close enough to
// navigate by. Prefer the closest; a railway/bus station or hospital is a strong
// anchor even a little further out.
function pickBestLandmark(landmarks) {
  if (!Array.isArray(landmarks) || !landmarks.length) return "";
  const strong = landmarks.filter((l) => /station|hospital|mall|college|university|marketplace/.test(l.type));
  const pick = (strong[0] && strong[0].dist <= 1000 ? strong[0] : landmarks[0]);
  return pick ? pick.name : "";
}

/**
 * Cache-only, FAST read. Returns the geo record for a pincode or null. Safe to
 * call inline in an order/ship request — never hits the slow network.
 */
export async function getPincodeGeo(pin) {
  const p = normPin(pin);
  if (p.length !== 6) return null;
  const cached = await kv(["GET", `${GEO_PREFIX}${p}`]);
  if (!cached) return null;
  try {
    const v = typeof cached === "string" ? JSON.parse(cached) : cached;
    return v && v.pin ? v : null;
  } catch {
    return null;
  }
}

/**
 * Do the real OSM work for a pincode and cache it. SLOW (Overpass) — call only
 * from a background cron / warm job, not from a request path. Returns the record
 * (also when only the fast Nominatim part succeeded; Overpass failure just leaves
 * landmarks empty, to be retried on a later fill with force).
 */
export async function fillPincodeGeo(pin, { force = false, withLandmarks = true } = {}) {
  const p = normPin(pin);
  if (p.length !== 6) return null;
  if (!force) {
    const existing = await getPincodeGeo(p);
    // Done when we have the locality AND either we aren't asking for landmarks or
    // Overpass has already answered for this PIN (lmOk, even if it found none).
    if (existing && existing.localityLine != null && (!withLandmarks || existing.lmOk)) return existing;
  }

  const centroid = await pincodeCentroid(p);
  if (!centroid) return null; // can't place the pincode — leave it for a retry
  await sleep(1100); // Nominatim usage policy: <= 1 req/s
  const { locality, localityLine } = await reverseLocality(centroid.lat, centroid.lon);

  const prev = await getPincodeGeo(p);
  let landmarks = prev?.landmarks || [];
  let lmOk = !!prev?.lmOk;
  if (withLandmarks) {
    const got = await overpassLandmarks(centroid.lat, centroid.lon);
    if (got !== null) { landmarks = got; lmOk = true; } // null = all mirrors failed; keep prior, retry next run
  }

  const record = {
    pin: p,
    lat: centroid.lat,
    lon: centroid.lon,
    locality,
    localityLine,
    landmarks,
    lmOk,
    bestLandmark: pickBestLandmark(landmarks),
    filledAt: Date.now(),
  };
  await kv(["SET", `${GEO_PREFIX}${p}`, JSON.stringify(record), "EX", String(GEO_TTL_S)]);
  return record;
}

export { MAX_LANDMARK_DIST, haversine };
