/**
 * The Coasty API prompt(s) shared by the Copy-for-AI control and the Coding
 * Agent Quickstart. Plain strings + a builder (no JSX) so both the bar and the
 * popup can import without a cycle.
 *
 * API_REFERENCE      — the self-contained API brief.
 * AI_PROMPT          — API_REFERENCE + a generic "now help me build" CTA.
 * buildCraftedPrompt — API_REFERENCE wrapped in guidance tailored to the
 *                      developer's coding agent + integration + goal.
 */

export const CHATGPT_BASE = "https://chatgpt.com/?q="
export const CLAUDE_BASE = "https://claude.ai/new?q="

export const API_REFERENCE = `# Coasty Computer Use API — integration brief for an AI coding assistant

You are helping me build on the Coasty Computer Use API: a REST API that lets code see a screen and act on it (click, type, scroll), run autonomous agent tasks on a machine, and orchestrate multi-step workflows.

- Base URL: https://coasty.ai/v1
- Auth: send the secret key in the \`X-API-Key: <key>\` header (or \`Authorization: Bearer <key>\`). Read it from a COASTY_API_KEY environment variable; never hardcode it.
- Full machine-readable reference (read this for complete detail): https://coasty.ai/docs/llms.txt
- Human docs: https://coasty.ai/docs  ·  API keys: https://coasty.ai/developers/keys

## Core endpoints (stateless / session)
- POST /v1/predict — body {screenshot (base64), instruction, cua_version} -> {actions:[{action_type, params}], status}. Loop: capture screenshot -> predict -> execute actions -> repeat until status is "done".
- POST /v1/sessions then POST /v1/sessions/{id}/predict — stateful multi-step with trajectory memory.
- POST /v1/ground — {screenshot, element} -> {x, y}. POST /v1/parse — pyautogui code -> structured actions (free).

## Task Runs — the server drives an agent task to completion
- POST /v1/runs — {machine_id, task, cua_version ("v3" default; "v4" = autonomous + pass/fail verifier), instructions?, system_prompt?, max_steps?, deadline_seconds?, on_awaiting_human ("pause"|"fail"|"cancel"), webhook_url?} -> a run (status "queued"). The server runs the screenshot->act loop, verifies success, and bills per step.
- GET /v1/runs  ·  GET /v1/runs/{id}  ·  POST /v1/runs/{id}/cancel  ·  POST /v1/runs/{id}/resume (after a human takeover)
- GET /v1/runs/{id}/events — Server-Sent Events; reconnect with Last-Event-ID. States: queued -> running -> (awaiting_human <-> running) -> succeeded | failed | cancelled | timed_out.
- Webhooks are HMAC-signed: header "Coasty-Signature: t=<unix>,v1=<hex>", signed payload "<t>." + raw_body, key = the webhook_secret returned once at create.

## Workflows — versioned JSON DSL composed of runs
- POST /v1/workflows {name, slug, definition, inputs_schema?}  ·  POST /v1/workflows/{id}/runs  ·  POST /v1/workflows/runs (ad-hoc inline definition)  ·  GET/POST /v1/workflows/runs/{id} + /events + /cancel + /resume {approved}.
- DSL step types: task, assert, if, loop, parallel, human_approval, retry, succeed, fail. Conditions are structured objects: {op: "eq"|"ne"|"lt"|"gt"|"lte"|"gte"|"contains"|"truthy"|"falsy"|"exists"|"and"|"or"|"not", ...}. Variables: {{inputs.x}}, {{vars.y}}, {{stepId.field}} (a task binds {status, passed, result, run_id}). Hard guards: budget_cents, max_iterations, deadline_seconds.

## Pricing (USD, prepaid dollar wallet)
predict $0.05  ·  session create $0.10  ·  session step $0.04  ·  ground $0.03  ·  parse free  ·  runs and workflow task steps $0.05 per agent step (v3/v4). Top up at https://coasty.ai/developers/usage.

## Errors
JSON envelope {error:{code, message, request_id}}. 401 invalid key  ·  402 INSUFFICIENT_CREDITS  ·  403 INSUFFICIENT_SCOPE  ·  429 rate limit / TOO_MANY_RUNS.`

export const AI_PROMPT = `${API_REFERENCE}

---
Now help me build: <describe what you want to build>. Use minimal, correct code, read COASTY_API_KEY from the environment, and ask me for a machine_id when a run or workflow needs one.`

/* ── Quickstart option catalogs (ids shared with the store + UI) ──────────── */

export const CODING_AGENT_OPTIONS = [
  { id: "cursor", label: "Cursor" },
  { id: "claude-code", label: "Claude Code" },
  { id: "codex", label: "Codex" },
  { id: "copilot", label: "GitHub Copilot" },
  { id: "windsurf", label: "Windsurf" },
  { id: "other", label: "Other" },
] as const

export const INTEGRATION_OPTIONS = [
  { id: "python", label: "Python" },
  { id: "javascript", label: "JavaScript" },
  { id: "curl", label: "cURL" },
  { id: "go", label: "Go" },
  { id: "mcp", label: "MCP server" },
  { id: "other", label: "Other" },
] as const

export const BUILD_TARGET_OPTIONS = [
  { id: "browser-automation", label: "Browser automation" },
  { id: "form-filling", label: "Form filling & checkout" },
  { id: "qa-testing", label: "QA & UI testing" },
  { id: "monitoring", label: "Scheduled monitoring" },
  { id: "data-extraction", label: "Research & data extraction" },
  { id: "not-sure", label: "Not sure yet" },
  { id: "other", label: "Other" },
] as const

const INTEGRATION_GUIDE: Record<string, string> = {
  python: "Write idiomatic Python 3 using httpx (or requests). Use async where it helps for streaming run events.",
  javascript: "Write modern TypeScript for Node 20+ using the built-in fetch, and type the responses.",
  curl: "Write copy-paste cURL commands for each call, reading the key from $COASTY_API_KEY.",
  go: "Write idiomatic Go using net/http and encoding/json with small typed structs.",
  mcp: "Use the Coasty MCP server (npx -y @coasty/mcp) configured in my MCP client. Call its tools where possible and fall back to the /v1 REST API for anything it does not expose.",
}

const BUILDING_GOAL: Record<string, string> = {
  "browser-automation": "automates a browser flow end to end (navigate, click, fill, extract) on a Coasty machine",
  "form-filling": "fills and submits a web form or checkout reliably, handling validation and the confirmation screen",
  "qa-testing": "drives a UI as a QA check, asserts the expected end state, and reports pass or fail",
  "monitoring": "runs on a schedule to watch a page or dashboard and report changes",
  "data-extraction": "navigates a site and extracts structured data into JSON",
  "not-sure": "shows a simple end-to-end example so I can see what the API can do",
}

export interface QuickstartSelection {
  codingAgent: string
  customAgent: string
  integration: string
  customIntegration: string
  building: string
  customBuilding: string
}

function labelFor(options: readonly { id: string; label: string }[], id: string, fallback: string) {
  return options.find((o) => o.id === id)?.label ?? fallback
}

export function buildCraftedPrompt(cfg: QuickstartSelection): string {
  const agentLabel =
    cfg.codingAgent === "other"
      ? cfg.customAgent.trim() || "my AI coding assistant"
      : labelFor(CODING_AGENT_OPTIONS, cfg.codingAgent, "my AI coding assistant")

  const integrationLabel =
    cfg.integration === "other"
      ? cfg.customIntegration.trim() || "my preferred stack"
      : labelFor(INTEGRATION_OPTIONS, cfg.integration, "code")

  const integrationGuide =
    cfg.integration === "other"
      ? `Write the integration in ${cfg.customIntegration.trim() || "my preferred language and stack"}.`
      : INTEGRATION_GUIDE[cfg.integration] || "Write a small, idiomatic client."

  const goal =
    cfg.building === "other"
      ? cfg.customBuilding.trim() || "the tool I describe"
      : BUILDING_GOAL[cfg.building] || "a working end-to-end example"

  return [
    `# Build with the Coasty Computer Use API using ${agentLabel}`,
    ``,
    `I'm using ${agentLabel} and I want to build ${goal} with the Coasty Computer Use API. Generate ${integrationLabel} code.`,
    ``,
    API_REFERENCE,
    ``,
    `## Your task`,
    `- Stack: ${integrationGuide}`,
    `- Goal: build something that ${goal}.`,
    `- Read COASTY_API_KEY from the environment; never hardcode it.`,
    `- Provision or pick a machine at https://coasty.ai/developers, or ask me for a machine_id, then drive the task with POST /v1/runs (use a workflow for multi-step logic).`,
    `- Stream progress from GET /v1/runs/{id}/events and stop when status is succeeded or failed.`,
    ``,
    `Start by scaffolding a minimal, runnable ${integrationLabel} example that ${goal}, then explain how to run and extend it.`,
  ].join("\n")
}
