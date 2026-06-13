/**
 * Wave-2 doc-drift contract — source scan of the canonical Markdown reference
 * (`lib/coasty-api-docs-md.ts`, served at https://coasty.ai/docs/llms.txt) and
 * the OpenAPI 3.1 spec (`lib/openapi/coasty-v1.ts`).
 *
 * Same style as tests/wave1-docs.test.ts: read the source with readFileSync and
 * assert on substrings, since both docs are static modules with no runtime.
 *
 * This wave pins the newly-shipped /v1 features, verified against the backend
 * response models:
 *
 *  W1 — usage.breakdown: a per-call cost breakdown (item/credits/count) that
 *       makes a charge self-auditable; present on /predict, /ground, sessions
 *       create + /sessions/{id}/predict; omitted on free/test/no-charge + /parse;
 *       when present the line credits SUM to credits_charged.
 *  W2 — screen_width / screen_height ECHO on PredictResponse + GroundResponse:
 *       the coordinate space the returned (x, y) are expressed in.
 *  W3 — cua_version ECHO on PredictResponse + SessionPredictResponse.
 *  W4 — CORRECTION: on /predict + /ground, screen_width/height are now OPTIONAL
 *       and default to the RECEIVED SCREENSHOT'S TRUE SIZE (not 1920x1080); the
 *       old "defaults to 1920x1080 / +1 credit" pitfall trap is GONE.
 *  W5 — GET /v1/billing/active: "what is billing me right now" fleet view.
 *  W6 — per-machine billing object now carries accrued_cents,
 *       projected_daily_cents, and since.
 *  W7 — headers: X-Credits-Refunded on refunded 5xx; X-Credits-Remaining on
 *       idempotent replays (body credits_charged 0); Warning: 199 on no-TTL
 *       provision.
 *  W8 — OpenAPI cua_version enum is ["v1","v3","v4","v5"] default "v5".
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const ROOT = join(__dirname, "..")
const doc = readFileSync(join(ROOT, "lib/coasty-api-docs-md.ts"), "utf-8")
const oas = readFileSync(join(ROOT, "lib/openapi/coasty-v1.ts"), "utf-8")

// ---------------------------------------------------------------------------
// W1 — usage.breakdown is documented as a self-auditable per-call cost breakdown.
// ---------------------------------------------------------------------------
describe("W1: usage.breakdown", () => {
  it("documents the breakdown field with the item/credits/count shape", () => {
    expect(doc).toContain("breakdown")
    // The exact line shape: an array of { item, credits, count? }.
    expect(doc).toMatch(/"item":\s*"base"/)
    expect(doc).toMatch(/"item":\s*"hd_images"/)
    expect(doc).toContain('"count"')
  })

  it("lists every item enum value", () => {
    for (const item of ["base", "trajectory", "hd_images", "engine", "custom_prompt"]) {
      expect(doc, `breakdown item '${item}' missing`).toContain(item)
    }
  })

  it("states the breakdown sums to credits_charged and is self-auditable", () => {
    const idx = doc.indexOf("breakdown")
    expect(idx).toBeGreaterThan(-1)
    expect(doc.toLowerCase()).toMatch(/sum[\s\S]{0,80}credits_charged|credits_charged[\s\S]{0,80}sum/)
    expect(doc.toLowerCase()).toContain("self-audit")
  })

  it("notes breakdown is omitted on free/test/no-charge calls and on /parse", () => {
    expect(doc.toLowerCase()).toMatch(/breakdown[\s\S]{0,300}(omit|null)/i)
    // /parse never bills, so it has no breakdown.
    expect(doc).toMatch(/parse[\s\S]{0,160}breakdown|breakdown[\s\S]{0,160}parse/)
  })

  it("OpenAPI UsageInfo schema carries a breakdown array", () => {
    const usageIdx = oas.indexOf("UsageInfo:")
    expect(usageIdx).toBeGreaterThan(-1)
    const section = oas.slice(usageIdx, usageIdx + 700)
    expect(section).toContain("breakdown")
    expect(section).toMatch(/item/)
  })
})

// ---------------------------------------------------------------------------
// W2 — screen_width / screen_height echo on PredictResponse + GroundResponse.
// ---------------------------------------------------------------------------
describe("W2: screen_width/height echo on responses", () => {
  it("documents that the response echoes the dimensions actually used", () => {
    expect(doc.toLowerCase()).toMatch(/echo[\s\S]{0,160}screen_width|screen_width[\s\S]{0,160}echo/)
    // The point of the echo: removes coordinate-scaling guesswork.
    expect(doc.toLowerCase()).toContain("guesswork")
  })

  it("OpenAPI PredictResponse echoes screen_width + screen_height", () => {
    const idx = oas.indexOf("PredictResponse:")
    const section = oas.slice(idx, idx + 1200)
    expect(section).toContain("screen_width")
    expect(section).toContain("screen_height")
  })

  it("OpenAPI GroundResponse echoes screen_width + screen_height", () => {
    const idx = oas.indexOf("GroundResponse:")
    const section = oas.slice(idx, idx + 1200)
    expect(section).toContain("screen_width")
    expect(section).toContain("screen_height")
  })
})

// ---------------------------------------------------------------------------
// W3 — cua_version echo on PredictResponse + SessionPredictResponse.
// ---------------------------------------------------------------------------
describe("W3: cua_version echo on responses", () => {
  it("OpenAPI PredictResponse echoes cua_version", () => {
    const idx = oas.indexOf("PredictResponse:")
    const section = oas.slice(idx, idx + 700)
    expect(section).toContain("cua_version")
  })

  it("OpenAPI SessionPredictResponse echoes cua_version", () => {
    const idx = oas.indexOf("SessionPredictResponse:")
    const section = oas.slice(idx, idx + 700)
    expect(section).toContain("cua_version")
  })
})

// ---------------------------------------------------------------------------
// W4 — CORRECTION: omitted screen_width/height defaults to the screenshot's
//      true size, NOT 1920x1080. The old +1-credit trap is gone for predict/ground.
// ---------------------------------------------------------------------------
describe("W4: screen_width/height default = screenshot true size", () => {
  it("the /predict + /ground request tables no longer default to 1920/1080", () => {
    // Scope to the predict + ground sections; the /sessions create table
    // INTENTIONALLY keeps the 1920x1080 default (a session has no screenshot at
    // create time), so a doc-wide scan would wrongly flag it.
    const predict = doc.slice(doc.indexOf("### POST /v1/predict"), doc.indexOf("### Sessions"))
    const ground = doc.slice(doc.indexOf("### POST /v1/ground"), doc.indexOf("### POST /v1/parse"))
    for (const [name, section] of [["predict", predict], ["ground", ground]] as const) {
      // The stale `| no | 1920 |` / `| no | 1080 |` default rows must be gone.
      expect(section, `${name} table still defaults screen_width to 1920`).not.toMatch(/\|\s*no\s*\|\s*1920\s*\|/)
      expect(section, `${name} table still defaults screen_height to 1080`).not.toMatch(/\|\s*no\s*\|\s*1080\s*\|/)
    }
  })

  it("the request tables explain the measured-from-screenshot default", () => {
    expect(doc.toLowerCase()).toMatch(/measured[\s\S]{0,40}screenshot|screenshot[\s\S]{0,40}true size/)
  })

  it("the #1-pitfall section no longer claims an omitted-dims default of 1920x1080 + a credit", () => {
    // The stale guidance promised +1 credit above 1280x720 from a 1920x1080 default.
    expect(doc).not.toMatch(/defaults? to 1920x1080/i)
    // The corrected note must point the reader at the echo of the dims used.
    const pitfallIdx = doc.indexOf("#1 pitfall")
    expect(pitfallIdx).toBeGreaterThan(-1)
    const section = doc.slice(pitfallIdx, pitfallIdx + 900)
    expect(section.toLowerCase()).toMatch(/true size|echo/)
  })

  it("OpenAPI PredictRequest screen_width/height are nullable, not 1920-defaulted", () => {
    const idx = oas.indexOf("PredictRequest:")
    const section = oas.slice(idx, idx + 1400)
    // The default:1920 / default:1080 must be gone from the predict request dims.
    expect(section).toMatch(/screen_width:\s*\{[^}]*nullable:\s*true/)
    expect(section).toMatch(/screen_height:\s*\{[^}]*nullable:\s*true/)
    expect(section).not.toMatch(/screen_width:\s*\{[^}]*default:\s*1920/)
    expect(section).not.toMatch(/screen_height:\s*\{[^}]*default:\s*1080/)
  })

  it("OpenAPI GroundRequest screen_width/height are nullable, not 1920-defaulted", () => {
    const idx = oas.indexOf("GroundRequest:")
    const section = oas.slice(idx, idx + 900)
    expect(section).toMatch(/screen_width:\s*\{[^}]*nullable:\s*true/)
    expect(section).toMatch(/screen_height:\s*\{[^}]*nullable:\s*true/)
    expect(section).not.toMatch(/screen_width:\s*\{[^}]*default:\s*1920/)
    expect(section).not.toMatch(/screen_height:\s*\{[^}]*default:\s*1080/)
  })

  it("OpenAPI CreateSessionRequest STILL defaults screen_width/height to 1920/1080", () => {
    const idx = oas.indexOf("CreateSessionRequest:")
    const section = oas.slice(idx, idx + 700)
    expect(section).toMatch(/screen_width:\s*\{[^}]*default:\s*1920/)
    expect(section).toMatch(/screen_height:\s*\{[^}]*default:\s*1080/)
  })
})

// ---------------------------------------------------------------------------
// W5 — GET /v1/billing/active.
// ---------------------------------------------------------------------------
describe("W5: GET /v1/billing/active", () => {
  it("documents the endpoint with its scope and 'billing me right now' framing", () => {
    expect(doc).toContain("GET /v1/billing/active")
    const idx = doc.indexOf("GET /v1/billing/active")
    const section = doc.slice(idx, idx + 1600)
    expect(section).toContain("machines:read")
    expect(section.toLowerCase()).toMatch(/right now|currently/)
  })

  it("documents the active-fleet response fields", () => {
    const idx = doc.indexOf("GET /v1/billing/active")
    const section = doc.slice(idx, idx + 1800)
    for (const f of [
      "rate_cents_per_hour",
      "running_credits_per_hour",
      "stopped_credits_per_hour",
      "accrued_cents",
      "total_credits_billed",
      "suspended_for_billing",
      "current_run_rate_cents_per_hour",
    ]) {
      expect(section, `billing/active response missing '${f}'`).toContain(f)
    }
  })

  it("notes test-mode keys return an empty fleet (no billed mock machines)", () => {
    const idx = doc.indexOf("GET /v1/billing/active")
    const section = doc.slice(idx, idx + 1800)
    expect(section.toLowerCase()).toMatch(/test[\s\S]{0,120}(empty|unbilled)/)
  })

  it("OpenAPI exposes the /v1/billing/active path", () => {
    expect(oas).toContain('"/v1/billing/active"')
    const idx = oas.indexOf('"/v1/billing/active"')
    const section = oas.slice(idx, idx + 600)
    expect(section).toContain("current_run_rate_cents_per_hour")
  })
})

// ---------------------------------------------------------------------------
// W6 — per-machine billing object: accrued_cents, projected_daily_cents, since.
// ---------------------------------------------------------------------------
describe("W6: per-machine billing object fields", () => {
  it("documents accrued_cents, projected_daily_cents, and since on the machine billing object", () => {
    expect(doc).toContain("accrued_cents")
    expect(doc).toContain("projected_daily_cents")
    // projected_daily_cents is defined as rate_cents_per_hour * 24.
    expect(doc).toMatch(/projected_daily_cents[\s\S]{0,80}24|24[\s\S]{0,80}projected_daily_cents/)
  })
})

// ---------------------------------------------------------------------------
// W7 — refund + replay + no-TTL headers.
// ---------------------------------------------------------------------------
describe("W7: billing-observability headers", () => {
  it("documents X-Credits-Refunded on a refunded 5xx failure", () => {
    expect(doc).toContain("X-Credits-Refunded")
    const idx = doc.indexOf("X-Credits-Refunded")
    const window = doc.slice(Math.max(0, idx - 400), idx + 400)
    // It sits next to X-Credits-Charged: 0 so the refund is machine-observable.
    expect(window).toContain("X-Credits-Charged")
  })

  it("documents X-Credits-Remaining on idempotent replays with a 0 charge", () => {
    // The replay carries X-Credits-Remaining and the body credits_charged is 0.
    expect(doc).toMatch(/replay[\s\S]{0,400}X-Credits-Remaining|X-Credits-Remaining[\s\S]{0,400}replay/i)
    expect(doc).toMatch(/replay[\s\S]{0,400}credits_charged[\s\S]{0,20}0|credits_charged[\s\S]{0,40}0[\s\S]{0,400}replay/i)
  })

  it("documents the Warning: 199 header on a no-TTL provision", () => {
    expect(doc).toMatch(/Warning:\s*199/)
    const idx = doc.search(/Warning:\s*199/)
    const window = doc.slice(Math.max(0, idx - 400), idx + 400)
    expect(window).toContain("ttl_minutes")
  })
})

// ---------------------------------------------------------------------------
// W8 — OpenAPI cua_version enum is current (v1/v3/v4/v5, default v5).
// ---------------------------------------------------------------------------
describe("W8: OpenAPI cua_version enum is current", () => {
  it("no schema still pins the stale [v1, v3] default v3 enum", () => {
    // The old narrow enum must be gone from request schemas.
    expect(oas).not.toMatch(/enum:\s*\["v1",\s*"v3"\]/)
  })

  it("PredictRequest advertises v1/v3/v4/v5 default v5", () => {
    const idx = oas.indexOf("PredictRequest:")
    const section = oas.slice(idx, idx + 900)
    expect(section).toMatch(/enum:\s*\["v1",\s*"v3",\s*"v4",\s*"v5"\]/)
    expect(section).toMatch(/default:\s*"v5"/)
  })
})
