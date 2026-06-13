/**
 * Wave-1 doc-drift contract — source scan of the canonical Markdown reference.
 *
 * `lib/coasty-api-docs-md.ts` exports the single Markdown constant served
 * verbatim at https://coasty.ai/docs/llms.txt. It is the authoritative, machine-
 * ingestible description of the whole Coasty Computer Use API, so any drift
 * between it and the live backend is a customer-facing defect.
 *
 * This file pins three corrections (same style as
 * tests/machines-internal-auth.test.ts: read the source with readFileSync and
 * assert on substrings, since the doc is a static string with no runtime):
 *
 *  A4 — the live API emits X-RateLimit-Limit / -Remaining / -Reset on every
 *       response; document them (advisory) in the response-headers section.
 *  E3 — the scroll action's `direction` is one of "vertical" | "horizontal"
 *       (horizontal comes from hscroll); document the enum.
 *  F1 — doc/reality drift: session-id examples must use the real `ses_` prefix
 *       (not `sess_`); GET /v1/models + the version tables must list v5 and call
 *       v5 the default (not "default v3"); /predict and /ground must mention
 *       Idempotency-Key (replays return X-Coasty-Idempotent-Replay and bill 0);
 *       and the two divergent action-param tables must be reconciled to the
 *       LIST/seconds/x1 wire shape, marked as canonical.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const ROOT = join(__dirname, "..")
const DOC = "lib/coasty-api-docs-md.ts"
const doc = readFileSync(join(ROOT, DOC), "utf-8")

// ---------------------------------------------------------------------------
// A4 — rate-limit response headers are documented (advisory).
// ---------------------------------------------------------------------------
describe("A4: rate-limit response headers", () => {
  it("documents all three X-RateLimit-* header names", () => {
    expect(doc).toContain("X-RateLimit-Limit")
    expect(doc).toContain("X-RateLimit-Remaining")
    expect(doc).toContain("X-RateLimit-Reset")
  })

  it("notes that they are advisory", () => {
    // The names must sit near the word "advisory" so the reader knows they are
    // informational, not a hard contract.
    const idx = doc.indexOf("X-RateLimit-Limit")
    expect(idx).toBeGreaterThan(-1)
    const window = doc.slice(Math.max(0, idx - 400), idx + 400)
    expect(window.toLowerCase()).toContain("advisory")
  })
})

// ---------------------------------------------------------------------------
// E3 — scroll direction enum is documented.
// ---------------------------------------------------------------------------
describe("E3: scroll direction enum", () => {
  it("documents scroll direction as vertical | horizontal", () => {
    // Find the documentation that ties scroll's `direction` to its two values.
    expect(doc).toMatch(/direction[\s\S]{0,160}"vertical"[\s\S]{0,40}"horizontal"/)
  })

  it("mentions both vertical and horizontal for scroll", () => {
    expect(doc).toContain('"vertical"')
    expect(doc).toContain('"horizontal"')
  })
})

// ---------------------------------------------------------------------------
// F1 — doc/reality drift fixes.
// ---------------------------------------------------------------------------
describe("F1: doc/reality drift", () => {
  it("uses the real ses_ session-id prefix, never sess_", () => {
    expect(doc).toContain("ses_")
    // The 4-letter sess_ prefix must be gone from every session-id example.
    expect(doc).not.toMatch(/sess_/)
  })

  it("lists v5 and states v5 is the default (no 'default v3')", () => {
    expect(doc).toContain("v5")
    // The literal stale phrasing must be gone.
    expect(doc).not.toContain("default v3")
    // v5 must be marked as the default somewhere.
    expect(doc).toMatch(/v5[^\n]*default|default[^\n]*v5/)
  })

  it("GET /v1/models example advertises a v5 cua_version", () => {
    const modelsIdx = doc.indexOf("GET /v1/models")
    expect(modelsIdx).toBeGreaterThan(-1)
    const section = doc.slice(modelsIdx, modelsIdx + 1500)
    expect(section).toContain('"id": "v5"')
  })

  it("documents Idempotency-Key on the /predict section", () => {
    const predictIdx = doc.indexOf("### POST /v1/predict")
    expect(predictIdx).toBeGreaterThan(-1)
    // Window up to the next sibling endpoint header (Sessions).
    const next = doc.indexOf("### Sessions", predictIdx)
    const section = doc.slice(predictIdx, next)
    expect(section).toContain("Idempotency-Key")
    expect(section).toContain("X-Coasty-Idempotent-Replay")
  })

  it("documents Idempotency-Key on the /ground section", () => {
    const groundIdx = doc.indexOf("### POST /v1/ground")
    expect(groundIdx).toBeGreaterThan(-1)
    const next = doc.indexOf("### POST /v1/parse", groundIdx)
    const section = doc.slice(groundIdx, next)
    expect(section).toContain("Idempotency-Key")
    expect(section).toContain("X-Coasty-Idempotent-Replay")
  })

  it("reconciles the action-param tables to the canonical LIST/seconds/x1 shape", () => {
    // The canonical Action types reference must use the list-shaped key_press,
    // seconds-based wait, and x1/y1 drag — not the divergent {key}/{ms}/{from_x}.
    expect(doc).toMatch(/canonical wire shape/i)
    // Canonical key_press carries a `keys` list.
    expect(doc).toMatch(/\bkey_press\b[\s\S]{0,40}keys/)
    // The stale singular {key}/{ms}/{from_x} rows must be gone from the reference table.
    expect(doc).not.toMatch(/\|\s*\\`key_press\\`\s*\|\s*\\`\{ key \}\\`/)
    expect(doc).not.toMatch(/\|\s*\\`wait\\`\s*\|\s*\\`\{ ms \}\\`/)
    expect(doc).not.toContain("from_x")
  })
})
