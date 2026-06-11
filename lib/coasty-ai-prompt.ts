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
- The predict surface (/v1/predict, /v1/ground, /v1/sessions) is SCREEN-AGNOSTIC: it can automate the user's OWN screen locally (capture a screenshot, POST it, execute the returned click/type/scroll actions with pyautogui or Playwright) or any other screen — Coasty-managed cloud VMs via /v1/machines are one execution target, not the only one. See the "Local automation" section of the reference below.
- Full machine-readable reference (read this for complete detail): https://coasty.ai/docs/llms.txt
- Human docs: https://coasty.ai/docs  ·  API keys: https://coasty.ai/developers/keys

## Core endpoints (stateless / session)
- POST /v1/predict — body {screenshot (base64), instruction, cua_version} -> {actions:[{action_type, params}], status}. Loop: capture screenshot -> predict -> execute actions -> repeat while status is "continue" ("done" / "fail" are terminal).
- POST /v1/sessions then POST /v1/sessions/{id}/predict — stateful multi-step with trajectory memory.
- POST /v1/ground — {screenshot, element} -> {x, y}. POST /v1/parse — pyautogui code -> structured actions (free).

## Task Runs — the server drives an agent task to completion
- POST /v1/runs — {machine_id, task, cua_version ("v3" default; "v4" = autonomous + pass/fail verifier), instructions?, system_prompt?, max_steps?, deadline_seconds?, on_awaiting_human ("pause"|"fail"|"cancel"), webhook_url?} -> a run (status "queued"). The server runs the screenshot->act loop, verifies success, and bills per step.
- GET /v1/runs  ·  GET /v1/runs/{id}  ·  POST /v1/runs/{id}/cancel  ·  POST /v1/runs/{id}/resume (after a human takeover)
- GET /v1/runs/{id}/events — Server-Sent Events; reconnect with Last-Event-ID. States: queued -> running -> (awaiting_human <-> running) -> succeeded | failed | cancelled | timed_out.
- Webhooks are HMAC-signed: header "Coasty-Signature: t=<unix>,v1=<hex>", signed payload "<t>." + raw_body, key = the webhook_secret returned once at create.

## Workflows — versioned JSON DSL composed of runs
- POST /v1/workflows {name, slug, definition, inputs_schema?}  ·  POST /v1/workflows/{id}/runs  ·  POST /v1/workflows/runs (ad-hoc inline definition)  ·  GET /v1/workflows/runs/{id} + /events (SSE)  ·  POST /v1/workflows/runs/{id}/cancel + /resume {approved}.
- DSL step types: task, assert, if, loop, parallel, human_approval, retry, succeed, fail. Conditions are structured objects: {op: "eq"|"ne"|"lt"|"gt"|"lte"|"gte"|"contains"|"truthy"|"falsy"|"exists"|"and"|"or"|"not", ...}. Variables: {{inputs.x}}, {{vars.y}}, {{stepId.field}} (a task binds {status, passed, result, run_id}). Hard guards: budget_cents, max_iterations, deadline_seconds.

## Pricing (USD, prepaid dollar wallet; 1 credit = $0.01)
- Inference: predict $0.05  ·  session create $0.10  ·  session step $0.04  ·  ground $0.03  ·  parse free. Exact surcharges: +$0.02 per trajectory screenshot, +$0.01 per HD image (width > 1280 or height > 720; current + trajectory), +$0.03 per request on the v1 engine, +$0.01 when system_prompt exceeds 500 chars.
- Runs & workflows: $0.05 per completed agent step on v3/v4, $0.08 on v1; workflow control-flow steps (if/assert/loop/parallel/retry/human_approval/succeed/fail) are free; cap spend with budget_cents.
- Machines: $0.05/hr Linux running, $0.09/hr Windows running, $0.01/hr stopped, $0 while creating/terminated (metered per minute, rounded down); snapshot $0.01 one-time; all per-call machine ops (actions/terminal/browser/files/screenshot) free; provisioning needs a $0.20 wallet minimum (a gate, not a fee).
- Schedules: create/run-now/webhook-fire need a $0.20 wallet minimum, no per-fire fee; execution bills your Coasty account credit balance at 10 credits per minute of agent runtime.
- sk-coasty-test-* sandbox keys never bill. Top up at https://coasty.ai/developers/usage.

## Errors
JSON envelope {error:{code, message, request_id}}. 401 invalid key  ·  402 INSUFFICIENT_CREDITS  ·  403 INSUFFICIENT_SCOPE.`

export const AI_PROMPT = `${API_REFERENCE}

---
Now help me build: <describe what you want to build>. Use minimal, correct code. DEFAULT TO AUTOMATING MY OWN SCREEN locally (the "Local automation" loop described above, via /v1/sessions/{id}/predict) unless I explicitly ask for a Coasty cloud VM — only then provision via /v1/machines or ask me for a machine_id for /v1/runs.`

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

export const EXECUTION_TARGET_OPTIONS = [
  // "local" is THE DEFAULT everywhere (store default + builder fallback):
  // the crafted prompt builds the screenshot->predict->execute loop against
  // the developer's OWN machine — no VM. "cloud-vm" is the explicit opt-in
  // for /v1/machines + /v1/runs orchestration; choices persist in the store.
  { id: "local", label: "My own screen (local)" },
  { id: "cloud-vm", label: "Coasty cloud VM" },
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
  /** "local" | "cloud-vm" — where the generated code should run. */
  executionTarget: string
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

  const rawGoal =
    cfg.building === "other"
      ? cfg.customBuilding.trim() || "the tool I describe"
      : BUILDING_GOAL[cfg.building] || "a working end-to-end example"

  // LOCAL IS THE DEFAULT: anything that isn't an explicit "cloud-vm" pick
  // (including a missing/unknown value from an older persisted config)
  // crafts the local agent loop against the developer's own screen.
  const local = cfg.executionTarget !== "cloud-vm"

  // Goal phrasing must match the run target — "on a Coasty machine" would
  // contradict a local-execution prompt.
  const goal = local ? rawGoal.replace(" on a Coasty machine", " in a browser on my machine") : rawGoal

  // Where the generated code runs decides the whole integration shape:
  // local = the screenshot->predict->execute loop on the developer's own
  // machine; cloud-vm = machine provisioning + /v1/runs orchestration.
  const executionBullets = local
    ? [
        `- Run target: MY OWN screen — no Coasty VM. Build the local agent loop: capture a screenshot of my screen (mss on Python / Playwright page.screenshot for a browser target), POST it to /v1/sessions/{id}/predict with the task instruction, EXECUTE the returned actions locally (pyautogui for the desktop, page.mouse/keyboard for a browser), and repeat until status leaves "continue".`,
        `- Coordinates come back in the coordinate space of the screenshot I send: pass the screenshot's EXACT pixel size as screen_width/screen_height on session create (POST /v1/sessions — the predict step has no size fields), and if the code downscales screenshots (e.g. to 1280x720), scale returned x/y back up before clicking.`,
        `- Send an Idempotency-Key header on every predict step so a network retry can never double-execute an action, keep pyautogui.FAILSAFE enabled on desktop targets, and cap the loop at a fixed number of steps.`,
        `- Read the "Local automation" section of https://coasty.ai/docs/llms.txt for the per-action executor mapping and the selectable instruction presets (pass one in the "instructions" field on session create — e.g. the Cautious preset when the screen can reach anything irreversible; custom instructions require the Starter tier or higher, so omit the field on a free-tier key).`,
      ]
    : [
        `- Run target: a Coasty cloud VM. Provision a machine via POST /v1/machines (or pick one at https://coasty.ai/machines), or ask me for a machine_id, then drive the task with POST /v1/runs (use a workflow for multi-step logic).`,
        `- Stream progress from GET /v1/runs/{id}/events and stop when the run reaches a terminal status (succeeded | failed | cancelled | timed_out).`,
      ]

  return [
    `# Build with the Coasty Computer Use API using ${agentLabel}`,
    ``,
    `I'm using ${agentLabel} and I want to build ${goal} with the Coasty Computer Use API${local ? ", running against my own screen (local automation, no VM)" : ""}. Generate ${integrationLabel} code.`,
    ``,
    API_REFERENCE,
    ``,
    `## Your task`,
    `- Stack: ${integrationGuide}`,
    `- Goal: build something that ${goal}.`,
    ...executionBullets,
    ``,
    `Start by scaffolding a minimal, runnable ${integrationLabel} example that ${goal}, then explain how to run and extend it.`,
  ].join("\n")
}
