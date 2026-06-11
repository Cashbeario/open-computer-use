// @vitest-environment jsdom
/**
 * copy-for-ai.test.tsx — the "Copy for AI" docs control.
 *
 * Verifies the prompt is accurate + self-contained (anti-drift), that clicking
 * copies it to the clipboard, that the brand logos render, and that the docs
 * mount the control.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { readFileSync } from "node:fs"
import { join } from "node:path"

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import { CopyForAI, BuildWithAIBar, AI_PROMPT } from "@/app/components/developers/copy-for-ai"

describe("AI_PROMPT — accurate, self-contained brief", () => {
  it("carries the base URL, auth, and key env var", () => {
    expect(AI_PROMPT).toContain("https://coasty.ai/v1")
    expect(AI_PROMPT).toContain("X-API-Key")
    expect(AI_PROMPT).toContain("COASTY_API_KEY")
    expect(AI_PROMPT).toContain("/docs/llms.txt")
  })

  it("documents core + runs + workflows endpoints", () => {
    for (const ep of ["/v1/predict", "/v1/sessions", "/v1/runs", "/v1/runs/{id}/events", "/v1/workflows"]) {
      expect(AI_PROMPT, `prompt documents ${ep}`).toContain(ep)
    }
    // Full DSL vocabulary on one line.
    expect(AI_PROMPT).toContain("task, assert, if, loop, parallel, human_approval, retry, succeed, fail")
  })

  it("prices in USD, with the credit anchor stated", () => {
    expect(AI_PROMPT).toContain("$0.05")
    expect(AI_PROMPT).toContain("$0.10")
    expect(AI_PROMPT).toContain("1 credit = $0.01")  // the anchor that makes any credit mention exact
    // The ONLY credit-denominated rate allowed is the consumer-balance schedule
    // runtime (10 credits/min bills subscription credits, not the USD wallet).
    expect(AI_PROMPT).toContain("10 credits per minute")
    const creditMentions = AI_PROMPT.match(/\d+\s*credits/gi) ?? []
    expect(creditMentions).toEqual(["10 credits"])
  })

  it("lists the standard error codes", () => {
    expect(AI_PROMPT).toContain("INSUFFICIENT_CREDITS")
    expect(AI_PROMPT).toContain("INSUFFICIENT_SCOPE")
  })
})

describe("CopyForAI — interaction", () => {
  let writeText: ReturnType<typeof vi.fn>
  beforeEach(() => {
    writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true })
  })

  it("copies the full prompt to the clipboard on click and confirms", async () => {
    render(<CopyForAI />)
    const btn = screen.getByLabelText(/Copy the Coasty API prompt/i)
    fireEvent.click(btn)
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(AI_PROMPT))
    expect(await screen.findByText("Copied for AI")).toBeTruthy()
  })

  it("renders the OpenAI / Claude / Cursor brand marks", () => {
    const { container } = render(<CopyForAI />)
    // The logo stack on the primary button renders three brand <svg> marks.
    expect(container.querySelectorAll("svg").length).toBeGreaterThanOrEqual(3)
  })

  it("exposes a 'more targets' dropdown trigger (ChatGPT / Claude)", () => {
    render(<CopyForAI />)
    expect(screen.getByLabelText(/More ways to use this prompt/i)).toBeTruthy()
  })
})

describe("BuildWithAIBar — explainer callout", () => {
  it("renders the explainer copy and the Create with AI trigger", () => {
    render(<BuildWithAIBar />)
    expect(screen.getByText(/Building with an AI assistant\?/)).toBeTruthy()
    expect(screen.getByText(/Cursor, Claude Code, ChatGPT/)).toBeTruthy()
    expect(screen.getByText("Create with AI")).toBeTruthy()
  })
})

describe("surface wiring — Copy for AI reaches every developer surface", () => {
  const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

  it("the docs render the BuildWithAIBar", () => {
    const DOCS = read("app/components/developers/developer-docs.tsx")
    expect(DOCS).toContain('import { BuildWithAIBar } from "@/app/components/developers/copy-for-ai"')
    expect(DOCS).toMatch(/<BuildWithAIBar/)
  })

  it("the keys, usage, and logs pages render the BuildWithAIBar", () => {
    for (const f of ["keys-content", "usage-content", "logs-content"]) {
      const src = read(`app/components/developers/${f}.tsx`)
      expect(src, `${f} imports BuildWithAIBar`).toContain("BuildWithAIBar")
      expect(src, `${f} renders BuildWithAIBar`).toMatch(/<BuildWithAIBar/)
    }
  })

  it("the developer-mode chat homepage summary renders the BuildWithAIBar", () => {
    const src = read("app/components/developers/developer-home-summary.tsx")
    expect(src).toMatch(/<BuildWithAIBar/)
  })
})
