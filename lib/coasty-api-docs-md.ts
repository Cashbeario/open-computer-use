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

1. **Core inference** (\`/v1/predict\`, \`/v1/sessions\`, \`/v1/ground\`, \`/v1/ocr\`,
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
coding it. A missing or malformed key returns \`401 INVALID_API_KEY\`.

### Key management

- Create, list, and revoke keys at https://coasty.ai/developers/keys, or via the
  API: \`POST /v1/keys\`, \`GET /v1/keys\`, \`DELETE /v1/keys/{key_id}\`.
- The raw key is shown exactly **once** at creation; store it securely.
- Per-account cap: 20 active keys.
- Each key carries a set of scopes (see Reference). New keys are granted a
  conservative default set that already includes \`runs:*\` and \`workflows:*\`.

### Test vs live keys

| Prefix | Kind | Bills your wallet? | Rate limits |
| --- | --- | --- | --- |
| \`sk-coasty-live-<48 hex>\` | live | Yes | Your subscription tier |
| \`sk-coasty-test-<48 hex>\` | test (sandbox) | No (free) | Same as your tier |
| \`cua_sk_<48 hex>\` | legacy | Yes | Your tier (accepted through 2026-11-01) |

Test keys (\`sk-coasty-test-*\`) run the same validation and logic as live keys
but **never debit your wallet**. They still consume rate-limit budget, so a
runaway test loop cannot starve production traffic. Responses from test keys
carry \`X-Coasty-Test-Mode: true\` and \`X-Credits-Charged: 0\`. The \`X-Coasty-Key-Kind\`
response header reports which family authenticated (\`live\`, \`test\`, or \`legacy\`).

### Billing model (USD)

Your developer wallet is a **prepaid USD balance** (denominated in cents).
Internally costs are computed at a granularity of $0.09 per unit; everywhere in
this document costs are shown in dollars. Charges are taken before the model
call and automatically refunded if the call fails. See the Pricing table in the
Reference section for exact per-endpoint dollar costs.

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

**Request body**

| Field | Type | Req | Default | Notes |
| --- | --- | --- | --- | --- |
| \`screenshot\` | string | yes | - | Base64-encoded PNG/JPEG. Must be > 100 chars. |
| \`instruction\` | string | yes | - | Natural language task. Must be non-empty. |
| \`cua_version\` | string | no | \`v3\` | \`v1\` / \`v3\` / \`v4\`. |
| \`model\` | string\\|null | no | null | Resolved server-side. |
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
  "usage": { "input_tokens": 1523, "output_tokens": 245, "credits_charged": 5, "cost_cents": 45 }
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

**Request body**

| Field | Type | Req | Default | Notes |
| --- | --- | --- | --- | --- |
| \`cua_version\` | string | no | \`v3\` | \`v1\` / \`v3\` / \`v4\`. |
| \`model\` | string\\|null | no | null | Resolved server-side. |
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
  "model": "default",
  "screen_size": "1920x1080",
  "created_at": "2026-06-01T12:00:00Z",
  "expires_at": "2026-06-01T12:30:00Z"
}
\`\`\`

#### POST /v1/sessions/{id}/predict

Predict the next step inside a session. Repeat until \`status != "continue"\`.

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
  "model": "default",
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

### POST /v1/ocr

Read on-screen text and bounding boxes. Scope: \`ocr\`.

**Request body**

| Field | Type | Req | Default | Notes |
| --- | --- | --- | --- | --- |
| \`screenshot\` | string | yes | - | Base64 PNG/JPEG. |
| \`region\` | object\\|null | no | null | Optional \`{x, y, width, height}\`. |

**Response** (\`OCRResponse\`)

\`\`\`json
{
  "elements": [
    { "id": 0, "text": "Sign in", "left": 480, "top": 300, "width": 80, "height": 24 }
  ],
  "full_text": "Sign in ...",
  "usage": { "credits_charged": 3, "cost_cents": 27 }
}
\`\`\`

\`\`\`bash
curl -s https://coasty.ai/v1/ocr \\
  -H "X-API-Key: $COASTY_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d "{\\"screenshot\\":\\"$SCREENSHOT\\"}"
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
  "total_cost_cents": 4860,
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
| \`model\` | string\\|null | no | null | Resolved server-side. |
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
| \`model\` | string\\|null | Resolved model id. |
| \`instructions\` | string\\|null | Extra guidance appended to the base prompt. |
| \`max_steps\` | int | Hard cap on agent steps. |
| \`on_awaiting_human\` | string | \`pause\` / \`fail\` / \`cancel\`. |
| \`steps_completed\` | int | Steps run so far. |
| \`credits_charged\` | int | Internal cost units (1 unit = $0.09). See \`cost_cents\` for dollars. |
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
  "model": "coasty-cua-v3",
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

Every error returns the same shape with the HTTP status set accordingly:

\`\`\`json
{
  "error": {
    "code": "INSUFFICIENT_CREDITS",
    "message": "Your API wallet does not have enough funds to complete this request.",
    "type": "payment_required",
    "request_id": "req_8f2c1e9a"
  }
}
\`\`\`

| Status | Code | Meaning |
| --- | --- | --- |
| 400 | \`INVALID_REQUEST\` | Malformed body or a field failed validation. |
| 401 | \`INVALID_API_KEY\` | The key is missing, malformed, or revoked. |
| 402 | \`INSUFFICIENT_CREDITS\` | Your USD wallet can't cover this request. Add funds. |
| 403 | \`INSUFFICIENT_SCOPE\` | The key is valid but lacks the required scope. |
| 404 | \`NOT_FOUND\` | The session/run/resource id does not exist or expired. |
| 422 | \`INVALID_REQUEST\` / \`IDEMPOTENCY_KEY_REUSED\` | Unknown body field, or an idempotency key reused with a different body. |
| 429 | \`RATE_LIMITED\` / \`TOO_MANY_RUNS\` / \`SESSION_LIMIT_REACHED\` | Per-minute, per-hour, concurrency, or concurrent-session limit exceeded. Back off and retry. |
| 500 | \`PREDICTION_FAILED\` | The model run failed. The charge is automatically refunded. |
| 503 | \`SERVICE_UNAVAILABLE\` | A transient upstream issue. Retry with backoff. |

Rate-limit responses include \`X-RateLimit-Limit\`, \`X-RateLimit-Remaining\`, and
\`X-RateLimit-Reset\` (advisory) plus a \`retry_after\` hint.

### Rate limits per tier

API tiers are derived from your subscription. Both a per-key and a per-user
(across all your keys) limit apply.

| Tier | Requests/min | Requests/hour | Concurrent sessions | Max trajectory | Max actions | CUA versions |
| --- | --- | --- | --- | --- | --- | --- |
| free | 3 | 30 | 1 | 3 | 3 | v3 |
| starter | 10 | 200 | 3 | 5 | 5 | v3 |
| professional | 20 | 500 | 10 | 8 | 5 | v1, v3, v4 |
| enterprise | 30 | 1000 | 100 | 20 | 10 | v1, v3, v4 |

Per-user hard cap across all keys: 40 requests/min, 1500 requests/hour. Custom
prompts (\`system_prompt\` + \`instructions\`) are gated by \`max_system_prompt_chars\`
per tier: free 0 (unavailable), starter 2000, professional 4000, enterprise
16000.

### Scopes

Scopes are deny-by-default; each route asserts the scope it requires. Naming is
\`<resource>:<verb>\` (\`read\` / \`write\` / \`exec\`).

| Scope | Grants |
| --- | --- |
| \`predict\` | \`POST /v1/predict\`. |
| \`session\` | All \`/v1/sessions\` endpoints. |
| \`ground\` | \`POST /v1/ground\`. |
| \`ocr\` | \`POST /v1/ocr\`. |
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

Default scopes on a new key: \`predict\`, \`session\`, \`ground\`, \`ocr\`, \`parse\`,
\`machines:read\`, \`actions:exec\`, \`files:read\`, \`runs:read\`, \`runs:write\`,
\`workflows:read\`, \`workflows:write\`. Elevated scopes (\`terminal:exec\`,
\`files:write\`, \`browser:execute\`, \`connection:read\`, \`snapshots:write\`) are
requested explicitly at key creation.

### Pricing (USD)

Costs are computed internally at a granularity of $0.09 per unit and shown here
in dollars. Charges are taken before the model call and refunded on failure.

| Endpoint | Cost | Note |
| --- | --- | --- |
| \`POST /v1/predict\` | $0.45 | Stateless prediction. |
| \`POST /v1/sessions\` | $0.90 | One-time session creation. |
| \`POST /v1/sessions/{id}/predict\` | $0.36 | Each step inside a session. |
| \`POST /v1/ground\` | $0.27 | Coordinate grounding. |
| \`POST /v1/ocr\` | $0.27 | Text extraction. |
| \`POST /v1/parse\` | Free | Deterministic, no model call. |
| \`POST /v1/runs\` | $0.45/step | Per agent step on v3/v4 (v1 is $0.72/step), billed from your USD wallet. |
| \`POST /v1/workflows/runs\` | $0.45/step | Each task step is a run; total capped by \`budget_cents\`. |

Surcharges may apply on inference endpoints: roughly +$0.18 per extra trajectory
screenshot, +$0.09 per HD screenshot (wider than 1280x720), +$0.27 per request
on the \`v1\` engine, and +$0.09 for a large custom prompt (over 500 chars). The
wallet is a prepaid USD balance; top up in the developer dashboard.

### MCP server

Connect Coasty to an MCP-capable client (for example, Claude or an IDE agent)
with the official server:

\`\`\`bash
npx -y @coasty/mcp
\`\`\`

Set \`COASTY_API_KEY\` in the environment; the MCP server exposes the same
endpoints documented above as tools.

---

## Links

- Human docs: https://coasty.ai/docs
- Manage API keys: https://coasty.ai/developers/keys
- Site-wide LLM doc: https://coasty.ai/llms-full.txt
`
