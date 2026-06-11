// @vitest-environment jsdom
/**
 * coding-agent-quickstart.test.tsx — the Coding Agent Quickstart popup, its
 * config store, and the crafted-prompt builder.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import {
  AI_PROMPT,
  API_REFERENCE,
  buildCraftedPrompt,
  CODING_AGENT_OPTIONS,
  INTEGRATION_OPTIONS,
  BUILD_TARGET_OPTIONS,
  EXECUTION_TARGET_OPTIONS,
} from "@/lib/coasty-ai-prompt"
import { useCodingAgentConfig } from "@/lib/coding-agent-store"
import { CodingAgentQuickstart } from "@/app/components/developers/coding-agent-quickstart"

const base = {
  codingAgent: "cursor", customAgent: "",
  integration: "python", customIntegration: "",
  building: "", customBuilding: "",
  executionTarget: "cloud-vm",
}

describe("buildCraftedPrompt — heavily-crafted, tailored", () => {
  it("embeds the full API reference + USD pricing", () => {
    const p = buildCraftedPrompt(base)
    expect(p).toContain(API_REFERENCE.split("\n")[0])  // the reference header
    expect(p).toContain("https://coasty.ai/v1")
    expect(p).toContain("$0.05")
    expect(p).toContain("COASTY_API_KEY")
    expect(p).toContain("1 credit = $0.01")  // the anchor that makes any credit mention exact
    // The ONLY credit-denominated rate allowed is the consumer-balance schedule
    // runtime (10 credits/min bills subscription credits, not the USD wallet).
    expect(p.match(/\d+\s*credits/gi) ?? []).toEqual(["10 credits"])
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
      executionTarget: "cloud-vm",
    })
    expect(p).toContain("Cline")
    expect(p).toContain("Rust")
    expect(p).toContain("a price tracker")
  })

  it("local execution target crafts the local agent loop, not a VM run", () => {
    const p = buildCraftedPrompt({ ...base, executionTarget: "local" })
    // The endpoint catalog (API_REFERENCE) always lists /v1/runs; what must
    // switch is the TASK section the agent acts on.
    const task = p.split("## Your task")[1]
    expect(task).toContain("MY OWN screen")
    expect(task).toContain("pyautogui")
    expect(task).toContain("Idempotency-Key")
    expect(task).toContain("scale returned x/y")         // the scaling pitfall
    expect(task).toContain("Local automation")           // points at the docs section
    expect(task).not.toContain("POST /v1/runs")          // no VM orchestration
    expect(task).not.toContain("machine_id")
  })

  it("cloud-vm execution target keeps the runs orchestration", () => {
    const p = buildCraftedPrompt({ ...base, executionTarget: "cloud-vm" })
    const task = p.split("## Your task")[1]
    expect(task).toContain("POST /v1/runs")
    expect(task).toContain("GET /v1/runs/{id}/events")
    expect(task).not.toContain("MY OWN screen")
  })

  it("the API reference itself says the surface is screen-agnostic", () => {
    // Every surface that embeds API_REFERENCE (quickstart, copy-for-AI,
    // ChatGPT/Claude deep links) inherits the local-automation story.
    expect(API_REFERENCE).toContain("SCREEN-AGNOSTIC")
    expect(API_REFERENCE).toContain("OWN screen")
  })

  it("offers both execution targets with local first-class", () => {
    const ids = EXECUTION_TARGET_OPTIONS.map((o) => o.id)
    expect(ids).toContain("local")
    expect(ids).toContain("cloud-vm")
    expect(ids[0]).toBe("local")                         // local listed first
  })

  it("LOCAL IS THE DEFAULT: store default + builder fallback + static prompt", () => {
    // 1. A fresh store (no persisted choice) defaults to local.
    expect(useCodingAgentConfig.getState().executionTarget).toBe("local")
    // 2. The builder treats anything but an explicit cloud-vm pick as local —
    //    including empty/unknown values from older persisted configs.
    for (const value of ["", "local", "unknown-future-id"]) {
      const task = buildCraftedPrompt({ ...base, executionTarget: value }).split("## Your task")[1]
      expect(task, `executionTarget=${JSON.stringify(value)}`).toContain("MY OWN screen")
    }
    // 3. The static AI_PROMPT (Copy-for-AI + ChatGPT/Claude deep links)
    //    instructs the agent to default to the user's own screen too.
    expect(AI_PROMPT).toContain("DEFAULT TO AUTOMATING MY OWN SCREEN")
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
