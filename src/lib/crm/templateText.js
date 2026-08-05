// Renders the REAL approved template body (fetched from Meta, cached) with its
// {{n}} placeholders filled by the params we actually sent — so the inbox thread
// shows EXACTLY what the customer received, not a hand-written approximation.
//
// Non-throwing: returns null on any miss (template not found, Meta down, parse
// error) so callers fall back to their own readable text. Cached in-module so
// the order webhook doesn't refetch every template on every order.

import { listTemplates } from "./whatsapp";

const TTL_MS = 10 * 60 * 1000; // refresh the template bodies at most every 10 min
let cache = { at: 0, byKey: null };

/** Map "name:lang" (and a name-only fallback) -> BODY text. Keeps stale on failure. */
async function loadBodies() {
  if (cache.byKey && Date.now() - cache.at < TTL_MS) return cache.byKey;
  const res = await listTemplates();
  if (!res.ok || !Array.isArray(res.templates)) return cache.byKey; // keep any stale map
  const byKey = {};
  for (const t of res.templates) {
    const body = (t.components || []).find((c) => c?.type === "BODY");
    const text = body?.text || "";
    byKey[`${t.name}:${t.language}`] = text;
    if (byKey[t.name] == null) byKey[t.name] = text; // name-only fallback
  }
  cache = { at: Date.now(), byKey };
  return byKey;
}

/**
 * @param {string} name  approved template name
 * @param {string} lang  language code (e.g. "en_US")
 * @param {(string|number)[]} params  ordered {{1}},{{2}}… values
 * @returns {Promise<string|null>} the real filled body, or null to fall back
 */
export async function renderTemplateBody(name, lang, params = []) {
  try {
    const byKey = await loadBodies();
    if (!byKey) return null;
    const tpl = byKey[`${name}:${lang}`] ?? byKey[name];
    if (!tpl) return null;
    return String(tpl).replace(/\{\{\s*(\d+)\s*\}\}/g, (_, n) => String(params[Number(n) - 1] ?? ""));
  } catch {
    return null;
  }
}
