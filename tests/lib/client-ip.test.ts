/**
 * Tests for `lib/client-ip.ts`.
 *
 * Covers the precedence order (cf-connecting-ip > true-client-ip >
 * x-forwarded-for first-public > x-real-ip > 'unknown'), IPv4 + IPv6
 * private-range filtering, header-bag polymorphism (Web Headers vs
 * plain object), and the user-agent classification buckets.
 *
 * Each test maps to a numbered case in the original spec for traceability.
 */
import { describe, it, expect } from "vitest"
import { getClientIp, classifyBot } from "@/lib/client-ip"

describe("getClientIp", () => {
  // 1. cf-connecting-ip wins over XFF.
  it("returns cf-connecting-ip even when x-forwarded-for is also set", () => {
    const h = new Headers({
      "cf-connecting-ip": "203.0.113.7",
      "x-forwarded-for": "1.2.3.4",
    })
    expect(getClientIp(h)).toBe("203.0.113.7")
  })

  // 2. XFF used when CF header missing.
  it("returns the XFF entry when cf-connecting-ip is missing", () => {
    const h = new Headers({ "x-forwarded-for": "1.2.3.4" })
    expect(getClientIp(h)).toBe("1.2.3.4")
  })

  // 3. ALB-prepended XFF: skip private hops, return first public.
  it("skips private hops in x-forwarded-for and returns first public IP", () => {
    const h = new Headers({
      "x-forwarded-for": "10.0.0.1, 1.2.3.4, 192.168.1.1",
    })
    expect(getClientIp(h)).toBe("1.2.3.4")
  })

  // 4. All-private XFF: return leftmost as last-resort debug aid.
  it("returns leftmost entry when every x-forwarded-for hop is private", () => {
    const h = new Headers({ "x-forwarded-for": "10.0.0.1, 192.168.1.1" })
    expect(getClientIp(h)).toBe("10.0.0.1")
  })

  // 5. Spoof attempt — internal cf-connecting-ip should be ignored.
  it("ignores a private cf-connecting-ip and falls through to XFF", () => {
    const h = new Headers({
      "cf-connecting-ip": "10.0.0.5",
      "x-forwarded-for": "1.2.3.4",
    })
    expect(getClientIp(h)).toBe("1.2.3.4")
  })

  // 6. No headers at all → 'unknown'.
  it("returns 'unknown' when no IP-bearing headers are present", () => {
    const h = new Headers()
    expect(getClientIp(h)).toBe("unknown")
  })

  // 7. IPv6 handling — loopback (::1) is private, public v6 is not.
  it("handles IPv6 addresses: skips ::1 and returns the public v6 hop", () => {
    const h = new Headers({ "x-forwarded-for": "::1, 2001:db8::1" })
    expect(getClientIp(h)).toBe("2001:db8::1")
  })

  // 8. Header lookup is case-insensitive via Web Headers contract.
  it("looks up header names case-insensitively", () => {
    const h = new Headers()
    // Headers API normalizes to lowercase internally — verify Title-Case
    // input round-trips correctly to a successful lookup.
    h.set("X-Forwarded-For", "1.2.3.4")
    expect(getClientIp(h)).toBe("1.2.3.4")
  })

  // 9. cf-connecting-ip-only smoke test.
  it("returns cf-connecting-ip when it is the only header set", () => {
    const h = new Headers({ "cf-connecting-ip": "198.51.100.42" })
    expect(getClientIp(h)).toBe("198.51.100.42")
  })

  // 10. true-client-ip fallback (Cloudflare Enterprise alias).
  it("uses true-client-ip when cf-connecting-ip is missing", () => {
    const h = new Headers({ "true-client-ip": "203.0.113.99" })
    expect(getClientIp(h)).toBe("203.0.113.99")
  })

  // 11. XFF with trailing comma / extra whitespace is tolerated.
  it("handles XFF with trailing commas and irregular whitespace", () => {
    const h = new Headers({
      "x-forwarded-for": "  10.0.0.1 ,  1.2.3.4  ,  ",
    })
    expect(getClientIp(h)).toBe("1.2.3.4")
  })

  // 12. Plain-object header bag (Node http style).
  it("accepts a plain-object header bag (Node http style)", () => {
    const h = {
      "x-forwarded-for": "10.0.0.1, 1.2.3.4",
      "user-agent": "test",
    }
    expect(getClientIp(h)).toBe("1.2.3.4")
  })

  // 12b. Plain-object header bag with array values.
  it("accepts a plain-object header bag with array-valued headers", () => {
    const h: Record<string, string | string[]> = {
      "cf-connecting-ip": ["203.0.113.55"],
      "x-forwarded-for": "1.2.3.4",
    }
    expect(getClientIp(h)).toBe("203.0.113.55")
  })

  // x-real-ip last-resort fallback.
  it("falls back to x-real-ip when nothing else is usable", () => {
    const h = new Headers({ "x-real-ip": "203.0.113.11" })
    expect(getClientIp(h)).toBe("203.0.113.11")
  })

  // Private x-real-ip is rejected (must not become the reported IP).
  it("ignores a private x-real-ip and returns 'unknown'", () => {
    const h = new Headers({ "x-real-ip": "192.168.0.1" })
    expect(getClientIp(h)).toBe("unknown")
  })

  // 172.16-172.31 boundary check (RFC1918 covers only this range, not
  // 172.0-15 or 172.32+ which ARE public).
  it("treats 172.16-172.31 as private but 172.32 as public", () => {
    expect(
      getClientIp(new Headers({ "x-forwarded-for": "172.16.0.1, 8.8.8.8" })),
    ).toBe("8.8.8.8")
    expect(
      getClientIp(new Headers({ "x-forwarded-for": "172.31.255.255, 8.8.8.8" })),
    ).toBe("8.8.8.8")
    // 172.32 is OUTSIDE RFC1918 — should be reported as the client IP.
    expect(
      getClientIp(new Headers({ "x-forwarded-for": "172.32.0.1" })),
    ).toBe("172.32.0.1")
  })
})

describe("classifyBot", () => {
  // 13. curl is a CLI tool.
  it("classifies curl as cli_tool", () => {
    expect(classifyBot("curl/8.7.1")).toBe("cli_tool")
  })

  // 14. Generic browser UA falls into the 'browser' bucket.
  it("classifies a standard browser UA as browser", () => {
    expect(
      classifyBot(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      ),
    ).toBe("browser")
  })

  // 15. Search crawler — case-insensitive match on 'googlebot'.
  it("classifies GoogleBot as search_crawler", () => {
    expect(classifyBot("GoogleBot/2.1 (+http://www.google.com/bot.html)")).toBe(
      "search_crawler",
    )
  })

  // 16. AI crawler — ChatGPT-User UA.
  it("classifies ChatGPT-User as ai_crawler", () => {
    expect(classifyBot("ChatGPT-User")).toBe("ai_crawler")
  })

  // 17. Missing UA → 'no_ua'.
  it("classifies a missing UA as no_ua", () => {
    expect(classifyBot(undefined)).toBe("no_ua")
    expect(classifyBot(null)).toBe("no_ua")
    expect(classifyBot("")).toBe("no_ua")
  })

  // Extra: SEO crawler bucket.
  it("classifies AhrefsBot as seo_crawler", () => {
    expect(classifyBot("Mozilla/5.0 (compatible; AhrefsBot/7.0; +http://ahrefs.com/robot/)")).toBe(
      "seo_crawler",
    )
  })

  // Extra: headless browser must beat the generic 'browser' fallback
  // because Puppeteer/Playwright UAs typically also contain 'Chrome'.
  it("classifies HeadlessChrome as headless_browser (not browser)", () => {
    expect(
      classifyBot(
        "Mozilla/5.0 (X11; Linux x86_64) HeadlessChrome/120.0.0.0 Safari/537.36",
      ),
    ).toBe("headless_browser")
  })

  // Extra: Coasty client bucket.
  it("classifies our own Electron client as coasty_client", () => {
    expect(classifyBot("Coasty/1.5.0 Electron/40.6.0")).toBe("coasty_client")
  })

  // Extra: completely unrecognized UA.
  it("returns 'unknown' for non-empty UAs that match nothing", () => {
    expect(classifyBot("FooBarMonitor/1.0")).toBe("unknown")
  })
})
