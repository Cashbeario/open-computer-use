/**
 * Capability-probe drift guard — scripts/coasty_api_test.py vs backend schema.
 *
 * Live false-negative (2026-06-11): the harness's idempotency capability probe
 * sent `screenshot: "x"`, which fails the backend's Pydantic outer-shape
 * validator (>= 100 base64 chars). Schema validation runs BEFORE the route
 * handler, so the in-handler Idempotency-Key check was unreachable and the
 * probe reported "deployed backend IGNORES Idempotency-Key" against every
 * build — including the fully patched one. That disabled the harness's
 * billed-POST retries, so a transient 502 surfaced as a failed check plus a
 * $0.04 charge with no observed response.
 *
 * This test pins the two sides together by scanning BOTH sources:
 *   - the harness sentinel must satisfy the backend's screenshot floor
 *     (length, % 4, base64 alphabet) so the key check stays reachable, and
 *   - the probe key must exceed the backend's documented max so it actually
 *     trips INVALID_IDEMPOTENCY_KEY.
 * The runtime twin lives in backend/tests/test_idempotency_gauntlet.py
 * (TestCapabilityProbeParity), which posts the sentinel through the real app.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { HAVE_BACKEND, HAVE_HARNESS } from "./helpers/private-sources"

const ROOT = join(__dirname, "..")
// Both sides are gitignored from the public repo: the harness
// (scripts/coasty_api_test.py) is an internal ops script and backend/ is not
// shipped. So both reads are guarded and the dependent tests skip on a fresh
// public clone (the maintainer tree always has both and always runs them).
const harness = HAVE_HARNESS
  ? readFileSync(join(ROOT, "scripts", "coasty_api_test.py"), "utf-8")
  : ""
const models = HAVE_BACKEND
  ? readFileSync(join(ROOT, "backend", "app", "models", "public_cua.py"), "utf-8")
  : ""
const cuaRoutes = HAVE_BACKEND
  ? readFileSync(join(ROOT, "backend", "app", "api", "routes", "public_cua.py"), "utf-8")
  : ""

describe("idempotency capability-probe sentinel stays schema-valid", () => {
  // Harness side: `"screenshot": "A" * 100` inside IDEM_PROBE_BODY.
  const probeShot = harness.match(/"screenshot":\s*"([A-Za-z0-9+/])"\s*\*\s*(\d+)/)
  const probeKey = harness.match(/IDEM_PROBE_KEY\s*=\s*"([A-Za-z0-9])"\s*\*\s*(\d+)/)

  // Backend side: the outer-shape floor and the key-length ceiling.
  const floor = models.match(/len\(stripped\)\s*<\s*(\d+)/)
  const keyMax = cuaRoutes.match(/len\(key\)\s*>\s*(\d+)/)

  // public-clone skip (harness-side): scripts/coasty_api_test.py is not shipped
  it.skipIf(!HAVE_HARNESS)("harness defines the sentinel as a single-char base64 repeat", () => {
    expect(probeShot, "IDEM_PROBE_BODY screenshot must be '<b64 char>' * N").toBeTruthy()
    expect(probeKey, "IDEM_PROBE_KEY must be '<char>' * N").toBeTruthy()
  })

  // public-clone skip (harness-side): scripts/coasty_api_test.py is not shipped
  it.skipIf(!HAVE_HARNESS)("the broken sentinel ('screenshot': 'x') never comes back", () => {
    expect(harness).not.toMatch(/"screenshot":\s*"x"/)
  })

  // public-clone skip (harness-side): scripts/coasty_api_test.py is not shipped
  it.skipIf(!HAVE_HARNESS)("preflight posts the named constants, not an inline body", () => {
    expect(harness).toContain('c.post("/predict", IDEM_PROBE_BODY')
    expect(harness).toContain('"Idempotency-Key": IDEM_PROBE_KEY')
  })

  // public-clone skip (backend-side only): backend/ is gitignored there
  it.skipIf(!HAVE_BACKEND)("backend still declares an outer-shape floor and a key ceiling", () => {
    expect(floor, "screenshot length floor in models/public_cua.py").toBeTruthy()
    expect(keyMax, "Idempotency-Key max length in routes/public_cua.py").toBeTruthy()
  })

  // public-clone skip: cross-references BOTH the harness sentinel and the
  // backend floor, so both sources must be present.
  it.skipIf(!HAVE_BACKEND || !HAVE_HARNESS)("sentinel screenshot satisfies the backend's outer shape", () => {
    const len = Number(probeShot![2])
    expect(len).toBeGreaterThanOrEqual(Number(floor![1]))
    expect(len % 4, "base64 length must be a multiple of 4").toBe(0)
    // Stays small enough that it can never decode into a real (billable) image.
    expect(len).toBeLessThan(1000)
  })

  // public-clone skip: cross-references the harness probe key and the backend
  // ceiling, so both sources must be present.
  it.skipIf(!HAVE_BACKEND || !HAVE_HARNESS)("probe key is oversized relative to the backend ceiling", () => {
    expect(Number(probeKey![2])).toBeGreaterThan(Number(keyMax![1]))
  })
})
