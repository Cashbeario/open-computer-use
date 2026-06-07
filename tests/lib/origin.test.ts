/**
 * Tests for `lib/origin.ts` — the OAuth-callback origin resolver.
 *
 * Pins the precedence order (NEXT_PUBLIC_APP_URL > x-forwarded-host >
 * host header > req.url > APP_DOMAIN), prod-mode bind-address validation,
 * dev-mode passthrough, and the security trade-off that forwarded
 * headers are consulted only when the env var is unset (so an attacker
 * setting `X-Forwarded-Host: evil.com` cannot redirect OAuth in a
 * correctly-configured production env).
 *
 * Mirrors the shape of tests/lib/client-ip.test.ts.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { resolveRequestOrigin } from "@/lib/origin"
import { APP_DOMAIN } from "@/lib/config"

function mkReq(url: string, headers: Record<string, string> = {}) {
  return { url, headers: new Headers(headers) }
}

// `process.env.NODE_ENV` is typed as a read-only literal union in Next.js's
// type augmentation. Cast through a mutable shape for these env-flip tests.
// IMPORTANT: never do `process.env = { ... }` — Node treats process.env
// specially, and replacing it can detach a captured alias from the real
// env. We only mutate property values, capturing originals per-test for
// restoration.
const env = process.env as Record<string, string | undefined>
const TOUCHED_KEYS = ["NEXT_PUBLIC_APP_URL", "NODE_ENV"] as const
let savedEnv: Partial<Record<(typeof TOUCHED_KEYS)[number], string | undefined>>

beforeEach(() => {
  savedEnv = {}
  for (const k of TOUCHED_KEYS) {
    savedEnv[k] = env[k]
  }
  delete env.NEXT_PUBLIC_APP_URL
  // Default test env is non-production so the bind-address validator
  // doesn't fire on dev-shaped fixtures.
  env.NODE_ENV = "test"
})
afterEach(() => {
  vi.restoreAllMocks()
  for (const k of TOUCHED_KEYS) {
    const v = savedEnv[k]
    if (v === undefined) {
      delete env[k]
    } else {
      env[k] = v
    }
  }
})

describe("resolveRequestOrigin", () => {
  // 1. Env-var path wins unconditionally — this is the prod-safe path.
  it("prefers NEXT_PUBLIC_APP_URL when set, ignoring forwarded headers", () => {
    env.NEXT_PUBLIC_APP_URL ="https://coasty.ai"
    const req = mkReq("http://0.0.0.0:3000/api/x", {
      "x-forwarded-host": "evil.com",
      "x-forwarded-proto": "https",
    })
    expect(resolveRequestOrigin(req)).toBe("https://coasty.ai")
  })

  // 2. Env-var trailing slash normalized.
  it("strips trailing slashes from NEXT_PUBLIC_APP_URL", () => {
    env.NEXT_PUBLIC_APP_URL ="https://coasty.ai///"
    const req = mkReq("http://0.0.0.0:3000/api/x")
    expect(resolveRequestOrigin(req)).toBe("https://coasty.ai")
  })

  // 3. ALB/CloudFront path: env unset, forwarded headers honored.
  it("uses x-forwarded-host + x-forwarded-proto when env unset", () => {
    const req = mkReq("http://0.0.0.0:3000/api/x", {
      "x-forwarded-host": "coasty.ai",
      "x-forwarded-proto": "https",
    })
    expect(resolveRequestOrigin(req)).toBe("https://coasty.ai")
  })

  // 4. Multi-hop x-forwarded-host: take leftmost.
  it("takes the leftmost hop from a comma-separated x-forwarded-host", () => {
    const req = mkReq("http://0.0.0.0:3000/api/x", {
      "x-forwarded-host": "coasty.ai, internal-alb.us-east-1.amazonaws.com",
      "x-forwarded-proto": "https",
    })
    expect(resolveRequestOrigin(req)).toBe("https://coasty.ai")
  })

  // 5. host-header fallback when forwarded headers absent.
  it("falls back to raw host header when x-forwarded-host is absent", () => {
    const req = mkReq("http://0.0.0.0:3000/api/x", {
      host: "coasty.ai",
      "x-forwarded-proto": "https",
    })
    expect(resolveRequestOrigin(req)).toBe("https://coasty.ai")
  })

  // 6. Dev fallback: no env, no headers — use req.url origin.
  it("falls back to req.url origin when env and headers are unset (dev)", () => {
    const req = mkReq("http://localhost:3000/api/x")
    expect(resolveRequestOrigin(req)).toBe("http://localhost:3000")
  })

  // 7. Localhost via host header in dev — protocol heuristic picks http.
  it("uses http for localhost in the raw-host path", () => {
    const req = mkReq("http://localhost:3000/api/x", {
      host: "localhost:3000",
    })
    expect(resolveRequestOrigin(req)).toBe("http://localhost:3000")
  })

  // 8. Production safety net — req.url is a bind address.
  it("in production, logs a warning and falls back to APP_DOMAIN when req.url is a bind address", () => {
    env.NODE_ENV = "production"
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    const req = mkReq("http://0.0.0.0:3000/api/x")
    expect(resolveRequestOrigin(req)).toBe(APP_DOMAIN)
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining("bind address"),
    )
  })

  // 9. Production safety net — forwarded-host is 127.0.0.1.
  it("in production, falls back to APP_DOMAIN when x-forwarded-host is 127.0.0.1", () => {
    env.NODE_ENV = "production"
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    const req = mkReq("http://0.0.0.0:3000/api/x", {
      "x-forwarded-host": "127.0.0.1:3000",
      "x-forwarded-proto": "https",
    })
    expect(resolveRequestOrigin(req)).toBe(APP_DOMAIN)
    expect(spy).toHaveBeenCalledOnce()
  })

  // 10. Dev does NOT trigger the production safety net.
  it("in non-production, allows bind-address origins to pass through", () => {
    env.NODE_ENV = "development"
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    const req = mkReq("http://0.0.0.0:3000/api/x")
    expect(resolveRequestOrigin(req)).toBe("http://0.0.0.0:3000")
    expect(spy).not.toHaveBeenCalled()
  })

  // 11. Malformed req.url doesn't crash — falls back to APP_DOMAIN.
  it("falls back to APP_DOMAIN when req.url cannot be parsed", () => {
    const req = mkReq("not-a-url")
    expect(resolveRequestOrigin(req)).toBe(APP_DOMAIN)
  })
})
