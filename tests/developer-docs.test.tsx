// @vitest-environment jsdom
/**
 * developer-docs.test.tsx — guards for the redesigned /developers/docs page
 * (app/components/developers/developer-docs.tsx).
 *
 * Three layers of coverage:
 *
 *  A. DATA INTEGRITY — the section catalogue, action types, error codes, rate
 *     tiers, and pricing are well-formed and internally consistent.
 *
 *  B. CODE CORRECTNESS — every code sample targets the real v1 base URL, sends
 *     the X-API-Key auth header, leaks no literal secret, and the JSON example
 *     objects are valid. This is the "the code in the docs works" guard.
 *
 *  C. RENDER + INTERACTION — the component renders every section, the sidebar
 *     links to every section that actually exists in the DOM (no dangling
 *     anchors), language tabs switch all code blocks, copy writes to the
 *     clipboard, sidebar clicks smooth-scroll without navigating, and the
 *     mobile pill nav covers every section. Plus edge cases.
 *
 * framer-motion and next/link are mocked to plain elements so the tree renders
 * deterministically in jsdom; IntersectionObserver is a no-op stub (the
 * component guards for its absence anyway).
 */
import React from "react"
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, fireEvent, within } from "@testing-library/react"

vi.mock("next/link", async () => {
  const mod = await import("react")
  const R: typeof React = (mod as unknown as { default?: typeof React }).default ?? (mod as unknown as typeof React)
  return {
    default: R.forwardRef(function MockLink(
      { href, children, ...props }: { href: string; children?: React.ReactNode },
      ref: React.Ref<HTMLAnchorElement>,
    ) {
      return R.createElement("a", { href, ref, ...props }, children)
    }),
  }
})

vi.mock("framer-motion", async () => {
  const mod = await import("react")
  const R: typeof React = (mod as unknown as { default?: typeof React }).default ?? (mod as unknown as typeof React)
  const STRIP = new Set([
    "initial", "animate", "exit", "whileInView", "whileHover", "whileTap",
    "whileFocus", "whileDrag", "transition", "viewport", "layout", "layoutId",
    "variants", "drag", "custom",
  ])
  const make = (tag: string) =>
    R.forwardRef(function MockMotion({ children, ...props }: Record<string, unknown>, ref: React.Ref<unknown>) {
      const clean: Record<string, unknown> = {}
      for (const k of Object.keys(props)) if (!STRIP.has(k)) clean[k] = props[k]
      return R.createElement(tag, { ...clean, ref }, children as React.ReactNode)
    })
  const motion = new Proxy({}, { get: (_t, tag: string) => make(tag) })
  return {
    motion,
    AnimatePresence: ({ children }: { children?: React.ReactNode }) => children,
    useReducedMotion: () => false,
  }
})

import {
  DeveloperDocs,
  DOC_SECTIONS,
  DOC_GROUPS,
  API_BASE,
  AUTH_HEADER,
  ACTION_TYPES,
  ERROR_CODES,
  PRICING,
  CODE_SAMPLES,
  LANGS,
  RESPONSE_EXAMPLE,
  ERROR_EXAMPLE,
  RUN_FIELDS,
  RUN_EVENT_TYPES,
  WEBHOOK_EVENTS,
  WORKFLOW_STEP_TYPES,
  CONDITION_OPS,
  WORKFLOW_RUN_FIELDS,
  RUN_EXAMPLE,
  WORKFLOW_DSL_EXAMPLE,
  WORKFLOW_RUN_EXAMPLE,
} from "@/app/components/developers/developer-docs"

const CANONICAL_ACTION_TYPES = [
  "click", "type_text", "key_press", "key_combo", "scroll",
  "drag", "move", "wait", "done", "fail",
]

// ───────────────────────── test environment ─────────────────────────

class NoopIntersectionObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() { return [] }
}

beforeEach(() => {
  vi.stubGlobal("IntersectionObserver", NoopIntersectionObserver)
  // jsdom implements neither of these; stub so the component can call them.
  Element.prototype.scrollIntoView = vi.fn()
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
    configurable: true,
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

// ════════════════════════ A. DATA INTEGRITY ════════════════════════

describe("DOC_SECTIONS catalogue", () => {
  it("has the expected sections, all with required fields", () => {
    expect(DOC_SECTIONS.length).toBe(18)
    for (const s of DOC_SECTIONS) {
      expect(typeof s.id).toBe("string")
      expect(s.id.length).toBeGreaterThan(0)
      expect(typeof s.title).toBe("string")
      expect(s.title.length).toBeGreaterThan(0)
      expect(typeof s.blurb).toBe("string")
      expect(s.blurb.length).toBeGreaterThan(0)
      expect(s.icon).toBeTruthy() // a component reference
      expect(DOC_GROUPS).toContain(s.group)
    }
  })

  it("has unique, url-safe ids", () => {
    const ids = DOC_SECTIONS.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(id).toMatch(/^[a-z][a-z0-9-]*$/)
  })

  it("covers every group with at least one section, in declared order", () => {
    for (const g of DOC_GROUPS) {
      expect(DOC_SECTIONS.some((s) => s.group === g)).toBe(true)
    }
    // sections are grouped contiguously in declaration order
    const seen: string[] = []
    for (const s of DOC_SECTIONS) if (!seen.includes(s.group)) seen.push(s.group)
    expect(seen).toEqual(DOC_GROUPS)
  })
})

describe("reference tables", () => {
  it("ACTION_TYPES is exactly the canonical action set", () => {
    const types = ACTION_TYPES.map((a) => a.type)
    expect(new Set(types)).toEqual(new Set(CANONICAL_ACTION_TYPES))
    expect(types.length).toBe(CANONICAL_ACTION_TYPES.length)
    for (const a of ACTION_TYPES) {
      expect(a.params.length).toBeGreaterThan(0)
      expect(a.description.length).toBeGreaterThan(0)
    }
  })

  it("ERROR_CODES are valid HTTP statuses and include the key ones", () => {
    for (const e of ERROR_CODES) {
      expect(e.status).toBeGreaterThanOrEqual(400)
      expect(e.status).toBeLessThan(600)
      expect(e.code).toMatch(/^[A-Z_]+$/)
      expect(e.meaning.length).toBeGreaterThan(0)
    }
    const statuses = ERROR_CODES.map((e) => e.status)
    for (const required of [401, 402, 403]) {
      expect(statuses).toContain(required)
    }
  })

  it("ERROR_CODES is the real backend catalogue, not the stale placeholder set", () => {
    const codes = new Set(ERROR_CODES.map((e) => e.code))
    // Real codes that must be documented (verified against the v1 contract).
    for (const code of [
      "INVALID_API_KEY", "INSUFFICIENT_SCOPE", "INSUFFICIENT_CREDITS", "WALLET_EXHAUSTED",
      "VALIDATION_ERROR", "INVALID_SCREENSHOT", "PAYLOAD_TOO_LARGE", "INVALID_LIMIT",
      "INVALID_STATUS_FILTER", "NOT_FOUND", "SESSION_NOT_FOUND", "RUN_NOT_FOUND",
      "WORKFLOW_NOT_FOUND", "NOT_AWAITING_HUMAN", "RESUME_CONFLICT", "IDEMPOTENCY_KEY_REUSED",
      "FEATURE_NOT_AVAILABLE", "INTERNAL_ERROR",
      "PREDICTION_FAILED", "GROUNDING_FAILED", "UPSTREAM_UNAVAILABLE", "UPSTREAM_TIMEOUT",
    ]) {
      expect(codes, `ERROR_CODES missing real code ${code}`).toContain(code)
    }
    // The stale/fake codes from the old placeholder table must be gone.
    for (const stale of ["INVALID_REQUEST", "RATE_LIMITED", "SERVICE_UNAVAILABLE"]) {
      expect(codes, `ERROR_CODES still contains stale code ${stale}`).not.toContain(stale)
    }
    // The status/code pairs the contract pins.
    const byStatus = (code: string) => ERROR_CODES.find((e) => e.code === code)?.status
    expect(byStatus("INVALID_API_KEY")).toBe(401)
    expect(byStatus("INSUFFICIENT_SCOPE")).toBe(403)
    expect(byStatus("INSUFFICIENT_CREDITS")).toBe(402)
    expect(byStatus("VALIDATION_ERROR")).toBe(422)
    expect(byStatus("PAYLOAD_TOO_LARGE")).toBe(413)
    expect(byStatus("UPSTREAM_TIMEOUT")).toBe(504)
  })

  it("PRICING is well-formed and non-empty", () => {
    expect(PRICING.length).toBeGreaterThanOrEqual(5)
    for (const p of PRICING) {
      expect(p.endpoint).toContain("/v1/")
      expect(p.cost.length).toBeGreaterThan(0)
    }
    // parse must be documented as free
    expect(PRICING.some((p) => /parse/.test(p.endpoint) && /free/i.test(p.cost))).toBe(true)
  })

  it("PRICING is denominated in USD, never credits", () => {
    // Every cost is a dollar string ($X.XX, with an optional /step or /hr
    // suffix for per-step and runtime-metered rates) or "Free".
    for (const p of PRICING) {
      expect(p.cost, `${p.endpoint} cost "${p.cost}" must be USD or Free`).toMatch(/^(\$\d+\.\d{2}(\/step|\/hr)?|Free)$/)
      expect(p.cost.startsWith("$") || p.cost === "Free", `${p.endpoint} cost must start with $ or be Free`).toBe(true)
      // the word "credit(s)" must never appear in a displayed price
      expect(/credit/i.test(p.cost), `${p.endpoint} cost must not say "credits"`).toBe(false)
    }
    // the headline endpoints carry their exact USD prices
    const byEndpoint = Object.fromEntries(PRICING.map((p) => [p.endpoint, p.cost]))
    expect(byEndpoint["POST /v1/predict"]).toBe("$0.05")
    expect(byEndpoint["POST /v1/sessions"]).toBe("$0.10")
    expect(byEndpoint["POST /v1/sessions/{id}/predict"]).toBe("$0.04")
    expect(byEndpoint["POST /v1/ground"]).toBe("$0.03")
    expect(byEndpoint["POST /v1/parse"]).toBe("Free")
  })

  it("the pricing sidebar entry is USD-framed, not credit-framed", () => {
    const pricing = DOC_SECTIONS.find((s) => s.id === "pricing")
    expect(pricing).toBeTruthy()
    expect(/credit/i.test(pricing!.title), "pricing title must not say credits").toBe(false)
    expect(/credit/i.test(pricing!.blurb), "pricing blurb must not say credits").toBe(false)
    expect(pricing!.blurb).toMatch(/USD|dollar|\$/i)
  })
})

// ═══════════════════════ B. CODE CORRECTNESS ═══════════════════════

describe("code samples target the real API", () => {
  const entries = Object.entries(CODE_SAMPLES)

  it("every endpoint provides all advertised languages, non-empty", () => {
    const langIds = LANGS.map((l) => l.id)
    for (const [endpoint, sample] of entries) {
      for (const lang of langIds) {
        const code = sample[lang]
        expect(code, `${endpoint}.${lang} should exist`).toBeTruthy()
        expect(code.trim().length, `${endpoint}.${lang} should be non-empty`).toBeGreaterThan(0)
      }
    }
  })

  it("every sample hits the v1 base host and sends the auth header", () => {
    const host = API_BASE.replace(/^https?:\/\//, "") // coasty.ai/v1
    for (const [endpoint, sample] of entries) {
      for (const lang of LANGS.map((l) => l.id)) {
        const code = sample[lang]
        expect(code, `${endpoint}.${lang} must reference ${host}`).toContain(host)
        expect(code, `${endpoint}.${lang} must send ${AUTH_HEADER}`).toContain(AUTH_HEADER)
      }
    }
  })

  it("leaks no literal secret key in any sample", () => {
    const secretLike = /sk-coasty-(?:live|test)-[0-9a-f]{8,}/
    for (const [endpoint, sample] of entries) {
      for (const lang of LANGS.map((l) => l.id)) {
        expect(secretLike.test(sample[lang]), `${endpoint}.${lang} must not embed a real key`).toBe(false)
      }
    }
  })

  it("leaves no placeholder/TODO markers in any sample", () => {
    for (const [endpoint, sample] of entries) {
      for (const lang of LANGS.map((l) => l.id)) {
        const code = sample[lang]
        expect(/\bTODO\b|\bFIXME\b|\bundefined\b|\bnull,\s*null\b/.test(code), `${endpoint}.${lang}`).toBe(false)
      }
    }
  })

  it("predict samples reference the documented request fields", () => {
    for (const lang of LANGS.map((l) => l.id)) {
      const code = CODE_SAMPLES.predict[lang]
      expect(code).toContain("screenshot")
      expect(code).toContain("instruction")
    }
  })

  it("session samples create, predict, and delete a session", () => {
    for (const lang of LANGS.map((l) => l.id)) {
      const code = CODE_SAMPLES.sessions[lang]
      expect(code).toContain("/sessions")
      expect(code).toMatch(/sessions\/.*\/predict|sessions\/\$/)
      expect(code.toUpperCase()).toContain("DELETE")
    }
  })
})

describe("JSON examples are valid and consistent", () => {
  it("RESPONSE_EXAMPLE round-trips and matches the documented shape", () => {
    const round = JSON.parse(JSON.stringify(RESPONSE_EXAMPLE))
    expect(round).toEqual(RESPONSE_EXAMPLE)
    expect(["continue", "done", "fail"]).toContain(RESPONSE_EXAMPLE.status)
    expect(Array.isArray(RESPONSE_EXAMPLE.actions)).toBe(true)
    expect(typeof RESPONSE_EXAMPLE.usage.credits_charged).toBe("number")
    expect(typeof RESPONSE_EXAMPLE.request_id).toBe("string")
  })

  it("RESPONSE_EXAMPLE only uses documented action types", () => {
    for (const a of RESPONSE_EXAMPLE.actions) {
      expect(CANONICAL_ACTION_TYPES).toContain(a.action_type)
    }
  })

  it("ERROR_EXAMPLE has the documented envelope", () => {
    const round = JSON.parse(JSON.stringify(ERROR_EXAMPLE))
    expect(round).toEqual(ERROR_EXAMPLE)
    expect(ERROR_EXAMPLE.error.code).toBeTruthy()
    expect(ERROR_EXAMPLE.error.message).toBeTruthy()
    expect(ERROR_EXAMPLE.error.request_id).toBeTruthy()
    // the example code must be one the errors table documents
    expect(ERROR_CODES.map((e) => e.code)).toContain(ERROR_EXAMPLE.error.code)
  })
})

// ════════════════════ C. RENDER + INTERACTION ════════════════════

describe("DeveloperDocs rendering", () => {
  it("renders a heading for every section", () => {
    render(<DeveloperDocs />)
    for (const s of DOC_SECTIONS) {
      expect(
        screen.getByRole("heading", { name: s.title }),
        `missing heading for "${s.title}"`,
      ).toBeTruthy()
    }
  })

  it("mounts a DOM anchor (id) for every section — no dangling sidebar links", () => {
    const { container } = render(<DeveloperDocs />)
    // every section id exists in the DOM
    for (const s of DOC_SECTIONS) {
      expect(container.querySelector(`#${s.id}`), `no element with id #${s.id}`).toBeTruthy()
    }
    // every sidebar anchor points at a section that exists
    const aside = container.querySelector("aside")!
    const anchors = Array.from(aside.querySelectorAll('a[href^="#"]'))
    expect(anchors.length).toBe(DOC_SECTIONS.length)
    const ids = new Set(DOC_SECTIONS.map((s) => s.id))
    for (const a of anchors) {
      const target = a.getAttribute("href")!.slice(1)
      expect(ids.has(target), `sidebar links to unknown #${target}`).toBe(true)
    }
  })

  it("shows each group label in the sidebar", () => {
    const { container } = render(<DeveloperDocs />)
    const aside = container.querySelector("aside")!
    for (const g of DOC_GROUPS) {
      expect(within(aside).getAllByText(g).length).toBeGreaterThanOrEqual(1)
    }
  })

  it("renders a mobile pill button for every section", () => {
    render(<DeveloperDocs />)
    for (const s of DOC_SECTIONS) {
      const pills = screen.getAllByRole("button", { name: s.title })
      expect(pills.length, `missing mobile pill for "${s.title}"`).toBeGreaterThanOrEqual(1)
    }
  })

  it("renders the pricing table in USD ($), with credits only in the schedules two-wallet note", () => {
    const { container } = render(<DeveloperDocs />)
    const pricing = container.querySelector("#pricing")!
    expect(pricing).toBeTruthy()
    const text = pricing.textContent ?? ""
    // The headline USD prices appear in the rendered table.
    expect(text).toContain("$0.05")
    expect(text).toContain("$0.10")
    expect(text).toContain("$0.03")
    // Machine runtime rates render in dollars per hour, snapshots as a one-time USD price.
    expect(text).toContain("$0.05/hr")
    expect(text).toContain("$0.09/hr")
    expect(text).toContain("$0.01/hr")
    expect(text).toContain("$0.01")
    // The exact surcharges render in USD.
    expect(text).toContain("+$0.02 each")
    expect(text).toContain("+$0.01 each")
    expect(text).toContain("+$0.03 per request")
    // "credit" appears ONLY in the schedules subscription-balance note (the
    // two-wallet split: schedule runtime bills subscription credits at
    // 10 credits/min, not the USD API wallet) — never as an API price.
    for (const m of text.matchAll(/credit/gi)) {
      const ctx = text.slice(Math.max(0, m.index! - 140), m.index! + 140)
      expect(
        /subscription/i.test(ctx),
        `"credit" outside the schedules subscription-credit note: ...${ctx}...`,
      ).toBe(true)
    }
  })
})

describe("DeveloperDocs interaction", () => {
  it("switches every code block's language when a tab is clicked", () => {
    const { container } = render(<DeveloperDocs />)
    // default language is Python
    expect(container.textContent).toContain("requests.post")
    expect(container.textContent).not.toContain("curl -s https://coasty.ai/v1/predict")

    fireEvent.click(screen.getAllByRole("tab", { name: "cURL" })[0])

    expect(container.textContent).toContain("curl -s https://coasty.ai/v1/predict")
    expect(container.textContent).not.toContain("requests.post")
  })

  it("copies the active snippet to the clipboard", async () => {
    render(<DeveloperDocs />)
    const copyButtons = screen.getAllByRole("button", { name: "Copy" })
    expect(copyButtons.length).toBeGreaterThan(0)
    fireEvent.click(copyButtons[0])
    const writeText = navigator.clipboard.writeText as ReturnType<typeof vi.fn>
    expect(writeText).toHaveBeenCalledTimes(1)
    expect(String(writeText.mock.calls[0][0]).length).toBeGreaterThan(0)
  })

  it("smooth-scrolls to a section from the sidebar without navigating", () => {
    const { container } = render(<DeveloperDocs />)
    const aside = container.querySelector("aside")!
    const link = within(aside).getByRole("link", { name: "Sessions" })
    fireEvent.click(link)
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith(
      expect.objectContaining({ behavior: "smooth" }),
    )
  })

  it("scrolls from a mobile pill too", () => {
    render(<DeveloperDocs />)
    const pill = screen.getAllByRole("button", { name: "Errors" })[0]
    fireEvent.click(pill)
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled()
  })
})

describe("DeveloperDocs edge cases", () => {
  it("renders without throwing when IntersectionObserver is unavailable", () => {
    vi.stubGlobal("IntersectionObserver", undefined)
    expect(() => render(<DeveloperDocs />)).not.toThrow()
  })

  it("does not crash if clipboard is missing when copying", () => {
    Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true })
    render(<DeveloperDocs />)
    const copyButtons = screen.getAllByRole("button", { name: "Copy" })
    expect(() => fireEvent.click(copyButtons[0])).not.toThrow()
  })

  it("marks the first section active on initial render", () => {
    const { container } = render(<DeveloperDocs />)
    const aside = container.querySelector("aside")!
    const active = aside.querySelector('a[aria-current="true"]')
    expect(active?.getAttribute("href")).toBe(`#${DOC_SECTIONS[0].id}`)
  })
})

// ═══════════ D. ADDITIONAL LANGUAGES (Go / Ruby / PHP) ═══════════
// The generic suites above (base host, auth header, no secrets, no
// placeholders, all-langs-present, predict fields, session lifecycle) already
// iterate LANGS and therefore cover every new language automatically. These
// add per-language correctness guards.

describe("additional languages", () => {
  const langIds = LANGS.map((l) => l.id)

  it("ships at least 6 languages including the popular trio, all unique", () => {
    expect(LANGS.length).toBeGreaterThanOrEqual(6)
    for (const id of ["curl", "python", "node", "go", "ruby", "php"]) {
      expect(langIds).toContain(id)
    }
    expect(new Set(langIds).size).toBe(langIds.length)
  })

  it("every endpoint provides exactly the advertised language set", () => {
    const want = [...langIds].sort()
    for (const [endpoint, sample] of Object.entries(CODE_SAMPLES)) {
      expect(Object.keys(sample).sort(), `${endpoint} language keys`).toEqual(want)
    }
  })

  it("every sample reads the key from the COASTY_API_KEY env var", () => {
    for (const [endpoint, sample] of Object.entries(CODE_SAMPLES)) {
      for (const lang of langIds) {
        expect(sample[lang], `${endpoint}.${lang}`).toContain("COASTY_API_KEY")
      }
    }
  })

  it("predict base64-encodes the screenshot in every language", () => {
    for (const lang of langIds) {
      expect(CODE_SAMPLES.predict[lang], lang).toMatch(/base64/i)
    }
  })

  it("PHP samples are valid open-tag scripts", () => {
    for (const [endpoint, sample] of Object.entries(CODE_SAMPLES)) {
      expect(sample.php.trimStart().startsWith("<?php"), `${endpoint}.php`).toBe(true)
    }
  })

  it("Go quickstart + session samples are complete programs", () => {
    for (const key of ["predict", "sessions"] as const) {
      expect(CODE_SAMPLES[key].go).toContain("package main")
      expect(CODE_SAMPLES[key].go).toContain("func main()")
    }
  })

  it("Ruby samples require the net/http stdlib", () => {
    for (const [endpoint, sample] of Object.entries(CODE_SAMPLES)) {
      expect(sample.ruby, `${endpoint}.ruby`).toContain('require "net/http"')
    }
  })

  it("each endpoint references its required request field in every language", () => {
    const required: Record<string, string[]> = {
      predict: ["screenshot", "instruction"],
      grounding: ["element"],
      parse: ["code", "pyautogui"],
    }
    for (const [endpoint, fields] of Object.entries(required)) {
      for (const lang of langIds) {
        for (const field of fields) {
          expect(CODE_SAMPLES[endpoint][lang as keyof (typeof CODE_SAMPLES)[string]], `${endpoint}.${lang} mentions ${field}`).toContain(field)
        }
      }
    }
  })

  it("Go/Ruby/PHP samples carry no stray JS template interpolation (only Node legitimately uses ${})", () => {
    for (const [endpoint, sample] of Object.entries(CODE_SAMPLES)) {
      for (const lang of ["go", "ruby", "php"] as const) {
        expect(sample[lang].includes("${"), `${endpoint}.${lang}`).toBe(false)
      }
    }
  })
})

describe("DeveloperDocs renders all six language tabs", () => {
  it("shows a tab for every language on every code block", () => {
    render(<DeveloperDocs />)
    // 10 endpoints render a CodeTabs: predict, sessions, grounding, parse,
    // runs, runEvents, runResume, webhookVerify, workflowCreate, workflowAdhoc.
    for (const l of LANGS) {
      expect(
        screen.getAllByRole("tab", { name: l.label }).length,
        `tab "${l.label}"`,
      ).toBeGreaterThanOrEqual(10)
    }
  })

  it("switching to Go swaps every block to Go", () => {
    const { container } = render(<DeveloperDocs />)
    expect(container.textContent).toContain("requests.post") // python default
    fireEvent.click(screen.getAllByRole("tab", { name: "Go" })[0])
    expect(container.textContent).toContain("package main")
    expect(container.textContent).not.toContain("requests.post")
  })
})

// ═════════════ E. AGENTS + WORKFLOWS (anti-drift guards) ═════════════
// These pin the two new doc surfaces — the Agents (Task Runs) group and the
// Workflows group — so their sidebar nav, endpoints, languages, reference
// data, and JSON examples can't silently drift from the v1 contract.

// The new section ids, grouped by the sidebar group they belong to.
const AGENT_SECTION_IDS = ["runs", "run-events", "human-takeover", "run-webhooks"]
const WORKFLOW_SECTION_IDS = ["workflows", "workflow-dsl", "workflow-runs"]

// The new CODE_SAMPLES keys that are real HTTP examples (all six languages).
const NEW_HTTP_SAMPLE_KEYS = [
  "runs", "runEvents", "runResume", "webhookVerify", "workflowCreate", "workflowAdhoc",
] as const

describe("Agents + Workflows sidebar groups", () => {
  it("registers the Agents and Workflows groups", () => {
    expect(DOC_GROUPS).toContain("Agents")
    expect(DOC_GROUPS).toContain("Workflows")
  })

  it("places the new sections in the right groups, contiguously", () => {
    for (const id of AGENT_SECTION_IDS) {
      const s = DOC_SECTIONS.find((x) => x.id === id)
      expect(s, `missing Agents section #${id}`).toBeTruthy()
      expect(s!.group).toBe("Agents")
    }
    for (const id of WORKFLOW_SECTION_IDS) {
      const s = DOC_SECTIONS.find((x) => x.id === id)
      expect(s, `missing Workflows section #${id}`).toBeTruthy()
      expect(s!.group).toBe("Workflows")
    }
    // Agents must precede Workflows, which must precede Reference.
    const order = DOC_SECTIONS.map((s) => s.group)
    expect(order.indexOf("Agents")).toBeLessThan(order.indexOf("Workflows"))
    expect(order.indexOf("Workflows")).toBeLessThan(order.indexOf("Reference"))
  })

  it("renders a sidebar group label and headings for every new section", () => {
    const { container } = render(<DeveloperDocs />)
    const aside = container.querySelector("aside")!
    expect(within(aside).getAllByText("Agents").length).toBeGreaterThanOrEqual(1)
    expect(within(aside).getAllByText("Workflows").length).toBeGreaterThanOrEqual(1)
    for (const id of [...AGENT_SECTION_IDS, ...WORKFLOW_SECTION_IDS]) {
      const s = DOC_SECTIONS.find((x) => x.id === id)!
      expect(screen.getByRole("heading", { name: s.title }), `heading "${s.title}"`).toBeTruthy()
      expect(container.querySelector(`#${id}`), `anchor #${id}`).toBeTruthy()
    }
  })
})

describe("Agents + Workflows code samples", () => {
  it("provides all six languages for every new HTTP example", () => {
    const langIds = LANGS.map((l) => l.id)
    for (const key of NEW_HTTP_SAMPLE_KEYS) {
      const sample = CODE_SAMPLES[key]
      expect(sample, `CODE_SAMPLES.${key} should exist`).toBeTruthy()
      expect(Object.keys(sample).sort()).toEqual([...langIds].sort())
      for (const lang of langIds) {
        expect(sample[lang].trim().length, `${key}.${lang} non-empty`).toBeGreaterThan(0)
      }
    }
  })

  it("targets the documented agent + workflow endpoints", () => {
    const langIds = LANGS.map((l) => l.id)
    // Each sample family must reference its core path in every language.
    const expectedPath: Record<(typeof NEW_HTTP_SAMPLE_KEYS)[number], string> = {
      runs: "/runs",
      runEvents: "/runs/",            // .../runs/{id}/events
      runResume: "/runs/",            // .../runs/{id}/resume
      webhookVerify: "/runs",
      workflowCreate: "/workflows",
      workflowAdhoc: "/workflows/runs",
    }
    for (const key of NEW_HTTP_SAMPLE_KEYS) {
      for (const lang of langIds) {
        expect(CODE_SAMPLES[key][lang], `${key}.${lang} hits ${expectedPath[key]}`).toContain(expectedPath[key])
      }
    }
    // The events + resume + cancel surface is documented somewhere in the runs sample family.
    const runsBlob = NEW_HTTP_SAMPLE_KEYS.flatMap((k) => Object.values(CODE_SAMPLES[k])).join("\n")
    expect(runsBlob).toContain("/runs/")
    expect(runsBlob).toContain("/events")
    expect(runsBlob).toContain("/resume")
    expect(runsBlob).toContain("/workflows")
    expect(runsBlob).toContain("/workflows/runs")
  })

  it("uses only real fields in the run-creation sample", () => {
    for (const lang of LANGS.map((l) => l.id)) {
      const code = CODE_SAMPLES.runs[lang]
      expect(code, `${lang} sends machine_id`).toContain("machine_id")
      expect(code, `${lang} sends task`).toContain("task")
      expect(code, `${lang} sets on_awaiting_human`).toContain("on_awaiting_human")
    }
  })

  it("streams events with Last-Event-ID replay in every language", () => {
    for (const lang of LANGS.map((l) => l.id)) {
      const code = CODE_SAMPLES.runEvents[lang]
      expect(code, `${lang} reconnects with Last-Event-ID`).toContain("Last-Event-ID")
    }
    expect(CODE_SAMPLES.runEvents.curl, "curl uses -N").toContain("curl -N")
  })

  it("resumes only after detecting awaiting_human", () => {
    for (const lang of LANGS.map((l) => l.id)) {
      const code = CODE_SAMPLES.runResume[lang]
      expect(code, `${lang} checks awaiting_human`).toContain("awaiting_human")
      expect(code, `${lang} calls resume`).toContain("/resume")
    }
  })

  it("verifies webhook signatures with HMAC-SHA256 (python + node)", () => {
    const py = CODE_SAMPLES.webhookVerify.python
    expect(py).toContain("hmac")
    expect(py).toMatch(/sha256/i)
    expect(py).toContain("compare_digest")
    expect(py).toContain("webhook_secret")

    const node = CODE_SAMPLES.webhookVerify.node
    expect(node).toContain("createHmac")
    expect(node).toMatch(/sha256/i)
    expect(node).toContain("timingSafeEqual")
    expect(node).toContain("webhook_secret")
  })

  it("builds workflows from a real DSL: task -> assert -> if branch", () => {
    for (const lang of LANGS.map((l) => l.id)) {
      const code = CODE_SAMPLES.workflowCreate[lang]
      expect(code, `${lang} has a slug`).toContain("invoice-reconcile")
      expect(code, `${lang} uses a {{var}} reference`).toContain("{{inputs.order_id}}")
      expect(code, `${lang} uses a structured condition`).toMatch(/"?op"?\s*[:=>]+\s*"contains"/)
      for (const t of ["task", "assert", "if", "succeed", "fail"]) {
        expect(code, `${lang} uses step type ${t}`).toContain(t)
      }
    }
  })

  it("runs an inline definition for the ad-hoc workflow example", () => {
    for (const lang of LANGS.map((l) => l.id)) {
      const code = CODE_SAMPLES.workflowAdhoc[lang]
      expect(code, `${lang} posts to /workflows/runs`).toContain("/workflows/runs")
      expect(code, `${lang} carries an inline definition`).toContain("definition")
      expect(code, `${lang} references inputs`).toContain("{{inputs.url}}")
    }
  })
})

describe("Agents + Workflows reference data + JSON examples", () => {
  it("run object documents the contract status set", () => {
    const fields = RUN_FIELDS.map((f) => f.field)
    for (const required of ["id", "object", "status", "machine_id", "task", "result", "cua_version"]) {
      expect(fields, `RUN_FIELDS missing ${required}`).toContain(required)
    }
  })

  it("event types cover the full SSE catalogue", () => {
    const types = RUN_EVENT_TYPES.map((e) => e.type)
    for (const t of [
      "status", "text", "reasoning", "tool_call", "tool_result",
      "awaiting_human", "resumed", "step", "billing", "error", "done",
    ]) {
      expect(types, `event ${t}`).toContain(t)
    }
  })

  it("webhook events are the five HMAC-signed lifecycle callbacks", () => {
    const events = WEBHOOK_EVENTS.map((e) => e.event)
    expect(new Set(events)).toEqual(new Set([
      "run.awaiting_human", "run.succeeded", "run.failed", "run.cancelled", "run.timed_out",
    ]))
  })

  it("workflow step types and condition operators are complete", () => {
    const steps = WORKFLOW_STEP_TYPES.map((s) => s.type)
    for (const t of [
      "task", "assert", "if", "loop", "parallel", "human_approval", "retry", "succeed", "fail",
    ]) {
      expect(steps, `step ${t}`).toContain(t)
    }
    const ops = CONDITION_OPS.map((c) => c.op).join(" ")
    for (const op of ["eq", "ne", "lt", "gt", "lte", "gte", "contains", "truthy", "falsy", "exists", "and", "or", "not"]) {
      expect(ops, `op ${op}`).toContain(op)
    }
  })

  it("RUN_EXAMPLE is a valid, contract-shaped agent.run", () => {
    const round = JSON.parse(JSON.stringify(RUN_EXAMPLE))
    expect(round).toEqual(RUN_EXAMPLE)
    expect(RUN_EXAMPLE.object).toBe("agent.run")
    expect(["queued", "running", "awaiting_human", "succeeded", "failed", "cancelled", "timed_out"])
      .toContain(RUN_EXAMPLE.status)
    expect(typeof RUN_EXAMPLE.machine_id).toBe("string")
    // webhook_secret is shown once at create time.
    expect(typeof RUN_EXAMPLE.webhook_secret).toBe("string")
  })

  it("WORKFLOW_DSL_EXAMPLE is a valid 2026-06-01 DSL with structured conditions", () => {
    const round = JSON.parse(JSON.stringify(WORKFLOW_DSL_EXAMPLE))
    expect(round).toEqual(WORKFLOW_DSL_EXAMPLE)
    expect(WORKFLOW_DSL_EXAMPLE.dsl_version).toBe("2026-06-01")
    const steps = WORKFLOW_DSL_EXAMPLE.definition.steps
    expect(steps.map((s) => s.type)).toEqual(["task", "assert", "if"])
    const ifStep = steps.find((s) => s.type === "if") as
      | { type: "if"; condition: { op: string } }
      | undefined
    expect(ifStep?.condition.op).toBe("contains")
  })

  it("WORKFLOW_RUN_EXAMPLE is a valid, contract-shaped workflow.run", () => {
    const round = JSON.parse(JSON.stringify(WORKFLOW_RUN_EXAMPLE))
    expect(round).toEqual(WORKFLOW_RUN_EXAMPLE)
    expect(WORKFLOW_RUN_EXAMPLE.object).toBe("workflow.run")
    const fields = WORKFLOW_RUN_FIELDS.map((f) => f.field)
    for (const required of ["id", "object", "status", "workflow_id", "workflow_version", "spent_cents", "budget_cents"]) {
      expect(fields, `WORKFLOW_RUN_FIELDS missing ${required}`).toContain(required)
    }
  })
})

describe("Agents + Workflows house style: no em dashes", () => {
  // Em dashes read as AI-written and are a hard house rule for new doc prose.
  // Scope: every NEW doc string we authored — code samples, reference-data
  // descriptions, JSON example string values, and the new sidebar entries.
  const EM_DASH = /—/

  function collectStrings(value: unknown, out: string[]) {
    if (typeof value === "string") out.push(value)
    else if (Array.isArray(value)) for (const v of value) collectStrings(v, out)
    else if (value && typeof value === "object") for (const v of Object.values(value)) collectStrings(v, out)
  }

  it("no new code sample contains an em dash", () => {
    for (const key of NEW_HTTP_SAMPLE_KEYS) {
      for (const [lang, code] of Object.entries(CODE_SAMPLES[key])) {
        expect(EM_DASH.test(code), `${key}.${lang} has an em dash`).toBe(false)
      }
    }
  })

  it("no new reference-data string contains an em dash", () => {
    const blobs: string[] = []
    collectStrings(RUN_FIELDS, blobs)
    collectStrings(RUN_EVENT_TYPES, blobs)
    collectStrings(WEBHOOK_EVENTS, blobs)
    collectStrings(WORKFLOW_STEP_TYPES, blobs)
    collectStrings(CONDITION_OPS, blobs)
    collectStrings(WORKFLOW_RUN_FIELDS, blobs)
    collectStrings(RUN_EXAMPLE, blobs)
    collectStrings(WORKFLOW_DSL_EXAMPLE, blobs)
    collectStrings(WORKFLOW_RUN_EXAMPLE, blobs)
    for (const s of blobs) {
      expect(EM_DASH.test(s), `reference string has an em dash: ${s}`).toBe(false)
    }
  })

  it("no new sidebar section title or blurb contains an em dash", () => {
    const newIds = new Set([...AGENT_SECTION_IDS, ...WORKFLOW_SECTION_IDS])
    for (const s of DOC_SECTIONS.filter((x) => newIds.has(x.id))) {
      expect(EM_DASH.test(s.title), `title "${s.title}" has an em dash`).toBe(false)
      expect(EM_DASH.test(s.blurb), `blurb "${s.blurb}" has an em dash`).toBe(false)
    }
  })
})
