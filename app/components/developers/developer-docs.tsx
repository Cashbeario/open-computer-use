"use client"

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { motion } from "framer-motion"
import Link from "next/link"
import { BuildWithAIBar } from "@/app/components/developers/copy-for-ai"
import {
  BookOpen,
  KeyRound,
  Rocket,
  MousePointerClick,
  Repeat,
  Crosshair,
  Braces,
  ListChecks,
  FileJson,
  AlertTriangle,
  Coins,
  Copy,
  Check,
  Terminal,
  ArrowRight,
  Bot,
  Radio,
  Hand,
  Webhook,
  Workflow,
  GitBranch,
  Network,
  type LucideIcon,
} from "lucide-react"
import { cn } from "@/lib/utils"

/* ===================================================================
   Developer API documentation — a self-contained, professional reference
   for the Computer Use prediction API. Built specifically for the in-app
   /developers/docs page: a prominent always-visible sticky sidebar, a
   mobile pill nav, scroll-spy section tracking, language-tabbed code, and
   high-detail prose. Every code sample is verified against the live v1
   contract (POST https://coasty.ai/v1/*, X-API-Key auth).

   The data constants (DOC_SECTIONS, ACTION_TYPES, ERROR_CODES,
   PRICING, CODE_SAMPLES, RESPONSE_EXAMPLE, ERROR_EXAMPLE) are exported so
   the test suite can assert section integrity, JSON validity, and that
   every snippet targets the correct base URL + auth header.
   =================================================================== */

export const API_BASE = "https://coasty.ai/v1"
export const AUTH_HEADER = "X-API-Key"

/* ─── Section catalogue (drives both the sidebar and scroll-spy) ─── */

export type DocGroup = "Get started" | "Core API" | "Agents" | "Workflows" | "Reference"

export interface DocSection {
  id: string
  title: string
  group: DocGroup
  icon: LucideIcon
  /** One-line summary shown under the sidebar entry on hover / in the pill. */
  blurb: string
}

export const DOC_SECTIONS: DocSection[] = [
  { id: "introduction",   title: "Introduction",      group: "Get started", icon: BookOpen,           blurb: "What the API does and how a turn works" },
  { id: "authentication", title: "Authentication",    group: "Get started", icon: KeyRound,           blurb: "API keys, live vs test, and the auth header" },
  { id: "quickstart",     title: "Quickstart",        group: "Get started", icon: Rocket,             blurb: "Your first prediction in under a minute" },
  { id: "predict",        title: "Predict",           group: "Core API",    icon: MousePointerClick,  blurb: "Stateless screenshot → actions" },
  { id: "sessions",       title: "Sessions",          group: "Core API",    icon: Repeat,             blurb: "Stateful, multi-step tasks with memory" },
  { id: "grounding",      title: "Grounding",         group: "Core API",    icon: Crosshair,          blurb: "Resolve a description to exact coordinates" },
  { id: "parse",          title: "Parse",             group: "Core API",    icon: Braces,             blurb: "Turn pyautogui code into structured actions" },
  { id: "runs",           title: "Task runs",         group: "Agents",      icon: Bot,                blurb: "Give the agent a task and a machine; it drives to done" },
  { id: "run-events",     title: "Streaming events",  group: "Agents",      icon: Radio,              blurb: "Live SSE stream with Last-Event-ID replay" },
  { id: "human-takeover", title: "Human takeover",    group: "Agents",      icon: Hand,               blurb: "Pause on awaiting_human, hand back with resume" },
  { id: "run-webhooks",   title: "Webhooks",          group: "Agents",      icon: Webhook,            blurb: "HMAC-signed run lifecycle callbacks" },
  { id: "workflows",      title: "Workflows",         group: "Workflows",   icon: Workflow,           blurb: "Compose many runs with a versioned JSON DSL" },
  { id: "workflow-dsl",   title: "Workflow DSL",      group: "Workflows",   icon: GitBranch,          blurb: "Steps, structured conditions, and variable refs" },
  { id: "workflow-runs",  title: "Running workflows", group: "Workflows",   icon: Network,            blurb: "Saved runs, ad-hoc runs, and guards" },
  { id: "actions",        title: "Action types",      group: "Reference",   icon: ListChecks,         blurb: "Every action the model can return" },
  { id: "responses",      title: "Response format",   group: "Reference",   icon: FileJson,           blurb: "The shape of every prediction response" },
  { id: "errors",         title: "Errors",            group: "Reference",   icon: AlertTriangle,      blurb: "Error envelope and HTTP status codes" },
  { id: "pricing",        title: "Pricing",           group: "Reference",   icon: Coins,              blurb: "What each endpoint costs in USD" },
]

export const DOC_GROUPS: DocGroup[] = ["Get started", "Core API", "Agents", "Workflows", "Reference"]

/* ─── Reference data ─── */

export interface ActionType {
  type: string
  params: string
  description: string
}

export const ACTION_TYPES: ActionType[] = [
  { type: "click",     params: "{ x, y }",                          description: "Single left click at the given pixel coordinate." },
  { type: "type_text", params: "{ text }",                         description: "Type a literal string at the current focus." },
  { type: "key_press", params: "{ key }",                          description: "Press one key, e.g. \"enter\", \"tab\", \"escape\"." },
  { type: "key_combo", params: "{ keys: [..] }",                   description: "Press a chord, e.g. [\"ctrl\", \"c\"] or [\"cmd\", \"v\"]." },
  { type: "scroll",    params: "{ x, y, direction, amount }",      description: "Scroll up / down / left / right at a position." },
  { type: "drag",      params: "{ from_x, from_y, to_x, to_y }",   description: "Press, move, and release between two points." },
  { type: "move",      params: "{ x, y }",                          description: "Move the cursor without clicking." },
  { type: "wait",      params: "{ ms }",                            description: "Pause before the next step (e.g. for a page load)." },
  { type: "done",      params: "{}",                                description: "The task is complete. status becomes \"done\"." },
  { type: "fail",      params: "{ reason? }",                       description: "The task is impossible. status becomes \"fail\"." },
]

export interface ErrorCode {
  status: number
  code: string
  meaning: string
}

/* The real backend error catalogue. Every error envelope carries
   error.code (stable, safe to branch on), error.request_id, and an
   X-Coasty-Request-Id header. Authentication failures also carry a
   WWW-Authenticate header. */
export const ERROR_CODES: ErrorCode[] = [
  // Auth + authorization
  { status: 401, code: "INVALID_API_KEY",       meaning: "Key missing, malformed, or revoked (or \"Bearer \" was wrongly pasted into X-API-Key). 401s carry a WWW-Authenticate header." },
  { status: 403, code: "INSUFFICIENT_SCOPE",    meaning: "The key is valid but lacks the scope this endpoint needs. The body lists required_scope and current_scopes; re-mint a key with the scope." },
  // Billing
  { status: 402, code: "INSUFFICIENT_CREDITS",  meaning: "Your USD wallet can't cover the request. The body reports required and balance. Add funds, or use a test key while building." },
  { status: 402, code: "WALLET_EXHAUSTED",      meaning: "The wallet emptied mid-run. Steps that already completed were billed; top up to continue." },
  // Request validation
  { status: 422, code: "VALIDATION_ERROR",      meaning: "The body failed schema validation. error.details lists the offending field path and the expected type." },
  { status: 422, code: "INVALID_SCREENSHOT",    meaning: "The screenshot is not decodable base64 PNG or JPEG. Strip any data: prefix and remove whitespace before encoding." },
  { status: 413, code: "PAYLOAD_TOO_LARGE",     meaning: "The screenshot exceeds the 10 MB base64 limit. Downscale the image or re-encode it as JPEG." },
  { status: 400, code: "INVALID_LIMIT",         meaning: "A ?limit= query parameter fell outside the allowed range of 1 to 200." },
  { status: 400, code: "INVALID_STATUS_FILTER", meaning: "A ?status= query parameter is not one of the real statuses for that resource." },
  // Resource lookup (ids are mode-isolated: test keys can't see live resources, and vice versa)
  { status: 404, code: "NOT_FOUND",             meaning: "The resource id is unknown or expired. Ids are mode-isolated, so a test key can't see live resources." },
  { status: 404, code: "SESSION_NOT_FOUND",     meaning: "The session id is unknown or its 24h inactivity window expired." },
  { status: 404, code: "RUN_NOT_FOUND",         meaning: "The run id is unknown, expired, or belongs to the other key mode." },
  { status: 404, code: "WORKFLOW_NOT_FOUND",    meaning: "The workflow id (or workflow-run id) is unknown or was archived." },
  // State conflicts (carry machine-readable current_state plus allowed_from or required_state)
  { status: 409, code: "NOT_AWAITING_HUMAN",    meaning: "You resumed a run that is not in awaiting_human. The body reports current_state and required_state." },
  { status: 409, code: "RESUME_CONFLICT",       meaning: "A resume or cancel race was lost (the run already moved on). Re-read the run and retry against its new state." },
  { status: 409, code: "IDEMPOTENCY_KEY_REUSED",meaning: "The same Idempotency-Key was sent with a different body. Use a fresh key, or replay the original request verbatim." },
  // Feature gating
  { status: 400, code: "FEATURE_NOT_AVAILABLE", meaning: "The feature is gated to a higher tier (for example cua_version v4). Upgrade the plan or drop the gated option." },
  // Server + upstream (charges for model failures are auto-refunded)
  { status: 500, code: "INTERNAL_ERROR",        meaning: "An unexpected server error. Retry, and quote request_id when contacting support." },
  { status: 500, code: "PREDICTION_FAILED",     meaning: "The prediction model run failed. The charge is automatically refunded." },
  { status: 500, code: "GROUNDING_FAILED",      meaning: "The grounding model run failed. The charge is automatically refunded." },
  { status: 503, code: "UPSTREAM_UNAVAILABLE",  meaning: "A transient upstream outage. Retry with an Idempotency-Key and exponential backoff." },
  { status: 504, code: "UPSTREAM_TIMEOUT",      meaning: "An upstream call timed out. Transient; retry with an Idempotency-Key." },
]

export interface PriceRow {
  endpoint: string
  cost: string
  note: string
}

export const PRICING: PriceRow[] = [
  { endpoint: "POST /v1/predict",                  cost: "$0.05", note: "Stateless prediction." },
  { endpoint: "POST /v1/sessions",                 cost: "$0.10", note: "One-time session creation." },
  { endpoint: "POST /v1/sessions/{id}/predict",    cost: "$0.04", note: "Each step inside a session." },
  { endpoint: "POST /v1/ground",                   cost: "$0.03", note: "Coordinate grounding." },
  { endpoint: "POST /v1/parse",                    cost: "Free",  note: "Deterministic, no model call." },
  { endpoint: "POST /v1/runs",                     cost: "$0.05/step", note: "Per completed agent step on v3/v4 ($0.08/step on the legacy v1 engine), billed from your dollar API wallet." },
  { endpoint: "POST /v1/workflows/runs",           cost: "$0.05/step", note: "Each task step is a run ($0.08/step on v1). Control-flow steps (if, assert, loop, parallel, retry, human_approval, succeed, fail) are free. Total capped by budget_cents." },
  { endpoint: "/v1/machines (Linux, running)",     cost: "$0.05/hr", note: "Runtime metered per minute, rounded down. Starting, stopping, and restarting bill at the running rate." },
  { endpoint: "/v1/machines (Windows, running)",   cost: "$0.09/hr", note: "Runtime metered per minute, rounded down." },
  { endpoint: "/v1/machines (stopped or suspended)", cost: "$0.01/hr", note: "Keep-alive rate while a machine is parked. The creating, error, and terminated states bill nothing." },
  { endpoint: "POST /v1/machines/{id}/snapshot",   cost: "$0.01", note: "One-time charge per snapshot." },
  { endpoint: "/v1/machines/{id} per-call ops",    cost: "Free",  note: "Actions, batch, browser, terminal, files, screenshot, and connection calls are never billed; you pay for runtime only." },
  { endpoint: "POST /v1/schedules",                cost: "Free",  note: "No per-fire fee; webhook fires are free (limited to 60/min). Create, run-now, and webhook fires require a $0.20 wallet minimum as a gate, not a charge." },
]

/* Exact per-request surcharges layered on top of the base prices above.
   Every surcharge is a fixed USD amount, never an estimate. */
export interface SurchargeRow {
  surcharge: string
  cost: string
  applies: string
}

export const SURCHARGES: SurchargeRow[] = [
  { surcharge: "Trajectory screenshot", cost: "+$0.02 each",        applies: "Every screenshot you include in a request's trajectory history." },
  { surcharge: "High-resolution image", cost: "+$0.01 each",        applies: "Any image wider than 1280px or taller than 720px (strict), counting the current screenshot and every trajectory image." },
  { surcharge: "v1 engine",             cost: "+$0.03 per request", applies: "Requests served by the legacy v1 engine instead of v3/v4." },
  { surcharge: "Long system prompt",    cost: "+$0.01 per request", applies: "Requests whose system_prompt exceeds 500 characters." },
]

/* ─── Agents (Task Runs) reference data ─── */

export interface RunField {
  field: string
  type: string
  description: string
}

/* The fields on the agent.run object, documented for the Task runs table. */
export const RUN_FIELDS: RunField[] = [
  { field: "id",                  type: "string",  description: "Unique run id, prefixed run_." },
  { field: "object",             type: "string",  description: "Always \"agent.run\"." },
  { field: "status",             type: "string",  description: "queued, running, awaiting_human, succeeded, failed, cancelled, or timed_out." },
  { field: "machine_id",         type: "string",  description: "The machine the agent is driving." },
  { field: "task",               type: "string",  description: "The natural-language goal you submitted." },
  { field: "cua_version",        type: "string",  description: "Model family: \"v3\" (default) or \"v4\" (professional tier and above)." },
  { field: "instructions",       type: "string",  description: "Extra guidance appended to the base prompt (nullable)." },
  { field: "max_steps",          type: "int",     description: "Hard cap on agent steps (default 50)." },
  { field: "on_awaiting_human",  type: "string",  description: "What to do when a human is needed: pause, fail, or cancel." },
  { field: "steps_completed",    type: "int",     description: "How many agent steps have run so far." },
  { field: "credits_charged",    type: "int",     description: "Internal cost units billed (1 unit = $0.01). See cost_cents for the dollar amount." },
  { field: "cost_cents",         type: "int",     description: "Dollar cost so far, in cents (USD)." },
  { field: "result",             type: "object",  description: "{ passed, status, summary, verdict? } once the run finishes." },
  { field: "error",              type: "object",  description: "{ code, message } when the run failed (nullable)." },
  { field: "awaiting_human_reason", type: "string", description: "Why the run paused for a human (nullable)." },
  { field: "metadata",           type: "object",  description: "The metadata you attached at create time." },
  { field: "webhook_url",        type: "string",  description: "Where lifecycle events are POSTed (nullable)." },
  { field: "created_at",         type: "string",  description: "ISO-8601 creation timestamp." },
  { field: "started_at",         type: "string",  description: "When the run left the queue (nullable)." },
  { field: "awaiting_human_since", type: "string", description: "When the run last paused for a human (nullable)." },
  { field: "finished_at",        type: "string",  description: "When the run reached a terminal state (nullable)." },
  { field: "request_id",         type: "string",  description: "Id of the create request, for support and tracing." },
]

export interface EventType {
  type: string
  description: string
}

/* SSE event types emitted by GET /v1/runs/{id}/events. */
export const RUN_EVENT_TYPES: EventType[] = [
  { type: "status",        description: "The run moved to a new status (running, awaiting_human, succeeded, etc.)." },
  { type: "text",          description: "A chunk of the agent's natural-language narration." },
  { type: "reasoning",     description: "A chunk of the model's private reasoning, if exposed." },
  { type: "tool_call",     description: "The agent invoked a tool (a click, a keypress, a navigation)." },
  { type: "tool_result",   description: "The result of the most recent tool call." },
  { type: "awaiting_human",description: "The run paused and is waiting for a human to take over." },
  { type: "resumed",       description: "Control was handed back after a human takeover." },
  { type: "step",          description: "A full agent step completed; carries steps_completed." },
  { type: "billing",       description: "Incremental billing update (credits_charged, cost_cents)." },
  { type: "error",         description: "A non-fatal or fatal error occurred during the run." },
  { type: "done",          description: "Terminal event. The stream closes after this is sent." },
]

export interface WebhookEvent {
  event: string
  meaning: string
}

/* HMAC-signed webhook lifecycle events POSTed to webhook_url. */
export const WEBHOOK_EVENTS: WebhookEvent[] = [
  { event: "run.awaiting_human", meaning: "The run paused and needs a human to take over." },
  { event: "run.succeeded",      meaning: "The run finished and verification passed." },
  { event: "run.failed",         meaning: "The run ended in failure (verification failed or an error)." },
  { event: "run.cancelled",      meaning: "The run was cancelled via the cancel endpoint." },
  { event: "run.timed_out",      meaning: "The run breached its deadline before finishing." },
]

/* ─── Workflows reference data ─── */

export interface StepType {
  type: string
  shape: string
  description: string
}

/* The step types available in the workflow DSL (dsl_version 2026-06-01). */
export const WORKFLOW_STEP_TYPES: StepType[] = [
  { type: "task",           shape: "{ task, machine_id?, save_as? }",     description: "Run an agent task. Supports {{var}} templating. Binds its result under save_as and the step id." },
  { type: "assert",         shape: "{ condition, message? }",             description: "Fail the workflow unless the structured condition holds." },
  { type: "if",             shape: "{ condition, then, else? }",          description: "Branch on a structured condition." },
  { type: "loop",           shape: "{ count | while, body }",             description: "Repeat a body a fixed number of times or while a condition holds." },
  { type: "parallel",       shape: "{ branches: [[...], [...]] }",        description: "Run independent branches concurrently." },
  { type: "human_approval", shape: "{ message?, timeout_seconds? }",      description: "Pause for a human to approve or reject before continuing." },
  { type: "retry",          shape: "{ body, max_attempts }",             description: "Retry a body up to max_attempts times on failure." },
  { type: "succeed",        shape: "{ output? }",                        description: "Finish the workflow successfully with an optional output." },
  { type: "fail",           shape: "{ message? }",                       description: "Finish the workflow as failed with an optional message." },
]

export interface ConditionOp {
  op: string
  shape: string
  description: string
}

/* Structured, injection-safe conditions (no expression strings). */
export const CONDITION_OPS: ConditionOp[] = [
  { op: "eq / ne",                 shape: "{ op, left, right }",       description: "Equal / not equal." },
  { op: "lt / gt / lte / gte",     shape: "{ op, left, right }",       description: "Ordered numeric comparison." },
  { op: "contains",                shape: "{ op, left, right }",       description: "left contains right (substring or membership)." },
  { op: "truthy / falsy / exists", shape: "{ op, value }",             description: "Test a single value for truthiness, falsiness, or presence." },
  { op: "and / or",                shape: "{ op, conditions: [..] }",  description: "Combine several conditions." },
  { op: "not",                     shape: "{ op, condition }",         description: "Negate a condition." },
]

export interface WorkflowLimit {
  limit: string
  rule: string
}

/* Validation limits the DSL enforces at create / ad-hoc time. */
export const WORKFLOW_LIMITS: WorkflowLimit[] = [
  { limit: "Max steps",          rule: "A definition holds at most 100 steps in total (counting every nested step)." },
  { limit: "Max nesting depth",  rule: "Steps can nest at most 8 levels deep (if, loop, parallel, retry bodies)." },
  { limit: "Parallel branches",  rule: "A parallel step takes at most 16 branches; they run concurrently." },
  { limit: "Retry attempts",     rule: "retry max_attempts is an integer from 1 to 20." },
  { limit: "Parallel contents",  rule: "human_approval, succeed, and fail are not allowed inside a parallel branch." },
  { limit: "save_as name",       rule: "save_as must not be \"inputs\" or \"vars\" (those namespaces are reserved)." },
]

export interface WorkflowRunField {
  field: string
  type: string
  description: string
}

/* The fields on the workflow.run object. */
export const WORKFLOW_RUN_FIELDS: WorkflowRunField[] = [
  { field: "id",                  type: "string", description: "Unique workflow-run id, prefixed wfr_." },
  { field: "object",             type: "string", description: "Always \"workflow.run\"." },
  { field: "status",             type: "string", description: "queued, running, awaiting_human, succeeded, failed, cancelled, or timed_out." },
  { field: "workflow_id",        type: "string", description: "The workflow this run belongs to (null for inline runs)." },
  { field: "workflow_version",   type: "int",    description: "The version of the workflow definition that ran." },
  { field: "machine_id",         type: "string", description: "Default machine for task steps that omit machine_id." },
  { field: "inputs",             type: "object", description: "The inputs you passed in, available as {{inputs.*}}." },
  { field: "output",             type: "object", description: "The output produced by a succeed step (nullable)." },
  { field: "error",              type: "object", description: "{ code, message } when the run failed (nullable)." },
  { field: "awaiting_human_reason", type: "string", description: "Why the run paused (nullable)." },
  { field: "awaiting_step_id",   type: "string", description: "The step id awaiting human approval (nullable)." },
  { field: "iterations_used",    type: "int",    description: "Loop iterations consumed against max_iterations." },
  { field: "spent_cents",        type: "int",    description: "Total spend so far, in USD cents." },
  { field: "budget_cents",       type: "int",    description: "Spend cap, in USD cents (0 means unlimited)." },
  { field: "created_at",         type: "string", description: "ISO-8601 creation timestamp." },
  { field: "started_at",         type: "string", description: "When execution began (nullable)." },
  { field: "finished_at",        type: "string", description: "When the run reached a terminal state (nullable)." },
  { field: "request_id",         type: "string", description: "Id of the create request, for support and tracing." },
]

/* ─── Verified code samples (cURL / Python / Node) ─── */

export type LangId = "curl" | "python" | "node" | "go" | "ruby" | "php"

export const LANGS: { id: LangId; label: string }[] = [
  { id: "curl",   label: "cURL" },
  { id: "python", label: "Python" },
  { id: "node",   label: "Node" },
  { id: "go",     label: "Go" },
  { id: "ruby",   label: "Ruby" },
  { id: "php",    label: "PHP" },
]

export type CodeSample = Record<LangId, string>

export const CODE_SAMPLES: Record<string, CodeSample> = {
  predict: {
    curl: `# screen.png is a screenshot of the screen you want to control
SCREENSHOT=$(base64 < screen.png | tr -d '\\n')

curl -s https://coasty.ai/v1/predict \\
  -H "X-API-Key: $COASTY_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d @- <<EOF
{
  "screenshot": "$SCREENSHOT",
  "instruction": "Click the login button",
  "screen_width": 1920,
  "screen_height": 1080
}
EOF`,
    python: `import base64, os, requests

API_KEY = os.environ["COASTY_API_KEY"]

with open("screen.png", "rb") as f:
    screenshot = base64.b64encode(f.read()).decode()

res = requests.post(
    "https://coasty.ai/v1/predict",
    headers={"X-API-Key": API_KEY},
    json={
        "screenshot": screenshot,
        "instruction": "Click the login button",
        "screen_width": 1920,
        "screen_height": 1080,
    },
    timeout=60,
)
res.raise_for_status()
data = res.json()

print(data["status"])              # "continue" | "done" | "fail"
for action in data["actions"]:
    print(action["action_type"], action["params"])`,
    node: `import { readFileSync } from "node:fs";

const API_KEY = process.env.COASTY_API_KEY;
const screenshot = readFileSync("screen.png").toString("base64");

const res = await fetch("https://coasty.ai/v1/predict", {
  method: "POST",
  headers: {
    "X-API-Key": API_KEY,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    screenshot,
    instruction: "Click the login button",
    screen_width: 1920,
    screen_height: 1080,
  }),
});
if (!res.ok) throw new Error(\`Coasty error \${res.status}\`);

const { status, actions } = await res.json();
console.log(status);               // "continue" | "done" | "fail"
for (const action of actions) {
  console.log(action.action_type, action.params);
}`,
    go: `package main

import (
  "bytes"
  "encoding/base64"
  "encoding/json"
  "fmt"
  "net/http"
  "os"
)

func main() {
  raw, _ := os.ReadFile("screen.png")
  screenshot := base64.StdEncoding.EncodeToString(raw)

  body, _ := json.Marshal(map[string]any{
    "screenshot":    screenshot,
    "instruction":   "Click the login button",
    "screen_width":  1920,
    "screen_height": 1080,
  })

  req, _ := http.NewRequest("POST", "https://coasty.ai/v1/predict", bytes.NewReader(body))
  req.Header.Set("X-API-Key", os.Getenv("COASTY_API_KEY"))
  req.Header.Set("Content-Type", "application/json")

  res, _ := http.DefaultClient.Do(req)
  defer res.Body.Close()

  var data map[string]any
  json.NewDecoder(res.Body).Decode(&data)

  fmt.Println(data["status"])            // "continue" | "done" | "fail"
  for _, a := range data["actions"].([]any) {
    action := a.(map[string]any)
    fmt.Println(action["action_type"], action["params"])
  }
}`,
    ruby: `require "base64"
require "json"
require "net/http"

api_key = ENV.fetch("COASTY_API_KEY")
screenshot = Base64.strict_encode64(File.read("screen.png"))

uri = URI("https://coasty.ai/v1/predict")
req = Net::HTTP::Post.new(uri)
req["X-API-Key"] = api_key
req["Content-Type"] = "application/json"
req.body = {
  screenshot: screenshot,
  instruction: "Click the login button",
  screen_width: 1920,
  screen_height: 1080
}.to_json

res = Net::HTTP.start(uri.hostname, uri.port, use_ssl: true) { |http| http.request(req) }
data = JSON.parse(res.body)

puts data["status"]                  # "continue" | "done" | "fail"
data["actions"].each do |action|
  puts "#{action['action_type']} #{action['params']}"
end`,
    php: `<?php
$apiKey = getenv("COASTY_API_KEY");
$screenshot = base64_encode(file_get_contents("screen.png"));

$ch = curl_init("https://coasty.ai/v1/predict");
curl_setopt_array($ch, [
  CURLOPT_RETURNTRANSFER => true,
  CURLOPT_POST           => true,
  CURLOPT_HTTPHEADER     => [
    "X-API-Key: $apiKey",
    "Content-Type: application/json",
  ],
  CURLOPT_POSTFIELDS => json_encode([
    "screenshot"    => $screenshot,
    "instruction"   => "Click the login button",
    "screen_width"  => 1920,
    "screen_height" => 1080,
  ]),
]);

$data = json_decode(curl_exec($ch), true);
curl_close($ch);

echo $data["status"] . "\\n";          // "continue" | "done" | "fail"
foreach ($data["actions"] as $action) {
  echo $action["action_type"] . " " . json_encode($action["params"]) . "\\n";
}`,
  },

  sessions: {
    curl: `BASE=https://coasty.ai/v1
AUTH="X-API-Key: $COASTY_API_KEY"

# 1. Create a session and capture its id
SESSION_ID=$(curl -s "$BASE/sessions" -H "$AUTH" \\
  -H "Content-Type: application/json" \\
  -d '{"screen_width":1920,"screen_height":1080}' \\
  | python -c "import sys,json;print(json.load(sys.stdin)['session_id'])")

# 2. Predict a step inside the session (repeat until status != "continue")
curl -s "$BASE/sessions/$SESSION_ID/predict" -H "$AUTH" \\
  -H "Content-Type: application/json" \\
  -d "{\\"screenshot\\":\\"$(base64 < screen.png | tr -d '\\n')\\",\\"instruction\\":\\"Book a meeting\\"}"

# 3. Release the session when the task is finished
curl -s -X DELETE "$BASE/sessions/$SESSION_ID" -H "$AUTH"`,
    python: `import base64, os, requests

BASE = "https://coasty.ai/v1"
HEADERS = {"X-API-Key": os.environ["COASTY_API_KEY"]}

def screenshot() -> str:
    with open("screen.png", "rb") as f:
        return base64.b64encode(f.read()).decode()

# 1. Open a session — it remembers the trajectory across steps
session = requests.post(f"{BASE}/sessions", headers=HEADERS, json={
    "screen_width": 1920,
    "screen_height": 1080,
}, timeout=60).json()
session_id = session["session_id"]

# 2. Drive the task one step at a time
try:
    for _ in range(20):  # safety cap
        res = requests.post(
            f"{BASE}/sessions/{session_id}/predict",
            headers=HEADERS,
            json={
                "screenshot": screenshot(),
                "instruction": "Book a meeting tomorrow at 3pm",
            },
            timeout=60,
        ).json()

        for action in res["actions"]:
            perform(action)          # your action executor

        if res["status"] != "continue":
            break
finally:
    # 3. Always release the session to free your concurrency quota
    requests.delete(f"{BASE}/sessions/{session_id}", headers=HEADERS, timeout=30)`,
    node: `const BASE = "https://coasty.ai/v1";
const HEADERS = {
  "X-API-Key": process.env.COASTY_API_KEY,
  "Content-Type": "application/json",
};

// 1. Open a session
const session = await fetch(\`\${BASE}/sessions\`, {
  method: "POST",
  headers: HEADERS,
  body: JSON.stringify({ screen_width: 1920, screen_height: 1080 }),
}).then((r) => r.json());

const sessionId = session.session_id;

// 2. Step through the task
try {
  for (let i = 0; i < 20; i++) {
    const res = await fetch(\`\${BASE}/sessions/\${sessionId}/predict\`, {
      method: "POST",
      headers: HEADERS,
      body: JSON.stringify({
        screenshot: await capture(),   // your base64 screenshot
        instruction: "Book a meeting tomorrow at 3pm",
      }),
    }).then((r) => r.json());

    for (const action of res.actions) await perform(action);
    if (res.status !== "continue") break;
  }
} finally {
  // 3. Release the session
  await fetch(\`\${BASE}/sessions/\${sessionId}\`, { method: "DELETE", headers: HEADERS });
}`,
    go: `package main

import (
  "bytes"
  "encoding/json"
  "fmt"
  "net/http"
  "os"
)

const base = "https://coasty.ai/v1"

func call(method, url string, payload any) map[string]any {
  var reader *bytes.Reader
  if payload != nil {
    b, _ := json.Marshal(payload)
    reader = bytes.NewReader(b)
  } else {
    reader = bytes.NewReader(nil)
  }
  req, _ := http.NewRequest(method, url, reader)
  req.Header.Set("X-API-Key", os.Getenv("COASTY_API_KEY"))
  req.Header.Set("Content-Type", "application/json")
  res, _ := http.DefaultClient.Do(req)
  defer res.Body.Close()
  var out map[string]any
  json.NewDecoder(res.Body).Decode(&out)
  return out
}

func main() {
  // 1. Create a session
  session := call("POST", base+"/sessions", map[string]any{
    "screen_width": 1920, "screen_height": 1080,
  })
  id := session["session_id"].(string)

  // 2. Step through the task
  for i := 0; i < 20; i++ {
    res := call("POST", fmt.Sprintf("%s/sessions/%s/predict", base, id), map[string]any{
      "screenshot":  capture(), // your base64 screenshot
      "instruction": "Book a meeting tomorrow at 3pm",
    })
    for _, a := range res["actions"].([]any) {
      perform(a) // your executor
    }
    if res["status"] != "continue" {
      break
    }
  }

  // 3. Release the session
  call("DELETE", base+"/sessions/"+id, nil)
}`,
    ruby: `require "base64"
require "json"
require "net/http"

BASE = "https://coasty.ai/v1"
API_KEY = ENV.fetch("COASTY_API_KEY")

def call(method, path, payload = nil)
  uri = URI("#{BASE}#{path}")
  klass = method == "DELETE" ? Net::HTTP::Delete : Net::HTTP::Post
  req = klass.new(uri)
  req["X-API-Key"] = API_KEY
  req["Content-Type"] = "application/json"
  req.body = payload.to_json if payload
  res = Net::HTTP.start(uri.hostname, uri.port, use_ssl: true) { |h| h.request(req) }
  JSON.parse(res.body)
end

def screenshot
  Base64.strict_encode64(File.read("screen.png"))
end

# 1. Create a session
session = call("POST", "/sessions", { screen_width: 1920, screen_height: 1080 })
sid = session["session_id"]

begin
  # 2. Step through the task
  20.times do
    res = call("POST", "/sessions/#{sid}/predict", {
      screenshot: screenshot,
      instruction: "Book a meeting tomorrow at 3pm"
    })
    res["actions"].each { |action| perform(action) } # your executor
    break unless res["status"] == "continue"
  end
ensure
  # 3. Release the session
  call("DELETE", "/sessions/#{sid}")
end`,
    php: `<?php
$base = "https://coasty.ai/v1";
$apiKey = getenv("COASTY_API_KEY");

function call($method, $url, $payload = null) {
  global $apiKey;
  $ch = curl_init($url);
  curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_CUSTOMREQUEST  => $method,
    CURLOPT_HTTPHEADER     => [
      "X-API-Key: $apiKey",
      "Content-Type: application/json",
    ],
  ]);
  if ($payload !== null) {
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload));
  }
  $out = json_decode(curl_exec($ch), true);
  curl_close($ch);
  return $out;
}

function screenshot() {
  return base64_encode(file_get_contents("screen.png"));
}

// 1. Create a session
$session = call("POST", "$base/sessions", ["screen_width" => 1920, "screen_height" => 1080]);
$sid = $session["session_id"];

try {
  // 2. Step through the task
  for ($i = 0; $i < 20; $i++) {
    $res = call("POST", "$base/sessions/$sid/predict", [
      "screenshot"  => screenshot(),
      "instruction" => "Book a meeting tomorrow at 3pm",
    ]);
    foreach ($res["actions"] as $action) {
      perform($action); // your executor
    }
    if ($res["status"] !== "continue") break;
  }
} finally {
  // 3. Release the session
  call("DELETE", "$base/sessions/$sid");
}`,
  },

  grounding: {
    curl: `curl -s https://coasty.ai/v1/ground \\
  -H "X-API-Key: $COASTY_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d "{\\"screenshot\\":\\"$SCREENSHOT\\",\\"element\\":\\"the blue Submit button\\"}"`,
    python: `import os, requests

res = requests.post(
    "https://coasty.ai/v1/ground",
    headers={"X-API-Key": os.environ["COASTY_API_KEY"]},
    json={
        "screenshot": screenshot,   # base64 PNG (see Quickstart)
        "element": "the blue Submit button below the form",
    },
    timeout=60,
).json()

print(res["x"], res["y"])           # exact click coordinates`,
    node: `const res = await fetch("https://coasty.ai/v1/ground", {
  method: "POST",
  headers: {
    "X-API-Key": process.env.COASTY_API_KEY,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    screenshot,                      // base64 PNG (see Quickstart)
    element: "the blue Submit button below the form",
  }),
}).then((r) => r.json());

console.log(res.x, res.y);`,
    go: `body, _ := json.Marshal(map[string]any{
  "screenshot": screenshot, // base64 PNG (see Quickstart)
  "element":    "the blue Submit button below the form",
})

req, _ := http.NewRequest("POST", "https://coasty.ai/v1/ground", bytes.NewReader(body))
req.Header.Set("X-API-Key", os.Getenv("COASTY_API_KEY"))
req.Header.Set("Content-Type", "application/json")

res, _ := http.DefaultClient.Do(req)
defer res.Body.Close()

var data map[string]any
json.NewDecoder(res.Body).Decode(&data)
fmt.Println(data["x"], data["y"])`,
    ruby: `require "json"
require "net/http"

uri = URI("https://coasty.ai/v1/ground")
req = Net::HTTP::Post.new(uri)
req["X-API-Key"] = ENV.fetch("COASTY_API_KEY")
req["Content-Type"] = "application/json"
req.body = {
  screenshot: screenshot, # base64 PNG (see Quickstart)
  element: "the blue Submit button below the form"
}.to_json

res = Net::HTTP.start(uri.hostname, uri.port, use_ssl: true) { |h| h.request(req) }
data = JSON.parse(res.body)
puts "#{data['x']} #{data['y']}"`,
    php: `<?php
$ch = curl_init("https://coasty.ai/v1/ground");
curl_setopt_array($ch, [
  CURLOPT_RETURNTRANSFER => true,
  CURLOPT_POST           => true,
  CURLOPT_HTTPHEADER     => [
    "X-API-Key: " . getenv("COASTY_API_KEY"),
    "Content-Type: application/json",
  ],
  CURLOPT_POSTFIELDS => json_encode([
    "screenshot" => $screenshot, // base64 PNG (see Quickstart)
    "element"    => "the blue Submit button below the form",
  ]),
]);

$data = json_decode(curl_exec($ch), true);
curl_close($ch);
echo $data["x"] . ", " . $data["y"] . "\\n";`,
  },

  parse: {
    curl: `curl -s https://coasty.ai/v1/parse \\
  -H "X-API-Key: $COASTY_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"code": "pyautogui.click(100, 200)"}'`,
    python: `import os, requests

res = requests.post(
    "https://coasty.ai/v1/parse",
    headers={"X-API-Key": os.environ["COASTY_API_KEY"]},
    json={"code": "pyautogui.click(100, 200)\\npyautogui.typewrite('hello')"},
    timeout=30,
).json()

for action in res["actions"]:
    print(action["action_type"], action["params"])`,
    node: `const res = await fetch("https://coasty.ai/v1/parse", {
  method: "POST",
  headers: {
    "X-API-Key": process.env.COASTY_API_KEY,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    code: "pyautogui.click(100, 200)\\npyautogui.typewrite('hello')",
  }),
}).then((r) => r.json());

console.log(res.actions);`,
    go: `body, _ := json.Marshal(map[string]any{
  "code": "pyautogui.click(100, 200)",
})

req, _ := http.NewRequest("POST", "https://coasty.ai/v1/parse", bytes.NewReader(body))
req.Header.Set("X-API-Key", os.Getenv("COASTY_API_KEY"))
req.Header.Set("Content-Type", "application/json")

res, _ := http.DefaultClient.Do(req)
defer res.Body.Close()

var data map[string]any
json.NewDecoder(res.Body).Decode(&data)
fmt.Println(data["actions"])`,
    ruby: `require "json"
require "net/http"

uri = URI("https://coasty.ai/v1/parse")
req = Net::HTTP::Post.new(uri)
req["X-API-Key"] = ENV.fetch("COASTY_API_KEY")
req["Content-Type"] = "application/json"
req.body = { code: "pyautogui.click(100, 200)" }.to_json

res = Net::HTTP.start(uri.hostname, uri.port, use_ssl: true) { |h| h.request(req) }
JSON.parse(res.body)["actions"].each { |a| puts "#{a['action_type']} #{a['params']}" }`,
    php: `<?php
$ch = curl_init("https://coasty.ai/v1/parse");
curl_setopt_array($ch, [
  CURLOPT_RETURNTRANSFER => true,
  CURLOPT_POST           => true,
  CURLOPT_HTTPHEADER     => [
    "X-API-Key: " . getenv("COASTY_API_KEY"),
    "Content-Type: application/json",
  ],
  CURLOPT_POSTFIELDS => json_encode(["code" => "pyautogui.click(100, 200)"]),
]);

$actions = json_decode(curl_exec($ch), true)["actions"];
curl_close($ch);
print_r($actions);`,
  },

  runs: {
    curl: `BASE=https://coasty.ai/v1
AUTH="X-API-Key: $COASTY_API_KEY"

# 1. Start a run. It returns status "queued" and a one-time webhook_secret.
RUN_ID=$(curl -s "$BASE/runs" -H "$AUTH" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: order-4821" \\
  -d '{
    "machine_id": "m_9f2c",
    "task": "Open the billing page and download the latest invoice as PDF",
    "cua_version": "v3",
    "max_steps": 40,
    "on_awaiting_human": "pause"
  }' | python -c "import sys,json;print(json.load(sys.stdin)['id'])")

# 2. Poll the run until it reaches a terminal state.
while :; do
  RUN=$(curl -s "$BASE/runs/$RUN_ID" -H "$AUTH")
  STATUS=$(echo "$RUN" | python -c "import sys,json;print(json.load(sys.stdin)['status'])")
  echo "status=$STATUS"
  case "$STATUS" in
    succeeded|failed|cancelled|timed_out) break ;;
  esac
  sleep 2
done`,
    python: `import os, time, requests

BASE = "https://coasty.ai/v1"
HEADERS = {"X-API-Key": os.environ["COASTY_API_KEY"]}
TERMINAL = {"succeeded", "failed", "cancelled", "timed_out"}

# 1. Start a run. Idempotency-Key makes a retried create safe.
run = requests.post(
    f"{BASE}/runs",
    headers={**HEADERS, "Idempotency-Key": "order-4821"},
    json={
        "machine_id": "m_9f2c",
        "task": "Open the billing page and download the latest invoice as PDF",
        "cua_version": "v3",         # "v4" needs professional tier or above
        "max_steps": 40,
        "on_awaiting_human": "pause",
    },
    timeout=30,
).json()
run_id = run["id"]
print(run["status"])                 # "queued"
webhook_secret = run.get("webhook_secret")   # shown once; store it now

# 2. Poll until terminal.
while True:
    run = requests.get(f"{BASE}/runs/{run_id}", headers=HEADERS, timeout=30).json()
    print(run["status"], run["steps_completed"], "steps")
    if run["status"] in TERMINAL:
        break
    time.sleep(2)

print(run["result"])                 # {"passed": ..., "status": ..., "summary": ...}`,
    node: `const BASE = "https://coasty.ai/v1";
const HEADERS = {
  "X-API-Key": process.env.COASTY_API_KEY,
  "Content-Type": "application/json",
};
const TERMINAL = new Set(["succeeded", "failed", "cancelled", "timed_out"]);

// 1. Start a run.
const created = await fetch(\`\${BASE}/runs\`, {
  method: "POST",
  headers: { ...HEADERS, "Idempotency-Key": "order-4821" },
  body: JSON.stringify({
    machine_id: "m_9f2c",
    task: "Open the billing page and download the latest invoice as PDF",
    cua_version: "v3",               // "v4" needs professional tier or above
    max_steps: 40,
    on_awaiting_human: "pause",
  }),
}).then((r) => r.json());

const runId = created.id;
const webhookSecret = created.webhook_secret;  // shown once; store it now
console.log(created.status);          // "queued"

// 2. Poll until terminal.
let run = created;
while (!TERMINAL.has(run.status)) {
  await new Promise((r) => setTimeout(r, 2000));
  run = await fetch(\`\${BASE}/runs/\${runId}\`, { headers: HEADERS }).then((r) => r.json());
  console.log(run.status, run.steps_completed, "steps");
}
console.log(run.result);`,
    go: `package main

import (
  "bytes"
  "encoding/json"
  "fmt"
  "net/http"
  "os"
  "time"
)

const base = "https://coasty.ai/v1"

func call(method, url string, payload any) map[string]any {
  var reader *bytes.Reader
  if payload != nil {
    b, _ := json.Marshal(payload)
    reader = bytes.NewReader(b)
  } else {
    reader = bytes.NewReader(nil)
  }
  req, _ := http.NewRequest(method, url, reader)
  req.Header.Set("X-API-Key", os.Getenv("COASTY_API_KEY"))
  req.Header.Set("Content-Type", "application/json")
  res, _ := http.DefaultClient.Do(req)
  defer res.Body.Close()
  var out map[string]any
  json.NewDecoder(res.Body).Decode(&out)
  return out
}

func main() {
  terminal := map[string]bool{"succeeded": true, "failed": true, "cancelled": true, "timed_out": true}

  // 1. Start a run.
  run := call("POST", base+"/runs", map[string]any{
    "machine_id":        "m_9f2c",
    "task":              "Open the billing page and download the latest invoice as PDF",
    "cua_version":       "v3",
    "max_steps":         40,
    "on_awaiting_human": "pause",
  })
  id := run["id"].(string)
  fmt.Println(run["status"]) // "queued"

  // 2. Poll until terminal.
  for !terminal[run["status"].(string)] {
    time.Sleep(2 * time.Second)
    run = call("GET", base+"/runs/"+id, nil)
    fmt.Println(run["status"], run["steps_completed"])
  }
  fmt.Println(run["result"])
}`,
    ruby: `require "json"
require "net/http"

BASE = "https://coasty.ai/v1"
API_KEY = ENV.fetch("COASTY_API_KEY")
TERMINAL = %w[succeeded failed cancelled timed_out]

def call(method, path, payload = nil, extra = {})
  uri = URI("#{BASE}#{path}")
  klass = method == "GET" ? Net::HTTP::Get : Net::HTTP::Post
  req = klass.new(uri)
  req["X-API-Key"] = API_KEY
  req["Content-Type"] = "application/json"
  extra.each { |k, v| req[k] = v }
  req.body = payload.to_json if payload
  res = Net::HTTP.start(uri.hostname, uri.port, use_ssl: true) { |h| h.request(req) }
  JSON.parse(res.body)
end

# 1. Start a run.
run = call("POST", "/runs", {
  machine_id: "m_9f2c",
  task: "Open the billing page and download the latest invoice as PDF",
  cua_version: "v3",
  max_steps: 40,
  on_awaiting_human: "pause"
}, { "Idempotency-Key" => "order-4821" })
run_id = run["id"]
puts run["status"] # "queued"

# 2. Poll until terminal.
until TERMINAL.include?(run["status"])
  sleep 2
  run = call("GET", "/runs/#{run_id}")
  puts "#{run['status']} #{run['steps_completed']}"
end
puts run["result"]`,
    php: `<?php
$base = "https://coasty.ai/v1";
$apiKey = getenv("COASTY_API_KEY");
$terminal = ["succeeded", "failed", "cancelled", "timed_out"];

function call($method, $url, $payload = null, $extra = []) {
  global $apiKey;
  $headers = array_merge([
    "X-API-Key: $apiKey",
    "Content-Type: application/json",
  ], $extra);
  $ch = curl_init($url);
  curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_CUSTOMREQUEST  => $method,
    CURLOPT_HTTPHEADER     => $headers,
  ]);
  if ($payload !== null) {
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload));
  }
  $out = json_decode(curl_exec($ch), true);
  curl_close($ch);
  return $out;
}

// 1. Start a run.
$run = call("POST", "$base/runs", [
  "machine_id"        => "m_9f2c",
  "task"              => "Open the billing page and download the latest invoice as PDF",
  "cua_version"       => "v3",
  "max_steps"         => 40,
  "on_awaiting_human" => "pause",
], ["Idempotency-Key: order-4821"]);
$runId = $run["id"];
echo $run["status"] . "\\n"; // "queued"

// 2. Poll until terminal.
while (!in_array($run["status"], $terminal, true)) {
  sleep(2);
  $run = call("GET", "$base/runs/$runId");
  echo $run["status"] . " " . $run["steps_completed"] . "\\n";
}
print_r($run["result"]);`,
  },

  runEvents: {
    curl: `# -N disables buffering so events arrive as they happen.
# Pass Last-Event-ID (the last seq you saw) to replay after a drop.
curl -N "https://coasty.ai/v1/runs/$RUN_ID/events" \\
  -H "X-API-Key: $COASTY_API_KEY" \\
  -H "Last-Event-ID: 42"`,
    python: `import os, httpx

BASE = "https://coasty.ai/v1"
HEADERS = {"X-API-Key": os.environ["COASTY_API_KEY"]}
run_id = "run_7a1b"
last_seq = 0  # persist this so a reconnect can replay

# httpx streams the SSE body line by line. Reconnect with Last-Event-ID.
with httpx.stream(
    "GET",
    f"{BASE}/runs/{run_id}/events",
    headers={**HEADERS, "Last-Event-ID": str(last_seq)},
    timeout=None,
) as resp:
    event_type = "message"
    for line in resp.iter_lines():
        if line.startswith("id:"):
            last_seq = int(line[3:].strip())
        elif line.startswith("event:"):
            event_type = line[6:].strip()
        elif line.startswith("data:"):
            data = line[5:].strip()
            print(event_type, data)
            if event_type == "done":
                break`,
    node: `const BASE = "https://coasty.ai/v1";
const runId = "run_7a1b";
let lastSeq = 0; // persist this so a reconnect can replay

// fetch streaming keeps the request body parser simple and dependency-free.
const res = await fetch(\`\${BASE}/runs/\${runId}/events\`, {
  headers: {
    "X-API-Key": process.env.COASTY_API_KEY,
    "Last-Event-ID": String(lastSeq),
  },
});

const reader = res.body.getReader();
const decoder = new TextDecoder();
let buffer = "";

for (;;) {
  const { value, done } = await reader.read();
  if (done) break;
  buffer += decoder.decode(value, { stream: true });

  const frames = buffer.split("\\n\\n");
  buffer = frames.pop() ?? "";
  for (const frame of frames) {
    let type = "message";
    let data = "";
    for (const line of frame.split("\\n")) {
      if (line.startsWith("id:")) lastSeq = Number(line.slice(3).trim());
      else if (line.startsWith("event:")) type = line.slice(6).trim();
      else if (line.startsWith("data:")) data += line.slice(5).trim();
    }
    console.log(type, data);
    if (type === "done") return;
  }
}`,
    go: `package main

import (
  "bufio"
  "fmt"
  "net/http"
  "os"
  "strconv"
  "strings"
)

func main() {
  base := "https://coasty.ai/v1"
  runID := "run_7a1b"
  lastSeq := 0 // persist so a reconnect can replay

  req, _ := http.NewRequest("GET", base+"/runs/"+runID+"/events", nil)
  req.Header.Set("X-API-Key", os.Getenv("COASTY_API_KEY"))
  req.Header.Set("Last-Event-ID", strconv.Itoa(lastSeq))

  res, _ := http.DefaultClient.Do(req)
  defer res.Body.Close()

  scanner := bufio.NewScanner(res.Body)
  eventType := "message"
  for scanner.Scan() {
    line := scanner.Text()
    switch {
    case strings.HasPrefix(line, "id:"):
      lastSeq, _ = strconv.Atoi(strings.TrimSpace(line[3:]))
    case strings.HasPrefix(line, "event:"):
      eventType = strings.TrimSpace(line[6:])
    case strings.HasPrefix(line, "data:"):
      fmt.Println(eventType, strings.TrimSpace(line[5:]))
      if eventType == "done" {
        return
      }
    }
  }
}`,
    ruby: `require "net/http"

base = "https://coasty.ai/v1"
run_id = "run_7a1b"
last_seq = 0 # persist so a reconnect can replay

uri = URI("#{base}/runs/#{run_id}/events")
req = Net::HTTP::Get.new(uri)
req["X-API-Key"] = ENV.fetch("COASTY_API_KEY")
req["Last-Event-ID"] = last_seq.to_s

Net::HTTP.start(uri.hostname, uri.port, use_ssl: true) do |http|
  http.request(req) do |res|
    event_type = "message"
    res.read_body do |chunk|
      chunk.each_line do |line|
        if line.start_with?("id:")
          last_seq = line[3..].strip.to_i
        elsif line.start_with?("event:")
          event_type = line[6..].strip
        elsif line.start_with?("data:")
          puts "#{event_type} #{line[5..].strip}"
          return if event_type == "done"
        end
      end
    end
  end
end`,
    php: `<?php
$base = "https://coasty.ai/v1";
$runId = "run_7a1b";
$lastSeq = 0; // persist so a reconnect can replay

$ch = curl_init("$base/runs/$runId/events");
curl_setopt_array($ch, [
  CURLOPT_HTTPHEADER => [
    "X-API-Key: " . getenv("COASTY_API_KEY"),
    "Last-Event-ID: $lastSeq",
  ],
  // The write callback fires as each chunk of the SSE stream arrives.
  CURLOPT_WRITEFUNCTION => function ($ch, $chunk) {
    foreach (explode("\\n", $chunk) as $line) {
      if (str_starts_with($line, "data:")) {
        echo trim(substr($line, 5)) . "\\n";
      }
    }
    return strlen($chunk);
  },
]);
curl_exec($ch);
curl_close($ch);`,
  },

  runResume: {
    curl: `BASE=https://coasty.ai/v1
AUTH="X-API-Key: $COASTY_API_KEY"

# Detect the pause.
STATUS=$(curl -s "$BASE/runs/$RUN_ID" -H "$AUTH" \\
  | python -c "import sys,json;print(json.load(sys.stdin)['status'])")

# When awaiting_human, a person completes the blocking step, then you resume.
if [ "$STATUS" = "awaiting_human" ]; then
  curl -s -X POST "$BASE/runs/$RUN_ID/resume" -H "$AUTH" \\
    -H "Content-Type: application/json" \\
    -d '{"note": "Solved the captcha; continue"}'
fi`,
    python: `import os, requests

BASE = "https://coasty.ai/v1"
HEADERS = {"X-API-Key": os.environ["COASTY_API_KEY"]}
run_id = "run_7a1b"

run = requests.get(f"{BASE}/runs/{run_id}", headers=HEADERS, timeout=30).json()

# resume is only valid while status == "awaiting_human".
if run["status"] == "awaiting_human":
    print("paused:", run["awaiting_human_reason"])
    # ... a human completes the blocking step out of band ...
    resumed = requests.post(
        f"{BASE}/runs/{run_id}/resume",
        headers=HEADERS,
        json={"note": "Solved the captcha; continue"},
        timeout=30,
    ).json()
    print(resumed["status"])         # back to "running"`,
    node: `const BASE = "https://coasty.ai/v1";
const HEADERS = {
  "X-API-Key": process.env.COASTY_API_KEY,
  "Content-Type": "application/json",
};
const runId = "run_7a1b";

const run = await fetch(\`\${BASE}/runs/\${runId}\`, { headers: HEADERS }).then((r) => r.json());

// resume is only valid while status === "awaiting_human".
if (run.status === "awaiting_human") {
  console.log("paused:", run.awaiting_human_reason);
  // ... a human completes the blocking step out of band ...
  const resumed = await fetch(\`\${BASE}/runs/\${runId}/resume\`, {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify({ note: "Solved the captcha; continue" }),
  }).then((r) => r.json());
  console.log(resumed.status);       // back to "running"
}`,
    go: `package main

import (
  "bytes"
  "encoding/json"
  "fmt"
  "net/http"
  "os"
)

func main() {
  base := "https://coasty.ai/v1"
  runID := "run_7a1b"
  key := os.Getenv("COASTY_API_KEY")

  // Read the run.
  getReq, _ := http.NewRequest("GET", base+"/runs/"+runID, nil)
  getReq.Header.Set("X-API-Key", key)
  getRes, _ := http.DefaultClient.Do(getReq)
  var run map[string]any
  json.NewDecoder(getRes.Body).Decode(&run)
  getRes.Body.Close()

  // resume is only valid while status == "awaiting_human".
  if run["status"] == "awaiting_human" {
    body, _ := json.Marshal(map[string]any{"note": "Solved the captcha; continue"})
    req, _ := http.NewRequest("POST", base+"/runs/"+runID+"/resume", bytes.NewReader(body))
    req.Header.Set("X-API-Key", key)
    req.Header.Set("Content-Type", "application/json")
    res, _ := http.DefaultClient.Do(req)
    defer res.Body.Close()
    var resumed map[string]any
    json.NewDecoder(res.Body).Decode(&resumed)
    fmt.Println(resumed["status"]) // back to "running"
  }
}`,
    ruby: `require "json"
require "net/http"

base = "https://coasty.ai/v1"
api_key = ENV.fetch("COASTY_API_KEY")
run_id = "run_7a1b"

get_uri = URI("#{base}/runs/#{run_id}")
get_req = Net::HTTP::Get.new(get_uri)
get_req["X-API-Key"] = api_key
run = JSON.parse(
  Net::HTTP.start(get_uri.hostname, get_uri.port, use_ssl: true) { |h| h.request(get_req) }.body
)

# resume is only valid while status == "awaiting_human".
if run["status"] == "awaiting_human"
  puts "paused: #{run['awaiting_human_reason']}"
  uri = URI("#{base}/runs/#{run_id}/resume")
  req = Net::HTTP::Post.new(uri)
  req["X-API-Key"] = api_key
  req["Content-Type"] = "application/json"
  req.body = { note: "Solved the captcha; continue" }.to_json
  res = Net::HTTP.start(uri.hostname, uri.port, use_ssl: true) { |h| h.request(req) }
  puts JSON.parse(res.body)["status"] # back to "running"
end`,
    php: `<?php
$base = "https://coasty.ai/v1";
$apiKey = getenv("COASTY_API_KEY");
$runId = "run_7a1b";
$headers = ["X-API-Key: $apiKey", "Content-Type: application/json"];

// Read the run.
$ch = curl_init("$base/runs/$runId");
curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_HTTPHEADER => $headers]);
$run = json_decode(curl_exec($ch), true);
curl_close($ch);

// resume is only valid while status == "awaiting_human".
if ($run["status"] === "awaiting_human") {
  echo "paused: " . $run["awaiting_human_reason"] . "\\n";
  $ch = curl_init("$base/runs/$runId/resume");
  curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_POST           => true,
    CURLOPT_HTTPHEADER     => $headers,
    CURLOPT_POSTFIELDS     => json_encode(["note" => "Solved the captcha; continue"]),
  ]);
  $resumed = json_decode(curl_exec($ch), true);
  curl_close($ch);
  echo $resumed["status"] . "\\n"; // back to "running"
}`,
  },

  webhookVerify: {
    curl: `# Create a run with a webhook. The response includes webhook_secret ONCE.
# Store it; you verify every later callback against it (see Python / Node tabs).
curl -s https://coasty.ai/v1/runs \\
  -H "X-API-Key: $COASTY_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "machine_id": "m_9f2c",
    "task": "Reconcile the invoice against the order",
    "webhook_url": "https://example.com/hooks/coasty"
  }'

# Each callback carries:  Coasty-Signature: t=<unix_ts>,v1=<hex>
# The signed payload is  "<t>." + raw_request_body, keyed by webhook_secret.`,
    python: `import hashlib, hmac, os, requests

BASE = "https://coasty.ai/v1"
HEADERS = {"X-API-Key": os.environ["COASTY_API_KEY"]}

# 1. Create a run with a webhook_url. webhook_secret is returned exactly once.
run = requests.post(
    f"{BASE}/runs",
    headers=HEADERS,
    json={
        "machine_id": "m_9f2c",
        "task": "Reconcile the invoice against the order",
        "webhook_url": "https://example.com/hooks/coasty",
    },
    timeout=30,
).json()
webhook_secret = run["webhook_secret"]   # persist this securely

# 2. In your webhook handler, verify the Coasty-Signature header.
def verify(raw_body: bytes, signature_header: str, secret: str) -> bool:
    parts = dict(p.split("=", 1) for p in signature_header.split(","))
    signed = f"{parts['t']}.".encode() + raw_body
    expected = hmac.new(secret.encode(), signed, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, parts["v1"])

# Example (your framework supplies the raw body + header):
# ok = verify(request.body, request.headers["Coasty-Signature"], webhook_secret)`,
    node: `import { createHmac, timingSafeEqual } from "node:crypto";

const BASE = "https://coasty.ai/v1";
const HEADERS = {
  "X-API-Key": process.env.COASTY_API_KEY,
  "Content-Type": "application/json",
};

// 1. Create a run with a webhook_url. webhook_secret is returned exactly once.
const run = await fetch(\`\${BASE}/runs\`, {
  method: "POST",
  headers: HEADERS,
  body: JSON.stringify({
    machine_id: "m_9f2c",
    task: "Reconcile the invoice against the order",
    webhook_url: "https://example.com/hooks/coasty",
  }),
}).then((r) => r.json());
const webhookSecret = run.webhook_secret; // persist this securely

// 2. In your webhook handler, verify the Coasty-Signature header.
function verify(rawBody, signatureHeader, secret) {
  const parts = Object.fromEntries(
    signatureHeader.split(",").map((p) => p.split("=")),
  );
  const signed = \`\${parts.t}.\` + rawBody; // rawBody is the exact bytes received
  const expected = createHmac("sha256", secret).update(signed).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(parts.v1);
  return a.length === b.length && timingSafeEqual(a, b);
}
// const ok = verify(rawBody, req.headers["coasty-signature"], webhookSecret);`,
    go: `package main

import (
  "bytes"
  "crypto/hmac"
  "crypto/sha256"
  "encoding/hex"
  "encoding/json"
  "net/http"
  "os"
  "strings"
)

const base = "https://coasty.ai/v1"

// verify checks the Coasty-Signature header: t=<unix_ts>,v1=<hex>.
func verify(rawBody []byte, signatureHeader, secret string) bool {
  parts := map[string]string{}
  for _, p := range strings.Split(signatureHeader, ",") {
    kv := strings.SplitN(p, "=", 2)
    if len(kv) == 2 {
      parts[kv[0]] = kv[1]
    }
  }
  mac := hmac.New(sha256.New, []byte(secret))
  mac.Write([]byte(parts["t"] + "."))
  mac.Write(rawBody)
  expected := hex.EncodeToString(mac.Sum(nil))
  return hmac.Equal([]byte(expected), []byte(parts["v1"]))
}

func main() {
  // Create a run with a webhook_url; webhook_secret is returned once.
  body, _ := json.Marshal(map[string]any{
    "machine_id":  "m_9f2c",
    "task":        "Reconcile the invoice against the order",
    "webhook_url": "https://example.com/hooks/coasty",
  })
  req, _ := http.NewRequest("POST", base+"/runs", bytes.NewReader(body))
  req.Header.Set("X-API-Key", os.Getenv("COASTY_API_KEY"))
  req.Header.Set("Content-Type", "application/json")
  res, _ := http.DefaultClient.Do(req)
  defer res.Body.Close()
  var run map[string]any
  json.NewDecoder(res.Body).Decode(&run)
  _ = run["webhook_secret"] // persist this securely, then call verify() per callback
}`,
    ruby: `require "json"
require "net/http"
require "openssl"

base = "https://coasty.ai/v1"
api_key = ENV.fetch("COASTY_API_KEY")

# 1. Create a run with a webhook_url. webhook_secret is returned exactly once.
uri = URI("#{base}/runs")
req = Net::HTTP::Post.new(uri)
req["X-API-Key"] = api_key
req["Content-Type"] = "application/json"
req.body = {
  machine_id: "m_9f2c",
  task: "Reconcile the invoice against the order",
  webhook_url: "https://example.com/hooks/coasty"
}.to_json
run = JSON.parse(
  Net::HTTP.start(uri.hostname, uri.port, use_ssl: true) { |h| h.request(req) }.body
)
webhook_secret = run["webhook_secret"] # persist this securely

# 2. Verify the Coasty-Signature header: t=<unix_ts>,v1=<hex>.
def verify(raw_body, signature_header, secret)
  parts = signature_header.split(",").map { |p| p.split("=", 2) }.to_h
  signed = "#{parts['t']}.#{raw_body}"
  expected = OpenSSL::HMAC.hexdigest("SHA256", secret, signed)
  Rack::Utils.secure_compare(expected, parts["v1"])
end
# ok = verify(request.body.read, request.get_header("HTTP_COASTY_SIGNATURE"), webhook_secret)`,
    php: `<?php
$base = "https://coasty.ai/v1";
$apiKey = getenv("COASTY_API_KEY");

// 1. Create a run with a webhook_url. webhook_secret is returned exactly once.
$ch = curl_init("$base/runs");
curl_setopt_array($ch, [
  CURLOPT_RETURNTRANSFER => true,
  CURLOPT_POST           => true,
  CURLOPT_HTTPHEADER     => [
    "X-API-Key: $apiKey",
    "Content-Type: application/json",
  ],
  CURLOPT_POSTFIELDS => json_encode([
    "machine_id"  => "m_9f2c",
    "task"        => "Reconcile the invoice against the order",
    "webhook_url" => "https://example.com/hooks/coasty",
  ]),
]);
$run = json_decode(curl_exec($ch), true);
curl_close($ch);
$webhookSecret = $run["webhook_secret"]; // persist this securely

// 2. Verify the Coasty-Signature header: t=<unix_ts>,v1=<hex>.
function verify($rawBody, $signatureHeader, $secret) {
  $parts = [];
  foreach (explode(",", $signatureHeader) as $p) {
    [$k, $v] = explode("=", $p, 2);
    $parts[$k] = $v;
  }
  $signed = $parts["t"] . "." . $rawBody;
  $expected = hash_hmac("sha256", $signed, $secret);
  return hash_equals($expected, $parts["v1"]);
}
// $ok = verify($rawBody, $_SERVER["HTTP_COASTY_SIGNATURE"], $webhookSecret);`,
  },

  workflowCreate: {
    curl: `BASE=https://coasty.ai/v1
AUTH="X-API-Key: $COASTY_API_KEY"

# 1. Create a workflow: a task step, an assert, then an if/branch.
#    {{var}} references pull from inputs.*, vars.*, and prior step results.
WF_ID=$(curl -s "$BASE/workflows" -H "$AUTH" \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "Invoice reconciliation",
    "slug": "invoice-reconcile",
    "inputs_schema": {"type": "object", "properties": {"order_id": {"type": "string"}}},
    "definition": {
      "steps": [
        {
          "id": "fetch",
          "type": "task",
          "task": "Open order {{inputs.order_id}} and read the invoice total",
          "save_as": "invoice"
        },
        {
          "id": "check",
          "type": "assert",
          "condition": {"op": "truthy", "value": "{{invoice.passed}}"},
          "message": "Agent failed to read the invoice"
        },
        {
          "id": "branch",
          "type": "if",
          "condition": {"op": "contains", "left": "{{invoice.result}}", "right": "PAID"},
          "then": [{"id": "ok", "type": "succeed", "output": {"state": "paid"}}],
          "else": [{"id": "no", "type": "fail", "message": "Invoice not marked paid"}]
        }
      ]
    }
  }' | python -c "import sys,json;print(json.load(sys.stdin)['id'])")

# 2. Start a run of the saved workflow.
curl -s "$BASE/workflows/$WF_ID/runs" -H "$AUTH" \\
  -H "Content-Type: application/json" \\
  -d '{"inputs": {"order_id": "ord_4821"}, "machine_id": "m_9f2c", "budget_cents": 500}'`,
    python: `import os, requests

BASE = "https://coasty.ai/v1"
HEADERS = {"X-API-Key": os.environ["COASTY_API_KEY"]}

definition = {
    "steps": [
        {
            "id": "fetch",
            "type": "task",
            "task": "Open order {{inputs.order_id}} and read the invoice total",
            "save_as": "invoice",
        },
        {
            "id": "check",
            "type": "assert",
            "condition": {"op": "truthy", "value": "{{invoice.passed}}"},
            "message": "Agent failed to read the invoice",
        },
        {
            "id": "branch",
            "type": "if",
            "condition": {"op": "contains", "left": "{{invoice.result}}", "right": "PAID"},
            "then": [{"id": "ok", "type": "succeed", "output": {"state": "paid"}}],
            "else": [{"id": "no", "type": "fail", "message": "Invoice not marked paid"}],
        },
    ],
}

# 1. Create the workflow. Re-using the same slug bumps its version.
wf = requests.post(
    f"{BASE}/workflows",
    headers=HEADERS,
    json={
        "name": "Invoice reconciliation",
        "slug": "invoice-reconcile",
        "inputs_schema": {"type": "object", "properties": {"order_id": {"type": "string"}}},
        "definition": definition,
    },
    timeout=30,
).json()
print(wf["id"], "v", wf["version"], wf["dsl_version"])

# 2. Start a run of the saved workflow.
run = requests.post(
    f"{BASE}/workflows/{wf['id']}/runs",
    headers=HEADERS,
    json={"inputs": {"order_id": "ord_4821"}, "machine_id": "m_9f2c", "budget_cents": 500},
    timeout=30,
).json()
print(run["id"], run["status"])`,
    node: `const BASE = "https://coasty.ai/v1";
const HEADERS = {
  "X-API-Key": process.env.COASTY_API_KEY,
  "Content-Type": "application/json",
};

const definition = {
  steps: [
    {
      id: "fetch",
      type: "task",
      task: "Open order {{inputs.order_id}} and read the invoice total",
      save_as: "invoice",
    },
    {
      id: "check",
      type: "assert",
      condition: { op: "truthy", value: "{{invoice.passed}}" },
      message: "Agent failed to read the invoice",
    },
    {
      id: "branch",
      type: "if",
      condition: { op: "contains", left: "{{invoice.result}}", right: "PAID" },
      then: [{ id: "ok", type: "succeed", output: { state: "paid" } }],
      else: [{ id: "no", type: "fail", message: "Invoice not marked paid" }],
    },
  ],
};

// 1. Create the workflow. Re-using the same slug bumps its version.
const wf = await fetch(\`\${BASE}/workflows\`, {
  method: "POST",
  headers: HEADERS,
  body: JSON.stringify({
    name: "Invoice reconciliation",
    slug: "invoice-reconcile",
    inputs_schema: { type: "object", properties: { order_id: { type: "string" } } },
    definition,
  }),
}).then((r) => r.json());
console.log(wf.id, "v", wf.version, wf.dsl_version);

// 2. Start a run of the saved workflow.
const run = await fetch(\`\${BASE}/workflows/\${wf.id}/runs\`, {
  method: "POST",
  headers: HEADERS,
  body: JSON.stringify({
    inputs: { order_id: "ord_4821" },
    machine_id: "m_9f2c",
    budget_cents: 500,
  }),
}).then((r) => r.json());
console.log(run.id, run.status);`,
    go: `package main

import (
  "bytes"
  "encoding/json"
  "fmt"
  "net/http"
  "os"
)

const base = "https://coasty.ai/v1"

func post(path string, payload any) map[string]any {
  b, _ := json.Marshal(payload)
  req, _ := http.NewRequest("POST", base+path, bytes.NewReader(b))
  req.Header.Set("X-API-Key", os.Getenv("COASTY_API_KEY"))
  req.Header.Set("Content-Type", "application/json")
  res, _ := http.DefaultClient.Do(req)
  defer res.Body.Close()
  var out map[string]any
  json.NewDecoder(res.Body).Decode(&out)
  return out
}

func main() {
  definition := map[string]any{
    "steps": []any{
      map[string]any{
        "id": "fetch", "type": "task", "save_as": "invoice",
        "task": "Open order {{inputs.order_id}} and read the invoice total",
      },
      map[string]any{
        "id": "check", "type": "assert", "message": "Agent failed to read the invoice",
        "condition": map[string]any{"op": "truthy", "value": "{{invoice.passed}}"},
      },
      map[string]any{
        "id": "branch", "type": "if",
        "condition": map[string]any{"op": "contains", "left": "{{invoice.result}}", "right": "PAID"},
        "then": []any{map[string]any{"id": "ok", "type": "succeed", "output": map[string]any{"state": "paid"}}},
        "else": []any{map[string]any{"id": "no", "type": "fail", "message": "Invoice not marked paid"}},
      },
    },
  }

  // 1. Create the workflow.
  wf := post("/workflows", map[string]any{
    "name": "Invoice reconciliation", "slug": "invoice-reconcile", "definition": definition,
  })
  fmt.Println(wf["id"], wf["version"], wf["dsl_version"])

  // 2. Start a run.
  run := post("/workflows/"+wf["id"].(string)+"/runs", map[string]any{
    "inputs": map[string]any{"order_id": "ord_4821"}, "machine_id": "m_9f2c", "budget_cents": 500,
  })
  fmt.Println(run["id"], run["status"])
}`,
    ruby: `require "json"
require "net/http"

BASE = "https://coasty.ai/v1"
API_KEY = ENV.fetch("COASTY_API_KEY")

def post(path, payload)
  uri = URI("#{BASE}#{path}")
  req = Net::HTTP::Post.new(uri)
  req["X-API-Key"] = API_KEY
  req["Content-Type"] = "application/json"
  req.body = payload.to_json
  res = Net::HTTP.start(uri.hostname, uri.port, use_ssl: true) { |h| h.request(req) }
  JSON.parse(res.body)
end

definition = {
  steps: [
    { id: "fetch", type: "task", save_as: "invoice",
      task: "Open order {{inputs.order_id}} and read the invoice total" },
    { id: "check", type: "assert", message: "Agent failed to read the invoice",
      condition: { op: "truthy", value: "{{invoice.passed}}" } },
    { id: "branch", type: "if",
      condition: { op: "contains", left: "{{invoice.result}}", right: "PAID" },
      then: [{ id: "ok", type: "succeed", output: { state: "paid" } }],
      else: [{ id: "no", type: "fail", message: "Invoice not marked paid" }] }
  ]
}

# 1. Create the workflow.
wf = post("/workflows", {
  name: "Invoice reconciliation", slug: "invoice-reconcile", definition: definition
})
puts "#{wf['id']} v#{wf['version']} #{wf['dsl_version']}"

# 2. Start a run.
run = post("/workflows/#{wf['id']}/runs", {
  inputs: { order_id: "ord_4821" }, machine_id: "m_9f2c", budget_cents: 500
})
puts "#{run['id']} #{run['status']}"`,
    php: `<?php
$base = "https://coasty.ai/v1";
$apiKey = getenv("COASTY_API_KEY");

function post($path, $payload) {
  global $base, $apiKey;
  $ch = curl_init("$base$path");
  curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_POST           => true,
    CURLOPT_HTTPHEADER     => [
      "X-API-Key: $apiKey",
      "Content-Type: application/json",
    ],
    CURLOPT_POSTFIELDS => json_encode($payload),
  ]);
  $out = json_decode(curl_exec($ch), true);
  curl_close($ch);
  return $out;
}

$definition = [
  "steps" => [
    ["id" => "fetch", "type" => "task", "save_as" => "invoice",
     "task" => "Open order {{inputs.order_id}} and read the invoice total"],
    ["id" => "check", "type" => "assert", "message" => "Agent failed to read the invoice",
     "condition" => ["op" => "truthy", "value" => "{{invoice.passed}}"]],
    ["id" => "branch", "type" => "if",
     "condition" => ["op" => "contains", "left" => "{{invoice.result}}", "right" => "PAID"],
     "then" => [["id" => "ok", "type" => "succeed", "output" => ["state" => "paid"]]],
     "else" => [["id" => "no", "type" => "fail", "message" => "Invoice not marked paid"]]],
  ],
];

// 1. Create the workflow.
$wf = post("/workflows", [
  "name" => "Invoice reconciliation", "slug" => "invoice-reconcile", "definition" => $definition,
]);
echo $wf["id"] . " v" . $wf["version"] . " " . $wf["dsl_version"] . "\\n";

// 2. Start a run.
$run = post("/workflows/" . $wf["id"] . "/runs", [
  "inputs" => ["order_id" => "ord_4821"], "machine_id" => "m_9f2c", "budget_cents" => 500,
]);
echo $run["id"] . " " . $run["status"] . "\\n";`,
  },

  workflowAdhoc: {
    curl: `# Run a workflow inline (no save). The body is a workflow-run body PLUS a
# "definition" (and optional "inputs_schema"). Great for one-off automations.
curl -s https://coasty.ai/v1/workflows/runs \\
  -H "X-API-Key: $COASTY_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "machine_id": "m_9f2c",
    "inputs": {"url": "https://status.example.com"},
    "max_iterations": 5,
    "definition": {
      "steps": [
        {"id": "open", "type": "task", "save_as": "page",
         "task": "Open {{inputs.url}} and report whether all systems are operational"},
        {"id": "gate", "type": "assert",
         "condition": {"op": "truthy", "value": "{{page.passed}}"}}
      ]
    }
  }'`,
    python: `import os, requests

BASE = "https://coasty.ai/v1"
HEADERS = {"X-API-Key": os.environ["COASTY_API_KEY"]}

# POST /v1/workflows/runs runs a definition inline, without saving a workflow.
run = requests.post(
    f"{BASE}/workflows/runs",
    headers=HEADERS,
    json={
        "machine_id": "m_9f2c",
        "inputs": {"url": "https://status.example.com"},
        "max_iterations": 5,
        "definition": {
            "steps": [
                {
                    "id": "open",
                    "type": "task",
                    "save_as": "page",
                    "task": "Open {{inputs.url}} and report whether all systems are operational",
                },
                {
                    "id": "gate",
                    "type": "assert",
                    "condition": {"op": "truthy", "value": "{{page.passed}}"},
                },
            ],
        },
    },
    timeout=30,
).json()
print(run["id"], run["status"])      # object == "workflow.run"`,
    node: `const BASE = "https://coasty.ai/v1";

// POST /v1/workflows/runs runs a definition inline, without saving a workflow.
const run = await fetch(\`\${BASE}/workflows/runs\`, {
  method: "POST",
  headers: {
    "X-API-Key": process.env.COASTY_API_KEY,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    machine_id: "m_9f2c",
    inputs: { url: "https://status.example.com" },
    max_iterations: 5,
    definition: {
      steps: [
        {
          id: "open",
          type: "task",
          save_as: "page",
          task: "Open {{inputs.url}} and report whether all systems are operational",
        },
        {
          id: "gate",
          type: "assert",
          condition: { op: "truthy", value: "{{page.passed}}" },
        },
      ],
    },
  }),
}).then((r) => r.json());
console.log(run.id, run.status);      // object === "workflow.run"`,
    go: `package main

import (
  "bytes"
  "encoding/json"
  "fmt"
  "net/http"
  "os"
)

func main() {
  base := "https://coasty.ai/v1"

  // POST /v1/workflows/runs runs a definition inline, without saving.
  body, _ := json.Marshal(map[string]any{
    "machine_id":     "m_9f2c",
    "inputs":         map[string]any{"url": "https://status.example.com"},
    "max_iterations": 5,
    "definition": map[string]any{
      "steps": []any{
        map[string]any{
          "id": "open", "type": "task", "save_as": "page",
          "task": "Open {{inputs.url}} and report whether all systems are operational",
        },
        map[string]any{
          "id": "gate", "type": "assert",
          "condition": map[string]any{"op": "truthy", "value": "{{page.passed}}"},
        },
      },
    },
  })

  req, _ := http.NewRequest("POST", base+"/workflows/runs", bytes.NewReader(body))
  req.Header.Set("X-API-Key", os.Getenv("COASTY_API_KEY"))
  req.Header.Set("Content-Type", "application/json")
  res, _ := http.DefaultClient.Do(req)
  defer res.Body.Close()

  var run map[string]any
  json.NewDecoder(res.Body).Decode(&run)
  fmt.Println(run["id"], run["status"]) // object == "workflow.run"
}`,
    ruby: `require "json"
require "net/http"

base = "https://coasty.ai/v1"

# POST /v1/workflows/runs runs a definition inline, without saving a workflow.
uri = URI("#{base}/workflows/runs")
req = Net::HTTP::Post.new(uri)
req["X-API-Key"] = ENV.fetch("COASTY_API_KEY")
req["Content-Type"] = "application/json"
req.body = {
  machine_id: "m_9f2c",
  inputs: { url: "https://status.example.com" },
  max_iterations: 5,
  definition: {
    steps: [
      { id: "open", type: "task", save_as: "page",
        task: "Open {{inputs.url}} and report whether all systems are operational" },
      { id: "gate", type: "assert",
        condition: { op: "truthy", value: "{{page.passed}}" } }
    ]
  }
}.to_json

res = Net::HTTP.start(uri.hostname, uri.port, use_ssl: true) { |h| h.request(req) }
run = JSON.parse(res.body)
puts "#{run['id']} #{run['status']}" # object == "workflow.run"`,
    php: `<?php
$base = "https://coasty.ai/v1";

// POST /v1/workflows/runs runs a definition inline, without saving a workflow.
$ch = curl_init("$base/workflows/runs");
curl_setopt_array($ch, [
  CURLOPT_RETURNTRANSFER => true,
  CURLOPT_POST           => true,
  CURLOPT_HTTPHEADER     => [
    "X-API-Key: " . getenv("COASTY_API_KEY"),
    "Content-Type: application/json",
  ],
  CURLOPT_POSTFIELDS => json_encode([
    "machine_id"     => "m_9f2c",
    "inputs"         => ["url" => "https://status.example.com"],
    "max_iterations" => 5,
    "definition" => [
      "steps" => [
        ["id" => "open", "type" => "task", "save_as" => "page",
         "task" => "Open {{inputs.url}} and report whether all systems are operational"],
        ["id" => "gate", "type" => "assert",
         "condition" => ["op" => "truthy", "value" => "{{page.passed}}"]],
      ],
    ],
  ]),
]);

$run = json_decode(curl_exec($ch), true);
curl_close($ch);
echo $run["id"] . " " . $run["status"] . "\\n"; // object == "workflow.run"`,
  },
}

/* JSON examples (kept as objects so the test suite can prove they are valid
   and rendered as pretty-printed JSON in the docs). */

export const RESPONSE_EXAMPLE = {
  request_id: "req_8f2c1e9a",
  status: "continue",
  reasoning: "The login form is visible. I'll click the email field, then type the address.",
  actions: [
    { action_type: "click", params: { x: 512, y: 340 }, description: "Click the email field" },
    { action_type: "type_text", params: { text: "you@example.com" }, description: "Type the email address" },
  ],
  raw_code: ["pyautogui.click(512, 340)", "pyautogui.typewrite('you@example.com')"],
  // A base $0.05 predict: credits_charged is the internal unit count (1 unit = $0.01),
  // cost_cents is the same amount in USD cents. The two always agree.
  usage: { input_tokens: 1523, output_tokens: 245, credits_charged: 5, cost_cents: 5 },
}

/* The standard error envelope. Every error carries error.code (stable),
   error.message (human-readable), error.request_id (also echoed in the
   X-Coasty-Request-Id header), plus error.suggestion and error.docs_url
   for self-service. INSUFFICIENT_CREDITS additionally reports required +
   balance so you can show the shortfall. A Link: <url>; rel="help" header
   mirrors docs_url. */
export const ERROR_EXAMPLE = {
  error: {
    code: "INSUFFICIENT_CREDITS",
    message: "Your API wallet does not have enough funds to complete this request.",
    type: "payment_required",
    suggestion: "Add funds in the dashboard, or use an sk-coasty-test- key while building (test keys never bill).",
    docs_url: "https://coasty.ai/developers/docs#errors",
    // Units are USD cents: a $0.05 predict was attempted with $0.02 left.
    required: 5,
    balance: 2,
    request_id: "req_8f2c1e9a",
  },
}

/* A freshly created agent.run, as returned by POST /v1/runs. */
export const RUN_EXAMPLE = {
  id: "run_7a1b2c3d",
  object: "agent.run",
  status: "queued",
  machine_id: "m_9f2c",
  task: "Open the billing page and download the latest invoice as PDF",
  cua_version: "v3",
  instructions: null,
  max_steps: 40,
  on_awaiting_human: "pause",
  steps_completed: 0,
  credits_charged: 0,
  cost_cents: 0,
  result: null,
  error: null,
  awaiting_human_reason: null,
  metadata: { team: "finance" },
  webhook_url: "https://example.com/hooks/coasty",
  created_at: "2026-06-01T12:00:00Z",
  started_at: null,
  awaiting_human_since: null,
  finished_at: null,
  request_id: "req_4f9a2b1c",
  // Returned only once, at create time. Store it to verify webhook signatures.
  webhook_secret: "whsec_one_time_value_shown_here",
}

/* A real workflow DSL (dsl_version 2026-06-01): task -> assert -> if/branch.
   Conditions are structured and injection-safe; {{path}} refs read inputs,
   vars, and prior step results. */
export const WORKFLOW_DSL_EXAMPLE = {
  dsl_version: "2026-06-01",
  definition: {
    steps: [
      {
        id: "fetch",
        type: "task",
        task: "Open order {{inputs.order_id}} and read the invoice total",
        save_as: "invoice",
      },
      {
        id: "check",
        type: "assert",
        condition: { op: "truthy", value: "{{invoice.passed}}" },
        message: "Agent failed to read the invoice",
      },
      {
        id: "branch",
        type: "if",
        condition: { op: "contains", left: "{{invoice.result}}", right: "PAID" },
        then: [{ id: "ok", type: "succeed", output: { state: "paid" } }],
        else: [{ id: "no", type: "fail", message: "Invoice not marked paid" }],
      },
    ],
    output: { paid: "{{invoice.result}}" },
  },
}

/* A workflow.run as returned by POST /v1/workflows/{id}/runs. */
export const WORKFLOW_RUN_EXAMPLE = {
  id: "wfr_5e6f7a8b",
  object: "workflow.run",
  status: "running",
  workflow_id: "wf_1a2b3c",
  workflow_version: 3,
  machine_id: "m_9f2c",
  inputs: { order_id: "ord_4821" },
  output: null,
  error: null,
  awaiting_human_reason: null,
  awaiting_step_id: null,
  iterations_used: 0,
  spent_cents: 0,
  budget_cents: 500,
  created_at: "2026-06-01T12:00:00Z",
  started_at: "2026-06-01T12:00:01Z",
  finished_at: null,
  request_id: "req_9c8b7a6d",
}

/* ===================================================================
   Scroll-spy — highlight the section currently in view. Uses an
   IntersectionObserver against the viewport, which works whether the page
   scrolls the document or an inner overflow container (as DevPageShell does).
   =================================================================== */

function useActiveSection(ids: string[]): string {
  const [active, setActive] = useState<string>(ids[0] ?? "")
  const ratios = useRef<Map<string, number>>(new Map())

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          ratios.current.set(e.target.id, e.isIntersecting ? e.intersectionRatio : 0)
        }
        let best = ""
        let bestRatio = 0
        for (const [id, ratio] of ratios.current) {
          if (ratio > bestRatio) {
            bestRatio = ratio
            best = id
          }
        }
        if (best) setActive(best)
      },
      { rootMargin: "-72px 0px -55% 0px", threshold: [0, 0.2, 0.5, 0.85, 1] },
    )
    for (const id of ids) {
      const el = document.getElementById(id)
      if (el) observer.observe(el)
    }
    return () => observer.disconnect()
  }, [ids])

  return active
}

function scrollToSection(id: string) {
  if (typeof document === "undefined") return
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" })
}

/* ===================================================================
   Building blocks
   =================================================================== */

function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  const onCopy = useCallback(() => {
    const done = () => {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    }
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(value).then(done).catch(() => {})
    } else {
      done()
    }
  }, [value])

  return (
    <button
      type="button"
      onClick={onCopy}
      aria-label={copied ? "Copied" : label}
      className={cn(
        "inline-flex items-center gap-1.5 h-7 px-2 rounded-md text-[11px] font-medium transition-colors",
        copied
          ? "text-emerald-600 dark:text-emerald-400"
          : "text-muted-foreground/55 hover:text-foreground hover:bg-foreground/[0.05]",
      )}
    >
      {copied ? <Check className="h-3 w-3" strokeWidth={2.5} /> : <Copy className="h-3 w-3" />}
      {copied ? "Copied" : label}
    </button>
  )
}

/** Language-tabbed code block with copy. Falls back to a single block when
    only one language is supplied. */
function CodeTabs({ sample, lang, onLang }: { sample: CodeSample; lang: LangId; onLang: (l: LangId) => void }) {
  const code = sample[lang]
  return (
    <div className="rounded-xl border border-foreground/[0.08] bg-foreground/[0.02] overflow-hidden">
      <div className="flex items-center justify-between gap-2 border-b border-foreground/[0.06] px-2.5 py-1.5">
        <div role="tablist" aria-label="Language" className="flex items-center gap-0.5 overflow-x-auto scrollbar-invisible min-w-0">
          {LANGS.map((l) => {
            const active = l.id === lang
            return (
              <button
                key={l.id}
                role="tab"
                aria-selected={active}
                onClick={() => onLang(l.id)}
                className={cn(
                  "h-6 px-2.5 rounded-md text-[11px] font-medium transition-colors shrink-0",
                  active
                    ? "bg-foreground/[0.08] dark:bg-foreground/[0.12] text-foreground"
                    : "text-muted-foreground/55 hover:text-foreground/85",
                )}
              >
                {l.label}
              </button>
            )
          })}
        </div>
        <div className="shrink-0">
          <CopyButton value={code} />
        </div>
      </div>
      <pre className="px-3.5 py-3 text-[12px] leading-[1.7] font-mono text-foreground/75 overflow-x-auto scrollbar-invisible">
        <code>{code}</code>
      </pre>
    </div>
  )
}

function JsonBlock({ value }: { value: unknown }) {
  const text = useMemo(() => JSON.stringify(value, null, 2), [value])
  return (
    <div className="rounded-xl border border-foreground/[0.08] bg-foreground/[0.02] overflow-hidden">
      <div className="flex items-center justify-between border-b border-foreground/[0.06] px-3 py-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground/45">JSON</span>
        <CopyButton value={text} />
      </div>
      <pre className="px-3.5 py-3 text-[12px] leading-[1.7] font-mono text-foreground/75 overflow-x-auto scrollbar-invisible">
        <code>{text}</code>
      </pre>
    </div>
  )
}

/** A documentation section. Registers an id for scroll-spy and applies a
    scroll-margin so anchored jumps clear the sticky chrome. */
function DocBlock({ section, children }: { section: DocSection; children: ReactNode }) {
  const Icon = section.icon
  return (
    <motion.section
      id={section.id}
      data-doc-section={section.id}
      initial={{ opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-10% 0px -10% 0px" }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="scroll-mt-24 pt-2"
    >
      <div className="flex items-center gap-2.5 mb-3">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-foreground/[0.08] bg-foreground/[0.03] text-foreground/55">
          <Icon className="h-4 w-4" strokeWidth={1.7} />
        </span>
        <h2 className="text-[19px] sm:text-[21px] font-semibold tracking-tight text-foreground">{section.title}</h2>
      </div>
      <div className="space-y-4">{children}</div>
    </motion.section>
  )
}

/** Reusable prose paragraph with consistent docs typography. */
function P({ children }: { children: ReactNode }) {
  return <p className="text-[13.5px] leading-[1.75] text-muted-foreground/75 max-w-2xl">{children}</p>
}

function InlineCode({ children }: { children: ReactNode }) {
  return (
    <code className="rounded-md bg-foreground/[0.06] px-1.5 py-0.5 font-mono text-[12px] text-foreground/85">
      {children}
    </code>
  )
}

/** Small bordered reference table. */
function RefTable({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <div className="rounded-xl border border-foreground/[0.07] overflow-hidden">
      <div className="overflow-x-auto scrollbar-invisible">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-foreground/[0.07] bg-foreground/[0.02]">
              {head.map((h) => (
                <th key={h} className="px-3.5 py-2 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-muted-foreground/50 whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className="border-b border-foreground/[0.04] last:border-0 hover:bg-foreground/[0.015] transition-colors">
                {row.map((cell, j) => (
                  <td key={j} className="px-3.5 py-2.5 text-[12.5px] text-foreground/75 align-top">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Callout({ children }: { children: ReactNode }) {
  return (
    <div className="flex gap-2.5 rounded-xl border border-foreground/[0.07] bg-foreground/[0.015] px-4 py-3">
      <Terminal className="h-4 w-4 text-muted-foreground/40 shrink-0 mt-0.5" strokeWidth={1.7} />
      <div className="text-[12.5px] leading-[1.7] text-muted-foreground/70">{children}</div>
    </div>
  )
}

/* ===================================================================
   Sidebar (desktop) + pill nav (mobile)
   =================================================================== */

function Sidebar({ active }: { active: string }) {
  return (
    <nav aria-label="Documentation sections" className="flex flex-col gap-5">
      {DOC_GROUPS.map((group) => (
        <div key={group}>
          <div className="px-2.5 mb-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/40">
            {group}
          </div>
          <ul className="space-y-0.5">
            {DOC_SECTIONS.filter((s) => s.group === group).map((s) => {
              const isActive = s.id === active
              const Icon = s.icon
              return (
                <li key={s.id}>
                  <a
                    href={`#${s.id}`}
                    aria-current={isActive ? "true" : undefined}
                    onClick={(e) => {
                      e.preventDefault()
                      scrollToSection(s.id)
                    }}
                    className={cn(
                      "group relative flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] font-medium transition-colors",
                      isActive
                        ? "bg-foreground/[0.06] text-foreground"
                        : "text-muted-foreground/60 hover:text-foreground/90 hover:bg-foreground/[0.03]",
                    )}
                  >
                    {isActive && (
                      <motion.span
                        layoutId="docs-active-bar"
                        className="absolute left-0 top-1/2 h-4 w-[2px] -translate-y-1/2 rounded-full bg-foreground"
                        transition={{ type: "spring", stiffness: 400, damping: 32 }}
                      />
                    )}
                    <Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={isActive ? 2.1 : 1.7} />
                    <span className="truncate">{s.title}</span>
                  </a>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </nav>
  )
}

function MobilePillNav({ active }: { active: string }) {
  return (
    <div className="lg:hidden sticky top-0 z-20 -mx-4 sm:-mx-6 px-4 sm:px-6 py-2 bg-background/80 backdrop-blur-xl border-b border-foreground/[0.06]">
      <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-invisible">
        {DOC_SECTIONS.map((s) => {
          const isActive = s.id === active
          return (
            <button
              key={s.id}
              onClick={() => scrollToSection(s.id)}
              aria-current={isActive ? "true" : undefined}
              className={cn(
                "shrink-0 h-7 px-2.5 rounded-full text-[11.5px] font-medium transition-colors whitespace-nowrap",
                isActive
                  ? "bg-foreground text-background"
                  : "bg-foreground/[0.05] text-muted-foreground/65 hover:text-foreground",
              )}
            >
              {s.title}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/* ===================================================================
   The documentation content
   =================================================================== */

/** Look up a section by id so the render order is decoupled from array
    indices. Adding a section no longer requires renumbering every block. */
function sec(id: string): DocSection {
  const found = DOC_SECTIONS.find((s) => s.id === id)
  if (!found) throw new Error(`Unknown doc section: ${id}`)
  return found
}

function DocsBody() {
  const [lang, setLang] = useState<LangId>("python")
  const sampleProps = (key: keyof typeof CODE_SAMPLES) => ({
    sample: CODE_SAMPLES[key],
    lang,
    onLang: setLang,
  })

  return (
    <div className="space-y-12">

      {/* ── Build-with-AI bar: drop the whole API into an AI coding tool ── */}
      <BuildWithAIBar />

      {/* ── Introduction ── */}
      <DocBlock section={DOC_SECTIONS[0]}>
        <P>
          The Coasty Computer Use API gives your code the ability to see a screen and act on it. You
          send a screenshot and a plain-language instruction; the model returns a precise list of
          actions — clicks, keystrokes, scrolls, and drags — with exact pixel coordinates. Your
          program performs those actions, captures a new screenshot, and asks again. That loop is how
          an agent drives any interface, real or virtual, without brittle selectors or per-app scripts.
        </P>
        <P>
          Everything is a normal HTTPS request to <InlineCode>{API_BASE}</InlineCode>. There is no SDK
          to install and no websocket to manage for the core endpoints: each call is stateless unless
          you opt into a <Link href="#sessions" onClick={(e) => { e.preventDefault(); scrollToSection("sessions") }} className="text-foreground/85 underline underline-offset-2 decoration-foreground/25 hover:decoration-foreground/60">session</Link>.
          Responses are JSON and stream nothing, so any HTTP client works.
        </P>
        <RefTable
          head={["Step", "What happens"]}
          rows={[
            [<span key="a" className="font-medium text-foreground/80">1. Capture</span>, "Take a screenshot of the screen you want to control and base64-encode it."],
            [<span key="b" className="font-medium text-foreground/80">2. Predict</span>, <>POST it with an instruction to <InlineCode>/predict</InlineCode>. You get back a list of actions.</>],
            [<span key="c" className="font-medium text-foreground/80">3. Act</span>, "Execute those actions on your machine, VM, or browser."],
            [<span key="d" className="font-medium text-foreground/80">4. Repeat</span>, <>Capture a fresh screenshot and call again until <InlineCode>status</InlineCode> is <InlineCode>done</InlineCode>.</>],
          ]}
        />
      </DocBlock>

      {/* ── Authentication ── */}
      <DocBlock section={DOC_SECTIONS[1]}>
        <P>
          Every request must include your secret key. The canonical way is the{" "}
          <InlineCode>{AUTH_HEADER}</InlineCode> header, but{" "}
          <InlineCode>Authorization: Bearer &lt;key&gt;</InlineCode> works too: a blank{" "}
          <InlineCode>{AUTH_HEADER}</InlineCode> falls through to the Bearer header. Pick one form and
          send the raw key. Do not paste the literal text <InlineCode>Bearer&nbsp;</InlineCode> inside{" "}
          <InlineCode>{AUTH_HEADER}</InlineCode>; that is the single most common first-day mistake and it
          returns <InlineCode>401 INVALID_API_KEY</InlineCode>. Keys are created and revoked from the{" "}
          <Link href="/developers/keys" className="text-foreground/85 underline underline-offset-2 decoration-foreground/25 hover:decoration-foreground/60">API keys</Link>{" "}
          page. Treat a key like a password: keep it server-side, store it in an environment variable,
          and never commit it or ship it in client-side code.
        </P>
        <div className="rounded-xl border border-foreground/[0.08] bg-foreground/[0.02] overflow-hidden">
          <div className="flex items-center justify-between border-b border-foreground/[0.06] px-3 py-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground/45">Header</span>
            <CopyButton value={`${AUTH_HEADER}: sk-coasty-live-your_key_here`} />
          </div>
          <pre className="px-3.5 py-3 text-[12px] font-mono text-foreground/75 overflow-x-auto scrollbar-invisible">
            <code>{`${AUTH_HEADER}: sk-coasty-live-your_key_here`}</code>
          </pre>
        </div>
        <RefTable
          head={["Prefix", "Kind", "Behaviour"]}
          rows={[
            [<InlineCode key="a">sk-coasty-live-</InlineCode>, <span key="b" className="font-medium text-foreground/80">Live</span>, "Runs the real model and draws down your USD wallet balance."],
            [<InlineCode key="c">sk-coasty-test-</InlineCode>, <span key="d" className="font-medium text-foreground/80">Test</span>, "Returns mock responses and never bills. Ideal for local dev and CI."],
          ]}
        />
        <Callout>
          Prefer test keys while you wire up your integration. An <InlineCode>sk-coasty-test-</InlineCode>{" "}
          key never bills and runs against mock VMs, yet exercises the exact same request and response
          shapes (its <InlineCode>X-Credits-Charged</InlineCode> and <InlineCode>usage.cost_cents</InlineCode>{" "}
          are always <InlineCode>0</InlineCode>), so you can build and run CI confidently before flipping
          to a live key.
        </Callout>
      </DocBlock>

      {/* ── Quickstart ── */}
      <DocBlock section={DOC_SECTIONS[2]}>
        <P>
          Your first prediction is four steps: export a key, capture a screenshot, base64-encode it, and
          POST it with an instruction. Grab a test key from the{" "}
          <Link href="/developers/keys" className="text-foreground/85 underline underline-offset-2 decoration-foreground/25 hover:decoration-foreground/60">API keys</Link>{" "}
          page (it never bills) and set it in your shell:
        </P>
        <div className="rounded-xl border border-foreground/[0.08] bg-foreground/[0.02] overflow-hidden">
          <div className="flex items-center justify-between border-b border-foreground/[0.06] px-3 py-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground/45">Shell</span>
            <CopyButton value={`export COASTY_API_KEY="sk-coasty-test-your_key_here"`} />
          </div>
          <pre className="px-3.5 py-3 text-[12px] font-mono text-foreground/75 overflow-x-auto scrollbar-invisible">
            <code>{`export COASTY_API_KEY="sk-coasty-test-your_key_here"`}</code>
          </pre>
        </div>
        <P>
          Now send the prediction. The call below uploads a screenshot, asks the model to click a button,
          and prints the actions it returns. Pick your language:
        </P>
        <CodeTabs {...sampleProps("predict")} />
        <P>
          A successful response contains an <InlineCode>actions</InlineCode> array and a{" "}
          <InlineCode>status</InlineCode> of <InlineCode>continue</InlineCode>,{" "}
          <InlineCode>done</InlineCode>, or <InlineCode>fail</InlineCode>. Execute each action in order,
          take a new screenshot, and call again while the status is <InlineCode>continue</InlineCode>.
          That loop is the whole API in miniature.
        </P>
        <RefTable
          head={["Want to...", "Go to"]}
          rows={[
            [
              "Run a multi-step task without resending history",
              <Link key="s" href="#sessions" onClick={(e) => { e.preventDefault(); scrollToSection("sessions") }} className="text-foreground/85 underline underline-offset-2 decoration-foreground/25 hover:decoration-foreground/60">Sessions</Link>,
            ],
            [
              "Hand the agent a task and let it drive to done on its own",
              <Link key="r" href="#runs" onClick={(e) => { e.preventDefault(); scrollToSection("runs") }} className="text-foreground/85 underline underline-offset-2 decoration-foreground/25 hover:decoration-foreground/60">Task runs</Link>,
            ],
            [
              "Chain many tasks with branches, loops, and guards",
              <Link key="w" href="#workflows" onClick={(e) => { e.preventDefault(); scrollToSection("workflows") }} className="text-foreground/85 underline underline-offset-2 decoration-foreground/25 hover:decoration-foreground/60">Workflows</Link>,
            ],
            [
              "Map a failed call to a fix",
              <Link key="e" href="#errors" onClick={(e) => { e.preventDefault(); scrollToSection("errors") }} className="text-foreground/85 underline underline-offset-2 decoration-foreground/25 hover:decoration-foreground/60">Errors</Link>,
            ],
          ]}
        />
        <Callout>
          Each of those sections ships a complete, copy-pasteable flow in all six languages: a sessions
          loop, a run polled to completion, and a workflow created then run. Start from the one that
          matches your task and adapt it.
        </Callout>
      </DocBlock>

      {/* ── Predict ── */}
      <DocBlock section={DOC_SECTIONS[3]}>
        <P>
          <InlineCode>POST /v1/predict</InlineCode> is the stateless workhorse. Each call is independent:
          you provide the full context every time, which makes it simple to reason about and trivial to
          scale horizontally. Use it for one-shot decisions and for loops where you manage history
          yourself. When a task needs the model to remember prior steps automatically, reach for{" "}
          <Link href="#sessions" onClick={(e) => { e.preventDefault(); scrollToSection("sessions") }} className="text-foreground/85 underline underline-offset-2 decoration-foreground/25 hover:decoration-foreground/60">sessions</Link>{" "}
          instead.
        </P>
        <RefTable
          head={["Field", "Type", "Required", "Description"]}
          rows={[
            [<InlineCode key="a">screenshot</InlineCode>, "string", <span key="b" className="text-foreground/80">Yes</span>, "Base64-encoded PNG or JPEG of the current screen."],
            [<InlineCode key="c">instruction</InlineCode>, "string", <span key="d" className="text-foreground/80">Yes</span>, "Natural-language goal, e.g. \"Click the login button\"."],
            [<InlineCode key="e">screen_width</InlineCode>, "int", "No", "Width in pixels (default 1920). Improves coordinate accuracy."],
            [<InlineCode key="f">screen_height</InlineCode>, "int", "No", "Height in pixels (default 1080)."],
            [<InlineCode key="g">max_actions</InlineCode>, "int", "No", "Cap on actions returned per call (default 5)."],
            [<InlineCode key="h">tools</InlineCode>, "string[]", "No", "Restrict to a subset of action types, e.g. [\"click\", \"type_text\"]."],
            [<InlineCode key="i">include_reasoning</InlineCode>, "bool", "No", "Return the model's reasoning string (default true)."],
          ]}
        />
        <P>The response is the standard prediction shape, covered in <Link href="#responses" onClick={(e) => { e.preventDefault(); scrollToSection("responses") }} className="text-foreground/85 underline underline-offset-2 decoration-foreground/25 hover:decoration-foreground/60">Response format</Link>.</P>
      </DocBlock>

      {/* ── Sessions ── */}
      <DocBlock section={DOC_SECTIONS[4]}>
        <P>
          A session keeps the trajectory — the running history of screenshots and actions — on our side,
          so each step only needs the latest screenshot and instruction. This produces better multi-step
          behaviour on long tasks and keeps your request bodies small. Create a session once, step
          through the task, then delete it to release your concurrency quota.
        </P>
        <CodeTabs {...sampleProps("sessions")} />
        <RefTable
          head={["Endpoint", "Purpose"]}
          rows={[
            [<InlineCode key="a">POST /v1/sessions</InlineCode>, "Create a session. Returns a session_id valid for 24h of inactivity."],
            [<InlineCode key="b">POST /v1/sessions/{"{id}"}/predict</InlineCode>, "Predict the next step. Body is just screenshot + instruction."],
            [<InlineCode key="c">POST /v1/sessions/{"{id}"}/reset</InlineCode>, "Clear history to start a new task on the same session. Free."],
            [<InlineCode key="d">DELETE /v1/sessions/{"{id}"}</InlineCode>, "End the session and free a concurrency slot. Free."],
          ]}
        />
        <Callout>
          Always delete a session in a <InlineCode>finally</InlineCode> block. Sessions count against
          your tier&apos;s concurrent-session limit, and orphaned sessions only expire after 24 hours of
          inactivity.
        </Callout>
      </DocBlock>

      {/* ── Grounding ── */}
      <DocBlock section={DOC_SECTIONS[5]}>
        <P>
          Grounding answers a narrower question than predict: &ldquo;where is this element?&rdquo; Give it
          a screenshot and a description and it returns the exact <InlineCode>x</InlineCode>,{" "}
          <InlineCode>y</InlineCode> coordinate to target. It is faster and cheaper than a full
          prediction ($0.03 instead of $0.05), which makes it ideal when you already know what to do
          and only need a pixel to click.
        </P>
        <CodeTabs {...sampleProps("grounding")} />
        <P>
          The response is <InlineCode>{`{ x, y, usage, request_id }`}</InlineCode>. Coordinates are in
          the same pixel space as the screenshot you sent.
        </P>
      </DocBlock>

      {/* ── Parse ── */}
      <DocBlock section={DOC_SECTIONS[6]}>
        <P>
          Parse converts a block of <InlineCode>pyautogui</InlineCode> code into the same structured
          action objects the model returns. It is deterministic, runs no model, and is free. Use it to
          migrate existing automation scripts onto Coasty&apos;s executor, or to normalise hand-written
          steps into the canonical action schema.
        </P>
        <CodeTabs {...sampleProps("parse")} />
      </DocBlock>

      {/* ── Task runs ── */}
      <DocBlock section={sec("runs")}>
        <P>
          A run hands the agent a task and a machine, then drives it to completion on our side. The
          agent loops autonomously, verifies its own work (pass or fail), can pause for a human when it
          hits a wall, bills $0.05 per completed step from your dollar API wallet ($0.08/step on the
          legacy v1 engine), and streams every event live. You
          start one call and watch, instead of running the predict loop yourself.
        </P>
        <P>
          Create a run with <InlineCode>POST /v1/runs</InlineCode>. The two required fields are{" "}
          <InlineCode>machine_id</InlineCode> and <InlineCode>task</InlineCode>. The response is an{" "}
          <InlineCode>agent.run</InlineCode> object with <InlineCode>status</InlineCode> of{" "}
          <InlineCode>queued</InlineCode>, plus a one-time <InlineCode>webhook_secret</InlineCode> you
          store to verify <Link href="#run-webhooks" onClick={(e) => { e.preventDefault(); scrollToSection("run-webhooks") }} className="text-foreground/85 underline underline-offset-2 decoration-foreground/25 hover:decoration-foreground/60">webhooks</Link>.
          Send an <InlineCode>Idempotency-Key</InlineCode> header to make a retried create safe.
        </P>
        <CodeTabs {...sampleProps("runs")} />
        <RefTable
          head={["Field", "Required", "Description"]}
          rows={[
            [<InlineCode key="a">machine_id</InlineCode>, <span key="a2" className="text-foreground/80">Yes</span>, "The machine the agent will drive."],
            [<InlineCode key="b">task</InlineCode>, <span key="b2" className="text-foreground/80">Yes</span>, "The natural-language goal to accomplish."],
            [<InlineCode key="c">cua_version</InlineCode>, "No", <>Model family. <InlineCode>v3</InlineCode> by default; <InlineCode>v4</InlineCode> needs professional tier or above.</>],
            [<InlineCode key="d">instructions</InlineCode>, "No", "Extra guidance appended to the base prompt."],
            [<InlineCode key="e">system_prompt</InlineCode>, "No", "A preamble placed ahead of the base prompt."],
            [<InlineCode key="g">max_steps</InlineCode>, "No", "Hard cap on agent steps (default 50)."],
            [<InlineCode key="h">deadline_seconds</InlineCode>, "No", <>Wall-clock budget; the run becomes <InlineCode>timed_out</InlineCode> if breached.</>],
            [<InlineCode key="i">on_awaiting_human</InlineCode>, "No", <>What to do when a human is needed: <InlineCode>pause</InlineCode> (default), <InlineCode>fail</InlineCode>, or <InlineCode>cancel</InlineCode>.</>],
            [<InlineCode key="j">awaiting_human_timeout_seconds</InlineCode>, "No", "How long to wait for a human before timing out."],
            [<InlineCode key="k">webhook_url</InlineCode>, "No", "HTTPS endpoint for lifecycle callbacks (https only)."],
            [<InlineCode key="l">metadata</InlineCode>, "No", "Arbitrary JSON echoed back on the run object."],
          ]}
        />
        <RefTable
          head={["Endpoint", "Purpose"]}
          rows={[
            [<InlineCode key="a">POST /v1/runs</InlineCode>, "Start a run. Returns the run plus a one-time webhook_secret."],
            [<InlineCode key="b">GET /v1/runs</InlineCode>, <>List runs. Filter with <InlineCode>?status=</InlineCode> and <InlineCode>?limit=</InlineCode>.</>],
            [<InlineCode key="c">GET /v1/runs/{"{id}"}</InlineCode>, "Fetch a single run and its current status."],
            [<InlineCode key="d">GET /v1/runs/{"{id}"}/events</InlineCode>, "Server-Sent Events stream of the run (see Streaming events)."],
            [<InlineCode key="e">POST /v1/runs/{"{id}"}/cancel</InlineCode>, "Cancel a run that has not reached a terminal state."],
            [<InlineCode key="f">POST /v1/runs/{"{id}"}/resume</InlineCode>, "Hand control back after a human takeover."],
          ]}
        />
        <JsonBlock value={RUN_EXAMPLE} />
        <RefTable
          head={["Field", "Type", "Description"]}
          rows={RUN_FIELDS.map((f) => [
            <InlineCode key={f.field}>{f.field}</InlineCode>,
            <code key={`${f.field}-t`} className="font-mono text-[11.5px] text-muted-foreground/60">{f.type}</code>,
            f.description,
          ])}
        />
        <Callout>
          A run moves through <InlineCode>queued</InlineCode> to <InlineCode>running</InlineCode>, can
          bounce between <InlineCode>running</InlineCode> and <InlineCode>awaiting_human</InlineCode>,
          and ends in one of <InlineCode>succeeded</InlineCode>, <InlineCode>failed</InlineCode>,{" "}
          <InlineCode>cancelled</InlineCode>, or <InlineCode>timed_out</InlineCode>. Terminal states are
          immutable, so it is always safe to stop polling once you reach one. Runs need the{" "}
          <InlineCode>runs:read</InlineCode> and <InlineCode>runs:write</InlineCode> scopes, granted to
          new keys by default.
        </Callout>
      </DocBlock>

      {/* ── Streaming events ── */}
      <DocBlock section={sec("run-events")}>
        <P>
          <InlineCode>GET /v1/runs/{"{id}"}/events</InlineCode> returns a Server-Sent Events stream so
          you can follow a run as it happens, instead of polling. Each event has a type and a numeric{" "}
          <InlineCode>id</InlineCode> (the sequence number). If your connection drops, reconnect and
          replay everything you missed by sending the last sequence you saw as a{" "}
          <InlineCode>Last-Event-ID</InlineCode> header, or as the <InlineCode>?after=</InlineCode> query
          parameter. The stream closes after the <InlineCode>done</InlineCode> event.
        </P>
        <CodeTabs {...sampleProps("runEvents")} />
        <RefTable
          head={["Event", "Meaning"]}
          rows={RUN_EVENT_TYPES.map((e) => [
            <InlineCode key={e.type}>{e.type}</InlineCode>,
            e.description,
          ])}
        />
      </DocBlock>

      {/* ── Human takeover ── */}
      <DocBlock section={sec("human-takeover")}>
        <P>
          Some steps need a person: a captcha, a one-time code, a judgment call. When the agent reaches
          one and <InlineCode>on_awaiting_human</InlineCode> is <InlineCode>pause</InlineCode>, the run
          moves to <InlineCode>awaiting_human</InlineCode> and emits an{" "}
          <InlineCode>awaiting_human</InlineCode> event with a reason. A human completes the blocking
          step (in the same machine session), then you hand control back with{" "}
          <InlineCode>POST /v1/runs/{"{id}"}/resume</InlineCode> and an optional{" "}
          <InlineCode>note</InlineCode>. Resume is only valid while the status is{" "}
          <InlineCode>awaiting_human</InlineCode>.
        </P>
        <CodeTabs {...sampleProps("runResume")} />
        <Callout>
          Detect the pause from either the run object (<InlineCode>status == awaiting_human</InlineCode>{" "}
          with <InlineCode>awaiting_human_reason</InlineCode> set), the SSE{" "}
          <InlineCode>awaiting_human</InlineCode> event, or the <InlineCode>run.awaiting_human</InlineCode>{" "}
          webhook. After resume, the run returns to <InlineCode>running</InlineCode> and emits a{" "}
          <InlineCode>resumed</InlineCode> event. Set <InlineCode>on_awaiting_human</InlineCode> to{" "}
          <InlineCode>fail</InlineCode> or <InlineCode>cancel</InlineCode> at create time if you would
          rather the run stop than wait for a human.
        </Callout>
      </DocBlock>

      {/* ── Webhooks ── */}
      <DocBlock section={sec("run-webhooks")}>
        <P>
          Pass a <InlineCode>webhook_url</InlineCode> (https only) when you create a run and we POST a
          signed callback at each lifecycle transition. The response to your create call includes a{" "}
          <InlineCode>webhook_secret</InlineCode> exactly once: store it, because every callback is
          signed with it. Each request carries a <InlineCode>Coasty-Signature</InlineCode> header of the
          form <InlineCode>t=&lt;unix_ts&gt;,v1=&lt;hex&gt;</InlineCode>.
        </P>
        <P>
          To verify, build the signed payload as <InlineCode>{`"<t>." + raw_request_body`}</InlineCode>,
          compute <InlineCode>HMAC-SHA256</InlineCode> over it keyed by the{" "}
          <InlineCode>webhook_secret</InlineCode>, and compare against <InlineCode>v1</InlineCode> with a
          constant-time check. Always hash the raw body bytes, before any JSON re-serialisation.
        </P>
        <CodeTabs {...sampleProps("webhookVerify")} />
        <RefTable
          head={["Event", "Meaning"]}
          rows={WEBHOOK_EVENTS.map((e) => [
            <InlineCode key={e.event}>{e.event}</InlineCode>,
            e.meaning,
          ])}
        />
      </DocBlock>

      {/* ── Workflows ── */}
      <DocBlock section={sec("workflows")}>
        <P>
          A workflow composes many runs into one versioned program, with branching, loops, and guards
          expressed as a JSON DSL. Each <InlineCode>task</InlineCode> step is itself an agent run, so a
          workflow is the way to chain tasks, gate them on conditions, and pass results between them.
          Workflows are versioned: re-creating the same <InlineCode>slug</InlineCode> bumps the version,
          and a <InlineCode>PUT</InlineCode> does too.
        </P>
        <P>
          Create one with <InlineCode>POST /v1/workflows</InlineCode>. The <InlineCode>slug</InlineCode>{" "}
          must match <InlineCode>[a-z0-9_-]</InlineCode>. The response is a <InlineCode>Workflow</InlineCode>{" "}
          carrying an <InlineCode>id</InlineCode>, a <InlineCode>version</InlineCode>, and the current{" "}
          <InlineCode>dsl_version</InlineCode> (<InlineCode>2026-06-01</InlineCode>).
        </P>
        <CodeTabs {...sampleProps("workflowCreate")} />
        <RefTable
          head={["Endpoint", "Purpose"]}
          rows={[
            [<InlineCode key="a">POST /v1/workflows</InlineCode>, "Create a workflow (or bump its version when the slug already exists)."],
            [<InlineCode key="b">GET /v1/workflows</InlineCode>, <>List workflows. Filter with <InlineCode>?limit=</InlineCode>.</>],
            [<InlineCode key="c">GET /v1/workflows/{"{id}"}</InlineCode>, "Fetch a workflow and its definition."],
            [<InlineCode key="d">PUT /v1/workflows/{"{id}"}</InlineCode>, "Replace the definition; bumps the version."],
            [<InlineCode key="e">DELETE /v1/workflows/{"{id}"}</InlineCode>, "Archive a workflow."],
          ]}
        />
        <Callout>
          Workflows need the <InlineCode>workflows:read</InlineCode> and{" "}
          <InlineCode>workflows:write</InlineCode> scopes, granted to new keys by default. See the{" "}
          <Link href="#workflow-dsl" onClick={(e) => { e.preventDefault(); scrollToSection("workflow-dsl") }} className="text-foreground/85 underline underline-offset-2 decoration-foreground/25 hover:decoration-foreground/60">Workflow DSL</Link>{" "}
          for the full step and condition catalogue.
        </Callout>
      </DocBlock>

      {/* ── Workflow DSL ── */}
      <DocBlock section={sec("workflow-dsl")}>
        <P>
          The DSL (<InlineCode>dsl_version</InlineCode> <InlineCode>2026-06-01</InlineCode>) is a JSON
          object with a <InlineCode>steps</InlineCode> array and an optional <InlineCode>output</InlineCode>.
          Each step has an <InlineCode>id</InlineCode> and a <InlineCode>type</InlineCode>. A{" "}
          <InlineCode>task</InlineCode> step runs the agent and binds its result (
          <InlineCode>{`{ status, passed, result, run_id, steps, error }`}</InlineCode>) under both its{" "}
          <InlineCode>save_as</InlineCode> name and its step id, so later steps can read it.
        </P>
        <JsonBlock value={WORKFLOW_DSL_EXAMPLE} />
        <RefTable
          head={["Step type", "Shape", "Description"]}
          rows={WORKFLOW_STEP_TYPES.map((s) => [
            <InlineCode key={s.type}>{s.type}</InlineCode>,
            <code key={`${s.type}-s`} className="font-mono text-[11.5px] text-muted-foreground/60">{s.shape}</code>,
            s.description,
          ])}
        />
        <P>
          Conditions are structured rather than expression strings, which keeps them injection-safe.
          Each <InlineCode>left</InlineCode>, <InlineCode>right</InlineCode>, or{" "}
          <InlineCode>value</InlineCode> is either a literal or a <InlineCode>{`{{path}}`}</InlineCode>{" "}
          reference. Paths are dotted lookups into <InlineCode>inputs.*</InlineCode>,{" "}
          <InlineCode>vars.*</InlineCode>, and any step id or <InlineCode>save_as</InlineCode> name.
        </P>
        <RefTable
          head={["Operator", "Shape", "Description"]}
          rows={CONDITION_OPS.map((c) => [
            <InlineCode key={c.op}>{c.op}</InlineCode>,
            <code key={`${c.op}-s`} className="font-mono text-[11.5px] text-muted-foreground/60">{c.shape}</code>,
            c.description,
          ])}
        />
        <Callout>
          Three hard guards stop a workflow run when breached:{" "}
          <InlineCode>budget_cents</InlineCode> (spend cap in USD cents; 0 means unlimited),{" "}
          <InlineCode>max_iterations</InlineCode> (loop cap), and{" "}
          <InlineCode>deadline_seconds</InlineCode> (wall-clock). A breach ends the run as{" "}
          <InlineCode>failed</InlineCode> or <InlineCode>timed_out</InlineCode>.
        </Callout>
        <P>
          A definition is validated before it is accepted. The limits below are enforced at create and
          ad-hoc time, so an invalid definition is rejected with <InlineCode>422 VALIDATION_ERROR</InlineCode>{" "}
          rather than failing mid-run.
        </P>
        <RefTable
          head={["Limit", "Rule"]}
          rows={WORKFLOW_LIMITS.map((l) => [
            <span key={l.limit} className="font-medium text-foreground/80">{l.limit}</span>,
            l.rule,
          ])}
        />
        <Callout>
          Workflows are version-pinned. When a run starts, the workflow&apos;s current{" "}
          <InlineCode>definition</InlineCode> is snapshotted into that run, so editing or replacing the
          workflow (which bumps its <InlineCode>version</InlineCode>) never changes runs already in
          flight. Each run records the <InlineCode>workflow_version</InlineCode> it executed.
        </Callout>
      </DocBlock>

      {/* ── Running workflows ── */}
      <DocBlock section={sec("workflow-runs")}>
        <P>
          Start a saved workflow with <InlineCode>POST /v1/workflows/{"{id}"}/runs</InlineCode>, or run a
          definition inline (without saving) with <InlineCode>POST /v1/workflows/runs</InlineCode> by
          adding a <InlineCode>definition</InlineCode> (and optional <InlineCode>inputs_schema</InlineCode>)
          to the same body. Both return a <InlineCode>workflow.run</InlineCode>. The body accepts{" "}
          <InlineCode>inputs</InlineCode>, a default <InlineCode>machine_id</InlineCode> for task steps,{" "}
          and the <InlineCode>budget_cents</InlineCode>, <InlineCode>max_iterations</InlineCode>, and{" "}
          <InlineCode>deadline_seconds</InlineCode> guards. An <InlineCode>Idempotency-Key</InlineCode>{" "}
          header is honoured here too.
        </P>
        <CodeTabs {...sampleProps("workflowAdhoc")} />
        <RefTable
          head={["Endpoint", "Purpose"]}
          rows={[
            [<InlineCode key="a">POST /v1/workflows/{"{id}"}/runs</InlineCode>, "Start a run of a saved workflow."],
            [<InlineCode key="b">POST /v1/workflows/runs</InlineCode>, "Run an inline definition without saving a workflow."],
            [<InlineCode key="c">GET /v1/workflows/runs</InlineCode>, <>List workflow runs. Filter with <InlineCode>?workflow_id=</InlineCode> and <InlineCode>?limit=</InlineCode>.</>],
            [<InlineCode key="d">GET /v1/workflows/runs/{"{id}"}</InlineCode>, "Fetch a single workflow run."],
            [<InlineCode key="e">GET /v1/workflows/runs/{"{id}"}/events</InlineCode>, "SSE stream with the same Last-Event-ID replay semantics."],
            [<InlineCode key="f">POST /v1/workflows/runs/{"{id}"}/cancel</InlineCode>, "Cancel a workflow run."],
            [<InlineCode key="g">POST /v1/workflows/runs/{"{id}"}/resume</InlineCode>, <>Approve or reject a human_approval pause with <InlineCode>{`{ approved, note? }`}</InlineCode>.</>],
          ]}
        />
        <JsonBlock value={WORKFLOW_RUN_EXAMPLE} />
        <RefTable
          head={["Field", "Type", "Description"]}
          rows={WORKFLOW_RUN_FIELDS.map((f) => [
            <InlineCode key={f.field}>{f.field}</InlineCode>,
            <code key={`${f.field}-t`} className="font-mono text-[11.5px] text-muted-foreground/60">{f.type}</code>,
            f.description,
          ])}
        />
      </DocBlock>

      {/* ── Action types ── */}
      <DocBlock section={sec("actions")}>
        <P>
          Every action the model can return uses an <InlineCode>action_type</InlineCode> from the table
          below, paired with a <InlineCode>params</InlineCode> object. Your executor switches on the
          type and applies the parameters. The terminal types — <InlineCode>done</InlineCode> and{" "}
          <InlineCode>fail</InlineCode> — set the response <InlineCode>status</InlineCode> and signal you
          to stop looping.
        </P>
        <RefTable
          head={["Action", "Params", "Description"]}
          rows={ACTION_TYPES.map((a) => [
            <InlineCode key={a.type}>{a.type}</InlineCode>,
            <code key={`${a.type}-p`} className="font-mono text-[11.5px] text-muted-foreground/60">{a.params}</code>,
            a.description,
          ])}
        />
      </DocBlock>

      {/* ── Response format ── */}
      <DocBlock section={sec("responses")}>
        <P>
          Predict and session-predict return the same shape. <InlineCode>actions</InlineCode> is the
          ordered list to execute; <InlineCode>status</InlineCode> tells you whether to keep going
          (<InlineCode>continue</InlineCode>), stop successfully (<InlineCode>done</InlineCode>), or stop
          because the task is impossible (<InlineCode>fail</InlineCode>). <InlineCode>usage</InlineCode>{" "}
          reports tokens and the dollar cost of the call (<InlineCode>cost_cents</InlineCode>).
        </P>
        <P>
          Billed success responses also carry two headers you can read without parsing the body:{" "}
          <InlineCode>X-Credits-Charged</InlineCode> (what this call cost) and{" "}
          <InlineCode>X-Credits-Remaining</InlineCode> (your wallet balance after it). In the body, the
          same numbers appear as <InlineCode>usage.credits_charged</InlineCode> and{" "}
          <InlineCode>usage.cost_cents</InlineCode>. On an <InlineCode>sk-coasty-test-</InlineCode> key
          both are always <InlineCode>0</InlineCode>. Every response (success or error) additionally
          carries an <InlineCode>X-Coasty-Request-Id</InlineCode> header that mirrors{" "}
          <InlineCode>request_id</InlineCode>; quote it when contacting support.
        </P>
        <JsonBlock value={RESPONSE_EXAMPLE} />
        <RefTable
          head={["Field", "Description"]}
          rows={[
            [<InlineCode key="a">request_id</InlineCode>, "Unique id for the call. Include it when contacting support."],
            [<InlineCode key="b">status</InlineCode>, <>One of <InlineCode>continue</InlineCode>, <InlineCode>done</InlineCode>, <InlineCode>fail</InlineCode>.</>],
            [<InlineCode key="c">actions</InlineCode>, "Ordered list of actions to perform this step."],
            [<InlineCode key="d">reasoning</InlineCode>, "The model's explanation (omitted if include_reasoning is false)."],
            [<InlineCode key="e">raw_code</InlineCode>, "The equivalent pyautogui lines, if you prefer to run those."],
            [<InlineCode key="f">usage</InlineCode>, <>Tokens plus the cost of the request (see the two fields below).</>],
            [<InlineCode key="g">usage.credits_charged</InlineCode>, <>Internal cost units billed (1 unit = <InlineCode>$0.01</InlineCode>). See <InlineCode>cost_cents</InlineCode> for the dollar amount.</>],
            [<InlineCode key="h">usage.cost_cents</InlineCode>, "Dollar cost so far, in cents (USD)."],
          ]}
        />
      </DocBlock>

      {/* ── Errors ── */}
      <DocBlock section={sec("errors")}>
        <P>
          Errors return a non-2xx status and a JSON envelope under an <InlineCode>error</InlineCode> key.
          The <InlineCode>code</InlineCode> is stable and safe to branch on; <InlineCode>message</InlineCode>{" "}
          is human-readable and may change. Every error also carries an{" "}
          <InlineCode>error.request_id</InlineCode> (mirrored in the{" "}
          <InlineCode>X-Coasty-Request-Id</InlineCode> response header), plus{" "}
          <InlineCode>error.suggestion</InlineCode> and <InlineCode>error.docs_url</InlineCode> for
          self-service. A <InlineCode>{`Link: <url>; rel="help"`}</InlineCode> header mirrors{" "}
          <InlineCode>docs_url</InlineCode>. Always log the request id: it is the fastest way for us to
          trace a failed call.
        </P>
        <P>
          Some codes attach machine-readable context to the body. A <InlineCode>402</InlineCode>{" "}
          (<InlineCode>INSUFFICIENT_CREDITS</InlineCode>) reports <InlineCode>required</InlineCode> and{" "}
          <InlineCode>balance</InlineCode>; a <InlineCode>403</InlineCode> reports{" "}
          <InlineCode>required_scope</InlineCode> and <InlineCode>current_scopes</InlineCode>; a{" "}
          <InlineCode>422</InlineCode> <InlineCode>VALIDATION_ERROR</InlineCode> lists the offending field
          path under <InlineCode>error.details</InlineCode>; and a <InlineCode>409</InlineCode> state
          conflict carries <InlineCode>current_state</InlineCode> with{" "}
          <InlineCode>allowed_from</InlineCode> or <InlineCode>required_state</InlineCode>.
        </P>
        <JsonBlock value={ERROR_EXAMPLE} />
        <RefTable
          head={["Status", "Code", "Cause and fix"]}
          rows={ERROR_CODES.map((e) => [
            <span key={`${e.code}-s`} className="font-mono text-[12px] text-foreground/80">{e.status}</span>,
            <InlineCode key={`${e.code}-c`}>{e.code}</InlineCode>,
            e.meaning,
          ])}
        />
        <Callout>
          Treat <InlineCode>429</InlineCode>, <InlineCode>503</InlineCode> (
          <InlineCode>UPSTREAM_UNAVAILABLE</InlineCode>), and <InlineCode>504</InlineCode> (
          <InlineCode>UPSTREAM_TIMEOUT</InlineCode>) as retryable: honor <InlineCode>Retry-After</InlineCode>{" "}
          on a 429, and use an <InlineCode>Idempotency-Key</InlineCode> with exponential backoff on the
          upstream codes. A <InlineCode>500</InlineCode> model failure (
          <InlineCode>PREDICTION_FAILED</InlineCode> or <InlineCode>GROUNDING_FAILED</InlineCode>)
          auto-refunds the charge, so retrying is free.
        </Callout>

        {/* Troubleshooting: the five most common first-week mistakes. */}
        <h3 className="text-[15px] font-semibold tracking-tight text-foreground/90 pt-2">Troubleshooting</h3>
        <P>
          Five mistakes account for almost every first-week support ticket. Each maps to one status and
          one fix:
        </P>
        <RefTable
          head={["Symptom", "Likely cause", "Fix"]}
          rows={[
            [
              <span key="s401" className="font-mono text-[12px] text-foreground/80">401</span>,
              <>Wrong header. The key is missing, or <InlineCode>Bearer&nbsp;</InlineCode> was pasted into <InlineCode>{AUTH_HEADER}</InlineCode>.</>,
              <>Send the raw key in <InlineCode>{AUTH_HEADER}</InlineCode>, or use <InlineCode>Authorization: Bearer &lt;key&gt;</InlineCode>. Never both prefixes.</>,
            ],
            [
              <span key="s402" className="font-mono text-[12px] text-foreground/80">402</span>,
              <>No credits. Your live wallet can&apos;t cover the call (<InlineCode>INSUFFICIENT_CREDITS</InlineCode>).</>,
              <>Add funds, or build against an <InlineCode>sk-coasty-test-</InlineCode> key (test keys never bill).</>,
            ],
            [
              <span key="s403" className="font-mono text-[12px] text-foreground/80">403</span>,
              <>Missing scope. The key lacks <InlineCode>required_scope</InlineCode> for this endpoint.</>,
              <>Re-mint a key with the needed scope (for example <InlineCode>runs:write</InlineCode> or <InlineCode>workflows:write</InlineCode>).</>,
            ],
            [
              <span key="s422" className="font-mono text-[12px] text-foreground/80">422</span>,
              <>Bad screenshot or missing field. Undecodable base64, a <InlineCode>data:</InlineCode> prefix, or an absent required field.</>,
              <>Strip the <InlineCode>data:</InlineCode> prefix and whitespace; read <InlineCode>error.details</InlineCode> for the exact field path.</>,
            ],
          ]}
        />
      </DocBlock>

      {/* ── Pricing ── */}
      <DocBlock section={sec("pricing")}>
        <P>
          Requests are billed in US dollars from your prepaid API wallet. The charge is taken before the
          model runs and automatically refunded if a request fails server-side. Internally each request
          unit is <InlineCode>$0.01</InlineCode> (the granularity behind every price below), but
          everything you pay and see is dollars. Every price on this page is exact; test keys (
          <InlineCode>sk-coasty-test-</InlineCode>) always bill <InlineCode>$0.00</InlineCode>.
        </P>
        <RefTable
          head={["Endpoint", "Cost", "Notes"]}
          rows={PRICING.map((p) => [
            <InlineCode key={p.endpoint}>{p.endpoint}</InlineCode>,
            <span key={`${p.endpoint}-c`} className="font-medium text-foreground/80 whitespace-nowrap">{p.cost}</span>,
            p.note,
          ])}
        />

        <h3 className="text-[15px] font-semibold tracking-tight text-foreground/90 pt-2">Surcharges</h3>
        <P>
          Four fixed surcharges can apply on top of a base price, all on the vision endpoints
          (predict, session steps, ground). Each is an exact USD amount:
        </P>
        <RefTable
          head={["Surcharge", "Cost", "Applies to"]}
          rows={SURCHARGES.map((s) => [
            <span key={s.surcharge} className="font-medium text-foreground/80">{s.surcharge}</span>,
            <span key={`${s.surcharge}-c`} className="font-medium text-foreground/80 whitespace-nowrap">{s.cost}</span>,
            s.applies,
          ])}
        />

        <h3 className="text-[15px] font-semibold tracking-tight text-foreground/90 pt-2">Machines</h3>
        <P>
          Machines bill for runtime only, metered per minute and rounded down:{" "}
          <InlineCode>$0.05/hr</InlineCode> for a running Linux machine,{" "}
          <InlineCode>$0.09/hr</InlineCode> for a running Windows machine, and{" "}
          <InlineCode>$0.01/hr</InlineCode> while stopped or suspended. The starting, stopping, and
          restarting transitions bill at the running rate; the creating, error, and terminated states
          bill nothing, and TTL auto-destroy is free. Snapshots are a one-time{" "}
          <InlineCode>$0.01</InlineCode> each, and every per-call operation (actions, batch, browser,
          terminal, files, screenshot, connection) is free. Provisioning requires a{" "}
          <InlineCode>$0.20</InlineCode> wallet minimum, which is a gate, not a charge. If the wallet
          empties mid-flight the machine is automatically stopped, never destroyed, and resumes after
          you top up. The live rate card is always at <InlineCode>GET /v1/machines/pricing</InlineCode>.
        </P>

        <h3 className="text-[15px] font-semibold tracking-tight text-foreground/90 pt-2">Schedules</h3>
        <P>
          Schedules have no per-fire fee: webhook fires are free (limited to 60/min), and create,
          run-now, and webhook fires only require the same <InlineCode>$0.20</InlineCode> wallet
          minimum as a gate. The execution itself is billed differently from everything else on this
          page: scheduled agent runtime is charged to your subscription credit balance at 10 credits
          per minute ($0.10 of subscription value per minute, at 1 credit = $0.01), not to this USD
          API wallet. Keep both balances funded if you rely on schedules.
        </P>
        <div className="flex flex-wrap items-center gap-3 pt-1">
          <Link
            href="/developers/keys"
            className="inline-flex items-center gap-1.5 h-9 px-4 rounded-xl text-[12.5px] font-medium bg-foreground text-background hover:bg-foreground/90 transition-all"
          >
            Create an API key
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
          <Link
            href="/developers/usage"
            className="inline-flex items-center gap-1.5 h-9 px-4 rounded-xl text-[12.5px] font-medium border border-foreground/[0.1] text-muted-foreground/75 hover:text-foreground hover:border-foreground/20 transition-all"
          >
            View your usage
          </Link>
        </div>
      </DocBlock>
    </div>
  )
}

/* ===================================================================
   Public component
   =================================================================== */

export function DeveloperDocs({
  // The sticky top offset (a plain Tailwind class). Default suits the dashboard
  // (scroll container starts below the app header); the public /docs page passes
  // a larger offset to clear the fixed landing header.
  sidebarStickyClassName = "top-2",
  // Max-height for the nav, applied as an INLINE STYLE on purpose. Tailwind does
  // NOT reliably emit a CSS rule for an arbitrary `max-h-[calc(100dvh-...)]`
  // value (verified: the class lands in the DOM but computed max-height stays
  // `none`), so the nav had no cap and never scrolled. An inline style with real
  // calc() spaces always applies. The dashboard subtracts the app header
  // (--spacing-app-header); the public page subtracts the fixed header zone.
  sidebarMaxHeight = "calc(100dvh - var(--spacing-app-header, 56px) - 1.25rem)",
}: { sidebarStickyClassName?: string; sidebarMaxHeight?: string } = {}) {
  const ids = useMemo(() => DOC_SECTIONS.map((s) => s.id), [])
  const active = useActiveSection(ids)

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[220px_minmax(0,1fr)] xl:grid-cols-[240px_minmax(0,1fr)] gap-x-10">
      {/* Sticky sidebar — always visible on lg+, the primary way to navigate.
          The sticky element is ITSELF the scroll container (a single
          `overflow-y-auto` + `max-h` box reliably scrolls when content overflows
          — no flexbox height ambiguity). The title is pinned with `sticky top-0`
          inside it. `docs-nav-scroll` shows a subtle scrollbar because the app
          hides scrollbars globally; `overscroll-contain` keeps wheel scrolling
          inside the nav. */}
      <aside className="hidden lg:block">
        <div
          className={cn(
            "sticky overflow-y-auto overscroll-contain docs-nav-scroll rounded-2xl border border-foreground/[0.06] bg-foreground/[0.012]",
            sidebarStickyClassName,
          )}
          style={{ maxHeight: sidebarMaxHeight }}
        >
          <div className="sticky top-0 z-10 border-b border-foreground/[0.06] bg-background px-3 pt-3 pb-2.5">
            <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/40">Reference</div>
            <div className="text-[13px] font-semibold text-foreground/85 mt-0.5">Computer Use API</div>
          </div>
          <div className="p-3 pt-2.5">
            <Sidebar active={active} />
          </div>
        </div>
      </aside>

      {/* Content. The mobile pill nav lives at the top of this column. */}
      <div className="min-w-0">
        <MobilePillNav active={active} />
        <div className="pt-4 lg:pt-0">
          <DocsBody />
        </div>
      </div>
    </div>
  )
}
