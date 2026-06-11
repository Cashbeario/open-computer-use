/**
 * agent-runs-api.test.ts — anti-drift guards for the Task Runs API (Phase 1) and
 * the v4 + instructions surface (Phase 2).
 *
 * Same spirit as api-wallet.test.ts / atomic-credit-grants.test.ts: source-level
 * assertions that pin the state-machine, billing-idempotency, ownership-scoping,
 * tier-gating, kill-switch, and SSRF/webhook invariants so a future refactor
 * cannot silently regress them. These run in CI (vitest) even though the backend
 * itself is pytest — they read the SQL + Python as text and assert structure.
 */
import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const root = process.cwd()
const read = (p: string) => readFileSync(join(root, p), "utf8")

const M025 = read("supabase/migrations/025_agent_runs.sql")
const KEYS = read("backend/app/services/api_key_service.py")
const CUA_MODELS = read("backend/app/models/public_cua.py")
const RUN_MODELS = read("backend/app/models/public_runs.py")
const RUN_SVC = read("backend/app/services/public_run_service.py")
const RUN_ROUTES = read("backend/app/api/routes/public_runs.py")
const CONFIG = read("backend/app/core/config.py")
const MAIN = read("backend/main.py")
const CUA_EXEC = read("backend/app/services/cua_executor.py")
const CUA_SVC = read("backend/app/services/public_cua_service.py")

const RUN_STATES = ["queued", "running", "awaiting_human", "succeeded", "failed", "cancelled", "timed_out"]
const TERMINAL = ["succeeded", "failed", "cancelled", "timed_out"]

describe("025 migration — agent_runs schema + state machine", () => {
  it("creates agent_runs and agent_run_events", () => {
    expect(M025).toMatch(/CREATE TABLE IF NOT EXISTS public\.agent_runs/)
    expect(M025).toMatch(/CREATE TABLE IF NOT EXISTS public\.agent_run_events/)
  })

  it("pins the full status vocabulary in a CHECK constraint", () => {
    for (const s of RUN_STATES) {
      expect(M025, `status '${s}' allowed`).toContain(`'${s}'`)
    }
    expect(M025).toMatch(/status\s+text NOT NULL DEFAULT 'queued'/)
  })

  it("stores money as bigint cents, never float", () => {
    expect(M025).toMatch(/cost_cents\s+bigint\s+NOT NULL DEFAULT 0 CHECK \(cost_cents >= 0\)/)
    expect(M025).not.toMatch(/cost_cents\s+(numeric|real|double|float)/i)
  })

  it("agent_run_transition is the single chokepoint and treats terminal states as immutable", () => {
    expect(M025).toMatch(/CREATE OR REPLACE FUNCTION public\.agent_run_transition/)
    expect(M025).toMatch(/v_terminal text\[\] := ARRAY\['succeeded','failed','cancelled','timed_out'\]/)
    // Terminal -> anything applies NO transition (ok=false) so the worker can't
    // double-emit terminal events after an endpoint-driven cancel.
    expect(M025).toMatch(/IF v_current = ANY \(v_terminal\) THEN\s*\n\s*ok := false/)
    // Source-state gate gives optimistic concurrency for double-resume / cancel races.
    expect(M025).toMatch(/IF v_current <> ALL \(p_from\) THEN/)
    // Entering a terminal stamps finished_at.
    expect(M025).toMatch(/finished_at\s+=\s+CASE[\s\S]{0,80}p_to = ANY \(v_terminal\) THEN now\(\)/)
  })

  it("append_event assigns a monotonic per-run seq under a row lock (Last-Event-ID)", () => {
    expect(M025).toMatch(/CREATE OR REPLACE FUNCTION public\.agent_run_append_event/)
    expect(M025).toMatch(/last_event_seq\s+=\s+last_event_seq \+ 1/)
    expect(M025).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS uq_agent_run_events_run_seq[\s\S]{0,80}\(run_id, seq\)/)
  })

  it("claim uses FOR UPDATE SKIP LOCKED so N replicas never double-execute a run", () => {
    expect(M025).toMatch(/CREATE OR REPLACE FUNCTION public\.agent_run_claim/)
    expect(M025).toMatch(/FOR UPDATE SKIP LOCKED/)
    expect(M025).toMatch(/status\s+=\s+'running'/)
  })

  it("heartbeat is a fencing-token check (different worker => abandon)", () => {
    expect(M025).toMatch(/CREATE OR REPLACE FUNCTION public\.agent_run_heartbeat/)
    expect(M025).toMatch(/v_owner IS NULL OR v_owner <> p_worker_id/)
  })

  it("reaper only re-queues dead-worker RUNNING runs, never awaiting_human", () => {
    expect(M025).toMatch(/CREATE OR REPLACE FUNCTION public\.agent_run_reap_stale/)
    expect(M025).toMatch(/WHERE status = 'running'[\s\S]{0,160}heartbeat_at < now\(\) - make_interval/)
    expect(M025).not.toMatch(/status = 'awaiting_human'[\s\S]{0,40}make_interval\(secs => p_timeout_seconds\)/)
  })

  it("idempotency: one run per (user_id, idempotency_key)", () => {
    expect(M025).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS uq_agent_runs_user_idem[\s\S]{0,120}\(user_id, idempotency_key\)[\s\S]{0,60}WHERE idempotency_key IS NOT NULL/)
  })

  it("RLS: service_role writes, authenticated reads own; events cascade-delete with the run", () => {
    expect(M025).toMatch(/ALTER TABLE public\.agent_runs\s+ENABLE ROW LEVEL SECURITY/)
    expect(M025).toMatch(/Service role full access to agent_runs[\s\S]{0,140}FOR ALL TO service_role/)
    expect(M025).toMatch(/Users can view own agent_runs[\s\S]{0,140}FOR SELECT TO authenticated/)
    expect(M025).toMatch(/run_id\s+uuid NOT NULL REFERENCES public\.agent_runs\(id\) ON DELETE CASCADE/)
  })

  it("all RPCs are SECURITY DEFINER with a pinned search_path", () => {
    const defs = M025.match(/SECURITY DEFINER\s+SET search_path = public/g) || []
    expect(defs.length).toBeGreaterThanOrEqual(5)
  })
})

describe("RunStatus model mirrors the migration", () => {
  it("declares exactly the 7 run states", () => {
    for (const s of RUN_STATES) {
      expect(RUN_MODELS, `RunStatus has ${s}`).toContain(`"${s}"`)
    }
  })
  it("pins the terminal set", () => {
    expect(RUN_MODELS).toMatch(/TERMINAL_RUN_STATES\s*=\s*frozenset/)
    for (const s of TERMINAL) expect(RUN_MODELS).toContain(`RunStatus.${s.toUpperCase()}.value`)
  })
  it("on_awaiting_human policy is pause|fail|cancel", () => {
    expect(RUN_MODELS).toMatch(/PAUSE\s*=\s*"pause"/)
    expect(RUN_MODELS).toMatch(/FAIL\s*=\s*"fail"/)
    expect(RUN_MODELS).toMatch(/CANCEL\s*=\s*"cancel"/)
  })
})

describe("Phase 2 — v4 + instructions", () => {
  it("CUAVersion exposes v4", () => {
    expect(CUA_MODELS).toMatch(/V4\s*=\s*"v4"/)
  })
  it("instructions APPENDS (predict + session models carry it)", () => {
    expect(CUA_MODELS).toMatch(/instructions:\s*Optional\[str\]/)
    expect(CUA_MODELS).toMatch(/APPENDED to the base agent prompt/)
  })
  it("public_cua_service appends instructions without mutating the cached base prompt", () => {
    expect(CUA_SVC).toMatch(/# Additional Instructions/)
    expect(CUA_SVC).toMatch(/Never mutate the cached base prompt in place/)
  })
  it("v4 is gated to professional+ tiers (free/starter stay v3-only)", () => {
    // professional + enterprise include v4; free + starter do not.
    expect(KEYS).toMatch(/"professional":[\s\S]{0,400}"allowed_versions":\s*\["v1",\s*"v3",\s*"v4"\]/)
    expect(KEYS).toMatch(/"enterprise":[\s\S]{0,400}"allowed_versions":\s*\["v1",\s*"v3",\s*"v4"\]/)
    expect(KEYS).toMatch(/"free":[\s\S]{0,400}"allowed_versions":\s*\["v3"\]/)
    expect(KEYS).toMatch(/"starter":[\s\S]{0,400}"allowed_versions":\s*\["v3"\]/)
  })
  it("CUAExecutor honours a per-run version override (so a run can pin v3/v4)", () => {
    expect(CUA_EXEC).toMatch(/cua_version:\s*Optional\[str\]\s*=\s*None/)
    expect(CUA_EXEC).toMatch(/self\._cua_version_override/)
    expect(CUA_EXEC).toMatch(/_resolved_version = self\._cua_version_override or get_version\(\)/)
    expect(CUA_EXEC).toMatch(/get_agent_class\(_resolved_version\)/)
    expect(CUA_EXEC).toMatch(/get_grounding_class\(_resolved_version\)/)
  })
})

describe("scopes — runs + workflows are first-class and granted by default", () => {
  it("declares the four new scopes", () => {
    expect(KEYS).toMatch(/SCOPE_RUNS_READ\s*=\s*"runs:read"/)
    expect(KEYS).toMatch(/SCOPE_RUNS_WRITE\s*=\s*"runs:write"/)
    expect(KEYS).toMatch(/SCOPE_WORKFLOWS_READ\s*=\s*"workflows:read"/)
    expect(KEYS).toMatch(/SCOPE_WORKFLOWS_WRITE\s*=\s*"workflows:write"/)
  })
  it("includes them in ALL_SCOPES and DEFAULT_SCOPES_LIST", () => {
    const allScopes = KEYS.slice(KEYS.indexOf("ALL_SCOPES"), KEYS.indexOf("DEFAULT_SCOPES_LIST"))
    for (const s of ["SCOPE_RUNS_READ", "SCOPE_RUNS_WRITE", "SCOPE_WORKFLOWS_READ", "SCOPE_WORKFLOWS_WRITE"]) {
      expect(allScopes, `ALL_SCOPES has ${s}`).toContain(s)
    }
    const def = KEYS.slice(KEYS.indexOf("DEFAULT_SCOPES_LIST"), KEYS.indexOf("DEFAULT_SCOPES_LIST") + 1200)
    for (const s of ["SCOPE_RUNS_READ", "SCOPE_RUNS_WRITE", "SCOPE_WORKFLOWS_READ", "SCOPE_WORKFLOWS_WRITE"]) {
      expect(def, `DEFAULT has ${s}`).toContain(s)
    }
  })
})

describe("dashboard key-mint (route.ts) stays in lockstep with the backend scopes", () => {
  // The Next.js dashboard route mints keys into the SAME api_keys table the
  // FastAPI backend validates against. When route.ts's scope set drifted NARROW
  // of the backend, dashboard-minted keys silently 403'd (INSUFFICIENT_SCOPE)
  // on the entire runs/workflows/machines surface even though the key was valid.
  // These guards pin the two together so that can't regress.
  const ROUTE = read("app/api/developers/route.ts")

  // The literal scope strings the backend DEFAULT_SCOPES_LIST grants a fresh
  // key. Since the machines-API expansion this includes the FULL machine
  // lifecycle (machines:write, terminal:exec, files:write, snapshots:write) —
  // only the two high-risk scopes (connection:read, browser:execute) stay
  // opt-in.
  const BACKEND_DEFAULT = [
    "predict", "session", "ground", "parse",
    "machines:read", "machines:write",
    "actions:exec", "terminal:exec",
    "files:read", "files:write",
    "snapshots:write",
    "runs:read", "runs:write", "workflows:read", "workflows:write",
  ]

  it("route.ts DEFAULT_SCOPES grants every backend default scope (no narrow drift)", () => {
    const start = ROUTE.indexOf("const DEFAULT_SCOPES")
    expect(start, "DEFAULT_SCOPES declared in route.ts").toBeGreaterThan(-1)
    const block = ROUTE.slice(start, ROUTE.indexOf("]", start) + 1)
    for (const s of BACKEND_DEFAULT) {
      expect(block, `DEFAULT_SCOPES includes "${s}"`).toContain(`"${s}"`)
    }
  })

  it("high-risk scopes stay OUT of route.ts DEFAULT_SCOPES (opt-in only)", () => {
    // connection:read returns plaintext SSH keys + VNC passwords;
    // browser:execute runs arbitrary JS. Granting them silently to every
    // fresh key would be a privilege-escalation regression — pin them out.
    const start = ROUTE.indexOf("const DEFAULT_SCOPES")
    const block = ROUTE.slice(start, ROUTE.indexOf("]", start) + 1)
    for (const s of ["connection:read", "browser:execute"]) {
      expect(block, `DEFAULT_SCOPES must NOT include "${s}"`).not.toContain(`"${s}"`)
    }
  })

  it("backend DEFAULT_SCOPES_LIST matches the same machine-lifecycle expansion", () => {
    const def = KEYS.slice(KEYS.indexOf("DEFAULT_SCOPES_LIST"), KEYS.indexOf("DEFAULT_SCOPES_LIST") + 1200)
    for (const s of ["SCOPE_MACHINES_WRITE", "SCOPE_TERMINAL_EXEC", "SCOPE_FILES_WRITE", "SCOPE_SNAPSHOTS_WRITE"]) {
      expect(def, `backend DEFAULT has ${s}`).toContain(s)
    }
    for (const s of ["SCOPE_CONNECTION_READ", "SCOPE_BROWSER_EXECUTE"]) {
      expect(def, `backend DEFAULT must NOT have ${s}`).not.toContain(s)
    }
  })

  it("route.ts validates against a full ALL_SCOPES allowlist (can grant elevated scopes)", () => {
    const start = ROUTE.indexOf("const ALL_SCOPES")
    expect(start, "ALL_SCOPES allowlist declared in route.ts").toBeGreaterThan(-1)
    const block = ROUTE.slice(start, ROUTE.indexOf("])", start) + 2)
    // ALL_SCOPES must build on the full default set (so runs/workflows/machines
    // read+write the user's key needed are all allowed)…
    expect(block, "ALL_SCOPES spreads DEFAULT_SCOPES").toContain("...DEFAULT_SCOPES")
    // …plus the opt-in extras a caller can request beyond the defaults.
    for (const s of ["keys", "usage", "browser:execute", "connection:read",
                     "schedules:read", "schedules:write", "triggers:write"]) {
      expect(block, `ALL_SCOPES allows "${s}"`).toContain(`"${s}"`)
    }
    // Validation must check the allowlist, not the (narrower) default set.
    expect(ROUTE).toMatch(/!ALL_SCOPES\.has\(s\)/)
  })

  it("backend create_key defaults empty scopes to DEFAULT_SCOPES_LIST (never mints a scopeless key)", () => {
    expect(KEYS).toMatch(/if not scopes:\s*\n\s*scopes = list\(DEFAULT_SCOPES_LIST\)/)
  })
})

describe("run service — billing, ownership, takeover, SSRF, kill-switch", () => {
  it("bills per step against the dollar wallet, idempotently per (run, step)", () => {
    expect(RUN_SVC).toMatch(/api_billing_service\.charge/)
    expect(RUN_SVC).toMatch(/f"\{run_request_id\}:step:\{step_index\}"/)
    expect(RUN_SVC).toMatch(/calculate_cost\(endpoint="predict",\s*cua_version=cua_version\)/)
  })
  it("test-mode keys never bill and never touch a real VM", () => {
    expect(RUN_SVC).toMatch(/if is_test:\s*\n\s*return True, 0, 0/)
    expect(RUN_SVC).toMatch(/async def _drive_test/)
  })
  it("wallet-exhausted mid-run stops the run (WALLET_EXHAUSTED)", () => {
    expect(RUN_SVC).toMatch(/WALLET_EXHAUSTED/)
    expect(RUN_SVC).toMatch(/if not ok_bill:/)
  })
  it("ownership is enforced — a machine must belong to the key's user", () => {
    expect(RUN_SVC).toMatch(/_machine_owned_by/)
    expect(RUN_SVC).toMatch(/db_service\.get_machine\(machine_id, user_id\)/)
    expect(RUN_SVC).toMatch(/MACHINE_NOT_FOUND/)
  })
  it("backpressure caps concurrent in-flight runs per user", () => {
    expect(RUN_SVC).toMatch(/RUNS_MAX_CONCURRENT_PER_USER/)
    expect(RUN_SVC).toMatch(/TOO_MANY_RUNS/)
  })
  it("human takeover: pause transitions to awaiting_human; fail/cancel stop immediately", () => {
    expect(RUN_SVC).toMatch(/"running"\], "awaiting_human"/)
    expect(RUN_SVC).toMatch(/resume_from_human/)
    expect(RUN_SVC).toMatch(/if ah_policy in \("fail", "cancel"\):/)
  })
  it("awaiting_human timeout maps to timed_out, not a silent resume", () => {
    expect(RUN_SVC).toMatch(/AWAITING_HUMAN_TIMEOUT/)
    expect(RUN_SVC).toMatch(/final_status = "timed_out"/)
  })
  it("SSRF guard refuses private/loopback/link-local webhook hosts (fail-closed)", () => {
    expect(RUN_SVC).toMatch(/def _host_is_safe/)
    expect(RUN_SVC).toMatch(/ip\.is_private or ip\.is_loopback or ip\.is_link_local/)
    // fail-closed on resolution failure
    expect(RUN_SVC).toMatch(/except Exception:\s*\n\s*return False/)
  })
  it("webhooks are HMAC-signed with the documented Coasty-Signature scheme", () => {
    expect(RUN_SVC).toMatch(/Coasty-Signature/)
    expect(RUN_SVC).toMatch(/hmac\.new\(secret\.encode/)
    expect(RUN_SVC).toMatch(/f"t=\{ts\},v1=\{sig\}"/)
  })
  it("the terminal commit goes through the chokepoint from any active state", () => {
    expect(RUN_SVC).toMatch(/\["queued", "running", "awaiting_human"\], final_status, patch/)
  })
  it("crash-recovery reaps + claims orphans (FOR UPDATE SKIP LOCKED via RPC)", () => {
    expect(RUN_SVC).toMatch(/agent_run_reap_stale/)
    expect(RUN_SVC).toMatch(/agent_run_claim/)
    expect(RUN_SVC).toMatch(/async def recovery_loop/)
  })
})

describe("run routes — scopes, kill-switch, idempotency, SSE replay", () => {
  it("each route asserts the right scope", () => {
    // window sized to span the idempotency reservation block between the
    // scope check and the service call
    expect(RUN_ROUTES).toMatch(/enforce_scope\(SCOPE_RUNS_WRITE\)[\s\S]{0,3500}create_run/)
    expect(RUN_ROUTES).toMatch(/enforce_scope\(SCOPE_RUNS_READ\)/)
  })
  it("respects the RUNS_API_ENABLED kill-switch", () => {
    expect(RUN_ROUTES).toMatch(/def _ensure_enabled/)
    expect(RUN_ROUTES).toMatch(/RUNS_API_ENABLED/)
    expect(RUN_ROUTES).toMatch(/RUNS_API_DISABLED/)
  })
  it("create is idempotent via the Idempotency-Key header (reserve protocol)", () => {
    // The reservation protocol (not the old lookup-then-store): the key is
    // atomically CLAIMED before execution so a retry that lands mid-flight
    // gets 409 IDEMPOTENCY_IN_FLIGHT instead of a second run + charge.
    // (The 2026-06-10 live double-bill was the lookup-then-store hole.)
    expect(RUN_ROUTES).toMatch(/idempotency_reserve_full/)
    expect(RUN_ROUTES).toMatch(/IDEMPOTENCY_KEY_REUSED/)
    expect(RUN_ROUTES).toMatch(/IDEMPOTENCY_IN_FLIGHT/)
    // never persist the one-time webhook secret into the idempotency cache
    expect(RUN_ROUTES).toMatch(/safe\["webhook_secret"\]\s*=\s*None/)
  })
  it("SSE stream supports Last-Event-ID replay and closes on a 'done' event", () => {
    expect(RUN_ROUTES).toMatch(/Last-Event-ID/)
    expect(RUN_ROUTES).toMatch(/after_seq/)
    expect(RUN_ROUTES).toMatch(/media_type="text\/event-stream"/)
    expect(RUN_ROUTES).toMatch(/any\(e\.get\("type"\) == "done"/)
  })
  it("v4 is tier-gated at the route layer too", () => {
    expect(RUN_ROUTES).toMatch(/allowed_versions/)
    expect(RUN_ROUTES).toMatch(/FEATURE_NOT_AVAILABLE/)
  })
})

describe("config flags + mounts", () => {
  it("declares the runs kill-switch and tuning knobs", () => {
    for (const k of ["RUNS_API_ENABLED", "RUNS_MAX_CONCURRENT_PER_USER", "RUNS_MAX_DEADLINE_SECONDS",
                     "RUNS_IDLE_TIMEOUT_SECONDS", "RUNS_HEARTBEAT_SECONDS", "RUNS_REAP_STALE_SECONDS"]) {
      expect(CONFIG, `config has ${k}`).toContain(k)
    }
  })
  it("mounts /v1/runs gated by service mode 'api'", () => {
    expect(MAIN).toMatch(/_mount_if\(\{"api"\}, public_runs\.router, prefix="\/v1\/runs"/)
  })
  it("wires the runs recovery loop on startup behind the flag", () => {
    expect(MAIN).toMatch(/RUNS_API_ENABLED[\s\S]{0,160}public_run_service\.recovery_loop\(\)/)
  })
})
