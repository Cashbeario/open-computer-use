/**
 * Tests for the public-API proxy's transient-failure retry
 * (lib/api/upstream-fetch.ts), used by app/v1/[...path] and the legacy
 * app/api/v1/cua/[...path] proxies.
 *
 * The origin (ALB -> ECS) can briefly emit a 502/503/504 or reset a connection
 * during a rolling deploy, or because the shared ALB idle timeout (3600s, kept
 * high for SSE/WS) outlives the worker keep-alive (75s) so the ALB reuses a
 * closed connection. These must be retried for safe methods and NEVER for an
 * un-keyed write (no double-charge) nor for a genuine timeout.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import {
  fetchUpstreamWithRetry,
  isRetryable,
  type UpstreamResult,
} from "@/lib/api/upstream-fetch"

const URL = "http://127.0.0.1:8001/v1/predict"

function ok(status = 200, body = "{}") {
  return new Response(body, { status, headers: { "content-type": "application/json" } })
}

describe("isRetryable", () => {
  it("retries idempotent reads regardless of key", () => {
    expect(isRetryable("GET", false)).toBe(true)
    expect(isRetryable("HEAD", false)).toBe(true)
    expect(isRetryable("OPTIONS", false)).toBe(true)
  })
  it("retries writes ONLY with an Idempotency-Key", () => {
    expect(isRetryable("POST", false)).toBe(false)
    expect(isRetryable("POST", true)).toBe(true)
    expect(isRetryable("PUT", true)).toBe(true)
    expect(isRetryable("DELETE", true)).toBe(true)
    expect(isRetryable("PATCH", false)).toBe(false)
  })
})

describe("fetchUpstreamWithRetry", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  async function run(promise: Promise<UpstreamResult>): Promise<UpstreamResult> {
    // Drive the backoff timers to completion, then resolve.
    await vi.runAllTimersAsync()
    return promise
  }

  it("retries a transient 503 then returns the eventual 200", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(ok(503, "down"))
      .mockResolvedValueOnce(ok(200, '{"ok":true}'))
    vi.stubGlobal("fetch", fetchMock)

    const r = await run(fetchUpstreamWithRetry(URL, { method: "GET" }, true))
    expect(r.response?.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("retries a connection error (reset) then succeeds", async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new TypeError("fetch failed: ECONNRESET"))
      .mockResolvedValueOnce(ok(200))
    vi.stubGlobal("fetch", fetchMock)

    const r = await run(fetchUpstreamWithRetry(URL, { method: "POST" }, true))
    expect(r.response?.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("does NOT retry when not retryable (un-keyed POST) — no double-execute", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(ok(502, "bad gateway"))
    vi.stubGlobal("fetch", fetchMock)

    const r = await run(fetchUpstreamWithRetry(URL, { method: "POST" }, false))
    // Returns the 502 response as-is; the caller streams it. Only ONE attempt.
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(r.response?.status).toBe(502)
  })

  it("gives up after exhausting retries on persistent 503", async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok(503, "down"))
    vi.stubGlobal("fetch", fetchMock)

    const r = await run(fetchUpstreamWithRetry(URL, { method: "GET" }, true))
    // 1 initial + 2 retries = 3 attempts, then the final 503 is returned.
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(r.response?.status).toBe(503)
  })

  it("does NOT retry a genuine timeout (AbortError) and flags timedOut", async () => {
    const fetchMock = vi.fn().mockImplementation(() => {
      const e = new DOMException("aborted", "AbortError")
      return Promise.reject(e)
    })
    vi.stubGlobal("fetch", fetchMock)

    const r = await run(fetchUpstreamWithRetry(URL, { method: "GET" }, true))
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(r.failed).toBe(true)
    expect(r.timedOut).toBe(true)
  })

  it("connection error on an un-keyed POST is not retried (reported as failed)", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("ECONNRESET"))
    vi.stubGlobal("fetch", fetchMock)

    const r = await run(fetchUpstreamWithRetry(URL, { method: "POST" }, false))
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(r.failed).toBe(true)
    expect(r.timedOut).toBe(false)
  })
})
