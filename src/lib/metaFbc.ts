// Single source of truth for building Meta's `fbc` (click-id) parameter for
// the Conversions API.
//
// Meta requires the fbc value — and the fbclid embedded inside it — to be
// forwarded EXACTLY as the browser stored it. Any transformation (URL
// decode/encode, trim, case change) makes Meta reject it with
// "Server sending modified fbclid value in fbc parameter", which craters
// ad match quality and reported ROAS. Both helpers below are deliberately
// byte-for-byte faithful: they copy characters, they never decode them.

/**
 * Read a cookie value out of a raw `Cookie:` request header WITHOUT decoding.
 *
 * The stock pattern runs the value through decodeURIComponent(), which is the
 * exact bug Meta flags for `_fbc` / `_fbp`. Use this for those two cookies so
 * the stored value reaches the Conversions API unaltered.
 */
export function readCookieRaw(
  cookieHeader: string,
  name: string
): string | undefined {
  const m = new RegExp(`(?:^|; )${name}=([^;]+)`).exec(cookieHeader);
  return m ? m[1] : undefined;
}

/**
 * Build an `fbc` value from an fbclid present in a URL's query string, when no
 * `_fbc` cookie exists yet (e.g. the visitor just landed from a Meta ad).
 *
 * The fbclid is pulled straight out of the raw query string. URLSearchParams
 * .get() would URL-decode it (turning %2F back into "/", "+" into a space,
 * etc.) — Meta wants it un-decoded, character-for-character as it appears in
 * the address bar. Returns undefined when there's no fbclid to work with.
 *
 * @param nowMs current time in ms; injectable so tests are deterministic.
 */
export function buildFbcFromUrl(
  eventSourceUrl: string | undefined,
  nowMs: number = Date.now()
): string | undefined {
  if (!eventSourceUrl) return undefined;
  const query = eventSourceUrl.split("?")[1];
  if (!query) return undefined;

  let fbclid: string | undefined;
  for (const pair of query.split("&")) {
    const eq = pair.indexOf("=");
    if (eq !== -1 && pair.slice(0, eq) === "fbclid") {
      fbclid = pair.slice(eq + 1);
      break;
    }
  }
  if (!fbclid) return undefined;

  return `fb.1.${Math.floor(nowMs / 1000)}.${fbclid}`;
}
