/**
 * Wave-3 doc-drift contract — source scan of the canonical Markdown reference
 * (`lib/coasty-api-docs-md.ts`, served at https://coasty.ai/docs/llms.txt) and
 * the OpenAPI 3.1 spec (`lib/openapi/coasty-v1.ts`).
 *
 * Same style as tests/wave2-docs-surface.test.ts: read the source with
 * readFileSync and assert on substrings, since both docs are static modules with
 * no runtime.
 *
 * This wave pins the newly-shipped /v1 *reliability* surface, verified against the
 * backend idempotency / streaming / webhook implementations:
 *
 *  R1 — IDEMPOTENCY CONTRACT (the headline): Idempotency-Key on every mutating
 *       call; SHA-256-of-canonical-body "same request"; per-account, test-isolated
 *       scope; 24h replay / 10min in-flight reservation; keyed replay never
 *       double-bills (X-Credits-Charged: 0, usage.billed: false, replay headers);
 *       WAIT-AND-RETURN self-healing retry (~25s) then 409 IDEMPOTENCY_IN_FLIGHT;
 *       FETCH-BY-KEY GET /v1/idempotency/{key}; status headers.
 *  R2 — machine-readable retryability: every error envelope carries `retryable`
 *       and `retry_with_same_idempotency_key`; error catalog grows a `retryable`
 *       column; the EVERY-error-is-catalogued guarantee.
 *  R3 — latency expectations + recommended client timeouts (>=120s, not 60s).
 *  R4 — SSE-keepalive predict (Accept: text/event-stream / ?stream=keepalive).
 *  R5 — SSE streaming contract for runs/workflows: Last-Event-ID / ?after, seq
 *       cursor, unbounded replay, : keepalive, terminal event: done.
 *  R6 — webhook signing recipe + retried delivery (3 attempts, dedupe).
 *  R7 — session TTL / expiry: 2h (7200s) idle, expires_at, 404 SESSION_NOT_FOUND.
 *  R8 — coordinate contract: pixel space of submitted screenshot, no normalization.
 *  R9 — screenshot limits machine-readable in errors (error.examples).
 *  R10 — new response headers quick-reference + usage.billed.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const ROOT = join(__dirname, "..")
const doc = readFileSync(join(ROOT, "lib/coasty-api-docs-md.ts"), "utf-8")
const oas = readFileSync(join(ROOT, "lib/openapi/coasty-v1.ts"), "utf-8")

// ---------------------------------------------------------------------------
// R1 — the Idempotency contract.
// ---------------------------------------------------------------------------
describe("R1: idempotency contract", () => {
  it("has a dedicated Idempotency section", () => {
    expect(doc).toMatch(/##[^\n]*Idempotency/)
  })

  it("lists the mutating endpoints that accept Idempotency-Key", () => {
    const idx = doc.search(/##[^\n]*Idempotency/)
    expect(idx).toBeGreaterThan(-1)
    const section = doc.slice(idx, idx + 6000)
    for (const ep of [
      "/predict", "/ground", "/sessions", "/runs", "/workflows", "/machines", "/schedules",
    ]) {
      expect(section, `idempotency section missing endpoint mention '${ep}'`).toContain(ep)
    }
  })

  it('defines "same request" as a SHA-256 of the canonical JSON body, session_id folded in', () => {
    expect(doc).toContain("SHA-256")
    expect(doc.toLowerCase()).toContain("canonical")
    expect(doc.toLowerCase()).toMatch(/sorted keys/)
    // For /sessions/{id}/predict the session_id is folded into the hash.
    expect(doc.toLowerCase()).toMatch(/session_id[\s\S]{0,120}(folded|hash)/)
    // Reusing a key with a different body is 422 IDEMPOTENCY_KEY_REUSED.
    expect(doc).toContain("IDEMPOTENCY_KEY_REUSED")
  })

  it("states the key scope is per-account, test-isolated, not per-endpoint", () => {
    const idx = doc.search(/##[^\n]*Idempotency/)
    const section = doc.slice(idx, idx + 6000)
    expect(section.toLowerCase()).toMatch(/per-account|per account/)
    expect(section.toLowerCase()).toMatch(/not per-endpoint|not per endpoint/)
    expect(section.toLowerCase()).toMatch(/test[\s\S]{0,80}isolat/)
  })

  it("documents the 24h replay window and 10min in-flight reservation", () => {
    const idx = doc.search(/##[^\n]*Idempotency/)
    const section = doc.slice(idx, idx + 6000)
    expect(section).toMatch(/24\s*h(ours)?/)
    expect(section).toMatch(/10\s*min(utes)?/)
  })

  it("a keyed replay never double-bills (0 charge, billed:false, replay headers)", () => {
    const idx = doc.search(/##[^\n]*Idempotency/)
    const section = doc.slice(idx, idx + 6000)
    expect(section).toContain("X-Credits-Charged: 0")
    expect(section).toMatch(/"?credits_charged"?:\s*0/)
    expect(section).toMatch(/"?billed"?:\s*false/)
    expect(section).toContain("X-Coasty-Idempotent-Replay: true")
    expect(section).toContain("Idempotency-Replayed: true")
    expect(section).toContain("Idempotency-Status: completed")
  })

  it("documents WAIT-AND-RETURN (self-healing retry) up to ~25s", () => {
    const idx = doc.search(/##[^\n]*Idempotency/)
    const section = doc.slice(idx, idx + 6000)
    expect(section.toLowerCase()).toMatch(/wait[\s-]and[\s-]return|self-healing/)
    expect(section).toMatch(/25\s*s/)
    // Only after the wait do you get a 409.
    expect(section).toContain("409")
    expect(section).toContain("IDEMPOTENCY_IN_FLIGHT")
    expect(section).toContain("Retry-After")
    expect(section).toMatch(/"?retryable"?:\s*true/)
    expect(section).toMatch(/"?retry_with_same_idempotency_key"?:\s*true/)
    expect(section).toContain("Idempotency-Status: processing")
  })

  it("documents FETCH-BY-KEY GET /v1/idempotency/{key} with all three outcomes", () => {
    expect(doc).toContain("GET /v1/idempotency/{key}")
    const idx = doc.indexOf("GET /v1/idempotency/{key}")
    const section = doc.slice(idx, idx + 2000)
    // completed
    expect(section).toMatch(/"status":\s*"completed"/)
    expect(section).toContain('"original_status"')
    expect(section).toContain('"result"')
    // processing
    expect(section).toMatch(/"status":\s*"processing"/)
    // unknown
    expect(section).toMatch(/404[\s\S]{0,40}NOT_FOUND|NOT_FOUND[\s\S]{0,40}404/)
  })

  it("OpenAPI exposes the /v1/idempotency/{key} path", () => {
    expect(oas).toContain('"/v1/idempotency/{key}"')
    const idx = oas.indexOf('"/v1/idempotency/{key}"')
    const section = oas.slice(idx, idx + 900)
    expect(section).toContain("IdempotencyLookupResponse")
  })

  it("OpenAPI defines the IdempotencyLookupResponse schema", () => {
    const idx = oas.indexOf("IdempotencyLookupResponse:")
    expect(idx).toBeGreaterThan(-1)
    const section = oas.slice(idx, idx + 700)
    expect(section).toContain("completed")
    expect(section).toContain("processing")
    expect(section).toContain("original_status")
  })
})

// ---------------------------------------------------------------------------
// R2 — machine-readable retryability + error catalog.
// ---------------------------------------------------------------------------
describe("R2: machine-readable retryability", () => {
  it("documents retryable + retry_with_same_idempotency_key in the error envelope", () => {
    expect(doc).toContain("retryable")
    expect(doc).toContain("retry_with_same_idempotency_key")
    // They sit in the error-envelope field reference.
    const idx = doc.indexOf("### Error envelope")
    expect(idx).toBeGreaterThan(-1)
    const section = doc.slice(idx, idx + 2400)
    expect(section).toContain("retryable")
    expect(section).toContain("retry_with_same_idempotency_key")
  })

  it("the error catalog has a retryable column", () => {
    const idx = doc.indexOf("### Full error catalog")
    expect(idx).toBeGreaterThan(-1)
    const section = doc.slice(idx, idx + 6000)
    // A markdown header row that names the retryable column.
    expect(section).toMatch(/\|[^\n]*Retryable[^\n]*\|/i)
  })

  it("lists representative retryable=true codes and the in-flight reuse-key flag", () => {
    const idx = doc.indexOf("### Full error catalog")
    const section = doc.slice(idx, idx + 6000)
    for (const code of [
      "INTERNAL_ERROR", "DB_UNAVAILABLE", "SERVICE_UNAVAILABLE", "UPSTREAM_TIMEOUT",
      "PREDICTION_FAILED", "RATE_LIMITED", "TOO_MANY_RUNS", "IDEMPOTENCY_IN_FLIGHT",
    ]) {
      expect(section, `error catalog missing retryable code '${code}'`).toContain(code)
    }
  })

  it("states EVERY /v1 error returns the catalogued envelope; branch on code", () => {
    expect(doc.toLowerCase()).toMatch(/every[\s\S]{0,40}error[\s\S]{0,120}(envelope|catalog)/)
    expect(doc.toLowerCase()).toMatch(/branch[\s\S]{0,40}code|on `?code`?, never/)
  })

  it("OpenAPI ApiError carries retryable + retry_with_same_idempotency_key", () => {
    const idx = oas.indexOf("const ApiErrorSchema")
    expect(idx).toBeGreaterThan(-1)
    const section = oas.slice(idx, idx + 2000)
    expect(section).toContain("retryable")
    expect(section).toContain("retry_with_same_idempotency_key")
  })
})

// ---------------------------------------------------------------------------
// R3 — latency expectations + recommended timeouts.
// ---------------------------------------------------------------------------
describe("R3: latency expectations + recommended timeouts", () => {
  it("documents the edge timeout, server-side step ceiling, and a >=120s client timeout recommendation", () => {
    // ~100s edge bound on any single synchronous HTTP response.
    expect(doc).toMatch(/100\s*s/)
    // a heavy step can run up to ~300s server-side.
    expect(doc).toMatch(/300\s*s/)
    // recommend at least 120s (not 60s) for predict / session-predict.
    expect(doc).toMatch(/120\s*s/)
    expect(doc.toLowerCase()).toMatch(/recommend|at least 120|timeout of at least/)
  })
})

// ---------------------------------------------------------------------------
// R4 — SSE-keepalive predict.
// ---------------------------------------------------------------------------
describe("R4: SSE-keepalive predict", () => {
  it("documents Accept: text/event-stream / ?stream=keepalive on predict + session predict", () => {
    expect(doc).toContain("Accept: text/event-stream")
    expect(doc).toContain("?stream=keepalive")
    // keepalive comment frames, terminal result / error events.
    expect(doc).toMatch(/: keepalive/)
    expect(doc).toContain("event: result")
    expect(doc).toContain("event: error")
    // ~15s cadence.
    expect(doc).toMatch(/15\s*s/)
  })

  it("notes the plain-JSON path is unchanged without the Accept header", () => {
    expect(doc.toLowerCase()).toMatch(/without the accept header[\s\S]{0,80}(plain|unchanged|json)/)
  })
})

// ---------------------------------------------------------------------------
// R5 — SSE streaming contract for runs / workflows.
// ---------------------------------------------------------------------------
describe("R5: SSE streaming contract (runs/workflows)", () => {
  it("documents Last-Event-ID precedence + ?after, the seq cursor, and exactly-once", () => {
    expect(doc).toContain("Last-Event-ID")
    expect(doc).toMatch(/\?after=/)
    expect(doc.toLowerCase()).toMatch(/last-event-id[\s\S]{0,80}(precedence|takes precedence|wins)/)
    expect(doc.toLowerCase()).toMatch(/exactly-once|exactly once/)
    expect(doc.toLowerCase()).toMatch(/monotonic/)
    expect(doc.toLowerCase()).toMatch(/strictly[\s-]greater/)
  })

  it("documents the unbounded replay window (resume from seq=0)", () => {
    expect(doc.toLowerCase()).toMatch(/unbounded/)
    expect(doc).toMatch(/seq=0|from\s*`?seq`?\s*0|seq\s*0/i)
  })

  it("documents the terminal event: done (no [DONE] sentinel) and : keepalive", () => {
    expect(doc).toContain("event: done")
    expect(doc).not.toContain("[DONE]")
    expect(doc).toMatch(/: keepalive/)
    // framing id: / event: / data:.
    expect(doc).toMatch(/\bid:\s/)
    expect(doc).toMatch(/\bdata:\s/)
  })
})

// ---------------------------------------------------------------------------
// R6 — webhook signing recipe + retried delivery.
// ---------------------------------------------------------------------------
describe("R6: webhook signing + delivery", () => {
  it("documents the Coasty-Signature recipe and 5-min tolerance", () => {
    expect(doc).toMatch(/Coasty-Signature:\s*t=/)
    expect(doc).toMatch(/HMAC[_-]?SHA256/i)
    // signed bytes = "{t}." + raw body
    expect(doc).toMatch(/\{t\}\.|"\{t\}\."|<t>\./)
    // ±5 min / 300s tolerance.
    expect(doc).toMatch(/300\b/)
    expect(doc.toLowerCase()).toMatch(/constant-time/)
    // per-run secret whsec_ shown once.
    expect(doc).toContain("whsec_")
  })

  it("documents retried delivery (<=3 attempts, backoff, 4xx terminal) and dedupe", () => {
    expect(doc).toMatch(/3\s*attempts/)
    expect(doc.toLowerCase()).toMatch(/exponential backoff/)
    expect(doc.toLowerCase()).toMatch(/4xx[\s\S]{0,40}terminal|terminal[\s\S]{0,40}4xx/)
    // receivers must be idempotent / dedupe on the Coasty-Event id.
    expect(doc).toContain("Coasty-Event")
    expect(doc.toLowerCase()).toMatch(/idempotent|dedupe/)
    // HTTPS-only / SSRF-guarded.
    expect(doc.toLowerCase()).toMatch(/https-only|https only/)
  })

  it("includes a verification snippet that recomputes the HMAC", () => {
    // The existing python verify() example over "{t}." + raw_body.
    expect(doc).toMatch(/hmac\.new|hmac\.compare_digest/)
  })
})

// ---------------------------------------------------------------------------
// R7 — session TTL / expiry.
// ---------------------------------------------------------------------------
describe("R7: session TTL / expiry", () => {
  it("documents the 2-hour (7200s) idle TTL reset on predict/reset", () => {
    expect(doc).toMatch(/2-hour|2 hour|7200/)
    expect(doc).toContain("7200")
    expect(doc.toLowerCase()).toMatch(/idle[\s\S]{0,40}ttl|ttl[\s\S]{0,40}idle/)
    expect(doc.toLowerCase()).toMatch(/reset[\s\S]{0,60}each predict|each predict[\s\S]{0,60}reset|on each predict/)
  })

  it("documents expires_at on create/get and 404 SESSION_NOT_FOUND on expired/unknown", () => {
    expect(doc).toContain("expires_at")
    expect(doc).toMatch(/404[\s\S]{0,60}SESSION_NOT_FOUND|SESSION_NOT_FOUND[\s\S]{0,60}expired/)
  })

  it("documents that reset keeps the session config", () => {
    expect(doc.toLowerCase()).toMatch(/reset[\s\S]{0,120}(keeps|keep).{0,40}config|clears[\s\S]{0,120}accumulated/)
  })

  it("OpenAPI session create description no longer claims the stale 5-15 min TTL", () => {
    const idx = oas.indexOf('operationId: "createSession"')
    const section = oas.slice(idx, idx + 600)
    expect(section).not.toMatch(/5-15 min/)
    expect(section).toMatch(/2\s*h|7200/)
  })
})

// ---------------------------------------------------------------------------
// R8 — coordinate contract.
// ---------------------------------------------------------------------------
describe("R8: coordinate contract", () => {
  it("states coordinates are in the pixel space of the submitted screenshot, top-left origin, no normalization", () => {
    expect(doc.toLowerCase()).toMatch(/pixel space/)
    expect(doc.toLowerCase()).toMatch(/top-left/)
    expect(doc).toMatch(/\(0,\s*0\)/)
    expect(doc.toLowerCase()).toMatch(/no normalization|not normalized|never normalized/)
  })
})

// ---------------------------------------------------------------------------
// R9 — screenshot limits machine-readable in errors.
// ---------------------------------------------------------------------------
describe("R9: machine-readable screenshot limits", () => {
  it("documents error.examples on PAYLOAD_TOO_LARGE / INVALID_SCREENSHOT", () => {
    expect(doc).toContain("max_base64_bytes")
    expect(doc).toContain("10485760")
    expect(doc).toContain("min_base64_chars")
    expect(doc).toMatch(/"png"[\s\S]{0,10}"jpeg"/)
    // tied to the two error codes.
    expect(doc).toContain("PAYLOAD_TOO_LARGE")
    expect(doc).toContain("INVALID_SCREENSHOT")
    expect(doc.toLowerCase()).toMatch(/error\.examples|`examples`/)
  })

  it("OpenAPI surfaces the screenshot-limit examples values", () => {
    expect(oas).toContain("max_base64_bytes")
    expect(oas).toContain("10485760")
  })
})

// ---------------------------------------------------------------------------
// R10 — new response headers quick-reference + usage.billed.
// ---------------------------------------------------------------------------
describe("R10: new response headers + usage.billed", () => {
  it("documents the new idempotency + IETF rate-limit + alias headers", () => {
    expect(doc).toContain("Idempotency-Status")
    expect(doc).toContain("Idempotency-Replayed")
    expect(doc).toContain("X-Credits-Refunded")
    expect(doc).toContain("RateLimit-Limit")
    expect(doc).toContain("RateLimit-Remaining")
    expect(doc).toContain("RateLimit-Reset")
    expect(doc).toContain("X-Request-Id")
    // X-Request-Id is an alias of X-Coasty-Request-Id.
    expect(doc).toMatch(/X-Request-Id[\s\S]{0,80}X-Coasty-Request-Id|X-Coasty-Request-Id[\s\S]{0,80}X-Request-Id/)
  })

  it("documents usage.billed: true on a real billed call, false on test keys / replays", () => {
    expect(doc).toMatch(/usage\.billed|`billed`/)
    expect(doc.toLowerCase()).toMatch(/billed[\s\S]{0,120}(false|test key|replay)/)
  })

  it("OpenAPI UsageInfo carries the billed boolean", () => {
    const idx = oas.indexOf("UsageInfo:")
    const section = oas.slice(idx, idx + 1400)
    expect(section).toContain("billed")
  })
})
