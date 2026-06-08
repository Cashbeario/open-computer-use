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
  RATE_TIERS,
  PRICING,
  CODE_SAMPLES,
  LANGS,
  RESPONSE_EXAMPLE,
  ERROR_EXAMPLE,
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
    expect(DOC_SECTIONS.length).toBe(13)
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
    for (const required of [401, 402, 403, 429]) {
      expect(statuses).toContain(required)
    }
  })

  it("RATE_TIERS and PRICING are well-formed and non-empty", () => {
    expect(RATE_TIERS.length).toBeGreaterThanOrEqual(3)
    for (const t of RATE_TIERS) {
      expect(t.tier.length).toBeGreaterThan(0)
      expect(t.perMinute).toMatch(/^\d+$/)
    }
    expect(PRICING.length).toBeGreaterThanOrEqual(5)
    for (const p of PRICING) {
      expect(p.endpoint).toContain("/v1/")
      expect(p.cost.length).toBeGreaterThan(0)
    }
    // parse must be documented as free
    expect(PRICING.some((p) => /parse/.test(p.endpoint) && /free/i.test(p.cost))).toBe(true)
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
      ocr: ["screenshot"],
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
    // 5 endpoints render a CodeTabs (predict, sessions, grounding, ocr, parse)
    for (const l of LANGS) {
      expect(
        screen.getAllByRole("tab", { name: l.label }).length,
        `tab "${l.label}"`,
      ).toBeGreaterThanOrEqual(5)
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
