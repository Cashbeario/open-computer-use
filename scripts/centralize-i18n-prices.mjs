#!/usr/bin/env node
/**
 * One-shot helper: convert hardcoded Coasty subscription prices in i18n
 * locale files to placeholder substitution form.  Targets ONLY the
 * specific keys known to contain Coasty prices (avoids damaging
 * unrelated content like competitor prices in seo.faq.q3).
 *
 * After this script runs, every locale file uses placeholders like
 * {starterPrice}, {unlimitedPrice}, etc.  Consumer code (layout.tsx,
 * seo-schemas.tsx) must then pass these variables when calling t().
 *
 * Idempotent: re-running on already-converted files is a no-op (the
 * regex only matches dollar amounts).
 *
 * Safe to delete after running.  Reversible via git revert.
 */
import { readFile, writeFile, readdir } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const LOCALE_DIR = path.resolve(__dirname, "..", "messages")

// ─── Keys to touch ─────────────────────────────────────────────────────────
//
// Each entry is a JSON path inside the locale file.  The script will walk
// each path, find the string value, and replace hardcoded Coasty prices
// with placeholder names — preserving every other character (including
// competitor prices, formatting, language-specific punctuation, etc).
const TARGET_KEYS = [
  ["seo", "home", "description"],
  ["seo", "home", "ogTitle"],
  ["seo", "home", "ogDescription"],
  ["seo", "home", "twitterDescription"],
  ["seo", "pricing", "description"],
  ["seo", "pricing", "ogTitle"],
  ["seo", "pricing", "ogDescription"],
  ["seo", "structuredData", "appDescription"],
  ["seo", "structuredData", "orgDescription"],
  ["seo", "structuredData", "productDescription"],
  ["seo", "structuredData", "websiteDescription"],
  ["seo", "structuredData", "softwareDescription"],
  ["comparePage", "ctaDescription"],
]

// Coasty-tier prices we know about (cents-exact match — won't accidentally
// hit competitor prices like $9,000 or $200/mo).  Order matters: longer
// patterns (e.g. $99/month) must match before shorter ones ($99).
// When a tier's price changes, bump the matching numeric here AND re-run
// `node scripts/replace-coasty-249-in-locales.mjs` (or a future
// equivalent) for the non-English locales that use translated month
// suffixes — this script's regex only covers /mo and /month.
const REPLACEMENTS = [
  // Long form first
  [/\$99\/month/g, "{unlimitedPriceLong}"],
  [/\$19\/month/g, "{starterPriceLong}"],
  // Short form
  [/\$99\/mo/g, "{unlimitedPrice}"],
  [/\$100\/mo/g, "{proPrice}"],
  [/\$50\/mo/g, "{plusPrice}"],
  [/\$19\/mo/g, "{starterPrice}"],
  [/\$9\/mo/g, "{litePrice}"],
]

function getAt(obj, pathArr) {
  let v = obj
  for (const k of pathArr) {
    if (v == null) return undefined
    v = v[k]
  }
  return v
}

function setAt(obj, pathArr, value) {
  let cur = obj
  for (let i = 0; i < pathArr.length - 1; i++) {
    if (cur[pathArr[i]] == null) return false
    cur = cur[pathArr[i]]
  }
  cur[pathArr[pathArr.length - 1]] = value
  return true
}

function applyReplacements(s) {
  let out = s
  let hits = 0
  for (const [re, repl] of REPLACEMENTS) {
    const before = out
    out = out.replace(re, repl)
    if (out !== before) hits++
  }
  return { out, hits }
}

async function main() {
  const files = (await readdir(LOCALE_DIR))
    .filter((f) => f.endsWith(".json"))
    .sort()

  let totalFiles = 0
  let totalKeys = 0
  let totalHits = 0

  for (const file of files) {
    const filePath = path.join(LOCALE_DIR, file)
    const raw = await readFile(filePath, "utf8")
    const data = JSON.parse(raw)

    let fileHits = 0
    let fileKeysTouched = 0

    for (const pathArr of TARGET_KEYS) {
      const v = getAt(data, pathArr)
      if (typeof v !== "string") continue
      const { out, hits } = applyReplacements(v)
      if (hits === 0) continue
      setAt(data, pathArr, out)
      fileHits += hits
      fileKeysTouched++
    }

    if (fileHits > 0) {
      await writeFile(filePath, JSON.stringify(data, null, 2) + "\n", "utf8")
      console.log(
        `${file.padEnd(10)} keys=${fileKeysTouched} substitutions=${fileHits}`,
      )
      totalFiles++
      totalKeys += fileKeysTouched
      totalHits += fileHits
    } else {
      console.log(`${file.padEnd(10)} (no Coasty-tier prices found)`)
    }
  }

  console.log("\n──────────────────────────────────────────")
  console.log(`Locales updated:        ${totalFiles}`)
  console.log(`Total keys mutated:     ${totalKeys}`)
  console.log(`Total substitutions:    ${totalHits}`)
}

main().catch((err) => {
  console.error("ERROR:", err)
  process.exit(1)
})
