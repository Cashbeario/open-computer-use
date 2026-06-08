// @vitest-environment jsdom
/**
 * coding-agent-quickstart.test.tsx — the Coding Agent Quickstart popup, its
 * config store, and the crafted-prompt builder.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import {
  API_REFERENCE,
  buildCraftedPrompt,
  CODING_AGENT_OPTIONS,
  INTEGRATION_OPTIONS,
  BUILD_TARGET_OPTIONS,
} from "@/lib/coasty-ai-prompt"
import { useCodingAgentConfig } from "@/lib/coding-agent-store"
import { CodingAgentQuickstart } from "@/app/components/developers/coding-agent-quickstart"

const base = {
  codingAgent: "cursor", customAgent: "",
  integration: "python", customIntegration: "",
  building: "", customBuilding: "",
}

describe("buildCraftedPrompt — heavily-crafted, tailored", () => {
  it("embeds the full API reference + USD pricing", () => {
    const p = buildCraftedPrompt(base)
    expect(p).toContain(API_REFERENCE.split("\n")[0])  // the reference header
    expect(p).toContain("https://coasty.ai/v1")
    expect(p).toContain("$0.45")
    expect(p).toContain("COASTY_API_KEY")
    expect(p).not.toMatch(/\d+\s*credits/i)
  })

  it("tailors to the coding agent + integration + goal", () => {
    const p = buildCraftedPrompt({
      ...base, codingAgent: "claude-code", integration: "curl", building: "monitoring",
    })
    expect(p).toContain("Claude Code")
    expect(p).toMatch(/cURL/)
    expect(p).toContain("cURL commands")          // integration guidance
    expect(p).toContain("watch a page or dashboard")  // building goal
  })

  it("uses the MCP server guidance for the mcp integration", () => {
    const p = buildCraftedPrompt({ ...base, integration: "mcp" })
    expect(p).toContain("@coasty/mcp")
  })

  it("honors custom 'Other' values", () => {
    const p = buildCraftedPrompt({
      codingAgent: "other", customAgent: "Cline",
      integration: "other", customIntegration: "Rust",
      building: "other", customBuilding: "a price tracker",
    })
    expect(p).toContain("Cline")
    expect(p).toContain("Rust")
    expect(p).toContain("a price tracker")
  })

  it("offers a sensible set of options for each question", () => {
    expect(CODING_AGENT_OPTIONS.map((o) => o.id)).toContain("cursor")
    expect(CODING_AGENT_OPTIONS.map((o) => o.id)).toContain("claude-code")
    expect(INTEGRATION_OPTIONS.map((o) => o.id)).toContain("mcp")
    expect(BUILD_TARGET_OPTIONS.map((o) => o.id)).toContain("not-sure")
    for (const set of [CODING_AGENT_OPTIONS, INTEGRATION_OPTIONS, BUILD_TARGET_OPTIONS]) {
      expect(set.map((o) => o.id)).toContain("other")
    }
  })
})

describe("useCodingAgentConfig — persisted config for later recommendations", () => {
  beforeEach(() => {
    useCodingAgentConfig.getState().reset()
  })

  it("records selections", () => {
    const s = useCodingAgentConfig.getState()
    s.setCodingAgent("windsurf")
    s.setIntegration("go")
    s.setBuilding("qa-testing")
    const next = useCodingAgentConfig.getState()
    expect(next.codingAgent).toBe("windsurf")
    expect(next.integration).toBe("go")
    expect(next.building).toBe("qa-testing")
  })

  it("stamps configuredAt only once the user commits (markConfigured)", () => {
    expect(useCodingAgentConfig.getState().configuredAt).toBeNull()
    useCodingAgentConfig.getState().markConfigured()
    expect(typeof useCodingAgentConfig.getState().configuredAt).toBe("string")
  })

  it("keeps custom 'Other' text", () => {
    useCodingAgentConfig.getState().setCodingAgent("other")
    useCodingAgentConfig.getState().setCustomAgent("Aider")
    expect(useCodingAgentConfig.getState().customAgent).toBe("Aider")
  })
})

describe("CodingAgentQuickstart — popup", () => {
  beforeEach(() => useCodingAgentConfig.getState().reset())

  it("renders a 'Create with AI' trigger with brand logos", () => {
    const { container } = render(<CodingAgentQuickstart />)
    expect(screen.getByText("Create with AI")).toBeTruthy()
    expect(container.querySelectorAll("svg").length).toBeGreaterThanOrEqual(3)
  })

  it("opens the wizard with all three questions", () => {
    render(<CodingAgentQuickstart />)
    fireEvent.click(screen.getByText("Create with AI"))
    expect(screen.getByText("What are you coding with?")).toBeTruthy()
    expect(screen.getByText("What integration should the prompt generate?")).toBeTruthy()
    expect(screen.getByText("What are you building?")).toBeTruthy()
    // The tailored prompt preview is present.
    expect(screen.getByText("Your prompt")).toBeTruthy()
  })
})
