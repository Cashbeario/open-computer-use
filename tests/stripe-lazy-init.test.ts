/**
 * stripe-lazy-init.test.ts — guards lazy Stripe construction in API routes.
 *
 * `next build` imports EVERY route module during page-data collection, so a
 * module-scope `new Stripe(process.env.STRIPE_API_KEY!)` throws "Neither
 * apiKey nor config.authenticator provided" and fails the build on any clone
 * without a Stripe key (OSS contributors, CI without billing secrets). Each
 * billing route must instead construct Stripe inside a memoized getStripe()
 * so the throw is deferred to the first request that actually needs it.
 *
 * Source-level anti-drift in the same spirit as api-wallet.test.ts: pins the
 * lazy-init shape so a future refactor can't silently reintroduce the
 * module-scope construction.
 */
import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const root = process.cwd()
const read = (p: string) => readFileSync(join(root, p), "utf8")

const STRIPE_ROUTES = [
  "app/api/credits/webhook/route.ts",
  "app/api/credits/checkout/route.ts",
  "app/api/credits/auto-refill/execute/route.ts",
  "app/api/subscription/checkout/route.ts",
  "app/api/subscription/portal/route.ts",
  "app/api/developers/wallet/checkout/route.ts",
] as const

describe("Stripe routes construct the client lazily, not at module scope", () => {
  for (const file of STRIPE_ROUTES) {
    describe(file, () => {
      const src = read(file)

      it("has no module-scope `const x = new Stripe(...)`", () => {
        // The pre-fix pattern ran the constructor at import time (column 0
        // `const`). Function-local construction is indented, so this regex
        // only matches the module-scope form.
        expect(src).not.toMatch(/^const\s+\w+\s*=\s*new Stripe\(/m)
      })

      it("declares the memoized getStripe getter", () => {
        expect(src).toContain("function getStripe")
      })

      it("constructs Stripe only inside getStripe", () => {
        // Every `new Stripe(` occurrence must sit between the getter
        // declaration and its closing `return _stripe`.
        const getterStart = src.indexOf("function getStripe")
        const getterEnd = src.indexOf("return _stripe", getterStart)
        expect(getterStart).toBeGreaterThan(-1)
        expect(getterEnd).toBeGreaterThan(getterStart)
        let idx = src.indexOf("new Stripe(")
        expect(idx).toBeGreaterThan(-1)
        while (idx !== -1) {
          expect(idx, "`new Stripe(` outside getStripe body").toBeGreaterThan(getterStart)
          expect(idx, "`new Stripe(` outside getStripe body").toBeLessThan(getterEnd)
          idx = src.indexOf("new Stripe(", idx + 1)
        }
      })

      it("still reads process.env.STRIPE_API_KEY", () => {
        expect(src).toContain("process.env.STRIPE_API_KEY")
      })
    })
  }
})
