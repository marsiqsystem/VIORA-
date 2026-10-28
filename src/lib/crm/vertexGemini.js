// Vertex AI Gemini client — same generate interface as gemini.js, but authed
// with a GCP SERVICE ACCOUNT against Vertex AI (aiplatform.googleapis.com), so it
// runs on a GCP project's billing instead of an AI Studio prepay balance. Used
// when the AI Studio key keeps 402-ing on a depleted project. Reuses the San
// Luxury GCP project's working billing via its own revocable service-account key.
//
// Env:
//   GOOGLE_SERVICE_ACCOUNT_JSON  — the full SA key JSON (one line)
//   GCP_PROJECT_ID               — e.g. impactful-bee-424710-c6
//   GCP_LOCATION                 — e.g. us-central1  (default)
//   GEMINI_MODEL / per-call model
//
// Auth is the JWT-bearer flow done with Node's crypto (no extra dependency):
// sign a JWT with the SA private key -> exchange at oauth2 for a 1h access token
// (cached). Never throws — callers get { ok:false } and fall back.

import crypto from "crypto";

function cfg() {
  let sa = null;
  try {
    const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
    if (raw) sa = typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch (e) {
    console.error("[vertex] GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON:", e?.message || e);
  }
  return {
    sa,
    projectId: (process.env.GCP_PROJECT_ID || sa?.project_id || "").trim(),
    location: (process.env.GCP_LOCATION || "us-central1").trim(),
    model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
  };
}

const isConfigured = () => {
  const c = cfg();
  return !!(c.sa?.client_email && c.sa?.private_key && c.projectId);
};

function b64url(input) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

// Cache the access token in-process until shortly before it expires.
let tokenCache = { token: "", exp: 0 };

async function getAccessToken(sa) {
  const now = Math.floor(Date.now() / 1000);
  if (tokenCache.token && tokenCache.exp - 60 > now) return tokenCache.token;

  const tokenUri = sa.token_uri || "https://oauth2.googleapis.com/token";
  const header = { alg: "RS256", typ: "JWT" };
  const claims = {
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/cloud-platform",
    aud: tokenUri,
    iat: now,
    exp: now + 3600,
  };
  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claims))}`;
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(signingInput);
  const signature = b64url(signer.sign(sa.private_key));
  const assertion = `${signingInput}.${signature}`;

  const res = await fetch(tokenUri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    throw new Error(`token exchange failed HTTP ${res.status}: ${JSON.stringify(data?.error || data).slice(0, 160)}`);
  }
  tokenCache = { token: data.access_token, exp: now + (Number(data.expires_in) || 3600) };
  return tokenCache.token;
}

/**
 * Generate text from Vertex AI Gemini. Same shape as gemini.generateReply.
 * @returns {Promise<{ok:boolean, text?:string, error?:any}>}
 */
async function generateVertex(userMessage, opts = {}) {
  const c = cfg();
  if (!isConfigured()) return { ok: false, error: "Vertex not configured (GOOGLE_SERVICE_ACCOUNT_JSON / GCP_PROJECT_ID)." };
  const model = opts.model || c.model;
  const loc = c.location;
  const host = loc === "global" ? "aiplatform.googleapis.com" : `${loc}-aiplatform.googleapis.com`;
  const url = `https://${host}/v1/projects/${c.projectId}/locations/${loc}/publishers/google/models/${model}:generateContent`;

  const body = {
    contents: [{ role: "user", parts: [{ text: userMessage }] }],
    generationConfig: {
      temperature: opts.temperature ?? 0.7,
      maxOutputTokens: opts.maxOutputTokens ?? 300,
    },
  };
  if (opts.systemPrompt) body.systemInstruction = { parts: [{ text: opts.systemPrompt }] };

  // Gemini 2.5 flash models "think" by default, which spends the output-token
  // budget on hidden reasoning and truncates the real answer (finishReason
  // MAX_TOKENS → unparseable JSON). These are short, structured replies, so turn
  // thinking OFF for flash (budget 0) — big latency/cost win and the whole JSON
  // fits. GEMINI_THINKING_BUDGET overrides if a little reasoning is ever wanted.
  if (/flash/i.test(model)) {
    const budget = Number(process.env.GEMINI_THINKING_BUDGET);
    body.generationConfig.thinkingConfig = { thinkingBudget: Number.isFinite(budget) ? budget : 0 };
  }

  try {
    const token = await getAccessToken(c.sa);
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error(`[vertex] HTTP ${res.status}:`, JSON.stringify(data?.error || data).slice(0, 200));
      return { ok: false, error: data?.error || `HTTP ${res.status}` };
    }
    const text = data?.candidates?.[0]?.content?.parts
      ?.map((p) => p.text)
      .filter(Boolean)
      .join("")
      .trim();
    if (!text) return { ok: false, error: "empty response" };
    return { ok: true, text };
  } catch (error) {
    console.error("[vertex] error:", error?.message || error);
    return { ok: false, error: error?.message || String(error) };
  }
}

export { generateVertex, isConfigured };
