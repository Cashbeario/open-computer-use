// Auto-authored single-document Markdown reference for the Coasty Computer Use API.
// Served verbatim at https://coasty.ai/docs/llms.txt so an LLM can ingest the
// whole API in one file. Source of truth: backend/app/models/public_*.py,
// backend/app/api/routes/public_*.py, api_key_service.py, api_billing_service.py,
// and app/components/developers/developer-docs.tsx. Keep this in sync with those.
//
// NOTE on escaping: this is a template literal. Every backtick inside the doc is
// written as \` and every literal dollar-brace is written as \${ so the doc text
// (which contains shell/JS code with backticks and {{var}} / ${var} tokens) does
// not break the literal. No interpolation is used.

export const API_DOCS_MARKDOWN = `# Coasty Computer Use API

> The single, complete reference for the Coasty Computer Use (CUA) API. Coasty
> turns a screenshot plus an instruction into structured GUI actions, drives
> autonomous task runs on a machine, and composes those runs into versioned
> workflows. This document covers every endpoint, request field, response shape,
> error, rate limit, scope, and price.

- Base URL: \`https://coasty.ai/v1\`
- Auth header: \`X-API-Key: <key>\` (or \`Authorization: Bearer <key>\`)
- Human docs: https://coasty.ai/docs
- Manage keys: https://coasty.ai/developers/keys
- Site-wide LLM doc: https://coasty.ai/llms-full.txt

---

## 1. Overview

Coasty exposes three layers, smallest to largest:

1. **Core inference** (\`/v1/predict\`, \`/v1/sessions\`, \`/v1/ground\`,
   \`/v1/parse\`). You supply screenshots and instructions; Coasty returns the
   actions to take. You execute the actions on your own machine and loop.
2. **Task Runs** (\`/v1/runs\`). You give the agent a task plus a \`machine_id\` and
   Coasty drives the whole loop server-side (autonomous, pass/fail verified,
   optional human takeover, per-step billing, streaming events, webhooks).
3. **Workflows** (\`/v1/workflows\`). A versioned JSON DSL that composes many runs
   with branching, loops, parallelism, asserts, retries, and human approvals.

How a single inference turn works: send a base64 screenshot and a natural
language instruction; the model returns an ordered list of \`actions\` (clicks,
typing, key presses, scrolls, etc.) and a \`status\` of \`continue\`, \`done\`, or
\`fail\`. With \`/v1/predict\` you manage trajectory yourself; with \`/v1/sessions\`
the server remembers the trajectory across steps.

### Base URL

All endpoints live under:

\`\`\`
https://coasty.ai/v1
\`\`\`

### Authentication

Send your API key in either header (both are accepted on every \`/v1\` endpoint):

\`\`\`
X-API-Key: sk-coasty-live-<48 hex>
Authorization: Bearer sk-coasty-live-<48 hex>
\`\`\`

Read the key from the \`COASTY_API_KEY\` environment variable rather than hard
coding it. A missing or malformed key returns \`401 INVALID_API_KEY\` (which also
sends a \`WWW-Authenticate: Bearer\` challenge header).

### Request ids and response headers

Every response (success or error) carries an \`X-Coasty-Request-Id\` header, and
every error body repeats it as \`error.request_id\`. Quote that id verbatim when
you contact support; it ties together the whole request end-to-end.

Billed responses also return two headers so you can track spend without a
second call:

- \`X-Credits-Charged\`: what this request cost in credits (1 credit = $0.01; \`0\` on test keys).
- \`X-Credits-Remaining\`: your wallet balance after the charge (USD cents).

Other useful headers: \`X-Coasty-Key-Kind\` (\`live\` / \`test\` / \`legacy\`),
\`X-Coasty-Test-Mode: true\` (test keys only), and \`X-Coasty-Idempotent-Replay: true\`
when a response was served from the idempotency cache.

### Key management

- Create, list, and revoke keys at https://coasty.ai/developers/keys, or via the
  API: \`POST /v1/keys\`, \`GET /v1/keys\`, \`DELETE /v1/keys/{key_id}\`.
- The raw key is shown exactly **once** at creation; store it securely.
- Per-account cap: 20 active keys.
- Each key carries a set of scopes (see Reference). New keys are granted a
  conservative default set that already includes \`runs:*\` and \`workflows:*\`.

### Test vs live keys

| Prefix | Kind | Bills your wallet? |
| --- | --- | --- |
| \`sk-coasty-live-<48 hex>\` | live | Yes |
| \`sk-coasty-test-<48 hex>\` | test (sandbox) | No (free) |
| \`cua_sk_<48 hex>\` | legacy (accepted through 2026-11-01) | Yes |

Test keys (\`sk-coasty-test-*\`) run the same validation and logic as live keys
but **never debit your wallet**. Responses from test keys
carry \`X-Coasty-Test-Mode: true\` and \`X-Credits-Charged: 0\`. The \`X-Coasty-Key-Kind\`
response header reports which family authenticated (\`live\`, \`test\`, or \`legacy\`).

### Billing model (USD)

Your developer wallet is a **prepaid USD balance** (denominated in cents).
Costs are counted in **credits, and 1 credit = 1 cent = $0.01 exactly** —
every \`credits_charged\` / \`total_credits\` field in this API uses that unit.
Per-request charges are taken before the model call and automatically refunded
if the call fails. Machines additionally bill an hourly runtime rate, metered
per minute. See the Pricing table in the Reference section for exact costs.

---

## 2. Quickstart

### Step 1: get a key

Create a key at https://coasty.ai/developers/keys and export it:

\`\`\`bash
export COASTY_API_KEY="sk-coasty-live-..."
\`\`\`

### Step 2: your first prediction

\`\`\`bash
# screen.png is a screenshot of the screen you want to control
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
EOF
\`\`\`

\`\`\`python
import base64, os, requests

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
    print(action["action_type"], action["params"])
\`\`\`

### Step 3: hand the agent a whole task (a run)

Instead of looping yourself, give the agent a task and a machine and let it
drive to completion:

\`\`\`python
import os, time, requests

BASE = "https://coasty.ai/v1"
HEADERS = {"X-API-Key": os.environ["COASTY_API_KEY"]}
TERMINAL = {"succeeded", "failed", "cancelled", "timed_out"}

run = requests.post(
    f"{BASE}/runs",
    headers={**HEADERS, "Idempotency-Key": "order-4821"},
    json={
        "machine_id": "m_9f2c",
        "task": "Open the billing page and download the latest invoice as PDF",
        "cua_version": "v3",
        "max_steps": 40,
        "on_awaiting_human": "pause",
    },
    timeout=30,
).json()
run_id = run["id"]
webhook_secret = run.get("webhook_secret")   # shown once; store it now

while run["status"] not in TERMINAL:
    time.sleep(2)
    run = requests.get(f"{BASE}/runs/{run_id}", headers=HEADERS, timeout=30).json()
    print(run["status"], run["steps_completed"], "steps")

print(run["result"])               # {"passed": ..., "status": ..., "summary": ...}
\`\`\`

---

## 3. Core endpoints

### CUA versions

\`cua_version\` selects the engine. Pass it on \`/v1/predict\`, \`/v1/sessions\`, and
\`/v1/runs\`.

| Version | Description | Avg step | Tiers |
| --- | --- | --- | --- |
| \`v1\` | Baseline: single action per call, reflection, 8-screenshot trajectory | 9-10s | professional, enterprise |
| \`v3\` | Lean (default): multi-action per call, no reflection, aggressive compaction | 3.5-4s | all tiers |
| \`v4\` | Autonomous + verifier (pass/fail, recovery, exploration, cost governor) | varies | professional, enterprise |

### Prompt steering: instructions vs system_prompt

- \`instructions\` (string, optional): extra guidance **APPENDED** to the built-in
  CUA system prompt. Use this to steer behaviour while keeping the base prompt.
- \`system_prompt\` (string, optional): a custom prompt that **REPLACES** the base
  agent prompt (on runs it takes priority as a preamble). May be combined with
  \`instructions\`, which is appended after the replacement.
- Both draw from the same per-tier custom-prompt budget. On the free tier the
  budget is 0, so neither is available there.

---

### POST /v1/predict

Stateless action prediction. Scope: \`predict\`. Send a screenshot plus an
instruction, get an ordered list of actions back. You manage trajectory.

**Price:** $0.05 (5 credits) per call, plus exact surcharges: +$0.02 (2 cr)
per \`trajectory\` screenshot you attach, +$0.01 (1 cr) per HD image (width >
1280 or height > 720 — charged on the current screenshot and each trajectory
screenshot), +$0.03 (3 cr) when \`cua_version\` is \`v1\`, and +$0.01 (1 cr)
when \`system_prompt\` exceeds 500 characters. Refunded if the call fails.

**Request body**

| Field | Type | Req | Default | Notes |
| --- | --- | --- | --- | --- |
| \`screenshot\` | string | yes | - | Base64-encoded PNG/JPEG. Must be > 100 chars. |
| \`instruction\` | string | yes | - | Natural language task. Must be non-empty. |
| \`cua_version\` | string | no | \`v3\` | \`v1\` / \`v3\` / \`v4\`. |
| \`system_prompt\` | string\\|null | no | null | REPLACES the base prompt. |
| \`instructions\` | string\\|null | no | null | APPENDED to the base prompt. |
| \`screen_width\` | int | no | 1920 | 320-3840. |
| \`screen_height\` | int | no | 1080 | 240-2160. |
| \`trajectory\` | array | no | [] | Prior steps for context: \`[{screenshot, actions, reasoning}]\`. |
| \`max_actions\` | int | no | 5 | 1-10. Capped to your tier max. |
| \`tools\` | string[]\\|null | no | null | Allowed action types (null = all). |
| \`include_reasoning\` | bool | no | true | Include the agent's reasoning. |
| \`include_raw_code\` | bool | no | true | Include raw pyautogui code. |

**Response** (\`PredictResponse\`)

\`\`\`json
{
  "request_id": "req_8f2c1e9a",
  "status": "continue",
  "reasoning": "The login form is visible. I'll click the email field, then type the address.",
  "actions": [
    { "action_type": "click", "params": { "x": 512, "y": 340 }, "description": "Click the email field" },
    { "action_type": "type_text", "params": { "text": "you@example.com" }, "description": "Type the email address" }
  ],
  "raw_code": ["pyautogui.click(512, 340)", "pyautogui.typewrite('you@example.com')"],
  "usage": { "input_tokens": 1523, "output_tokens": 245, "credits_charged": 6, "cost_cents": 6 }
}
\`\`\`

\`status\` is one of \`continue\`, \`done\`, \`fail\`. Each action object is
\`{ action_type, params, description, raw_code }\`. \`usage.cost_cents\` is the USD
cost in cents.

**curl**

\`\`\`bash
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
EOF
\`\`\`

**Python**

\`\`\`python
import base64, os, requests

with open("screen.png", "rb") as f:
    screenshot = base64.b64encode(f.read()).decode()

res = requests.post(
    "https://coasty.ai/v1/predict",
    headers={"X-API-Key": os.environ["COASTY_API_KEY"]},
    json={
        "screenshot": screenshot,
        "instruction": "Click the login button",
        "screen_width": 1920,
        "screen_height": 1080,
    },
    timeout=60,
).json()

print(res["status"])
for action in res["actions"]:
    print(action["action_type"], action["params"])
\`\`\`

---

### Sessions

Stateful, multi-step tasks. The server remembers the trajectory across steps so
you only send the latest screenshot each turn. Scope: \`session\`. Always delete a
session when done to free your concurrency quota.

#### POST /v1/sessions

Create a session.

**Price:** $0.10 (10 credits) one-time at creation, with no surcharges.
Reset, get, list, and delete are free, and sessions carry no per-minute
cost — deleting just frees your concurrency slot.

**Request body**

| Field | Type | Req | Default | Notes |
| --- | --- | --- | --- | --- |
| \`cua_version\` | string | no | \`v3\` | \`v1\` / \`v3\` / \`v4\`. |
| \`screen_width\` | int | no | 1920 | 320-3840. |
| \`screen_height\` | int | no | 1080 | 240-2160. |
| \`max_trajectory_length\` | int | no | 3 | 1-20. Clamped to your tier max. |
| \`system_prompt\` | string\\|null | no | null | REPLACES the base prompt. |
| \`instructions\` | string\\|null | no | null | APPENDED to the base prompt. |
| \`tools\` | string[]\\|null | no | null | Allowed action types. |
| \`metadata\` | object\\|null | no | null | Opaque caller metadata. |

**Response** (\`CreateSessionResponse\`)

\`\`\`json
{
  "session_id": "sess_3b9c...",
  "cua_version": "v3",
  "screen_size": "1920x1080",
  "created_at": "2026-06-01T12:00:00Z",
  "expires_at": "2026-06-01T12:30:00Z"
}
\`\`\`

#### POST /v1/sessions/{id}/predict

Predict the next step inside a session. Repeat until \`status != "continue"\`.

**Price:** $0.04 (4 credits) per step, plus the same surcharges as
\`/v1/predict\`: +$0.02 per screenshot in the server-kept trajectory, +$0.01
per HD image (current + trajectory), +$0.03 on the \`v1\` engine, +$0.01 for
a \`system_prompt\` over 500 characters.

**Request body**

| Field | Type | Req | Default |
| --- | --- | --- | --- |
| \`screenshot\` | string | yes | - |
| \`instruction\` | string | yes | - |
| \`include_reasoning\` | bool | no | true |
| \`include_raw_code\` | bool | no | true |

**Response** (\`SessionPredictResponse\`): \`{ request_id, session_id, step,
actions, raw_code, reasoning, status, usage }\`.

#### POST /v1/sessions/{id}/reset

Reset the session trajectory to start a fresh task on the same session. Returns
\`{ "status": "ok", "session_id": "..." }\`.

#### DELETE /v1/sessions/{id}

Release the session and free a concurrency slot. Returns
\`{ "status": "ok", "session_id": "..." }\`.

#### GET /v1/sessions

List your active sessions. Returns \`{ "sessions": [...] }\`.

#### GET /v1/sessions/{id}

Get one session's status (\`SessionInfoResponse\`):

\`\`\`json
{
  "session_id": "sess_3b9c...",
  "cua_version": "v3",
  "screen_size": "1920x1080",
  "step_count": 4,
  "created_at": "2026-06-01T12:00:00Z",
  "expires_at": "2026-06-01T12:30:00Z",
  "total_credits_used": 16
}
\`\`\`

**curl: the full session lifecycle**

\`\`\`bash
BASE=https://coasty.ai/v1
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
curl -s -X DELETE "$BASE/sessions/$SESSION_ID" -H "$AUTH"
\`\`\`

---

### POST /v1/ground

Resolve a natural language description of an element to exact \`(x, y)\` pixel
coordinates. Scope: \`ground\`.

**Price:** $0.03 (3 credits) per call, +$0.01 (1 credit) if the screenshot
is HD (width > 1280 or height > 720).

**Request body**

| Field | Type | Req | Default |
| --- | --- | --- | --- |
| \`screenshot\` | string | yes | - |
| \`element\` | string | yes | - |
| \`screen_width\` | int | no | 1920 |
| \`screen_height\` | int | no | 1080 |

**Response** (\`GroundResponse\`): \`{ "x": 512, "y": 340, "usage": { ... } }\`.

\`\`\`bash
curl -s https://coasty.ai/v1/ground \\
  -H "X-API-Key: $COASTY_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d "{\\"screenshot\\":\\"$SCREENSHOT\\",\\"element\\":\\"the blue Submit button\\"}"
\`\`\`

---

### POST /v1/parse

Turn raw pyautogui code into structured actions. Deterministic, no model call,
and **free**. Scope: \`parse\`.

**Request body**

| Field | Type | Req | Notes |
| --- | --- | --- | --- |
| \`code\` | string | yes | Non-empty, under 50,000 chars. |

**Response** (\`ParseResponse\`): \`{ "actions": [ { action_type, params, ... } ] }\`.

\`\`\`bash
curl -s https://coasty.ai/v1/parse \\
  -H "X-API-Key: $COASTY_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"code": "pyautogui.click(100, 200)"}'
\`\`\`

---

### GET /v1/models

List available models, CUA versions, and action types. No body.

\`\`\`json
{
  "models": [
    { "id": "default", "description": "Default model - balanced performance and cost" }
  ],
  "cua_versions": [
    { "id": "v1", "description": "Baseline - single action per call, reflection enabled, 8-screenshot trajectory", "avg_step_time": "9-10s", "features": ["reflection", "single_action"] },
    { "id": "v3", "description": "Lean - multi-action per call, no reflection, aggressive compaction", "avg_step_time": "3.5-4s", "features": ["multi_action", "compaction"] }
  ],
  "action_types": ["click", "type_text", "key_press", "key_combo", "scroll", "drag", "move", "wait", "done", "fail"]
}
\`\`\`

### GET /v1/usage

Usage summary for a billing period. Optional query param \`period\` (\`YYYY-MM\`,
defaults to the current month).

\`\`\`json
{
  "period": "2026-06",
  "total_requests": 128,
  "total_credits": 540,
  "total_cost_cents": 540,
  "breakdown": { "predict": { "requests": 100, "credits": 500 } },
  "balance": 9300,
  "wallet_balance_cents": 9300,
  "wallet_balance_usd": 93.0
}
\`\`\`

\`balance\` / \`wallet_balance_cents\` is the prepaid USD wallet balance in cents.

---

## 4. Task Runs

A run gives the agent a task plus a machine and drives it to completion
server-side: an autonomous loop with pass/fail verification, optional human
takeover, per-step wallet billing, a streaming event log, and webhooks. Scopes:
\`runs:read\` (list/get/events) and \`runs:write\` (start/cancel/resume).

**Pricing.** Each completed agent step bills your wallet $0.05 (5 credits)
on \`v3\`/\`v4\`, or $0.08 (8 credits) on \`v1\` (5 base + 3 v1 engine
surcharge). Steps are billed one at a time as they complete, idempotently
per step; bookkeeping steps emitted when you resume a paused run are not
billed, and no trajectory/HD/prompt surcharges apply to run steps. Creating
a run requires the wallet to cover at least one step (otherwise
\`402 INSUFFICIENT_CREDITS\`); if the wallet runs dry mid-run the run fails
with \`WALLET_EXHAUSTED\` and only completed steps stay billed. Test keys
bill $0.

### POST /v1/runs

Start a run. Returns immediately with \`status: "queued"\` and a one-time
\`webhook_secret\` (only when you pass a \`webhook_url\`). Idempotency is via the
\`Idempotency-Key\` request header, not a body field.

**Request body** (unknown fields are rejected with 422)

| Field | Type | Req | Default | Notes |
| --- | --- | --- | --- | --- |
| \`machine_id\` | string | yes | - | Target machine (VM). Must be owned by your key's user. 1-128 chars. |
| \`task\` | string | yes | - | Natural-language goal. 1-16000 chars. |
| \`cua_version\` | string | no | \`v3\` | \`v1\` / \`v3\` / \`v4\`. \`v4\` requires professional+ tier. |
| \`instructions\` | string\\|null | no | null | APPENDED to the base prompt. Up to 16000 chars. |
| \`system_prompt\` | string\\|null | no | null | Custom preamble (takes priority). Up to 32000 chars. |
| \`max_steps\` | int | no | 50 | 1-1000. Clamped to the server ceiling. |
| \`deadline_seconds\` | int\\|null | no | null | 1-86400. Wall-clock budget. Clamped server-side. |
| \`on_awaiting_human\` | string | no | \`pause\` | \`pause\` / \`fail\` / \`cancel\` when a human is needed. |
| \`awaiting_human_timeout_seconds\` | int\\|null | no | null | 1-86400. How long to wait while paused. |
| \`webhook_url\` | string\\|null | no | null | HTTPS only, no userinfo. Notified on terminal + awaiting_human. |
| \`metadata\` | object\\|null | no | null | Opaque caller metadata. Max 50 keys. |

Header: \`Idempotency-Key: <up to 128 chars, [A-Za-z0-9_-:]>\` makes a retried
create safe. Reusing a key with a different body returns \`422 IDEMPOTENCY_KEY_REUSED\`.

**The Run object** (\`RunResponse\`, returned by create / get / list)

| Field | Type | Notes |
| --- | --- | --- |
| \`id\` | string | Run id. |
| \`object\` | string | Always \`"agent.run"\`. |
| \`status\` | string | \`queued\` / \`running\` / \`awaiting_human\` / \`succeeded\` / \`failed\` / \`cancelled\` / \`timed_out\`. |
| \`machine_id\` | string | The machine the agent is driving. |
| \`task\` | string | The goal you submitted. |
| \`cua_version\` | string | \`v3\` (default) or \`v4\`. |
| \`instructions\` | string\\|null | Extra guidance appended to the base prompt. |
| \`max_steps\` | int | Hard cap on agent steps. |
| \`on_awaiting_human\` | string | \`pause\` / \`fail\` / \`cancel\`. |
| \`steps_completed\` | int | Steps run so far. |
| \`credits_charged\` | int | Internal cost units (1 unit = $0.01). See \`cost_cents\` for dollars. |
| \`cost_cents\` | int | Dollar cost so far, in cents. |
| \`result\` | object\\|null | \`{ passed, status, summary, verdict? }\` once finished. |
| \`error\` | object\\|null | \`{ code, message }\` when failed. |
| \`awaiting_human_reason\` | string\\|null | Why the run paused. |
| \`metadata\` | object\\|null | The metadata you attached. |
| \`webhook_url\` | string\\|null | Where lifecycle events are POSTed. |
| \`webhook_secret\` | string\\|null | Per-run HMAC signing secret. Returned ONCE on create, null on get/list. |
| \`created_at\` | string\\|null | ISO-8601. |
| \`started_at\` | string\\|null | When the run left the queue. |
| \`awaiting_human_since\` | string\\|null | When it last paused for a human. |
| \`finished_at\` | string\\|null | When it reached a terminal state. |
| \`request_id\` | string\\|null | Id of the create request. |

**Example response** (a freshly created run):

\`\`\`json
{
  "id": "run_7a1b2c3d",
  "object": "agent.run",
  "status": "queued",
  "machine_id": "m_9f2c",
  "task": "Open the billing page and download the latest invoice as PDF",
  "cua_version": "v3",
  "instructions": null,
  "max_steps": 40,
  "on_awaiting_human": "pause",
  "steps_completed": 0,
  "credits_charged": 0,
  "cost_cents": 0,
  "result": null,
  "error": null,
  "awaiting_human_reason": null,
  "metadata": { "team": "finance" },
  "webhook_url": "https://example.com/hooks/coasty",
  "created_at": "2026-06-01T12:00:00Z",
  "started_at": null,
  "awaiting_human_since": null,
  "finished_at": null,
  "request_id": "req_4f9a2b1c",
  "webhook_secret": "whsec_one_time_value_shown_here"
}
\`\`\`

**curl**

\`\`\`bash
BASE=https://coasty.ai/v1
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
done
\`\`\`

**Python**

\`\`\`python
import os, time, requests

BASE = "https://coasty.ai/v1"
HEADERS = {"X-API-Key": os.environ["COASTY_API_KEY"]}
TERMINAL = {"succeeded", "failed", "cancelled", "timed_out"}

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
webhook_secret = run.get("webhook_secret")   # shown once; store it now

while run["status"] not in TERMINAL:
    time.sleep(2)
    run = requests.get(f"{BASE}/runs/{run_id}", headers=HEADERS, timeout=30).json()
    print(run["status"], run["steps_completed"], "steps")

print(run["result"])
\`\`\`

### GET /v1/runs

List your runs. Query params: \`status\` (filter), \`limit\` (default 20). Returns
\`{ object: "list", data: [Run...], has_more, request_id }\`.

### GET /v1/runs/{id}

Get one run by id. Returns a \`RunResponse\`.

### POST /v1/runs/{id}/cancel

Cancel an active run. Returns the run with \`status: "cancelled"\`.

### POST /v1/runs/{id}/resume

Hand control back to the agent after a human takeover. Only valid while
\`status == "awaiting_human"\`. Body: \`{ "note": "<optional, up to 2000 chars>" }\`.
After resume the run returns to \`running\`.

\`\`\`python
import os, requests

BASE = "https://coasty.ai/v1"
HEADERS = {"X-API-Key": os.environ["COASTY_API_KEY"]}
run_id = "run_7a1b"

run = requests.get(f"{BASE}/runs/{run_id}", headers=HEADERS, timeout=30).json()
if run["status"] == "awaiting_human":
    print("paused:", run["awaiting_human_reason"])
    # ... a human completes the blocking step out of band ...
    resumed = requests.post(
        f"{BASE}/runs/{run_id}/resume",
        headers=HEADERS,
        json={"note": "Solved the captcha; continue"},
        timeout=30,
    ).json()
    print(resumed["status"])         # back to "running"
\`\`\`

### GET /v1/runs/{id}/events (SSE)

Server-Sent Events stream of the run timeline. Reconnect-safe: pass
\`Last-Event-ID: <seq>\` (or \`?after=<seq>\`) to replay everything after that
sequence. Events are durable in Postgres, so a dropped connection never loses or
double-emits an event (the \`seq\` is the cursor).

Each event has \`{ seq, type, data, created_at }\` and is emitted as:

\`\`\`
id: 42
event: status
data: {"status":"running"}
\`\`\`

**Run event types**

| Type | Meaning |
| --- | --- |
| \`status\` | The run moved to a new status. |
| \`text\` | A chunk of the agent's narration. |
| \`reasoning\` | A chunk of the model's reasoning, if exposed. |
| \`tool_call\` | The agent invoked a tool (click, keypress, navigation). |
| \`tool_result\` | The result of the most recent tool call. |
| \`awaiting_human\` | The run paused and is waiting for a human. |
| \`resumed\` | Control was handed back after a takeover. |
| \`step\` | A full agent step completed; carries \`steps_completed\`. |
| \`billing\` | Incremental billing update (\`credits_charged\`, \`cost_cents\`). |
| \`error\` | A non-fatal or fatal error occurred. |
| \`done\` | Terminal event. The stream closes after this. |

\`\`\`bash
# -N disables buffering so events arrive as they happen.
# Pass Last-Event-ID (the last seq you saw) to replay after a drop.
curl -N "https://coasty.ai/v1/runs/$RUN_ID/events" \\
  -H "X-API-Key: $COASTY_API_KEY" \\
  -H "Last-Event-ID: 42"
\`\`\`

### Run state machine

\`\`\`
queued -> running -> (awaiting_human <-> running) -> succeeded | failed | cancelled | timed_out
\`\`\`

Terminal states (\`succeeded\`, \`failed\`, \`cancelled\`, \`timed_out\`) are immutable.
\`awaiting_human\` is only reached when \`on_awaiting_human == "pause"\`; with \`fail\`
or \`cancel\` the run goes straight to the corresponding terminal state.

### Webhooks

Pass a \`webhook_url\` (https only) when you create a run. Coasty POSTs a JSON
payload on lifecycle transitions. The create response returns \`webhook_secret\`
exactly once: store it, because every callback is signed with it.

**Webhook events**

| Event | Meaning |
| --- | --- |
| \`run.awaiting_human\` | The run paused and needs a human to take over. |
| \`run.succeeded\` | The run finished and verification passed. |
| \`run.failed\` | The run ended in failure (verification failed or an error). |
| \`run.cancelled\` | The run was cancelled via the cancel endpoint. |
| \`run.timed_out\` | The run breached its deadline before finishing. |

**Signature.** Each callback carries a header:

\`\`\`
Coasty-Signature: t=<unix_ts>,v1=<hex>
\`\`\`

The signed payload is \`"<t>." + raw_request_body\`. Compute
\`HMAC-SHA256(webhook_secret, signed_payload)\` as hex and compare to \`v1\` with a
constant-time compare. Reject if it does not match or \`t\` is too old.

\`\`\`python
import hashlib, hmac, os, requests

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
# ok = verify(request.body, request.headers["Coasty-Signature"], webhook_secret)
\`\`\`

---

## 5. Workflows

A workflow is a versioned JSON DSL composing many runs with branching, loops,
parallelism, asserts, retries, and human approvals. Scopes: \`workflows:read\` and
\`workflows:write\` (granted to new keys by default). DSL version: \`2026-06-01\`.

The \`definition\` is validated structurally on create and on ad-hoc start. When a
run begins, the definition is **snapshotted** into the run, so editing a workflow
never changes an in-flight run (version pinning). Updating a saved workflow bumps
its \`version\`.

**Pricing.** A workflow adds no fee of its own. Each \`task\` step executes as
a run and bills the identical per-step rate: $0.05 (5 credits) on \`v3\`/\`v4\`,
$0.08 (8 credits) on \`v1\`. Control-flow steps — \`if\`, \`assert\`, \`loop\`,
\`parallel\`, \`retry\`, \`human_approval\`, \`succeed\`, \`fail\` — are **free**.
Total spend accrues against \`budget_cents\` (0 or null = uncapped); breaching
it (or \`max_iterations\`) stops the run with \`GUARD_EXCEEDED\`. Test keys
bill $0.

### Workflow endpoints

| Method + path | Scope | Description |
| --- | --- | --- |
| \`POST /v1/workflows\` | \`workflows:write\` | Create a workflow. |
| \`GET /v1/workflows\` | \`workflows:read\` | List workflows (\`limit\`, default 20). |
| \`GET /v1/workflows/{id}\` | \`workflows:read\` | Get a workflow. |
| \`PUT /v1/workflows/{id}\` | \`workflows:write\` | Update (bumps version). |
| \`DELETE /v1/workflows/{id}\` | \`workflows:write\` | Archive a workflow. |
| \`POST /v1/workflows/{id}/runs\` | \`workflows:write\` | Start a run of a saved workflow. |
| \`POST /v1/workflows/runs\` | \`workflows:write\` | Start an ad-hoc run (inline \`definition\`). |
| \`GET /v1/workflows/runs\` | \`workflows:read\` | List workflow runs (\`workflow_id\`, \`limit\`). |
| \`GET /v1/workflows/runs/{id}\` | \`workflows:read\` | Get a workflow run. |
| \`GET /v1/workflows/runs/{id}/events\` | \`workflows:read\` | SSE stream (Last-Event-ID replay). |
| \`POST /v1/workflows/runs/{id}/cancel\` | \`workflows:write\` | Cancel a workflow run. |
| \`POST /v1/workflows/runs/{id}/resume\` | \`workflows:write\` | Approve/reject a paused step. |

Note: the static \`/runs\` subtree is declared before the dynamic \`/{workflow_id}\`
routes, so \`runs\` is never captured as a workflow id.

### POST /v1/workflows (create)

**Request body**

| Field | Type | Req | Notes |
| --- | --- | --- | --- |
| \`name\` | string | yes | 1-128 chars. |
| \`slug\` | string | yes | Stable per-account handle, matches \`^[a-z0-9][a-z0-9_-]{0,62}$\`. |
| \`definition\` | object | yes | The workflow DSL (validated server-side). |
| \`inputs_schema\` | object\\|null | no | Typed input declarations: \`{name: {type, required?, default?}}\`. |
| \`description\` | string\\|null | no | Up to 2000 chars. |
| \`metadata\` | object\\|null | no | Opaque. |

**Response** (\`WorkflowResponse\`): \`{ id, object: "workflow", name, slug,
version, dsl_version, definition, inputs_schema, description, status, metadata,
created_at, updated_at, request_id }\`.

\`PUT /v1/workflows/{id}\` accepts optional \`name\`, \`definition\`, \`inputs_schema\`,
\`description\`, \`status\` (\`active\` | \`archived\`), and \`metadata\`.

### Workflow DSL spec

The \`definition\` holds a \`steps\` array (and optional top-level \`output\`). Each
step is \`{ id, type, ... }\` where \`id\` matches \`^[A-Za-z0-9_-]{1,64}$\`.

**Step types (9)**

| Type | Shape | Description |
| --- | --- | --- |
| \`task\` | \`{ id, type, task, machine_id?, cua_version?, instructions?, system_prompt?, max_steps?, save_as?, on_awaiting_human? }\` | Run an agent task. Supports \`{{var}}\` templating. Binds its result under \`save_as\` and under the step id. |
| \`assert\` | \`{ id, type, condition, message? }\` | Fail the workflow unless the structured condition holds. |
| \`if\` | \`{ id, type, condition, then: [...], else?: [...] }\` | Branch on a structured condition. |
| \`loop\` | \`{ id, type, (count: int \\| while: condition), body: [...], max_iterations? }\` | Repeat a body a fixed number of times or while a condition holds. |
| \`parallel\` | \`{ id, type, branches: [[...], [...]] }\` | Run independent branches concurrently. |
| \`human_approval\` | \`{ id, type, message?, timeout_seconds? }\` | Pause for a human to approve or reject before continuing. |
| \`retry\` | \`{ id, type, body: [...], max_attempts: int }\` | Retry a body up to \`max_attempts\` times on failure. |
| \`succeed\` | \`{ id, type, output?: {} }\` | Finish the workflow successfully with an optional output. |
| \`fail\` | \`{ id, type, message? }\` | Finish the workflow as failed with an optional message. |

**Structured conditions (13 ops, injection-safe, no free-text eval)**

| Op | Shape | Meaning |
| --- | --- | --- |
| \`eq\` / \`ne\` | \`{ op, left, right }\` | Equal / not equal. |
| \`lt\` / \`gt\` / \`lte\` / \`gte\` | \`{ op, left, right }\` | Ordered numeric comparison. |
| \`contains\` | \`{ op, left, right }\` | \`left\` contains \`right\` (substring or membership). |
| \`truthy\` / \`falsy\` / \`exists\` | \`{ op, value }\` | Test a single value for truthiness, falsiness, or presence. |
| \`and\` / \`or\` | \`{ op, conditions: [...] }\` | Combine several conditions. |
| \`not\` | \`{ op, condition }\` | Negate a condition. |

**Variable references** \`{{path}}\` resolve dotted paths into \`{inputs, vars,
<save_as>}\`:

- \`{{inputs.x}}\` reads a bound input value.
- \`{{vars.y}}\` reads a workflow variable.
- \`{{stepId.field}}\` reads a prior task's result. A \`task\` binds:
  \`{ status, passed, result, run_id, steps, error }\`. For a step saved as
  \`invoice\` you can reference \`{{invoice.passed}}\` or \`{{invoice.result}}\`.

**Hard guards** (set when starting a run, enforced during execution)

- \`budget_cents\`: total spend cap across all task steps (0 or null = unlimited).
- \`max_iterations\`: cap on total loop iterations consumed.
- \`deadline_seconds\`: wall-clock budget for the whole workflow run.

**Validation limits** (enforced at create / ad-hoc time)

| Limit | Rule |
| --- | --- |
| Max steps | At most 200 steps total (counting every nested step). |
| Max nesting depth | Steps nest at most 8 levels deep (if/loop/parallel/retry bodies). |
| Parallel branches | A \`parallel\` step takes at most 16 branches; they run concurrently. |
| Retry attempts | \`retry.max_attempts\` is an integer from 1 to 20. |
| Parallel contents | \`human_approval\`, \`succeed\`, and \`fail\` are not allowed inside a parallel branch. |
| save_as name | \`save_as\` must not be \`"inputs"\` or \`"vars"\` (reserved namespaces). |

**Complete example DSL** (task -> assert -> if/branch):

\`\`\`json
{
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
      "condition": { "op": "truthy", "value": "{{invoice.passed}}" },
      "message": "Agent failed to read the invoice"
    },
    {
      "id": "branch",
      "type": "if",
      "condition": { "op": "contains", "left": "{{invoice.result}}", "right": "PAID" },
      "then": [{ "id": "ok", "type": "succeed", "output": { "state": "paid" } }],
      "else": [{ "id": "no", "type": "fail", "message": "Invoice not marked paid" }]
    }
  ],
  "output": { "paid": "{{invoice.result}}" }
}
\`\`\`

### Starting a workflow run

\`POST /v1/workflows/{id}/runs\` (saved) or \`POST /v1/workflows/runs\` (ad-hoc with
an inline \`definition\`).

**Request body** (\`StartWorkflowRunRequest\`)

| Field | Type | Req | Notes |
| --- | --- | --- | --- |
| \`inputs\` | object\\|null | no | Bound input values, available as \`{{inputs.*}}\`. |
| \`machine_id\` | string\\|null | no | Default machine for task steps that omit their own. |
| \`budget_cents\` | int\\|null | no | Spend cap, 0-10000000 (0/null = unlimited). |
| \`max_iterations\` | int\\|null | no | 1-100000. |
| \`deadline_seconds\` | int\\|null | no | 1-86400. |
| \`webhook_url\` | string\\|null | no | Lifecycle callbacks. |
| \`metadata\` | object\\|null | no | Opaque. |
| \`definition\` | object\\|null | no | For ad-hoc runs without a saved workflow. |
| \`inputs_schema\` | object\\|null | no | For ad-hoc runs. |

Supports the \`Idempotency-Key\` header (same semantics as runs).

**The Workflow Run object** (\`WorkflowRunResponse\`)

| Field | Type | Notes |
| --- | --- | --- |
| \`id\` | string | Workflow-run id. |
| \`object\` | string | Always \`"workflow.run"\`. |
| \`status\` | string | \`queued\` / \`running\` / \`awaiting_human\` / \`succeeded\` / \`failed\` / \`cancelled\` / \`timed_out\`. |
| \`workflow_id\` | string\\|null | The workflow this run belongs to (null for inline runs). |
| \`workflow_version\` | int\\|null | Version of the definition that ran. |
| \`machine_id\` | string\\|null | Default machine for task steps. |
| \`inputs\` | object | The inputs you passed in. |
| \`output\` | object\\|null | Produced by a \`succeed\` step. |
| \`error\` | object\\|null | \`{ code, message }\` when failed. |
| \`awaiting_human_reason\` | string\\|null | Why the run paused. |
| \`awaiting_step_id\` | string\\|null | The step id awaiting approval. |
| \`iterations_used\` | int | Loop iterations consumed. |
| \`spent_cents\` | int | Total spend so far (USD cents). |
| \`budget_cents\` | int | Spend cap (0 = unlimited). |
| \`webhook_url\` | string\\|null | Lifecycle callbacks. |
| \`webhook_secret\` | string\\|null | Returned once on create. |
| \`metadata\` | object\\|null | Opaque. |
| \`created_at\` / \`started_at\` / \`finished_at\` | string\\|null | Timestamps. |
| \`request_id\` | string\\|null | Id of the create request. |

\`resume\` body (\`POST /v1/workflows/runs/{id}/resume\`):
\`{ "approved": true, "note": "<optional>" }\`. \`approved: false\` rejects (fails)
the pending \`human_approval\` step.

**Example workflow run response:**

\`\`\`json
{
  "id": "wfr_5e6f7a8b",
  "object": "workflow.run",
  "status": "running",
  "workflow_id": "wf_1a2b3c",
  "workflow_version": 3,
  "machine_id": "m_9f2c",
  "inputs": { "order_id": "ord_4821" },
  "output": null,
  "error": null,
  "awaiting_human_reason": null,
  "awaiting_step_id": null,
  "iterations_used": 0,
  "spent_cents": 0,
  "budget_cents": 500,
  "created_at": "2026-06-01T12:00:00Z",
  "started_at": "2026-06-01T12:00:01Z",
  "finished_at": null,
  "request_id": "req_9c8b7a6d"
}
\`\`\`

**curl: create a workflow, then start a run**

\`\`\`bash
BASE=https://coasty.ai/v1
AUTH="X-API-Key: $COASTY_API_KEY"

# 1. Create a workflow: a task step, an assert, then an if/branch.
WF_ID=$(curl -s "$BASE/workflows" -H "$AUTH" \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "Invoice reconciliation",
    "slug": "invoice-reconcile",
    "inputs_schema": {"type": "object", "properties": {"order_id": {"type": "string"}}},
    "definition": {
      "steps": [
        {"id": "fetch", "type": "task", "task": "Open order {{inputs.order_id}} and read the invoice total", "save_as": "invoice"},
        {"id": "check", "type": "assert", "condition": {"op": "truthy", "value": "{{invoice.passed}}"}, "message": "Agent failed to read the invoice"},
        {"id": "branch", "type": "if", "condition": {"op": "contains", "left": "{{invoice.result}}", "right": "PAID"},
         "then": [{"id": "ok", "type": "succeed", "output": {"state": "paid"}}],
         "else": [{"id": "no", "type": "fail", "message": "Invoice not marked paid"}]}
      ]
    }
  }' | python -c "import sys,json;print(json.load(sys.stdin)['id'])")

# 2. Start a run of the saved workflow.
curl -s "$BASE/workflows/$WF_ID/runs" -H "$AUTH" \\
  -H "Content-Type: application/json" \\
  -d '{"inputs": {"order_id": "ord_4821"}, "machine_id": "m_9f2c", "budget_cents": 500}'
\`\`\`

**Python**

\`\`\`python
import os, requests

BASE = "https://coasty.ai/v1"
HEADERS = {"X-API-Key": os.environ["COASTY_API_KEY"]}

definition = {
    "steps": [
        {"id": "fetch", "type": "task", "save_as": "invoice",
         "task": "Open order {{inputs.order_id}} and read the invoice total"},
        {"id": "check", "type": "assert",
         "condition": {"op": "truthy", "value": "{{invoice.passed}}"},
         "message": "Agent failed to read the invoice"},
        {"id": "branch", "type": "if",
         "condition": {"op": "contains", "left": "{{invoice.result}}", "right": "PAID"},
         "then": [{"id": "ok", "type": "succeed", "output": {"state": "paid"}}],
         "else": [{"id": "no", "type": "fail", "message": "Invoice not marked paid"}]},
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
print(run["id"], run["status"])
\`\`\`

Workflow run events stream the same way as run events
(\`GET /v1/workflows/runs/{id}/events\`, Last-Event-ID replay).

---

## Local automation — automate ANY screen (no VM required)

\`/v1/predict\`, \`/v1/ground\` and \`/v1/sessions\` are **screen-agnostic**: a
screenshot goes in, coordinates and typed actions come out. The pixels can come
from anywhere — the user's own desktop, a Playwright/Puppeteer browser page, an
Android emulator (\`adb exec-out screencap\`), a VNC/RDP framebuffer, a Citrix
window. Coasty-managed VMs (\`/v1/machines\`) are one execution target, not the
only one. To automate locally you write a small loop: capture → predict →
execute → repeat.

### The local agent loop (your own desktop)

\`\`\`python
# pip install requests mss pyautogui pillow
import base64, io, time, uuid, requests, mss, pyautogui
from PIL import Image

API, HDRS = "https://coasty.ai/v1", {"X-API-Key": "sk-coasty-test-..."}
pyautogui.FAILSAFE = True                    # mouse to a corner aborts instantly

REAL_W, REAL_H = pyautogui.size()            # actual desktop resolution
SEND_W, SEND_H = 1280, 720                   # what the model sees (SD = 1 credit cheaper)
SX, SY = REAL_W / SEND_W, REAL_H / SEND_H    # scale model coords -> real pixels

def screenshot_b64():
    with mss.mss() as sct:
        shot = sct.grab(sct.monitors[1])
        img = Image.frombytes("RGB", shot.size, shot.bgra, "raw", "BGRX")
        img = img.resize((SEND_W, SEND_H))   # MUST match screen_width/height below
        buf = io.BytesIO(); img.save(buf, format="PNG")
        return base64.b64encode(buf.getvalue()).decode()

def execute(a):
    t, p = a["action_type"], a["params"]
    if t == "click":      pyautogui.click(p["x"]*SX, p["y"]*SY, clicks=p.get("clicks",1), button=p.get("button","left"))
    elif t == "type_text": pyautogui.write(p["text"], interval=0.02)
    elif t == "key_press": pyautogui.press(p["keys"])
    elif t == "key_combo": pyautogui.hotkey(*p["keys"])
    elif t == "scroll":    pyautogui.scroll(p["clicks"])      # +clicks = up (pyautogui convention)
    elif t == "drag":      pyautogui.moveTo(p["x1"]*SX, p["y1"]*SY); pyautogui.dragTo(p["x2"]*SX, p["y2"]*SY, duration=0.4)
    elif t == "wait":      time.sleep(p["seconds"])
    return t

sess = requests.post(f"{API}/sessions", headers=HDRS, json={
    "cua_version": "v3", "screen_width": SEND_W, "screen_height": SEND_H,
    "instructions": "Click the visual center of elements. If the target is not visible, scroll toward it, never guess.",
}).json()
sid = sess["session_id"]

task = "Open the calculator and compute 42 * 17"
try:
    for step in range(25):
        r = requests.post(f"{API}/sessions/{sid}/predict",
            headers={**HDRS, "Idempotency-Key": f"step-{sid}-{step}-{uuid.uuid4().hex[:8]}"},
            json={"screenshot": screenshot_b64(), "instruction": task}, timeout=120).json()
        for a in r["actions"]:
            if execute(a) in ("done", "fail"):
                raise SystemExit(f"finished: {r['status']} - {r['reasoning']}")
        if r["status"] != "continue": break
        time.sleep(0.5)
finally:
    requests.delete(f"{API}/sessions/{sid}", headers=HDRS)   # free the concurrency slot (sessions have no per-minute cost)
\`\`\`

For a browser, use a fixed 1280x720 Playwright viewport so coordinates map 1:1
(\`page.screenshot()\` in, \`page.mouse.click(x, y)\` out — no scaling at all).
For Android: \`adb exec-out screencap -p\` in, \`adb shell input tap x y\` out.

### Coordinate scaling — the #1 pitfall

Coordinates come back **in the same space as the screenshot you sent**. If you
downscale (e.g. a 2560x1440 desktop resized to 1280x720 to save a credit),
multiply returned x/y by your scale factor before clicking — and pass the
DOWNSCALED size as \`screen_width\`/\`screen_height\`. Sending full resolution
with the real width/height also works (coordinates map 1:1) and costs +1 credit
above 1280x720. A mismatched screenshot vs \`screen_width\`/\`screen_height\` is
the number-one cause of "it clicks the wrong place".

### Executing every action type locally

| action_type | params | desktop (pyautogui) | browser (Playwright) |
| --- | --- | --- | --- |
| \`click\` | x, y, button?=left, clicks?=1 | \`pyautogui.click(x, y, clicks, button)\` | \`page.mouse.click(x, y, {button, clickCount})\` |
| \`type_text\` | text | \`pyautogui.write(text, interval=0.02)\` | \`page.keyboard.type(text, {delay: 20})\` |
| \`key_press\` | keys (in order) | \`pyautogui.press(keys)\` | \`page.keyboard.press(...)\` per key |
| \`key_combo\` | keys (held together) | \`pyautogui.hotkey(*keys)\` | \`page.keyboard.press("Control+C")\` |
| \`scroll\` | clicks (+up / −down), direction?, x?, y? | \`pyautogui.scroll(clicks)\` / \`hscroll\` | \`page.mouse.wheel(0, -clicks * 120)\` |
| \`drag\` | x1, y1, x2, y2, button? | \`moveTo(x1,y1); dragTo(x2,y2)\` | \`mouse.move/down/move/up\` |
| \`wait\` | seconds | \`time.sleep(seconds)\` | \`page.waitForTimeout(s * 1000)\` |
| \`done\` | — | task finished — stop the loop | same |
| \`fail\` | — | agent blocked — stop, read \`reasoning\` | same |
| \`raw\` | code (pyautogui source) | log it; exec only in a sandbox you trust | never exec in a browser target |

### Prompt presets (best-suggestion \`instructions\` values)

\`instructions\` is APPENDED to the tuned base agent prompt (unlike
\`system_prompt\`, which replaces it — prefer \`instructions\`). Custom prompts
require Starter or higher; budgets are Starter 2,000 / Pro 4,000 / Enterprise
16,000 chars, +1 credit per call when over 500 chars. Pass a preset on session
create (applies to every step) or per predict call. The presets:

* **Precise UI control** (default pick): "Be precise. Before clicking, confirm the target element is actually visible in the CURRENT screenshot — never click from memory of a previous screen. Click the visual center of elements, not their edges. If the element you need is not visible, scroll toward where it should be instead of guessing coordinates. If two elements look similar, prefer the one whose text matches the task exactly. After typing into a field, verify focus landed in the right field before continuing."
* **Forms & data entry**: "You are doing data entry. Prefer keyboard navigation (Tab between fields, Enter to submit) over clicking when a form has focus. Clear a field (ctrl+a then type) before entering a new value — never append to stale text. Enter values EXACTLY as given in the task: do not reformat dates, trim IDs, or autocorrect spellings. After filling each field, confirm the screenshot shows the value you typed. Do not submit the form until every required field is verified filled."
* **QA & regression testing**: "You are executing a QA test step. Follow the instruction literally — do NOT improvise workarounds when the UI misbehaves; surfacing the failure is the point. If an expected element is missing, a button is disabled, or an error/dialog appears that the task does not mention, stop and emit fail() with what you observed. Wait for loading indicators to finish before asserting anything. If warnings or console-style error text appear, stop and fail() with what you see."
* **Read & extract**: "Your goal is to READ information from the screen, not to change anything. Interact only to reveal the data (scroll, switch tabs, expand rows) — never edit, submit, or delete. When you can see the requested information, write the extracted values verbatim as plain text before your code block — for this task that text IS the deliverable and overrides the code-only response format — exactly as rendered on screen including units and punctuation, then emit done(). If the data spans multiple screens, scroll through all of it before finishing."
* **Cautious (non-destructive)**: "Operate in non-destructive mode. NEVER click buttons that delete, remove, purchase, pay, send, post, publish, or permanently change state — if completing the task requires one, stop and emit fail() explaining which action needs human approval. Never enter credentials, 2FA codes, or payment details even if a login wall appears: fail() and describe the prompt instead. Dismissing cookie banners and closing popups is allowed. When in doubt about whether an action is reversible, do not take it."
* **Fast batch mode**: "This is a repetitive batch task on a UI you have already seen. You may chain click field, type value, Tab in one step here: the usual one-state-change rule is relaxed on this stable UI. Skip re-verifying elements that were stable in previous screenshots. Still stop immediately if the screen layout changes unexpectedly, an error appears, or a click lands on the wrong element — batch speed never justifies compounding a mistake."

### Local-run safety

You are giving a model control of a real mouse and keyboard. Keep
\`pyautogui.FAILSAFE\` on (mouse to a corner aborts), run with a step cap, send
an \`Idempotency-Key\` on every predict so a network retry can never
double-execute a step, and use the Cautious preset when the screen can reach
anything irreversible. Develop against a \`sk-coasty-test-*\` key (free) and
switch to live when the loop is stable.

---

## 6. Reference

### Action types

Every action type the model can return in \`actions\`:

| Type | Params | Description |
| --- | --- | --- |
| \`click\` | \`{ x, y }\` | Single left click at the pixel coordinate. |
| \`type_text\` | \`{ text }\` | Type a literal string at the current focus. |
| \`key_press\` | \`{ key }\` | Press one key, e.g. \`"enter"\`, \`"tab"\`, \`"escape"\`. |
| \`key_combo\` | \`{ keys: [..] }\` | Press a chord, e.g. \`["ctrl", "c"]\` or \`["cmd", "v"]\`. |
| \`scroll\` | \`{ x, y, direction, amount }\` | Scroll up/down/left/right at a position. |
| \`drag\` | \`{ from_x, from_y, to_x, to_y }\` | Press, move, and release between two points. |
| \`move\` | \`{ x, y }\` | Move the cursor without clicking. |
| \`wait\` | \`{ ms }\` | Pause before the next step (e.g. for a page load). |
| \`done\` | \`{}\` | The task is complete. \`status\` becomes \`"done"\`. |
| \`fail\` | \`{ reason? }\` | The task is impossible. \`status\` becomes \`"fail"\`. |

### Error envelope

Every error, on every endpoint, returns the same JSON shape with the HTTP
status set accordingly. The body is always wrapped in an \`error\` object:

\`\`\`json
{
  "error": {
    "code": "INSUFFICIENT_CREDITS",
    "message": "Operation needs 20 credits; you have 5.",
    "type": "billing_error",
    "request_id": "req_8f2c1e9a",
    "suggestion": "Top up at https://coasty.ai/credits, or switch to a sandbox key 'sk-coasty-test-...' for free testing.",
    "docs_url": "https://coasty.ai/api-docs#errors",
    "required": 20,
    "balance": 5
  }
}
\`\`\`

Field reference (every error carries the first four; the rest are conditional):

- \`code\`: machine-readable, stable across versions. Branch your logic on this,
  never on \`message\`.
- \`message\`: human-readable, may change between versions. Do not parse it.
- \`type\`: coarse telemetry category (\`auth_error\`, \`billing_error\`,
  \`validation_error\`, \`not_found_error\`, \`state_error\`, \`rate_limit_error\`,
  \`server_error\`).
- \`request_id\`: also returned as the \`X-Coasty-Request-Id\` header. Quote it to
  support.
- \`suggestion\`: a concrete next step (auto-filled per code). LLM agents can act
  on this to self-recover.
- \`docs_url\`: deep link to the matching docs anchor (also sent as
  \`Link: <url>; rel="help"\`).
- \`support\`: \`founders@coasty.ai\`, attached only on 5xx and a few ambiguous 4xx.
- Context extras: code-specific fields such as \`required_scope\`,
  \`current_scopes\`, \`required\`, \`balance\`, \`retry_after\`, \`valid_options\`,
  \`examples\`, \`details\`, \`current_state\`, \`allowed_from\`. Use these to
  auto-correct.

### Full error catalog

| Status | Code | Cause | Fix |
| --- | --- | --- | --- |
| 401 | \`INVALID_API_KEY\` | Key missing, malformed, revoked, or \`Bearer \` pasted into \`X-API-Key\`. Also sends \`WWW-Authenticate\`. | Send a raw \`sk-coasty-live-\`/\`sk-coasty-test-\` key in \`X-API-Key\`, or \`Authorization: Bearer <key>\`. |
| 403 | \`INSUFFICIENT_SCOPE\` | Key is valid but lacks the scope this route needs. Body has \`required_scope\` + \`current_scopes\`. | Re-mint the key with the missing scope, or call an endpoint your scopes allow. |
| 402 | \`INSUFFICIENT_CREDITS\` | Prepaid USD wallet can't cover this request. Body has \`required\` + \`balance\`. | Top up at https://coasty.ai/credits, or use a \`sk-coasty-test-\` key (free). |
| 402 | \`WALLET_EXHAUSTED\` | Wallet ran dry mid-run; the run stopped at the step in \`message\`. Completed steps were already billed. | Top up, then start a new run. |
| 422 | \`VALIDATION_ERROR\` | A request field failed validation. \`error.details\` (loc) names the field path + expected type. | Fix the named field and retry. |
| 422 | \`INVALID_SCREENSHOT\` | \`screenshot\` is not decodable base64 (often a \`data:...;base64,\` prefix or embedded newlines). | Strip the \`data:\` prefix and whitespace; send raw base64. |
| 413 | \`PAYLOAD_TOO_LARGE\` | Body exceeds the cap (CUA screenshot endpoints accept up to 10 MB of base64). | Downscale or JPEG-compress the screenshot, or split the work. |
| 400 | \`INVALID_LIMIT\` | A \`limit\` query param is outside \`1..200\`. Body has \`actual\`, \`min\`, \`max\`. | Pass \`1 <= limit <= 200\` (default 50), or omit the param. |
| 400 | \`INVALID_STATUS_FILTER\` | A \`status\` filter value is not a recognized state. Body lists \`valid_options\`. | Use a value from \`valid_options\` or omit \`?status=\`. |
| 404 | \`NOT_FOUND\` / \`MACHINE_NOT_FOUND\` / \`RUN_NOT_FOUND\` / \`WORKFLOW_NOT_FOUND\` / \`SESSION_NOT_FOUND\` | Id does not exist in this key's namespace. Ids are mode-isolated: a test key cannot see live resources and vice-versa. | Verify the id with the matching \`GET\` listing endpoint, using a key of the same kind. |
| 409 | \`NOT_AWAITING_HUMAN\` | You tried to resume a run that is not in \`awaiting_human\`. | Re-GET the run; resume only while \`status == "awaiting_human"\`. |
| 409 | \`RESUME_CONFLICT\` | Another resume/cancel/timeout won the race. | Re-GET the run to read its current status, then retry. |
| 409 | \`IDEMPOTENCY_KEY_REUSED\` | Same \`Idempotency-Key\` sent with a different body. | Resend the original body to get the cached result, or use a new key. |
| 409 | \`INVALID_STATE\` | A lifecycle action is illegal in the resource's current state. Body has \`current_state\` + \`allowed_from\`. | Check the state first (actions need \`running\`; provisioning is async), then retry. |
| 400 | \`FEATURE_NOT_AVAILABLE\` | The feature is gated to a higher tier (e.g. \`v4\` on free/starter, custom prompts on free). | Upgrade your plan or use an available alternative. |
| 500 | \`INTERNAL_ERROR\` | An unexpected server-side failure. | Retry; if it persists, file a ticket with the \`request_id\`. |
| 500 | \`PREDICTION_FAILED\` / \`GROUNDING_FAILED\` | The model call failed. The charge is automatically refunded. | Retry; for grounding, send a clearer or higher-resolution screenshot. |
| 504 | \`UPSTREAM_TIMEOUT\` | An upstream provisioning service timed out. | Add an \`Idempotency-Key\` and retry; if the original succeeded, the retry is a no-op. |
| 503 | \`UPSTREAM_UNAVAILABLE\` | An upstream service is briefly unavailable. | Retry with backoff; check https://status.coasty.ai. |

Errors that are transient (\`UPSTREAM_TIMEOUT\`, \`UPSTREAM_UNAVAILABLE\`) carry a
\`Retry-After\` header (and a \`retry_after\` body field) — honor it before retrying.

### Per-tier features

API tiers are derived from your subscription. \`v4\` requires professional tier
or above. Custom prompts (\`system_prompt\` + \`instructions\`) are gated by
\`max_system_prompt_chars\` per tier: free 0 (unavailable), starter 2000,
professional 4000, enterprise 16000.

### Scopes

Scopes are deny-by-default; each route asserts the scope it requires. Naming is
\`<resource>:<verb>\` (\`read\` / \`write\` / \`exec\`).

| Scope | Grants |
| --- | --- |
| \`predict\` | \`POST /v1/predict\`. |
| \`session\` | All \`/v1/sessions\` endpoints. |
| \`ground\` | \`POST /v1/ground\`. |
| \`parse\` | \`POST /v1/parse\`. |
| \`keys\` | List/revoke your own keys via the API. |
| \`usage\` | Read the usage summary. |
| \`runs:read\` | List, get, and stream events of your runs. |
| \`runs:write\` | Start, cancel, and resume (human takeover) runs. |
| \`workflows:read\` | List/get workflows and workflow runs. |
| \`workflows:write\` | Create/update/delete workflows and start workflow runs. |
| \`machines:read\` | List, get, status, screenshot of machines. |
| \`machines:write\` | Provision, start, stop, terminate machines. |
| \`actions:exec\` | \`POST /actions\`, \`/actions/batch\`, browser ops. |
| \`terminal:exec\` | \`POST /terminal\` (arbitrary shell). |
| \`files:read\` / \`files:write\` | File read/list/exists; write/edit/append/delete. |
| \`browser:execute\` | \`browser_execute\` (arbitrary JS). |
| \`snapshots:write\` | Create + delete snapshots. |
| \`connection:read\` | SSH key + VNC password (high-risk). |
| \`schedules:read\` / \`schedules:write\` | List/get; create/update/delete/run-now schedules. |
| \`triggers:write\` | Add/remove webhook + email + chain triggers. |

Default scopes on a new key: \`predict\`, \`session\`, \`ground\`, \`parse\`,
\`machines:read\`, \`actions:exec\`, \`files:read\`, \`runs:read\`, \`runs:write\`,
\`workflows:read\`, \`workflows:write\`. Elevated scopes (\`terminal:exec\`,
\`files:write\`, \`browser:execute\`, \`connection:read\`, \`snapshots:write\`) are
requested explicitly at key creation.

### Pricing (USD)

1 credit = 1 cent = $0.01, exactly. All charges debit your prepaid developer
wallet, are taken before execution, and are refunded automatically on failure.
Test keys (\`sk-coasty-test-*\`) never bill anything, anywhere.

**Per-request (inference)**

| Endpoint | Cost | Note |
| --- | --- | --- |
| \`POST /v1/predict\` | $0.05 (5 cr) | Stateless prediction. Surcharges below apply. |
| \`POST /v1/sessions\` | $0.10 (10 cr) | One-time at creation; no surcharges. |
| \`POST /v1/sessions/{id}/predict\` | $0.04 (4 cr) | Each step inside a session. Surcharges below apply. |
| \`POST /v1/ground\` | $0.03 (3 cr) | Coordinate grounding; +$0.01 if the image is HD. |
| \`POST /v1/parse\` | Free | Deterministic, no model call. |
| Session reset / get / list / delete | Free | Sessions have no per-minute cost. |
| \`GET /v1/models\`, \`GET /v1/usage\`, \`/v1/keys\` | Free | |

**Surcharges** (exact amounts, added per inference request):

- +$0.02 (2 cr) per trajectory screenshot beyond the current one.
- +$0.01 (1 cr) per HD image. An image is HD when width > 1280 **or**
  height > 720, strictly — exactly 1280x720 is NOT HD. The fee applies to the
  current screenshot and to every trajectory screenshot.
- +$0.03 (3 cr) per request on the \`v1\` engine; \`v3\` and \`v4\` add $0.
- +$0.01 (1 cr) when \`system_prompt\` is longer than 500 characters (exactly
  500 chars is free).

**Runs & workflows (per agent step)**

| Item | Cost | Note |
| --- | --- | --- |
| Run step on \`v3\` / \`v4\` | $0.05/step (5 cr) | Billed after each completed step; no trajectory/HD/prompt surcharges on run steps. |
| Run step on \`v1\` | $0.08/step (8 cr) | 5 cr base + 3 cr v1 engine surcharge. |
| Workflow \`task\` step | Same as a run step | $0.05 on v3/v4, $0.08 on v1; total capped by \`budget_cents\`. |
| Workflow control-flow steps (\`if\`, \`assert\`, \`loop\`, \`parallel\`, \`retry\`, \`human_approval\`, \`succeed\`, \`fail\`) | Free | Only \`task\` steps bill. |

Starting a run requires your wallet to cover at least one step ($0.05, or
$0.08 on \`v1\`) — otherwise \`402 INSUFFICIENT_CREDITS\`. If the wallet runs dry
mid-run, the run fails with \`WALLET_EXHAUSTED\`; completed steps stay billed.

**Machines (runtime — metered per minute, hourly rates)**

| State | Cost | Note |
| --- | --- | --- |
| Running — Linux | $0.05/hr (5 cr/hr) | Also billed while starting / stopping / restarting. |
| Running — Windows | $0.09/hr (9 cr/hr) | |
| Stopped / suspended | $0.01/hr (1 cr/hr) | Storage-only rate, any OS. |
| Creating / error / terminated | Free | Provisioning time is never billed. |
| \`POST /v1/machines/{id}/snapshot\` | $0.01 (1 cr) | One-time; refunded if the snapshot fails. |
| Actions, batches, terminal, browser ops, files, screenshots, start/stop/restart, connection, list/get/delete | Free per call | Covered by the runtime rate. |

Runtime is billed in whole credits, rounded down in your favor (partial
credits are never billed). Provisioning requires a wallet balance of at least
$0.20 (20 credits) — a gate, not a fee. An empty wallet **stops** the machine
(never destroys it) and flags it \`suspended_for_billing\`; top up and start it
again. The live price table is also served at \`GET /v1/machines/pricing\`.

**Schedules & triggers**

| Item | Cost | Note |
| --- | --- | --- |
| Create schedule / run-now / webhook fire | Free — gate only | Requires a $0.20 (20 cr) wallet minimum; there is no per-fire fee. |
| Scheduled execution | 10 Coasty credits per minute of agent runtime | Billed to your account credit balance (the consumer balance, NOT this API wallet); 20-credit minimum to start, 6-hour session cap. |
| Test schedules (\`sch_test_*\`) | Free | Synthetic runs; \`credits_charged: 0\`. |

The wallet is a prepaid USD balance; top up in the developer dashboard.

### MCP server

Connect Coasty to an MCP-capable client (for example, Claude or an IDE agent)
with the official server:

\`\`\`bash
npx -y @coasty/mcp
\`\`\`

Set \`COASTY_API_KEY\` in the environment; the MCP server exposes the same
endpoints documented above as tools.

---

## 7. Machines API

A machine is a cloud VM you own. Provision one, drive it with low-level actions
(click, type, terminal, browser, files), snapshot it, and tear it down. A
machine id is the \`machine_id\` you pass to runs, workflows, and schedules.

A machine id is either a UUID (live machines) or \`mch_test_<8-32 hex>\` (sandbox
machines from a test key). Ids are mode-isolated: a test key never sees live
machines and a live key never sees test machines.

**Sandbox shortcut.** A test key (\`sk-coasty-test-\`) returns a mock VM
**instantly** with no AWS provisioning, no wallet billing, and an
\`mch_test_*\` id. Use it to build and test the full action surface for free.
Live provisioning needs the \`machines:write\` scope and a minimum wallet
balance of $0.20 (20 credits) — a pre-flight gate, not a fee.

**Runtime billing.** A live machine bills your API wallet by state, metered
per minute and always rounded down in your favor:

| State | Rate |
| --- | --- |
| Running — Linux (incl. starting/stopping/restarting) | $0.05/hr (5 credits/hr) |
| Running — Windows | $0.09/hr (9 credits/hr) |
| Stopped / suspended (any OS — storage only) | $0.01/hr (1 credit/hr) |
| Creating / error / terminated | Free |

Every per-call operation on a machine — actions, batches, terminal, browser
ops, files, screenshots, start/stop/restart, connection details — is
**free**; you pay only the hourly runtime rate (plus $0.01 one-time for a
snapshot). If your wallet runs dry the machine is **stopped, never
destroyed**, and flagged \`suspended_for_billing\`; top up and start it again.
To bound spend, set \`ttl_minutes\` at provision time (5 minutes to 7 days):
the machine auto-terminates at \`created_at + ttl_minutes\`, ending all
billing. Extend or clear the TTL any time via \`PATCH /v1/machines/{id}\`.
The same numbers are served machine-readably at \`GET /v1/machines/pricing\`.

### Machine endpoints + scopes

| Method + path | Scope | Description |
| --- | --- | --- |
| \`POST /v1/machines\` | \`machines:write\` | Provision a VM. Honors \`Idempotency-Key\`. |
| \`GET /v1/machines\` | \`machines:read\` | List your machines (\`limit\`, 1-200, default 50). |
| \`GET /v1/machines/pricing\` | \`machines:read\` | The runtime + one-time price table (machine-readable). |
| \`GET /v1/machines/{id}\` | \`machines:read\` | Get one machine. |
| \`DELETE /v1/machines/{id}\` | \`machines:write\` | Terminate a machine. |
| \`POST /v1/machines/{id}/start\` | \`machines:write\` | Start a stopped machine. |
| \`POST /v1/machines/{id}/stop\` | \`machines:write\` | Stop a running machine. |
| \`POST /v1/machines/{id}/restart\` | \`machines:write\` | Restart a machine (billed at the running rate throughout). |
| \`PATCH /v1/machines/{id}\` | \`machines:write\` | Update the auto-destroy TTL (\`ttl_minutes\`: 5-10080 from now, 0 clears). |
| \`POST /v1/machines/{id}/snapshot\` | \`snapshots:write\` | Snapshot the disk. Honors \`Idempotency-Key\`. |
| \`GET /v1/machines/{id}/screenshot\` | \`machines:read\` | Capture the screen as base64. |
| \`GET /v1/machines/{id}/connection\` | \`connection:read\` | SSH key + VNC password + ports (HIGH-RISK). |
| \`POST /v1/machines/{id}/actions\` | varies by command | Run one action (click, type, scroll, terminal, file, browser). |
| \`POST /v1/machines/{id}/actions/batch\` | varies by command | Run up to 50 actions in order. |
| \`POST /v1/machines/{id}/browser/{op}\` | \`actions:exec\` (\`browser:execute\` for raw JS) | Browser convenience wrapper. |
| \`POST /v1/machines/{id}/terminal\` | \`terminal:exec\` | Run a shell command (PowerShell on Windows, bash on Unix). |
| \`POST /v1/machines/{id}/files/{op}\` | \`files:read\` or \`files:write\` | File operations. |

Per-command scopes on \`/actions\`: \`terminal_*\` needs \`terminal:exec\`;
\`file_read\`/\`file_exists\`/\`directory_list\`/\`file_download\`/\`file_list_downloads\`
need \`files:read\`; \`file_write\`/\`file_edit\`/\`file_append\`/\`file_delete\`/\`directory_delete\`
need \`files:write\`; \`browser_execute\` (arbitrary JS) needs \`browser:execute\`;
everything else needs \`actions:exec\`.

### POST /v1/machines (provision)

**Request body**

| Field | Type | Req | Default | Notes |
| --- | --- | --- | --- | --- |
| \`display_name\` | string | yes | - | 1-64 chars. Shown in dashboards. |
| \`os_type\` | string | no | \`linux\` | \`linux\` or \`windows\`. |
| \`desktop_enabled\` | bool | no | false | Install XFCE + VNC for a GUI desktop. |
| \`provider\` | string | no | \`auto\` | \`aws\` / \`azure\` / \`auto\`. |
| \`cpu_cores\` | int\\|null | no | null | 1-16, capped to your tier. |
| \`memory_gb\` | int\\|null | no | null | 1-64, capped to your tier. |
| \`storage_gb\` | int\\|null | no | null | 8-500. |
| \`restore_from_snapshot\` | bool\\|null | no | false | Restore your latest snapshot (Linux only). |
| \`ttl_minutes\` | int\\|null | no | null | 5-10080 (5 min - 7 days). Auto-terminate at \`created_at + ttl_minutes\`, ending runtime billing. |
| \`metadata\` | object\\|null | no | null | Free-form string tags (max 16 entries). |

Pass \`Idempotency-Key: <up to 128 chars, [A-Za-z0-9_-:]>\` so a retried provision
does not create a second VM (deduped for 24h).

**curl**

\`\`\`bash
BASE=https://coasty.ai/v1
AUTH="X-API-Key: $COASTY_API_KEY"

curl -s "$BASE/machines" -H "$AUTH" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: provision-bot-001" \\
  -d '{"display_name":"invoice-bot","os_type":"linux","desktop_enabled":true}'
\`\`\`

**Python**

\`\`\`python
import os, requests

BASE = "https://coasty.ai/v1"
HEADERS = {"X-API-Key": os.environ["COASTY_API_KEY"]}

m = requests.post(
    f"{BASE}/machines",
    headers={**HEADERS, "Idempotency-Key": "provision-bot-001"},
    json={"display_name": "invoice-bot", "os_type": "linux", "desktop_enabled": True},
    timeout=60,
).json()
machine_id = m["machine"]["id"]
print(machine_id, m["machine"]["status"])
\`\`\`

**Response**

\`\`\`json
{
  "machine": {
    "id": "mch_test_a1b2c3d4",
    "display_name": "invoice-bot",
    "status": "running",
    "os_type": "linux",
    "provider": "aws",
    "desktop_enabled": true,
    "cpu_cores": 2,
    "memory_gb": 4.0,
    "storage_gb": 20,
    "public_ip": "203.0.113.7",
    "is_test": true,
    "created_at": "2026-06-01T12:00:00Z",
    "metadata": {}
  },
  "connection": {
    "public_ip": "203.0.113.7",
    "ssh_port": 22,
    "ssh_username": "ubuntu",
    "vnc_port": 5900,
    "websocket_port": 8080,
    "has_ssh_key": true,
    "has_vnc_password": true
  },
  "request_id": "req_8f2c1e9a"
}
\`\`\`

The provision response NEVER includes the SSH key or VNC password. Fetch those
from \`GET /v1/machines/{id}/connection\` (gated by \`connection:read\`); it returns
\`ssh_private_key_pem\`, \`vnc_password\`, \`websocket_url\`, and \`devtools_url\`. Treat
that response as a secret (it is sent with \`Cache-Control: no-store\`).

### Lifecycle: start / stop / delete / snapshot

\`POST /v1/machines/{id}/start\`, \`/stop\`, and \`DELETE /v1/machines/{id}\` return
\`{ machine_id, status, message, request_id }\`. \`POST /v1/machines/{id}/snapshot\`
returns \`{ machine_id, snapshot_id, name, created_at, credits_charged, request_id }\`.

A snapshot costs **$0.01 (1 credit)** one-time, charged up front and refunded
if the snapshot fails. Start, stop, restart, and delete are free per call —
they only switch which hourly runtime rate applies ($0.05-0.09/hr running,
$0.01/hr stopped, $0 after termination).

### GET /v1/machines/{id}/screenshot

\`\`\`bash
curl -s "$BASE/machines/$MACHINE_ID/screenshot" -H "$AUTH"
\`\`\`

\`\`\`json
{
  "machine_id": "mch_test_a1b2c3d4",
  "image_b64": "<raw base64, no data: prefix>",
  "mime_type": "image/jpeg",
  "width": 1280,
  "height": 720,
  "captured_at": "2026-06-01T12:00:05Z",
  "request_id": "req_8f2c1e9a"
}
\`\`\`

The \`image_b64\` is pure base64 with any \`data:image/...;base64,\` prefix already
stripped, so you can feed it straight back into \`/v1/predict\`.

### POST /v1/machines/{id}/actions

**Request body**

| Field | Type | Req | Default | Notes |
| --- | --- | --- | --- | --- |
| \`command\` | string | yes | - | A name from the action allowlist (e.g. \`click\`, \`type\`, \`scroll\`, \`screenshot\`). |
| \`parameters\` | object | no | {} | Command-specific params, e.g. \`{ "x": 512, "y": 340 }\` for \`click\`. |
| \`timeout_ms\` | int\\|null | no | null | 1000-120000. Defaults to the command's tuned timeout. |

\`\`\`bash
curl -s "$BASE/machines/$MACHINE_ID/actions" -H "$AUTH" \\
  -H "Content-Type: application/json" \\
  -d '{"command":"click","parameters":{"x":512,"y":340}}'
\`\`\`

\`\`\`python
res = requests.post(
    f"{BASE}/machines/{machine_id}/actions",
    headers=HEADERS,
    json={"command": "click", "parameters": {"x": 512, "y": 340}},
    timeout=60,
).json()
print(res["success"], res["duration_ms"], "ms")
\`\`\`

\`\`\`json
{
  "machine_id": "mch_test_a1b2c3d4",
  "command": "click",
  "success": true,
  "result": { "success": true, "x": 512, "y": 340 },
  "error": null,
  "duration_ms": 84,
  "screenshot": null,
  "request_id": "req_8f2c1e9a"
}
\`\`\`

### POST /v1/machines/{id}/actions/batch

Run an ordered list of actions in one round-trip. Body: \`{ "steps": [ ActionRequest... ],
"stop_on_error": true }\` (max 50 steps; \`stop_on_error\` aborts on the first
failure, shell \`&&\`-style). Returns \`{ machine_id, results, completed_count,
failed_count, aborted, request_id }\`.

\`\`\`bash
curl -s "$BASE/machines/$MACHINE_ID/actions/batch" -H "$AUTH" \\
  -H "Content-Type: application/json" \\
  -d '{
    "steps": [
      {"command": "click", "parameters": {"x": 512, "y": 340}},
      {"command": "type", "parameters": {"text": "you@example.com"}},
      {"command": "key_press", "parameters": {"key": "enter"}}
    ],
    "stop_on_error": true
  }'
\`\`\`

### POST /v1/machines/{id}/browser/{op}

A convenience wrapper over browser commands. \`op\` is one of: \`open\`, \`navigate\`,
\`click\`, \`type\`, \`dom\`, \`clickables\`, \`state\`, \`info\`, \`scroll\`, \`close\`,
\`screenshot\`, \`wait\`, \`list-tabs\`, \`open-tab\`, \`close-tab\`, \`switch-tab\`. Body:
\`{ "parameters": {...}, "timeout_ms": null }\`. Arbitrary JS (\`browser_execute\`)
is intentionally NOT a browser op; send it through \`/actions\` with the
\`browser:execute\` scope.

\`\`\`bash
curl -s "$BASE/machines/$MACHINE_ID/browser/navigate" -H "$AUTH" \\
  -H "Content-Type: application/json" \\
  -d '{"parameters":{"url":"https://example.com"}}'
\`\`\`

### POST /v1/machines/{id}/terminal

Run a shell command. Requires \`terminal:exec\`. Output is truncated VM-side to
5000 chars; the hard timeout cap is 120s.

**Request body**

| Field | Type | Req | Default | Notes |
| --- | --- | --- | --- | --- |
| \`command\` | string | yes | - | 1-8192 chars. PowerShell on Windows, bash on Unix. |
| \`timeout_ms\` | int | no | 30000 | 1000-120000. |
| \`session_id\` | string\\|null | no | null | Reuse a persistent terminal session. |
| \`cwd\` | string\\|null | no | null | Initial working directory. |

\`\`\`bash
curl -s "$BASE/machines/$MACHINE_ID/terminal" -H "$AUTH" \\
  -H "Content-Type: application/json" \\
  -d '{"command":"ls -la /tmp","timeout_ms":15000}'
\`\`\`

### POST /v1/machines/{id}/files/{op}

File operations. \`op\` is one of: \`read\`, \`exists\`, \`list\`, \`list-directory\`,
\`download\`, \`list-downloads\` (need \`files:read\`) or \`write\`, \`edit\`, \`append\`,
\`delete\`, \`delete-directory\` (need \`files:write\`). Body: \`{ "parameters": {...} }\`
where the params depend on the op (e.g. \`{ "path": "..." }\` for read,
\`{ "path": ..., "content": ... }\` for write).

\`\`\`bash
# Read a file
curl -s "$BASE/machines/$MACHINE_ID/files/read" -H "$AUTH" \\
  -H "Content-Type: application/json" \\
  -d '{"parameters":{"path":"/home/ubuntu/report.txt"}}'

# Write a file (needs files:write)
curl -s "$BASE/machines/$MACHINE_ID/files/write" -H "$AUTH" \\
  -H "Content-Type: application/json" \\
  -d '{"parameters":{"path":"/home/ubuntu/out.txt","content":"hello"}}'
\`\`\`

---

## 8. Schedules & Triggers

A schedule fires an agent task against a machine on a cron/preset cadence, or
in response to an inbound trigger (an HMAC-signed webhook, inbound email, or
when another schedule completes). Scopes: \`schedules:read\` (list/get/runs) and
\`schedules:write\` (create/update/delete/pause/resume/run-now); adding or removing
triggers needs \`triggers:write\`.

A schedule id is a UUID (live) or \`sch_test_<8-32 hex>\` (sandbox). Test keys get
mock schedules that never bill, capped at 10. A trigger id matches \`trg_<8-32 hex>\`.

**Pricing.** Creating a schedule, firing it with run-now, and firing it via
webhook each require an API wallet balance of at least $0.20 (20 credits) —
a runway gate, not a fee; there is no per-fire or per-trigger charge.
Execution itself bills per minute of agent runtime to your Coasty account
credit balance (the consumer balance, not this API wallet) at 10 credits per
minute, with a 20-credit minimum to start and a 6-hour session cap. A fire
that cannot meet the balance gate records a run with status
\`insufficient_credits\`. Test schedules never bill (\`credits_charged: 0\`).

### Schedule endpoints

| Method + path | Scope | Description |
| --- | --- | --- |
| \`POST /v1/schedules\` | \`schedules:write\` | Create a schedule. Honors \`Idempotency-Key\`. |
| \`GET /v1/schedules\` | \`schedules:read\` | List schedules (\`limit\`, 1-200, default 50). |
| \`GET /v1/schedules/{id}\` | \`schedules:read\` | Get one schedule. |
| \`PATCH /v1/schedules/{id}\` | \`schedules:write\` | Update fields (at least one required). |
| \`DELETE /v1/schedules/{id}\` | \`schedules:write\` | Delete a schedule. |
| \`POST /v1/schedules/{id}/run\` | \`schedules:write\` | Fire once now (optional overrides). |
| \`POST /v1/schedules/{id}/pause\` | \`schedules:write\` | Pause (stop firing). |
| \`POST /v1/schedules/{id}/resume\` | \`schedules:write\` | Resume a paused schedule. |
| \`GET /v1/schedules/{id}/runs\` | \`schedules:read\` | List run history (\`cursor\`, \`status\`, \`limit\`). |
| \`GET /v1/schedules/{id}/runs/{run_id}\` | \`schedules:read\` | Get one schedule run. |
| \`GET /v1/schedules/{id}/triggers\` | \`schedules:read\` | List a schedule's triggers. |
| \`POST /v1/schedules/{id}/triggers\` | \`triggers:write\` | Add a webhook/email/chain trigger. |
| \`DELETE /v1/schedules/{id}/triggers/{tid}\` | \`triggers:write\` | Remove a trigger. |
| \`POST /v1/triggers/webhook/{id}\` | NONE (HMAC-signed) | Public fire endpoint hit by external systems. |
| \`POST /v1/triggers/email-mailbox\` | \`triggers:write\` | Provision an inbound email address. |

### POST /v1/schedules (create)

Provide exactly one of \`frequency\` (a recurring preset) or \`run_at\` (a one-shot
UTC timestamp). With \`frequency: "custom"\` you must also supply a raw \`cron\`.

**Request body**

| Field | Type | Req | Default | Notes |
| --- | --- | --- | --- | --- |
| \`name\` | string | yes | - | 1-128 chars. |
| \`machine_id\` | string | yes | - | Target VM, owned by your key's user. |
| \`task_prompt\` | string | yes | - | 1-8000 chars. The agent's instructions each fire. |
| \`frequency\` | string\\|null | no | null | \`every_15_minutes\`, \`every_30_minutes\`, \`hourly\`, \`every_6_hours\`, \`every_12_hours\`, \`daily\`, \`weekly\`, \`monthly\`, \`custom\`. |
| \`cron\` | string\\|null | no | null | Raw 5-or-6-field cron. Required when \`frequency = "custom"\`. |
| \`time\` | string\\|null | no | null | \`HH:MM\` for daily/weekly/monthly presets. |
| \`timezone\` | string | no | \`UTC\` | IANA timezone, e.g. \`America/New_York\`. |
| \`day_of_week\` | int\\|null | no | null | 0=Mon..6=Sun (weekly). |
| \`day_of_month\` | int\\|null | no | null | 1-28 (monthly). |
| \`run_at\` | string\\|null | no | null | ISO-8601 UTC for a one-shot schedule. Mutually exclusive with \`frequency\`. |
| \`max_consecutive_failures\` | int | no | 5 | 1-50. Circuit breaker: auto-pause after N failures. |
| \`metadata\` | object\\|null | no | null | String tags (max 16). |

\`\`\`bash
BASE=https://coasty.ai/v1
AUTH="X-API-Key: $COASTY_API_KEY"

curl -s "$BASE/schedules" -H "$AUTH" \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "Daily invoice sweep",
    "machine_id": "mch_test_a1b2c3d4",
    "task_prompt": "Open the billing page and download every new invoice as PDF",
    "frequency": "daily",
    "time": "09:00",
    "timezone": "America/New_York"
  }'
\`\`\`

A schedule (\`ScheduleResponse\`) returns \`{ id, name, machine_id, task_prompt,
enabled, frequency, cron, timezone, next_run_at, last_run_at, run_count,
consecutive_failures, paused_reason, is_test, created_at, metadata }\`.

\`PATCH /v1/schedules/{id}\` accepts any subset of \`name\`, \`task_prompt\`,
\`frequency\`, \`cron\`, \`timezone\`, \`time\`, \`day_of_week\`, \`day_of_month\`,
\`max_consecutive_failures\`, \`enabled\`, \`metadata\` (an empty body is a 400
\`EMPTY_UPDATE\`).

### Run now / pause / resume

\`POST /v1/schedules/{id}/run\` fires immediately; body (all optional):
\`{ "task_prompt_override": "...", "triggered_context": { ... } }\`. It returns
\`{ schedule_id, run_id, status, message, request_id }\`. \`/pause\` and \`/resume\`
flip the schedule's \`enabled\` flag.

### Run history

\`GET /v1/schedules/{id}/runs\` lists past fires: \`{ data: [ { id, schedule_id,
status, trigger, duration_seconds, credits_charged, error, executed_at } ],
next_cursor, has_more, request_id }\`. Filter with \`?status=\` (one of
\`completed\`, \`failed\`, \`skipped\`, \`cancelled\`, \`running\`, \`insufficient_credits\`).
\`GET /v1/schedules/{id}/runs/{run_id}\` returns a single run.

### Triggers

\`POST /v1/schedules/{id}/triggers\` adds a trigger. \`kind\` is one of:

- \`webhook\`: returns a public \`webhook_url\` plus a one-time \`webhook_secret\`.
  Optional \`rate_limit_per_minute\` (1-600, default 60).
- \`email\`: provisions an inbound mailbox; optional \`email_label\`.
- \`chain\`: fires this schedule when \`source_schedule_id\` completes. Optional
  \`event\` (\`on_complete\` / \`on_failure\` / \`on_any\`, default \`on_complete\`) and
  \`pass_output\` (default true). Chain depth is capped at 5.

The webhook \`webhook_secret\` is shown ONCE at creation (the response carries
\`Cache-Control: no-store\`); only its hash is stored, so save it now.

### POST /v1/triggers/webhook/{id} (unauthenticated, HMAC-signed)

External systems (Stripe, Linear, a CRM) fire a schedule by POSTing to the
webhook URL. There is NO API key: the request is authenticated by an HMAC-SHA256
signature instead. Send the signature in the \`Coasty-Signature\` header as
\`t=<unix_ts>,v1=<hex>\`, where the signed payload is \`"<t>." + raw_request_body\`.
The replay window is 5 minutes: a signature whose \`t\` is older than 5 minutes is
rejected even if the HMAC is valid. Identical \`(webhook_id, body)\` fires within
60s are deduplicated.

Webhook fires are free — there is no routing fee — but a fire is rejected
unless the schedule owner's API wallet holds at least $0.20 (20 credits).

\`\`\`python
import hashlib, hmac, json, os, time, requests

BASE = "https://coasty.ai/v1"
HEADERS = {"X-API-Key": os.environ["COASTY_API_KEY"]}
SCHEDULE_ID = "sch_test_a1b2c3d4"

# 1. Add a webhook trigger. webhook_url + webhook_secret are returned ONCE.
trig = requests.post(
    f"{BASE}/schedules/{SCHEDULE_ID}/triggers",
    headers=HEADERS,
    json={"kind": "webhook"},
    timeout=30,
).json()
webhook_url = trig["webhook_url"]        # https://coasty.ai/v1/triggers/webhook/whk_...
webhook_secret = trig["webhook_secret"]  # persist this securely; shown only here

# 2. Sign and fire the webhook the way an external system would.
body = json.dumps({"event": "invoice.created", "id": "inv_4821"}).encode()
ts = str(int(time.time()))
signed = ts.encode() + b"." + body
sig = hmac.new(webhook_secret.encode(), signed, hashlib.sha256).hexdigest()

res = requests.post(
    webhook_url,
    headers={
        "Content-Type": "application/json",
        "Coasty-Signature": f"t={ts},v1={sig}",
    },
    data=body,
    timeout=30,
).json()
print(res["received"], res.get("run_id"))   # {"received": true, "run_id": "...", ...}
\`\`\`

The fire response is \`{ received, schedule_id, run_id, deduplicated, message,
request_id }\`. A bad/missing/expired signature returns \`401 INVALID_SIGNATURE\`; a
paused schedule returns \`SCHEDULE_INACTIVE\`; exceeding the per-webhook rate limit
returns \`429 RATE_LIMITED\` (honor \`Retry-After\`).

### POST /v1/triggers/email-mailbox

Provisions a fresh inbound address on the \`agents.coasty.ai\` domain (gated by
\`triggers:write\`). Returns \`{ email_address, label, is_test, note, request_id }\`.
Pair it with a chain or email trigger to fire schedules on inbound mail.

---

## Links

- Human docs: https://coasty.ai/docs
- Manage API keys: https://coasty.ai/developers/keys
- Site-wide LLM doc: https://coasty.ai/llms-full.txt
`
