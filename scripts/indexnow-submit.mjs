#!/usr/bin/env node
/**
 * IndexNow submission script for Viora Jewel.
 *
 * Fetches https://www.viorajewel.in/sitemap.xml, extracts every URL, and
 * submits the full list to IndexNow (Bing's instant-indexing API). Bing
 * shares IndexNow signals with ChatGPT Search, Copilot, and other Bing-fed
 * AI engines, so a successful submission typically makes new content
 * discoverable within minutes instead of days.
 *
 * Usage:
 *   node scripts/indexnow-submit.mjs              # submit all sitemap URLs
 *   node scripts/indexnow-submit.mjs <url> <url>  # submit specific URLs only
 *
 * Requires: Node 18+ (uses global fetch).
 */

const KEY = "82e794657c26445cb435913c4ca117cd";
const HOST = "www.viorajewel.in";
const SITEMAP_URL = `https://${HOST}/sitemap.xml`;
const KEY_LOCATION = `https://${HOST}/${KEY}.txt`;
const INDEXNOW_ENDPOINT = "https://api.indexnow.org/IndexNow";

async function fetchSitemapUrls() {
  const res = await fetch(SITEMAP_URL, {
    headers: { "User-Agent": "Viora-IndexNow-Submitter/1.0" },
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch sitemap: ${res.status} ${res.statusText}`);
  }
  const xml = await res.text();
  const matches = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)];
  return matches.map((m) => m[1].trim()).filter((u) => u.startsWith(`https://${HOST}`));
}

async function submitToIndexNow(urls) {
  const payload = {
    host: HOST,
    key: KEY,
    keyLocation: KEY_LOCATION,
    urlList: urls,
  };

  const res = await fetch(INDEXNOW_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(payload),
  });

  const body = await res.text().catch(() => "");
  return { status: res.status, statusText: res.statusText, body };
}

async function verifyKeyFile() {
  const res = await fetch(KEY_LOCATION);
  if (!res.ok) {
    throw new Error(
      `Key file not reachable at ${KEY_LOCATION} (HTTP ${res.status}). ` +
        "Wait for Vercel deploy to finish, then retry."
    );
  }
  const text = (await res.text()).trim();
  if (text !== KEY) {
    throw new Error(
      `Key file contents don't match. Expected "${KEY}", got "${text.slice(0, 80)}".`
    );
  }
}

async function main() {
  const cliUrls = process.argv.slice(2);

  console.log("→ Verifying IndexNow key file is live...");
  await verifyKeyFile();
  console.log(`  OK: ${KEY_LOCATION}\n`);

  let urls;
  if (cliUrls.length > 0) {
    urls = cliUrls;
    console.log(`→ Submitting ${urls.length} URL(s) from command line.\n`);
  } else {
    console.log(`→ Fetching sitemap from ${SITEMAP_URL}...`);
    urls = await fetchSitemapUrls();
    console.log(`  Found ${urls.length} URLs in sitemap.\n`);
  }

  if (urls.length === 0) {
    console.error("No URLs to submit. Aborting.");
    process.exit(1);
  }

  // IndexNow accepts up to 10,000 URLs per request — well within our scale.
  console.log("→ Submitting to IndexNow...");
  const result = await submitToIndexNow(urls);

  console.log(`  Response: HTTP ${result.status} ${result.statusText}`);
  if (result.body) console.log(`  Body: ${result.body}`);

  if (result.status === 200 || result.status === 202) {
    console.log(`\nDone. ${urls.length} URL(s) accepted by IndexNow.`);
  } else {
    console.error(`\nSubmission failed (HTTP ${result.status}). See response above.`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
