/**
 * OSS-mode wiring guards — the "dormant scaffolding stays wired" suite.
 *
 * History: the OSS-mode rollout (lib/oss-mode.ts, lib/auto-secrets.ts,
 * lib/api-router.ts, lib/auth/current-identity.ts, lib/oss-mode-client.ts,
 * components/common/oss-banner.tsx, oss-setup-prompt.tsx) shipped fully
 * implemented and fully tested — and fully unmounted. Nothing imported it,
 * so the README quick start booted into a marketing page whose every CTA
 * 404'd and whose chat 401'd, while CSRF tokens were silently salted with
 * the literal string "undefined" (lib/csrf.ts reads CSRF_SECRET! and
 * auto-secrets never ran).
 *
 * These are source-scan pins in the style of tests/public-docs.test.tsx:
 * they assert each mount point KEEPS its OSS wiring. If you intentionally
 * move a mount, update the pin in the same commit — do not delete it.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const root = process.cwd()
const read = (p: string) => readFileSync(join(root, p), "utf8")

describe("instrumentation.ts boots auto-secrets (OSS Phase 8)", () => {
  const src = read("instrumentation.ts")

  it("dynamically imports lib/auto-secrets inside the nodejs-runtime guard", () => {
    // Dynamic import keeps node:fs out of the Edge instrumentation bundle —
    // same pattern as the machine-cleanup import below it.
    expect(src).toMatch(/NEXT_RUNTIME === 'nodejs'/)
    expect(src).toMatch(/await import\("@\/lib\/auto-secrets"\)/)
  })

  it("calls ensureLocalSecrets() before the cleanup service starts", () => {
    const secretsAt = src.indexOf("ensureLocalSecrets()")
    const cleanupAt = src.indexOf('"@/lib/services/machine-cleanup"')
    expect(secretsAt).toBeGreaterThan(-1)
    expect(cleanupAt).toBeGreaterThan(-1)
    expect(secretsAt).toBeLessThan(cleanupAt)
  })
})

describe("app/layout.tsx stamps the mode + mounts the banner", () => {
  const src = read("app/layout.tsx")

  it('renders <meta name="coasty-mode"> from describeMode() — the contract lib/oss-mode-client.ts reads', () => {
    expect(src).toMatch(/<meta name="coasty-mode" content=\{describeMode\(\)\}/)
  })

  it("mounts OssBanner gated by a server-side isOssMode() call", () => {
    expect(src).toMatch(/\{isOssMode\(\) && <OssBanner \/>\}/)
  })
})

describe("app/page.tsx routes OSS visitors into the app", () => {
  const src = read("app/page.tsx")

  it("branches on isOssMode() BEFORE creating a Supabase client", () => {
    const ossAt = src.indexOf("isOssMode()")
    const supabaseAt = src.indexOf("await createClient()")
    expect(ossAt).toBeGreaterThan(-1)
    expect(supabaseAt).toBeGreaterThan(-1)
    expect(ossAt).toBeLessThan(supabaseAt)
  })

  it("shows OssSetupPrompt when the key is missing, the chat surface when present", () => {
    expect(src).toMatch(/getCoastyApiKey\(\)/)
    expect(src).toMatch(/<OssSetupPrompt \/>/)
    expect(src).toMatch(/<HomeClient isAuthenticated=\{false\} ossMode \/>/)
  })
})

describe("app/home-client.tsx renders the chat surface in OSS mode", () => {
  const src = read("app/home-client.tsx")

  it("ossMode renders ChatContainer (not LandingPage) without the Stripe/referral handlers", () => {
    const ossBlock = src.slice(src.indexOf("if (ossMode)"), src.indexOf("// Landing page"))
    expect(ossBlock).toContain("<ChatContainer />")
    expect(ossBlock).not.toContain("LandingPage")
    expect(ossBlock).not.toContain("PaymentHandler")
    expect(ossBlock).not.toContain("ReferralProcessor")
  })
})

describe("app/auth/page.tsx replaces sign-in in OSS mode", () => {
  const src = read("app/auth/page.tsx")

  it("checks isOssMode() BEFORE the isSupabaseEnabled notFound() gate", () => {
    // Order matters: in OSS mode isSupabaseEnabled is false by definition,
    // so a later OSS check would be dead code behind a 404.
    const ossAt = src.indexOf("isOssMode()")
    const notFoundAt = src.indexOf("notFound()")
    expect(ossAt).toBeGreaterThan(-1)
    expect(notFoundAt).toBeGreaterThan(-1)
    expect(ossAt).toBeLessThan(notFoundAt)
  })

  it("renders OssSetupPrompt with the keyPresent variant", () => {
    expect(src).toMatch(/<OssSetupPrompt keyPresent=\{Boolean\(getCoastyApiKey\(\)\)\} \/>/)
  })
})

describe("app/api/chat/route.ts handles OSS identity before Supabase auth", () => {
  const src = read("app/api/chat/route.ts")

  it("branches on isOssMode() before the Supabase cookie lookup", () => {
    const ossAt = src.indexOf("if (isOssMode())")
    const cookieAt = src.indexOf("await createClient()")
    expect(ossAt).toBeGreaterThan(-1)
    expect(cookieAt).toBeGreaterThan(-1)
    expect(ossAt).toBeLessThan(cookieAt)
  })

  it("resolves identity via getCurrentIdentity (key-derived, never raw)", () => {
    expect(src).toContain('import { getCurrentIdentity } from \'@/lib/auth/current-identity\'')
    expect(src).toMatch(/await getCurrentIdentity\(\)/)
  })

  it("documents the forwardToBackend flip for when /v1/chat ships", () => {
    // Behavioral coverage lives in tests/api/chat-oss-mode.test.ts; this pin
    // keeps the migration instruction attached to the code it migrates.
    expect(src).toContain("forwardToBackend")
    expect(src).toContain("OSS_CHAT_NOT_AVAILABLE")
  })
})
