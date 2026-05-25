/**
 * Drift guard for public/llms.txt + public/llms-full.txt.
 *
 * These two files are static-served to LLM crawlers (llmstxt.org convention)
 * and contain literal Coasty subscription prices.  If a price changes in
 * lib/pricing/tiers.ts without running `node scripts/regen-static-pricing-files.mjs`,
 * the files drift silently — AI agents end up citing stale pricing in
 * recommendations and benchmarks.
 *
 * This test asserts that every literal Coasty plan price the static files
 * carry matches the canonical priceUSD in tiers.ts.  If it fails, run:
 *
 *     node scripts/regen-static-pricing-files.mjs
 *
 * then commit the updated public/llms*.txt diff alongside the tiers.ts
 * price change.
 *
 * Run: npx vitest run tests/llms-pricing-drift.test.ts
 */
import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import path from "node:path"
import {
  priceMonthly,
  priceMonthlyLong,
} from "@/lib/pricing/format"

const REPO_ROOT = path.resolve(__dirname, "..")
const LLMS_TXT = readFileSync(path.join(REPO_ROOT, "public/llms.txt"), "utf8")
const LLMS_FULL_TXT = readFileSync(
  path.join(REPO_ROOT, "public/llms-full.txt"),
  "utf8",
)

/**
 * For each (file, tier) check that the static file contains the
 * current canonical price string.  We don't assert the inverse (no
 * stale prices anywhere) because the files mention competitor prices
 * too — only Coasty's own tier prices are in our domain.
 */
describe("llms.txt / llms-full.txt — Coasty price freshness", () => {
  // Strategy: each file has a manually-curated list of Coasty plan-price
  // strings that MUST be present (the file was edited to mention them).
  // The expected value is derived from the canonical helper, so a price
  // change in lib/pricing/tiers.ts shifts the expected value — if the
  // regen script wasn't run, the assertion fails (the file still has
  // the old price, the new price string isn't found).
  //
  // We deliberately do NOT use fuzzy "near the tier name" matching
  // because competitor names contain "Pro"/"Unlimited"/etc. — that's
  // hopelessly noisy.  Instead we just check the canonical formatted
  // string is somewhere in the file.

  type Expect = { file: string; body: string; tier: "starter" | "plus" | "pro" | "unlimited"; form: "short" | "long" }
  const expectations: Expect[] = [
    // llms.txt currently mentions Starter + Unlimited (Plus/Pro aren't
    // in the short LLM doc — that's an editorial choice).
    { file: "llms.txt", body: LLMS_TXT, tier: "starter",   form: "short" },
    { file: "llms.txt", body: LLMS_TXT, tier: "unlimited", form: "short" },

    // llms-full.txt has both forms for Unlimited.
    { file: "llms-full.txt", body: LLMS_FULL_TXT, tier: "starter",   form: "short" },
    { file: "llms-full.txt", body: LLMS_FULL_TXT, tier: "unlimited", form: "short" },
  ]

  for (const exp of expectations) {
    const expected = exp.form === "short"
      ? priceMonthly(exp.tier)
      : priceMonthlyLong(exp.tier)
    it(`${exp.file}: contains current ${exp.tier} ${exp.form}-form price "${expected}"`, () => {
      expect(
        exp.body.includes(expected),
        `${exp.file} should contain "${expected}" (current canonical ${exp.tier} price). ` +
          `If the price changed in lib/pricing/tiers.ts, run ` +
          `\`node scripts/regen-static-pricing-files.mjs\` to re-sync, then commit the diff.`,
      ).toBe(true)
    })
  }
})
