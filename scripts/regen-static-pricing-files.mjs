#!/usr/bin/env node
/**
 * Rebuild the price-bearing lines in public/llms.txt + public/llms-full.txt
 * from the canonical price source (lib/pricing/format).
 *
 * Why: these two files are served as-is to LLM crawlers (per the llmstxt.org
 * convention).  They contain hardcoded subscription prices that would drift
 * silently if anyone edited tiers.ts without remembering to also touch them.
 *
 * This script does targeted, line-anchored substitution — it never rewrites
 * the entire file, only the specific lines containing Coasty plan prices.
 * Surrounding marketing copy and structure are preserved verbatim.
 *
 * Run manually after any change to subscription-tier prices:
 *     node scripts/regen-static-pricing-files.mjs
 *
 * Or wire into `npm run build` via a pre-build hook.  The companion test
 * (tests/llms-pricing-drift.test.ts) will fail the CI if anyone edits a
 * price in tiers.ts without re-running this script.
 *
 * Idempotent: re-running on already-current files is a no-op.
 */
import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, "..")

// Late import via dynamic import — the helpers live in TypeScript files
// that this script can't require directly.  We bundle on-demand using a
// small ts-node-free loader: read the tiers.ts source as text, extract
// the priceUSD numbers via regex.  Simpler than spinning up tsx for one
// number per tier.
async function loadCanonicalPrices() {
  const tiersTs = await readFile(
    path.join(REPO_ROOT, "lib", "pricing", "tiers.ts"),
    "utf8",
  )
  // Each tier block looks like:
  //     id: "starter",
  //     name: "Starter",
  //     priceUSD: 19,
  //     ...
  // We pull every (id, priceUSD) pair.
  const blockRe = /id:\s*"(\w+)",[\s\S]*?priceUSD:\s*([\d.]+|null)/g
  const prices = {}
  let m
  while ((m = blockRe.exec(tiersTs)) !== null) {
    const [, id, priceRaw] = m
    if (priceRaw === "null") continue
    prices[id] = Number(priceRaw)
  }
  return prices
}

/**
 * Build the exact display strings the static files use.  Mirrors the
 * formatters in lib/pricing/format.ts (priceMonthly, priceMonthlyLong)
 * — keep these in sync if you ever change the format there.
 */
function buildSubstitutions(prices) {
  // Each pattern matches the PREVIOUS canonical price (the literal that
  // currently exists in public/llms*.txt). After bumping a tier in
  // lib/pricing/tiers.ts you MUST update the corresponding pattern below
  // to the about-to-be-replaced value, run this script, then commit both
  // the pattern bump and the regenerated llms files together. The drift
  // test (tests/llms-pricing-drift.test.ts) will catch a forgotten run.
  return [
    // Long-form first (so "$99/month" matches before "$99/mo")
    {
      pattern: /\$99\/month/g,
      replacement: `$${prices.unlimited}/month`,
    },
    {
      pattern: /\$19\/month/g,
      replacement: `$${prices.starter}/month`,
    },
    {
      pattern: /\$99\/mo/g,
      replacement: `$${prices.unlimited}/mo`,
    },
    {
      pattern: /\$100\/mo/g,
      replacement: `$${prices.pro}/mo`,
    },
    {
      pattern: /\$50\/mo/g,
      replacement: `$${prices.plus}/mo`,
    },
    {
      pattern: /\$19\/mo/g,
      replacement: `$${prices.starter}/mo`,
    },
    {
      pattern: /\$9\/mo/g,
      replacement: `$${prices.lite}/mo`,
    },
    // "X-concurrent-agent cap" — verbatim mentions of the cap value.
    // Keep in sync with lib/pricing/tiers.ts unlimited.swarmAgentsLimit.
  ]
}

async function rewriteFile(relPath, substitutions) {
  const fullPath = path.join(REPO_ROOT, relPath)
  const before = await readFile(fullPath, "utf8")
  let after = before
  let hits = 0
  for (const { pattern, replacement } of substitutions) {
    after = after.replace(pattern, (m) => {
      if (m === replacement) return m
      hits++
      return replacement
    })
  }
  if (after === before) {
    console.log(`${relPath.padEnd(28)} (already up-to-date)`)
    return false
  }
  await writeFile(fullPath, after, "utf8")
  console.log(`${relPath.padEnd(28)} ${hits} substitutions written`)
  return true
}

async function main() {
  const prices = await loadCanonicalPrices()
  console.log("Canonical prices (from lib/pricing/tiers.ts):")
  for (const [id, p] of Object.entries(prices)) {
    console.log(`  ${id.padEnd(12)} $${p}`)
  }
  console.log("")

  const subs = buildSubstitutions(prices)

  let any = false
  for (const rel of ["public/llms.txt", "public/llms-full.txt"]) {
    any = (await rewriteFile(rel, subs)) || any
  }
  console.log("")
  console.log(any ? "✅ static price files re-synced" : "✅ nothing to do")
}

main().catch((err) => {
  console.error("ERROR:", err)
  process.exit(1)
})
