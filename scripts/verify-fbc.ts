/**
 * Verifies the Meta CAPI `fbc` fix WITHOUT touching Vercel, Meta, or any live
 * data. It feeds the real production helpers (src/lib/metaFbc.ts) inputs that a
 * buggy, decoding implementation would have corrupted, and asserts the fbclid
 * survives byte-for-byte — which is exactly what Meta's "modified fbclid value
 * in fbc" warning is about.
 *
 * Run:  npx ts-node --compiler-options "{\"module\":\"commonjs\"}" scripts/verify-fbc.ts
 */
import { readCookieRaw, buildFbcFromUrl } from "../src/lib/metaFbc";

let failures = 0;

function check(label: string, actual: string | undefined, expected: string | undefined) {
  const pass = actual === expected;
  if (!pass) failures++;
  console.log(`${pass ? "PASS" : "FAIL"}  ${label}`);
  if (!pass) {
    console.log(`        expected: ${JSON.stringify(expected)}`);
    console.log(`        actual:   ${JSON.stringify(actual)}`);
  }
}

// An fbclid crafted to contain characters that decodeURIComponent() /
// URLSearchParams.get() WOULD transform: %2F -> "/", %2B -> "+", and a literal
// "+" -> " " (space). If any decoding sneaks in, these change.
const FBCLID = "IwAR2%2Fabc%2Bdef+ghi";
const FIXED_NOW_MS = 1_700_000_000_000; // deterministic timestamp
const EXPECTED_TS = 1_700_000_000; // Math.floor(ms / 1000)

console.log("=== Meta CAPI fbc byte-for-byte verification ===\n");

// --- 1. _fbc cookie is forwarded raw (the checkout/Purchase path) -----------
const cookieFbc = `fb.1.1700000000.${FBCLID}`;
const cookieHeader = `_fbp=fb.1.111.222; _fbc=${cookieFbc}; ln_or=x`;
check(
  "_fbc cookie read verbatim (no decode)",
  readCookieRaw(cookieHeader, "_fbc"),
  cookieFbc
);
// Show what the OLD buggy decode would have produced, to make the bug concrete.
const buggyDecoded = decodeURIComponent(cookieFbc);
console.log(`        (old buggy decodeURIComponent would have sent: ${JSON.stringify(buggyDecoded)})`);
if (buggyDecoded === cookieFbc) {
  console.log("        !! test input is too weak — decode did not change it");
  failures++;
}

// --- 2. fbclid pulled from the URL raw (the /api/capi fallback path) ---------
const url = `https://www.viorajewel.in/success?utm_source=fb&fbclid=${FBCLID}&x=1`;
check(
  "fbclid extracted from URL verbatim",
  buildFbcFromUrl(url, FIXED_NOW_MS),
  `fb.1.${EXPECTED_TS}.${FBCLID}`
);
// Contrast against the decoding approach Meta rejects.
const buggyFromUrl = `fb.1.${EXPECTED_TS}.${new URL(url).searchParams.get("fbclid")}`;
console.log(`        (old URLSearchParams.get would have sent: ${JSON.stringify(buggyFromUrl)})`);

// --- 3. cookie takes precedence over the URL fallback (route-level logic) ----
const combined = readCookieRaw(cookieHeader, "_fbc") || buildFbcFromUrl(url, FIXED_NOW_MS);
check("existing _fbc cookie wins over URL fallback", combined, cookieFbc);

// --- 4. graceful no-ops -----------------------------------------------------
check("no fbclid in URL -> undefined", buildFbcFromUrl("https://x.com/success?a=1", FIXED_NOW_MS), undefined);
check("no query string -> undefined", buildFbcFromUrl("https://x.com/success", FIXED_NOW_MS), undefined);
check("missing cookie -> undefined", readCookieRaw("_fbp=only", "_fbc"), undefined);

// --- 5. a normal base64url fbclid is untouched (sanity) ---------------------
const plain = "IwAR3PlainClickIdNoSpecialChars0123456789";
check(
  "plain fbclid passes through unchanged",
  buildFbcFromUrl(`https://x.com/?fbclid=${plain}`, FIXED_NOW_MS),
  `fb.1.${EXPECTED_TS}.${plain}`
);

console.log(`\n=== ${failures === 0 ? "ALL CHECKS PASSED ✅" : `${failures} CHECK(S) FAILED ❌`} ===`);
process.exit(failures === 0 ? 0 : 1);
