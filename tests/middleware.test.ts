/**
 * Middleware integration test for the scanner 410-Gone short-circuit.
 *
 * Asserts that:
 *   1. A request to a known probe path returns 410 (not 404, not 200).
 *   2. The response body is empty so no information is disclosed.
 *   3. `Cache-Control: no-store` is set so CDNs cannot mask future
 *      probes from our access log.
 *   4. A structured log line `{"kind":"scanner_blocked", ...}` is emitted
 *      to stdout so CloudWatch Logs Insights can aggregate probe traffic
 *      without re-parsing UA strings.
 *
 * Mocks Supabase the same way `middleware-security.test.ts` does so the
 * short-circuit runs in isolation from auth / locale / CSP code paths.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { NextRequest } from "next/server"

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: { getUser: async () => ({ data: { user: null }, error: null }) },
    from: () => ({
      select: () => ({
        eq: () => ({ single: async () => ({ data: { onboarding_completed: true }, error: null }) }),
      }),
    }),
  }),
}))
vi.mock("@/lib/supabase/config", () => ({ isSupabaseEnabled: true }))
vi.mock("@/lib/csrf", () => ({ validateCsrfToken: async () => true }))

let middleware: typeof import("../middleware").middleware

beforeEach(async () => {
  vi.resetModules()
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co"
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key"
  ;({ middleware } = await import("../middleware"))
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("middleware: scanner 410-Gone short-circuit", () => {
  it("returns 410 with empty body and Cache-Control: no-store for a probe path", async () => {
    const req = new NextRequest("https://example.com/.env.local")
    const res = await middleware(req)

    expect(res.status).toBe(410)
    // Empty body — no information disclosure.
    const body = await res.text()
    expect(body).toBe("")
    expect(res.headers.get("Cache-Control")).toMatch(/no-store/)
  })

  it("emits a structured `kind:\"scanner_blocked\"` log line with path, ip, ua", async () => {
    // Capture console.log so we can inspect emitted JSON lines.
    const logs: string[] = []
    const logSpy = vi
      .spyOn(console, "log")
      .mockImplementation((...args: unknown[]) => {
        // Coerce each arg to string and concatenate the way Node does.
        logs.push(args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" "))
      })

    try {
      const req = new NextRequest("https://example.com/wp-admin/setup-config.php", {
        headers: new Headers({
          "user-agent": "scanner/1.0",
          "cf-connecting-ip": "203.0.113.42",
        }),
      })
      const res = await middleware(req)
      expect(res.status).toBe(410)

      // Find the structured scanner_blocked line.
      const scannerLine = logs.find((l) => l.includes('"kind":"scanner_blocked"'))
      expect(scannerLine, "expected a scanner_blocked log line").toBeTruthy()

      const parsed = JSON.parse(scannerLine!)
      expect(parsed.kind).toBe("scanner_blocked")
      expect(parsed.path).toBe("/wp-admin/setup-config.php")
      expect(parsed.ip).toBe("203.0.113.42")
      expect(parsed.ua).toBe("scanner/1.0")
      // Must not echo a full URL with query string — only pathname.
      expect(scannerLine).not.toContain("example.com")
    } finally {
      logSpy.mockRestore()
    }
  })

  it("does NOT short-circuit a request to /.well-known/acme-challenge/xyz (CRITICAL: cert renewal)", async () => {
    const req = new NextRequest(
      "https://example.com/.well-known/acme-challenge/some-token",
    )
    const res = await middleware(req)
    // The middleware allows this through; the eventual status will be a
    // normal 200 or 404 from the app router, but it MUST NOT be 410.
    expect(res.status).not.toBe(410)
  })

  it("does NOT short-circuit a legitimate chat route", async () => {
    const req = new NextRequest("https://example.com/c/abc-123")
    const res = await middleware(req)
    expect(res.status).not.toBe(410)
  })

  it("scanner short-circuit fires for path-traversal probes", async () => {
    const req = new NextRequest("https://example.com/%2e%2e%2fetc%2fpasswd")
    const res = await middleware(req)
    expect(res.status).toBe(410)
  })
})
