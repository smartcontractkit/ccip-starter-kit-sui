/**
 * Retrying `fetch` wrapper for the Sui JSON-RPC transport.
 *
 * Some Sui fullnodes (both public and private) intermittently return 404 / 5xx
 * / hang on individual requests even when a direct curl to the same endpoint
 * returns 200. The @mysten/sui SDK's `Transaction` build path batches multiple
 * RPC calls in `Promise.all`, so a single flaky response fails the whole
 * transaction. Wrapping `fetch` with retry + exponential backoff makes those
 * transient failures invisible to the caller.
 *
 * We intentionally do NOT retry:
 * - 200 responses with a JSON-RPC error body (the transport parses those and
 *   throws JsonRpcError — retrying won't help since the RPC processed it
 *   correctly, we just don't like the answer).
 * - 400, 401, 403 (auth / bad-request — retrying won't change the outcome).
 * - Abort-signal cancellations (caller-initiated).
 *
 * We DO retry:
 * - 404, 408, 425, 429, 500, 502, 503, 504.
 * - fetch() throwing (network / DNS / TLS errors).
 *
 * Configure via env:
 *   SUI_RPC_RETRY_MAX_ATTEMPTS  (default 4  — total tries, including first)
 *   SUI_RPC_RETRY_BASE_DELAY_MS (default 250 — first backoff, then 2x, 4x, …)
 */

const RETRYABLE_STATUSES = new Set([404, 408, 425, 429, 500, 502, 503, 504]);

function readIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * fetch()-compatible function that retries transient failures with exponential
 * backoff + small jitter. Pass this to `new JsonRpcHTTPTransport({ fetch: ... })`.
 */
export const retryingFetch: typeof fetch = async (input, init) => {
  const maxAttempts = readIntEnv('SUI_RPC_RETRY_MAX_ATTEMPTS', 4);
  const baseDelayMs = readIntEnv('SUI_RPC_RETRY_BASE_DELAY_MS', 250);

  let attempt = 0;
  let lastError: unknown;

  while (attempt < maxAttempts) {
    attempt += 1;
    try {
      const res = await fetch(input, init);

      if (res.ok || !RETRYABLE_STATUSES.has(res.status)) {
        return res;
      }

      lastError = new Error(`HTTP ${res.status} ${res.statusText}`);
      // Drain the body so the connection can be reused.
      try {
        await res.arrayBuffer();
      } catch {
        // ignore
      }
    } catch (err) {
      // Do not retry aborts.
      if (
        err instanceof Error &&
        (err.name === 'AbortError' || (init?.signal && init.signal.aborted))
      ) {
        throw err;
      }
      lastError = err;
    }

    if (attempt >= maxAttempts) break;

    const backoff = baseDelayMs * 2 ** (attempt - 1);
    const jitter = Math.floor(Math.random() * (baseDelayMs / 2));
    const wait = backoff + jitter;
    // Keep the message short so it doesn't drown out the actual script output.
    console.warn(
      `⚠️  Sui RPC transient failure (attempt ${attempt}/${maxAttempts}): ${
        lastError instanceof Error ? lastError.message : String(lastError)
      }. Retrying in ${wait}ms…`
    );
    await sleep(wait);
  }

  // Exhausted retries — surface the last error verbatim so downstream handlers
  // (e.g. SuiHTTPStatusError conversion inside the transport) still work.
  throw lastError instanceof Error
    ? lastError
    : new Error(`Sui RPC failed after ${maxAttempts} attempts: ${String(lastError)}`);
};
