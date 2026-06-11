/**
 * Anti-drift guards for the "Automate Any Screen" (local automation) docs.
 *
 * The local-automation story spans five surfaces that must stay in lockstep:
 *   lib/local-automation.ts        — single source of truth (presets, snippets, executor map)
 *   app/guide/tabs/api.tsx         — guide sections + preset selector UI
 *   app/api-docs/page.tsx          — public docs page section
 *   lib/coasty-api-docs-md.ts      — /docs/llms.txt LLM reference
 *   public/llms.txt + llms-full.txt — crawlable LLM files
 *   app/api/discovery/route.ts     — machine-readable manifest
 *
 * Backend counterpart: backend/tests/test_doc_examples.py
 * (TestLocalAutomationDocExamples) validates the snippet request bodies
 * against the real Pydantic models and pins the executor map's action types
 * against the /v1/models advertised list.
 *
 * Run: npx vitest run tests/docs-local-automation.test.ts
 */
import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
  ACTION_EXECUTOR_MAP,
  COORDINATE_SCALING_NOTE,
  LOCAL_AUTOMATION_SNIPPETS,
  LOCAL_SAFETY_NOTE,
  PROMPT_PRESETS,
} from "@/lib/local-automation"

const ROOT = join(__dirname, "..")
const read = (p: string) => readFileSync(join(ROOT, p), "utf-8")

const GUIDE = read("app/guide/tabs/api.tsx")
const API_DOCS = read("app/api-docs/page.tsx")
const LLMS_MD = read("lib/coasty-api-docs-md.ts")
const LLMS_TXT = read("public/llms.txt")
const LLMS_FULL = read("public/llms-full.txt")
const DISCOVERY = read("app/api/discovery/route.ts")

// Mirrors backend /v1/models advertised action_types (public_cua.py) plus
// "raw", the documented parse-fallback. The backend side of this pin lives in
// test_doc_examples.py::TestLocalAutomationDocExamples — if the API grows an
// action type, BOTH suites fail until the executor docs cover it.
const DOCUMENTED_ACTION_TYPES = [
  "click", "move", "type_text", "key_press", "key_combo",
  "scroll", "drag", "wait", "done", "fail", "raw",
]

describe("prompt presets — the selectable best-suggestion instructions", () => {
  it("ships at least 6 presets with unique ids and real content", () => {
    expect(PROMPT_PRESETS.length).toBeGreaterThanOrEqual(6)
    const ids = PROMPT_PRESETS.map(p => p.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const p of PROMPT_PRESETS) {
      expect(p.label.length).toBeGreaterThan(3)
      expect(p.description.length).toBeGreaterThan(20)
      expect(p.instructions.length).toBeGreaterThan(200)
    }
  })

  it("every preset fits the Starter-tier 2000-char custom-prompt budget", () => {
    // Free tier forbids custom prompts entirely (max_system_prompt_chars=0);
    // presets are documented as Starter+, so they must fit Starter's 2000.
    for (const p of PROMPT_PRESETS) {
      expect(p.instructions.length, `preset '${p.id}' exceeds the Starter budget`)
        .toBeLessThanOrEqual(2000)
    }
  })

  it("the cautious preset actually forbids destructive + credential actions", () => {
    const cautious = PROMPT_PRESETS.find(p => p.id === "cautious")
    expect(cautious).toBeDefined()
    for (const word of ["delete", "purchase", "credentials", "fail()"]) {
      expect(cautious!.instructions.toLowerCase()).toContain(word.toLowerCase())
    }
  })

  it("discovery manifest lists every preset id (machine-readable lockstep)", () => {
    for (const p of PROMPT_PRESETS) {
      expect(DISCOVERY, `discovery route missing preset id '${p.id}'`).toContain(`"${p.id}"`)
    }
  })

  it("the LLM reference documents every preset verbatim", () => {
    for (const p of PROMPT_PRESETS) {
      expect(LLMS_MD, `llms md missing preset '${p.label}'`).toContain(p.label)
      // The full instruction text must be in the LLM docs so an agent can
      // copy it without fetching another page.
      expect(LLMS_MD, `llms md missing instructions for '${p.id}'`)
        .toContain(p.instructions.slice(0, 80))
    }
  })
})

describe("action executor map — every public action type is executable locally", () => {
  it("covers exactly the advertised action types plus the raw fallback", () => {
    const documented = ACTION_EXECUTOR_MAP.map(r => r.actionType).sort()
    expect(documented).toEqual([...DOCUMENTED_ACTION_TYPES].sort())
  })

  it("each row gives both a desktop and a browser execution", () => {
    for (const r of ACTION_EXECUTOR_MAP) {
      expect(r.pyautogui.length, r.actionType).toBeGreaterThan(5)
      expect(r.playwright.length, r.actionType).toBeGreaterThan(5)
      expect(r.params.length, r.actionType).toBeGreaterThan(0)
    }
  })

  it("scroll documents the pyautogui sign convention (+up)", () => {
    const scroll = ACTION_EXECUTOR_MAP.find(r => r.actionType === "scroll")!
    expect(scroll.params).toContain("+up")
  })
})

describe("snippets — the local agent loop is retry-safe and scale-correct", () => {
  it("python loop: failsafe, idempotency, coordinate scaling, session cleanup", () => {
    const py = LOCAL_AUTOMATION_SNIPPETS.python
    expect(py).toContain("pyautogui.FAILSAFE = True")
    expect(py).toContain("Idempotency-Key")
    expect(py).toMatch(/SX, SY = REAL_W \/ SEND_W/)   // scale factors derived
    expect(py).toContain('p["x"] * SX')                // ...and actually applied
    expect(py).toContain("requests.delete")            // stops the session clock
    expect(py).toContain("sk-coasty-test-")            // free key while building
  })

  it("javascript loop: fixed viewport == screen size (the no-scaling path)", () => {
    const js = LOCAL_AUTOMATION_SNIPPETS.javascript
    expect(js).toContain("viewport: { width: 1280, height: 720 }")
    expect(js).toContain("screen_width: 1280")
    expect(js).toContain("Idempotency-Key")
    expect(js).toContain("browser.close()")
  })

  it("curl + go: one-shot predict with idempotency on the billed POST", () => {
    expect(LOCAL_AUTOMATION_SNIPPETS.curl).toContain("/v1/predict")
    expect(LOCAL_AUTOMATION_SNIPPETS.curl).toContain("Idempotency-Key")
    expect(LOCAL_AUTOMATION_SNIPPETS.go).toContain("Idempotency-Key")
    expect(LOCAL_AUTOMATION_SNIPPETS.go).toContain("robotgo")
  })

  it("the scaling pitfall callout names the failure mode", () => {
    expect(COORDINATE_SCALING_NOTE).toContain("number-one cause")
    expect(LOCAL_SAFETY_NOTE).toContain("Idempotency-Key")
  })
})

describe("surfaces — the local-automation story exists everywhere it should", () => {
  it("guide: Local group with all three sections wired to the shared lib", () => {
    for (const id of ["local-overview", "local-loop", "local-presets"]) {
      expect(GUIDE).toContain(`id: "${id}"`)      // DOC_SECTIONS nav entry
      expect(GUIDE).toContain(`id="${id}"`)       // rendered Section
    }
    expect(GUIDE).toContain("PROMPT_PRESETS")
    expect(GUIDE).toContain("ACTION_EXECUTOR_MAP")
    expect(GUIDE).toContain("LOCAL_AUTOMATION_SNIPPETS")
    expect(GUIDE).toContain('group: "Local"')
  })

  it("api-docs page: LocalTryIt section using the shared snippets", () => {
    expect(API_DOCS).toContain("LocalTryIt")
    expect(API_DOCS).toContain("LOCAL_AUTOMATION_SNIPPETS")
    expect(API_DOCS).toContain("Automate any screen")
  })

  it("LLM reference (/docs/llms.txt): full local-automation section", () => {
    expect(LLMS_MD).toContain("## Local automation")
    expect(LLMS_MD).toContain("screen-agnostic")
    expect(LLMS_MD).toContain("number-one cause")    // the scaling pitfall
    expect(LLMS_MD).toContain("Idempotency-Key")
    expect(LLMS_MD).toContain("adb")                  // emulator path documented
  })

  it("crawlable llms files point agents at the local-automation docs", () => {
    expect(LLMS_TXT).toContain("Automate ANY screen")
    expect(LLMS_TXT).toContain("#local-overview")
    expect(LLMS_FULL).toContain("screen-agnostic")
    expect(LLMS_FULL).toContain("#local-overview")
  })

  it("discovery manifest exposes the localAutomation block", () => {
    expect(DISCOVERY).toContain("localAutomation")
    expect(DISCOVERY).toContain("#local-overview")
  })
})
