// Google Gemini client (2.5 Flash by default). Single place that talks to
// generativelanguage.googleapis.com. Returns the model's reply text.
//
// Uses the REST generateContent endpoint with the API key in the
// x-goog-api-key header. Never throws — a failed generation must not crash the
// webhook; callers get { ok:false } and can fall back to a canned reply.

const BASE = "https://generativelanguage.googleapis.com/v1beta";

function config() {
  return {
    apiKey: process.env.GEMINI_API_KEY,
    model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
  };
}

const isConfigured = () => Boolean(config().apiKey);

/**
 * Generate a reply from Gemini.
 *
 * @param {string} userMessage   the customer's message text
 * @param {object} [opts]
 * @param {string} [opts.systemPrompt]  persona / instructions
 * @param {number} [opts.maxOutputTokens=300]
 * @param {number} [opts.temperature=0.7]
 * @returns {Promise<{ok:boolean, text?:string, error?:any}>}
 */
async function generateReply(userMessage, opts = {}) {
  const { apiKey, model } = config();
  if (!apiKey) {
    return { ok: false, error: "GEMINI_API_KEY not set." };
  }

  const body = {
    contents: [{ role: "user", parts: [{ text: userMessage }] }],
    generationConfig: {
      temperature: opts.temperature ?? 0.7,
      maxOutputTokens: opts.maxOutputTokens ?? 300,
    },
  };
  if (opts.systemPrompt) {
    body.system_instruction = { parts: [{ text: opts.systemPrompt }] };
  }

  const url = `${BASE}/models/${model}:generateContent`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error(`[gemini] HTTP ${res.status}:`, JSON.stringify(data?.error || data));
      return { ok: false, error: data?.error || `HTTP ${res.status}` };
    }
    const text = data?.candidates?.[0]?.content?.parts
      ?.map((p) => p.text)
      .filter(Boolean)
      .join("")
      .trim();
    if (!text) {
      // e.g. blocked by safety filters, or an empty candidate.
      console.warn("[gemini] no text in response:", JSON.stringify(data).slice(0, 300));
      return { ok: false, error: "empty response" };
    }
    return { ok: true, text };
  } catch (error) {
    console.error("[gemini] network error:", error);
    return { ok: false, error };
  }
}

export { generateReply, isConfigured };
