/**
 * Proxy response-encoding guard — every Next.js proxy that streams a backend
 * response must strip `content-encoding` and `content-length` from the
 * forwarded headers.
 *
 * Live incident (2026-06-11): Node's fetch (undici) transparently decompresses
 * gzipped upstream bodies but leaves the original headers on
 * `response.headers`. The /v1 proxy copied them wholesale, so every backend
 * response >= the GZipMiddleware floor (1000 bytes, backend/main.py) reached
 * Cloudflare as a plaintext body labeled "Content-Encoding: gzip" with the
 * compressed byte count. Cloudflare's strict parser rejected it and served a
 * 502 HTML page — while the lenient ALB logged a delivered 200, which made the
 * failure look like infrastructure flakiness instead of a proxy bug. Symptom
 * set: GET /v1/machines 502'd deterministically once the machine list grew
 * past 1KB; session predict 502'd whenever the reasoning text pushed the body
 * over the floor; small responses (models, pricing, error envelopes) always
 * passed. Proven live: /v1/machines -> 502, /v1/machines?limit=1 -> 200.
 *
 * Each proxy fix also documents itself in-file; this test exists so a future
 * refactor (or a brand-new proxy copied from an old template) cannot silently
 * reintroduce the mismatch on the routes listed here.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const ROOT = join(__dirname, "..")

const PROXY_ROUTES = [
  "app/v1/[...path]/route.ts",
  "app/api/v1/cua/[...path]/route.ts",
  "app/api/osworld/[...path]/route.ts",
  "app/api/electron/proxy/[...path]/route.ts",
]

describe.each(PROXY_ROUTES)("%s", (route) => {
  const src = readFileSync(join(ROOT, route), "utf-8")

  it("strips content-encoding from forwarded response headers", () => {
    expect(src).toContain('"content-encoding"')
  })

  it("strips content-length from forwarded response headers", () => {
    expect(src).toContain('"content-length"')
  })

  it("still strips the hop-by-hop headers", () => {
    expect(src).toContain('"transfer-encoding"')
    expect(src).toContain('"connection"')
  })
})

describe("public API proxies request identity encoding upstream", () => {
  // The two customer-facing proxies skip the gzip+gunzip round trip on the
  // in-VPC hop entirely (Cloudflare re-compresses toward the client anyway).
  // Belt and braces: the response-side strip above stays mandatory even so.
  it.each([
    "app/v1/[...path]/route.ts",
    "app/api/v1/cua/[...path]/route.ts",
  ])("%s sends Accept-Encoding: identity", (route) => {
    const src = readFileSync(join(ROOT, route), "utf-8")
    expect(src).toContain('"Accept-Encoding": "identity"')
  })
})
