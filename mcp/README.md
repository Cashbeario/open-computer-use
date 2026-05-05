# @coasty/mcp

Model Context Protocol server for **[Coasty](https://coasty.ai)** — drive screenshot-based action prediction, managed VMs, and automated schedules from any MCP-capable client (Claude Desktop, Claude Code, Cursor, Windsurf, VS Code Copilot, ChatGPT custom GPTs, and any other host that speaks MCP).

```
┌──────────────┐                        ┌──────────────┐
│ Claude/Cursor│   stdio JSON-RPC       │ @coasty/mcp  │     HTTPS    ┌─────────┐
│  Windsurf/.. │ ◄─────────────────────►│  (this pkg)  │ ◄────────────│  Coasty │
│              │                        │              │   /v1/*       │   API   │
└──────────────┘                        └──────────────┘              └─────────┘
```

Tools shipped (v1):

| Group | Tools |
|---|---|
| **Predict** | `coasty_predict` · `coasty_ground` · `coasty_ocr` · `coasty_parse` |
| **Machines** | `coasty_list_machines` · `coasty_get_machine` · `coasty_provision_machine` · `coasty_terminate_machine` · `coasty_start_machine` · `coasty_stop_machine` · `coasty_take_machine_screenshot` · `coasty_execute_machine_action` · `coasty_run_terminal_command` |
| **Schedules** | `coasty_list_schedules` · `coasty_get_schedule` · `coasty_create_schedule` · `coasty_update_schedule` · `coasty_delete_schedule` · `coasty_run_schedule_now` · `coasty_pause_schedule` · `coasty_resume_schedule` · `coasty_list_schedule_runs` · `coasty_add_trigger` · `coasty_remove_trigger` |
| **Account** | `coasty_get_credits` |
| **Prompts** | `start_automation_session` · `debug_failed_run` |

---

## Quick install

You need a **Coasty API key**. Get one (free sandbox keys included) at https://coasty.ai/developers.

| Key prefix | Behavior |
|---|---|
| `sk-coasty-test-…` | **Sandbox.** Mock VMs and schedules, zero billing. Great for development. |
| `sk-coasty-live-…` | **Production.** Real EC2/Azure VMs, real credit billing. |

### Claude Desktop

`~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "coasty": {
      "command": "npx",
      "args": ["-y", "@coasty/mcp"],
      "env": { "COASTY_API_KEY": "sk-coasty-test-..." }
    }
  }
}
```

Restart Claude Desktop. The Coasty tools appear under the 🛠 icon.

### Claude Code (CLI)

```bash
claude mcp add coasty \
  --env COASTY_API_KEY=sk-coasty-test-... \
  -- npx -y @coasty/mcp
```

### Cursor

`.cursor/mcp.json` (per-project) or `~/.cursor/mcp.json` (global):

```json
{
  "mcpServers": {
    "coasty": {
      "command": "npx",
      "args": ["-y", "@coasty/mcp"],
      "env": { "COASTY_API_KEY": "sk-coasty-test-..." }
    }
  }
}
```

Settings → MCP shows a green status dot when Coasty is reachable.

### Windsurf

`~/.codeium/windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "coasty": {
      "command": "npx",
      "args": ["-y", "@coasty/mcp"],
      "env": { "COASTY_API_KEY": "sk-coasty-test-..." }
    }
  }
}
```

### VS Code (with Copilot in Agent mode)

`.vscode/mcp.json` per-workspace. Note the **`servers`** key (not `mcpServers`):

```json
{
  "servers": {
    "coasty": {
      "command": "npx",
      "args": ["-y", "@coasty/mcp"],
      "env": { "COASTY_API_KEY": "sk-coasty-test-..." }
    }
  }
}
```

Tools only show in **Agent mode**, not Ask/Edit. Type `#` in the chat to autocomplete tool names.

---

## What can it do?

### Predict the next action from a screenshot

```
You: Here's a screenshot of a login form (attached). Click the email
     field and type 'me@example.com'.

Claude: I'll use coasty_predict to figure out the action sequence.
        → coasty_predict({ screenshot, instruction: "Click the email field..." })
        ← actions: [{ type: "click", x: 312, y: 245 }, { type: "type_text", text: "me@example.com" }]
```

### Provision a sandbox VM and drive it

```
You: Provision a Linux desktop VM and open google.com in the browser.

Claude: → coasty_provision_machine({ display_name: "demo", desktop_enabled: true })
        ← { id: "mch_test_a1b2c3d4", status: "running" }
        → coasty_execute_machine_action({
            machine_id: "mch_test_a1b2c3d4",
            command: "browser_navigate",
            parameters: { url: "https://google.com" }
          })
        ← { success: true, url: "https://google.com", title: "Google" }
```

### Schedule a daily 9am Slack summary

```
You: Every weekday at 9am ET, summarize my unread Gmail and post the top 5 to Slack.

Claude: → coasty_create_schedule({
            name: "morning briefing",
            machine_id: "mch_a1b2c3d4",
            task_prompt: "Summarize unread Gmail and post top 5 to Slack",
            frequency: "custom",
            cron: "0 9 * * 1-5",
            timezone: "America/New_York"
          })
        ← { id: "550e8400-e29b-41d4-a716-446655440000", next_run_at: "..." }
```

### Add a webhook trigger so Stripe can fire it

```
You: Hook this up to Stripe — fire when a customer subscribes.

Claude: → coasty_add_trigger({ schedule_id: "...", kind: "webhook" })
        ← {
            webhook_url: "https://coasty.ai/v1/triggers/webhook/whk_...",
            webhook_secret: "whsec_..." (RETURNED ONCE — STORE IT)
          }
```

---

## Auth + scopes

Tools fail with 403 if your key lacks the required scope. By default, new keys
get `predict`, `session`, `ground`, `ocr`, `parse`, `machines:read`,
`actions:exec`, `files:read`. Mint a key with elevated scopes at
https://coasty.ai/developers if you need:

| Scope | Tools that need it |
|---|---|
| `machines:write` | `provision_machine`, `terminate_machine`, `start_machine`, `stop_machine` |
| `terminal:exec` | `run_terminal_command` |
| `files:write` | `execute_machine_action` with `file_write`/`file_edit`/`file_append`/`file_delete` |
| `browser:execute` | `execute_machine_action` with `browser_execute` (arbitrary JS) |
| `schedules:read` | `list_schedules`, `get_schedule`, `list_schedule_runs` |
| `schedules:write` | `create_schedule`, `update_schedule`, `delete_schedule`, `run_schedule_now`, `pause_schedule`, `resume_schedule` |
| `triggers:write` | `add_trigger`, `remove_trigger` |

---

## Configuration

| Var | Default | Notes |
|---|---|---|
| `COASTY_API_KEY` | — (required) | `sk-coasty-{live,test}-…` |
| `COASTY_API_BASE_URL` | `https://coasty.ai` | Override for self-hosted |
| `COASTY_TIMEOUT_MS` | `90000` | Per-request timeout (Cloudflare cap is ~100s) |
| `COASTY_MCP_DEBUG` | `0` | Set to `1` for verbose stderr logging |

CLI flags override env vars: `--api-key`, `--base-url`, `--timeout`, `--debug`, `--version`, `--help`.

---

## Build & Test

### One-shot pre-publish check

```bash
cd mcp
npm install
npm run check       # lint + build + tests + binary smoke. ~6s.
```

That's the gate every commit must pass. It does:

1. `npm run lint`  — `tsc --noEmit`, no type errors
2. `npm run build` — emit `dist/`
3. `npm test`      — vitest run, 178 tests in 4 files
4. `npm run smoke` — `node dist/bin/coasty-mcp.js --version && --help` (catches build artifacts that don't actually run)

### Day-to-day

```bash
npm run build:watch       # tsc in watch mode (rebuilds on save)
npm run test:watch        # vitest in watch mode (re-runs affected tests)
npm run test:coverage     # vitest + V8 coverage report → coverage/
```

### Manual integration via the MCP Inspector

The Inspector is Anthropic's official MCP debugger. It speaks the same wire
protocol Claude Desktop / Cursor / etc. do, so if a tool works in the
Inspector it works in every client.

```bash
# UI mode — opens http://localhost:6274 with a tools-list pane and a tool-call form
COASTY_API_KEY=sk-coasty-test-... npm run inspector

# CLI mode — scriptable, ideal for CI
npm run inspector:tools     # → list every tool's schema
npm run inspector:prompts   # → list both prompts
npm run inspector:cli -- --method tools/call --tool-name coasty_get_credits --tool-arg period=2026-04
```

### Test layout

| File | What it covers | Tests |
|---|---|---|
| `tests/config.test.ts`           | Env + CLI flag resolution, key-prefix validation, timeout clamping | 11 |
| `tests/client.test.ts`           | HTTP wrapper: headers, query params, idempotency-key, timeouts, error mapping | 13 |
| `tests/server.test.ts`           | End-to-end via in-memory transport: every tool registered, schemas self-contained, annotations correct, error roundtrip | 11 |
| `tests/annotations.test.ts`      | Cross-tool invariants: `readOnlyHint` / `destructiveHint` / `idempotentHint` / `openWorldHint` are consistent | 11 |
| `tests/errors.test.ts`           | Every Coasty error code → expected hint substring (401/402/403/404/409/422/429/500) | 14 |
| `tests/tools-routing.test.ts`    | Each of the 24 tools forwards to the correct method + path + body | 28 |
| `tests/tools-validation.test.ts` | Every Zod constraint enforced (min/max bounds, enums, regex, required fields, allowlist commands) | 28 |
| `tests/prompts.test.ts`          | Both prompts produce expected message text with all arg combinations | 10 |
| `tests/edge-cases.test.ts`       | Unicode, RTL, very long inputs, network failures, malformed JSON, idempotency-key formats, key redaction | 23 |
| `tests/schema-validity.test.ts`  | Every JSON schema is well-formed, no external `$ref`, no top-level `oneOf`/`anyOf`, snake_case names | 11 |
| `tests/inspector-smoke.test.ts`  | Spawns the actual built binary, exercises JSON-RPC initialize → tools/list → prompts/list | 7 |
| **Total** | | **178** |

### What the tests guarantee

- **Every tool** routes to a known Coasty REST endpoint with the correct method and body shape
- **Every input field** has its Zod constraints enforced (min/max bounds tested, enum mismatches rejected, regex patterns checked)
- **Every documented error code** produces a useful "Hint: …" line for the LLM to self-correct
- **No `console.log`** can sneak into the codepath and corrupt the stdio transport (the smoke test reads stderr/stdout directly)
- **Annotations stay consistent** — read tools can't accidentally lose `readOnlyHint`, destructive tools can't accidentally lose `destructiveHint`
- **API key never appears in logs** — debug output is asserted to contain `[redacted]` instead
- **Schema portability** — no external `$ref`, no top-level unions, no description-on-non-schema, all regex compiles, min ≤ max
- **Drift detection** — adding a new tool without an annotation, description, or routing test fails CI

### Try it for real

```bash
# 1. Get a free sandbox key at https://coasty.ai/developers (sk-coasty-test-…)
# 2. Build
npm run check

# 3. Stick it in any MCP host
#    e.g. Claude Code:
claude mcp add coasty --env COASTY_API_KEY=sk-coasty-test-... -- node $(pwd)/dist/bin/coasty-mcp.js
claude mcp list   # should show coasty ✓ connected

# 4. Open Claude Code and try:
#    "Use the start_automation_session prompt with goal='check today's weather on google.com'"
```

---

## Security notes

- The MCP server runs **locally** on the user's machine (stdio transport).
  Their API key never touches Coasty's MCP infra — it goes from their host
  config straight to `https://coasty.ai/v1/*` over TLS.
- All tool calls hit the same `/v1` API as other clients. The same scope
  enforcement, rate limits, and 404-on-cross-tenant rules apply.
- Schemas are self-contained (no external `$ref`) and exclude `anyOf`/`oneOf`
  at the parameter level for max compat across hosts.
- Tool annotations (`readOnlyHint`, `destructiveHint`, `idempotentHint`,
  `openWorldHint`) are set so hosts can render appropriate confirmation UI.

---

## License

MIT © 2026 Coasty
