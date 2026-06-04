/**
 * composio-tool-format — pure display helpers for connection tool calls.
 *
 * The cardinal rule under test: no output ever contains the word "composio" or
 * a raw underscored tool name. Toolkit + action are humanized and the helper
 * generalizes across every toolkit (brand map + title-case fallback).
 */
import { describe, it, expect } from "vitest"
import {
  parseComposioToolName,
  isComposioToolName,
  composioToolLabel,
  composioToolDescription,
} from "@/lib/composio-store/tool-format"

describe("parseComposioToolName", () => {
  it("parses toolkit + humanized action", () => {
    expect(parseComposioToolName("composio_gmail_send_email")).toEqual({
      toolkitSlug: "gmail",
      toolkitLabel: "Gmail",
      actionSlug: "send_email",
      actionLabel: "Send email",
    })
  })

  it("is case-insensitive on the prefix and uppercases (Composio emits SCREAMING_CASE)", () => {
    expect(parseComposioToolName("composio_GMAIL_SEND_EMAIL")).toMatchObject({
      toolkitSlug: "gmail",
      toolkitLabel: "Gmail",
      actionLabel: "Send email",
    })
    expect(parseComposioToolName("COMPOSIO_github_create_an_issue")).toMatchObject({
      toolkitLabel: "GitHub",
      actionLabel: "Create an issue",
    })
  })

  it("uses brand-correct labels for concatenated / acronym slugs", () => {
    expect(parseComposioToolName("composio_googlecalendar_create_event")?.toolkitLabel).toBe(
      "Google Calendar",
    )
    expect(parseComposioToolName("composio_hubspot_create_contact")?.toolkitLabel).toBe(
      "HubSpot",
    )
    expect(parseComposioToolName("composio_clickup_add_task")?.toolkitLabel).toBe("ClickUp")
  })

  it("title-cases unknown toolkits so new connections still render", () => {
    const p = parseComposioToolName("composio_acmecrm_do_a_thing")
    expect(p?.toolkitLabel).toBe("Acmecrm")
    expect(p?.actionLabel).toBe("Do a thing")
  })

  it("tolerates a dash separator after the prefix", () => {
    expect(parseComposioToolName("composio-gmail_send_email")?.toolkitLabel).toBe("Gmail")
  })

  it("handles a toolkit with no action segment", () => {
    expect(parseComposioToolName("composio_gmail")).toMatchObject({
      toolkitSlug: "gmail",
      toolkitLabel: "Gmail",
      actionSlug: "",
      actionLabel: "",
    })
  })

  it("returns null for non-composio names and junk input", () => {
    expect(parseComposioToolName("browser_navigate")).toBeNull()
    expect(parseComposioToolName("webSearch")).toBeNull()
    expect(parseComposioToolName("terminal_execute")).toBeNull()
    expect(parseComposioToolName("composio_")).toBeNull()
    expect(parseComposioToolName("")).toBeNull()
    expect(parseComposioToolName(null)).toBeNull()
    expect(parseComposioToolName(undefined)).toBeNull()
    expect(parseComposioToolName(42)).toBeNull()
  })
})

describe("isComposioToolName", () => {
  it("discriminates composio vs other tools", () => {
    expect(isComposioToolName("composio_slack_send_message")).toBe(true)
    expect(isComposioToolName("browser_navigate")).toBe(false)
  })
})

describe("composioToolLabel", () => {
  it("formats 'Toolkit · Action'", () => {
    expect(composioToolLabel("composio_gmail_send_email")).toBe("Gmail · Send email")
    expect(composioToolLabel("composio_notion_create_page")).toBe("Notion · Create page")
  })
  it("falls back to just the toolkit when there is no action", () => {
    expect(composioToolLabel("composio_gmail")).toBe("Gmail")
  })
  it("returns null for non-composio tools", () => {
    expect(composioToolLabel("vmAction")).toBeNull()
  })
})

describe("composioToolDescription", () => {
  it("uses present/past voice", () => {
    expect(composioToolDescription("composio_gmail_send_email", true)).toBe(
      "Using Gmail to send email",
    )
    expect(composioToolDescription("composio_gmail_send_email", false)).toBe(
      "Used Gmail to send email",
    )
  })
  it("handles the no-action case", () => {
    expect(composioToolDescription("composio_gmail", true)).toBe("Using Gmail")
  })
  it("returns null for non-composio tools", () => {
    expect(composioToolDescription("webSearch", true)).toBeNull()
  })
})

describe("the cardinal rule: outputs never leak 'composio' or raw names", () => {
  const samples = [
    "composio_gmail_send_email",
    "composio_GITHUB_CREATE_AN_ISSUE",
    "composio_googlecalendar_create_event",
    "composio_acmecrm_do_a_thing",
    "composio_gmail",
  ]
  for (const name of samples) {
    it(`"${name}" → clean output`, () => {
      const label = composioToolLabel(name)!
      const descA = composioToolDescription(name, true)!
      const descB = composioToolDescription(name, false)!
      for (const out of [label, descA, descB]) {
        expect(out.toLowerCase()).not.toContain("composio")
        expect(out).not.toContain("_")
      }
    })
  }
})
