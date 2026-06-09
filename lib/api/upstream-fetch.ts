/**
 * Shared upstream fetch with transient-failure retry for the public API proxies
 * (app/v1/[...path] and the legacy app/api/v1/cua/[...path]).
 *
 * Why: the origin (ALB -> ECS) can briefly emit a gateway error or reset a
 * connection with no fault of the request — during a rolling deploy old tasks
 * drain, and because the shared ALB's idle timeout (3600s, kept high for SSE/WS)
 * far exceeds the gunicorn worker keep-alive (75s), the ALB can reuse a
 * connection the worker already closed, yielding a sporadic 502 / reset. A
 * single such blip should not surface as a client 5xx, so we retry it.
 *
 * Safety: the caller decides `retryable`. Retry idempotent reads freely; retry a
 * write ONLY when it carries an Idempotency-Key (the backend dedupes by it and
 * replays the cached result without re-charging billed vision endpoints), so we
 * can never double-execute or double-charge. A genuine request timeout
 * (AbortError) is reported, never retried (the next attempt would also time out
 * and could blow Cloudflare's ~100s budget).
 */

const RETRY_STATUSES = new Set([502, 503, 504])
const BACKOFF_MS = [250, 600]
const PER_ATTEMPT_TIMEOUT_MS = 90_000

export interface UpstreamResult {
  /** Present on success (incl. a non-retryable / final 5xx) — stream this back. */
  response?: Response
  /** True when every attempt failed at the connection level / on a transient 5xx. */
  failed?: boolean
  /** True when the failure was our own per-attempt abort (a real upstream timeout). */
  timedOut?: boolean
}

/**
 * Decide whether a method is safe to retry. Reads are always safe; writes only
 * when an Idempotency-Key makes the backend dedupe the replay.
 */
export function isRetryable(method: string, hasIdempotencyKey: boolean): boolean {
  const m = method.toUpperCase()
  if (m === "GET" || m === "HEAD" || m === "OPTIONS") return true
  return hasIdempotencyKey && (m === "POST" || m === "PUT" || m === "PATCH" || m === "DELETE")
}

export async function fetchUpstreamWithRetry(
  url: string,
  options: RequestInit,
  retryable: boolean,
): Promise<UpstreamResult> {
  const maxAttempts = retryable ? BACKOFF_MS.length + 1 : 1
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
  let timedOut = false

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), PER_ATTEMPT_TIMEOUT_MS)
    try {
      const response = await fetch(url, { ...options, signal: controller.signal })
      clearTimeout(timer)

      if (retryable && attempt < maxAttempts - 1 && RETRY_STATUSES.has(response.status)) {
        // Drain the body so the underlying connection can be reused/closed,
        // then back off and retry.
        try {
          await response.arrayBuffer()
        } catch {
          /* ignore */
        }
        await sleep(BACKOFF_MS[attempt])
        continue
      }
      return { response }
    } catch (err) {
      clearTimeout(timer)
      timedOut = err instanceof DOMException && err.name === "AbortError"
      if (!timedOut && retryable && attempt < maxAttempts - 1) {
        await sleep(BACKOFF_MS[attempt])
        continue
      }
      break
    }
  }
  return { failed: true, timedOut }
}
