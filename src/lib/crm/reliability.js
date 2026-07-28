// Cross-cutting reliability helpers used by every outbound integration
// (Velocity shipping API, Meta WhatsApp API). Kept provider-agnostic on purpose:
// routes call withRetry() around whatever async call they make, so the retry /
// backoff policy lives in exactly one place and the pipeline behaves the same
// no matter which third party we're talking to.
//
// Design notes:
//  - Only *transient* failures should be retried (network blips, HTTP 429/5xx).
//    A 4xx like "400 bad phone number" will fail identically every time, so
//    retrying it just wastes time and (for Meta) burns quota. The caller decides
//    what is retryable via `shouldRetry`.
//  - Backoff is exponential with jitter so a burst of webhooks doesn't hammer
//    the upstream in lockstep.
//  - Never throws past the final attempt unless the caller wants it to: it
//    returns the last error so webhook handlers can log-and-move-on rather than
//    crash (a crashed handler makes Wix/Velocity retry the whole event).

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Default "is this worth retrying?" policy. Retries on:
 *  - no HTTP status at all (network error / timeout), or
 *  - HTTP 408, 425, 429, or any 5xx.
 * Anything else (most 4xx) is treated as permanent.
 *
 * @param {{status?: number}} err  an Error, or a { status } result object
 */
function defaultShouldRetry(err) {
  const status = err?.status ?? err?.response?.status;
  if (status == null) return true; // network/timeout — retry
  if (status === 408 || status === 425 || status === 429) return true;
  return status >= 500 && status <= 599;
}

/**
 * Run an async function with exponential-backoff retries.
 *
 * @template T
 * @param {() => Promise<T>} fn                the operation to attempt
 * @param {object}   [opts]
 * @param {string}   [opts.label="op"]         name for logs
 * @param {number}   [opts.retries=3]          extra attempts after the first (so 3 => up to 4 tries)
 * @param {number}   [opts.baseDelayMs=500]    first backoff delay; doubles each round
 * @param {number}   [opts.maxDelayMs=8000]    cap on any single backoff wait
 * @param {(err:any)=>boolean} [opts.shouldRetry=defaultShouldRetry]
 * @returns {Promise<T>}  resolves with fn()'s value, or rejects with the last error
 */
async function withRetry(fn, opts = {}) {
  const {
    label = "op",
    retries = 3,
    baseDelayMs = 500,
    maxDelayMs = 8000,
    shouldRetry = defaultShouldRetry,
  } = opts;

  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const isLast = attempt === retries;
      if (isLast || !shouldRetry(err)) {
        console.error(
          `[retry] ${label} failed permanently on attempt ${attempt + 1}:`,
          err?.message || err
        );
        throw err;
      }
      // Exponential backoff with full jitter.
      const backoff = Math.min(maxDelayMs, baseDelayMs * 2 ** attempt);
      const wait = Math.round(Math.random() * backoff);
      console.warn(
        `[retry] ${label} attempt ${attempt + 1} failed (${
          err?.status ?? "no-status"
        }); retrying in ${wait}ms`
      );
      await sleep(wait);
    }
  }
  throw lastErr; // unreachable, but keeps types honest
}

export { withRetry, defaultShouldRetry, sleep };
