/**
 * workflows-api.test.ts — anti-drift guards for the Workflows engine (Phase 3).
 *
 * Pins the DSL grammar, the no-eval (injection-safe) condition evaluator, the
 * HARD guards (budget_cents / max_iterations / deadline), version pinning of
 * in-flight runs, the shared run state machine, route ordering, scopes, and the
 * kill-switch. Runs in CI via vitest (reads SQL + Python as text).
 */
import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const root = process.cwd()
const read = (p: string) => readFileSync(join(root, p), "utf8")

const M026 = read("supabase/migrations/026_workflows.sql")
const WF_MODELS = read("backend/app/models/public_workflows.py")
const WF_ENGINE = read("backend/app/services/workflow_engine.py")
const WF_ROUTES = read("backend/app/api/routes/public_workflows.py")
const CONFIG = read("backend/app/core/config.py")
const MAIN = read("backend/main.py")

const STATES = ["queued", "running", "awaiting_human", "succeeded", "failed", "cancelled", "timed_out"]
const STEP_TYPES = ["task", "assert", "if", "loop", "parallel", "human_approval", "retry", "succeed", "fail"]
const COND_OPS = ["eq", "ne", "lt", "gt", "lte", "gte", "contains", "truthy", "falsy", "exists", "and", "or", "not"]

describe("026 migration — workflows + workflow_runs schema", () => {
  it("creates workflows, workflow_runs, workflow_run_events", () => {
    expect(M026).toMatch(/CREATE TABLE IF NOT EXISTS public\.workflows/)
    expect(M026).toMatch(/CREATE TABLE IF NOT EXISTS public\.workflow_runs/)
    expect(M026).toMatch(/CREATE TABLE IF NOT EXISTS public\.workflow_run_events/)
  })

  it("pins the workflow DSL by VALUE into the run (in-flight version pinning)", () => {
    // The run snapshots the definition so editing the workflow never mutates a
    // running execution.
    expect(M026).toMatch(/definition\s+jsonb NOT NULL,/)
    expect(M026).toMatch(/workflow_version integer/)
    expect(M026).toMatch(/PINNING/i)
  })

  it("links task-step runs back to the workflow run (additive columns + FK)", () => {
    expect(M026).toMatch(/ALTER TABLE public\.agent_runs\s+ADD COLUMN IF NOT EXISTS workflow_run_id uuid/)
    expect(M026).toMatch(/ADD COLUMN IF NOT EXISTS workflow_step_id text/)
    expect(M026).toMatch(/agent_runs_workflow_run_fk[\s\S]{0,160}REFERENCES public\.workflow_runs\(id\) ON DELETE SET NULL/)
  })

  it("shares the run state machine vocabulary", () => {
    for (const s of STATES) expect(M026, `workflow status '${s}'`).toContain(`'${s}'`)
    expect(M026).toMatch(/CREATE OR REPLACE FUNCTION public\.workflow_run_transition/)
    expect(M026).toMatch(/v_terminal text\[\] := ARRAY\['succeeded','failed','cancelled','timed_out'\]/)
  })

  it("workflow_run_add_spend is the race-safe budget + iteration guard", () => {
    expect(M026).toMatch(/CREATE OR REPLACE FUNCTION public\.workflow_run_add_spend/)
    expect(M026).toMatch(/FOR UPDATE/)
    // exceeded when over budget OR over max iterations
    expect(M026).toMatch(/\(v_budget > 0 AND v_spent > v_budget\) OR \(v_iters > v_max\)/)
    expect(M026).toMatch(/outcome := 'exceeded'/)
    // budget 0 = unlimited
    expect(M026).toMatch(/0 = unlimited|0 means unlimited|never exceeds/i)
  })

  it("claim/heartbeat/reap mirror the runs plumbing (SKIP LOCKED + fencing)", () => {
    expect(M026).toMatch(/CREATE OR REPLACE FUNCTION public\.workflow_run_claim[\s\S]{0,400}FOR UPDATE SKIP LOCKED/)
    expect(M026).toMatch(/CREATE OR REPLACE FUNCTION public\.workflow_run_heartbeat[\s\S]{0,400}v_owner <> p_worker_id/)
    expect(M026).toMatch(/CREATE OR REPLACE FUNCTION public\.workflow_run_reap_stale/)
  })

  it("RLS: service writes, users read own; events cascade-delete", () => {
    expect(M026).toMatch(/ALTER TABLE public\.workflow_runs\s+ENABLE ROW LEVEL SECURITY/)
    expect(M026).toMatch(/Users can view own workflow_runs[\s\S]{0,140}FOR SELECT TO authenticated/)
    expect(M026).toMatch(/run_id\s+uuid NOT NULL REFERENCES public\.workflow_runs\(id\) ON DELETE CASCADE/)
  })

  it("idempotency: one workflow run per (user_id, idempotency_key)", () => {
    expect(M026).toMatch(/uq_workflow_runs_user_idem[\s\S]{0,120}\(user_id, idempotency_key\)[\s\S]{0,60}WHERE idempotency_key IS NOT NULL/)
  })
})

describe("DSL grammar — step types + structured conditions", () => {
  it("models declare exactly the 9 step types", () => {
    for (const t of STEP_TYPES) expect(WF_MODELS, `step type ${t}`).toContain(`"${t}"`)
  })
  it("conditions are STRUCTURED ops (no free-text expressions)", () => {
    for (const op of COND_OPS) expect(WF_MODELS, `cond op ${op}`).toContain(`"${op}"`)
  })
  it("there is NO eval/exec anywhere in the engine (injection-safe)", () => {
    // No dynamic code execution on customer-supplied conditions/templates.
    // (re.compile for the {{ref}} regex is fine — only Python's eval/exec and a
    // bare compile() would be code-execution primitives.)
    expect(WF_ENGINE).not.toMatch(/\beval\s*\(/)
    expect(WF_ENGINE).not.toMatch(/\bexec\s*\(/)
    expect(WF_ENGINE).not.toMatch(/(?<!re\.)(?<!\w)compile\s*\(/)
  })
})

describe("static validation — fail-loud + bounded", () => {
  it("validates structure, unique ids, depth, and step count", () => {
    expect(WF_ENGINE).toMatch(/def validate_definition/)
    expect(WF_ENGINE).toMatch(/duplicate step id/)
    expect(WF_ENGINE).toMatch(/nesting depth exceeds/)
    expect(WF_ENGINE).toMatch(/unknown step type/)
    expect(WF_ENGINE).toMatch(/max is \{max_steps\}|max is/)
  })
  it("bounds parallel branches and retry attempts", () => {
    expect(WF_ENGINE).toMatch(/parallel supports at most 16 branches/)
    expect(WF_ENGINE).toMatch(/retry\.max_attempts must be an int in 1\.\.20/)
  })
  it("the engine enforces guards on every loop/task boundary", () => {
    expect(WF_ENGINE).toMatch(/workflow_run_add_spend/)
    expect(WF_ENGINE).toMatch(/DEADLINE_EXCEEDED/)
    expect(WF_ENGINE).toMatch(/LOOP_LIMIT/)
    // while-loops accrue an iteration against the global guard so they can't spin forever
    expect(WF_ENGINE).toMatch(/count_iteration=True/)
  })
})

describe("engine — task steps are runs; human_approval pauses the workflow", () => {
  it("task steps execute a real run inline and bind the result", () => {
    expect(WF_ENGINE).toMatch(/public_run_service\.execute_inline/)
    expect(WF_ENGINE).toMatch(/workflow_run_id=state\.run_id/)
    expect(WF_ENGINE).toMatch(/state\.ctx\[sa\]\s*=\s*binding/)
  })
  it("human_approval transitions to awaiting_human and waits cross-replica", () => {
    expect(WF_ENGINE).toMatch(/"running"\], "awaiting_human"/)
    expect(WF_ENGINE).toMatch(/APPROVAL_TIMEOUT/)
    // resume(approved=false) is a terminal failure
    expect(WF_ENGINE).toMatch(/HUMAN_REJECTED/)
  })
  it("variable refs resolve dotted paths; templating substitutes into task text", () => {
    expect(WF_ENGINE).toMatch(/def _lookup_path/)
    expect(WF_ENGINE).toMatch(/def _substitute_str/)
    expect(WF_ENGINE).toMatch(/def _eval_condition/)
  })
  it("crash-recovery reaps + claims orphaned workflow runs", () => {
    expect(WF_ENGINE).toMatch(/workflow_run_reap_stale/)
    expect(WF_ENGINE).toMatch(/workflow_run_claim/)
    expect(WF_ENGINE).toMatch(/async def recovery_loop/)
  })
})

describe("workflow routes — ordering, scopes, kill-switch", () => {
  it("declares the static /runs subtree BEFORE the dynamic /{workflow_id}", () => {
    const runsIdx = WF_ROUTES.indexOf('@router.post("/runs"')
    const dynIdx = WF_ROUTES.indexOf('@router.get("/{workflow_id}"')
    expect(runsIdx).toBeGreaterThan(0)
    expect(dynIdx).toBeGreaterThan(0)
    expect(runsIdx).toBeLessThan(dynIdx)
  })
  it("write routes require workflows:write, read routes workflows:read", () => {
    expect(WF_ROUTES).toMatch(/enforce_scope\(SCOPE_WORKFLOWS_WRITE\)/)
    expect(WF_ROUTES).toMatch(/enforce_scope\(SCOPE_WORKFLOWS_READ\)/)
  })
  it("respects the WORKFLOWS_API_ENABLED kill-switch", () => {
    expect(WF_ROUTES).toMatch(/WORKFLOWS_API_ENABLED/)
    expect(WF_ROUTES).toMatch(/WORKFLOWS_API_DISABLED/)
  })
  it("start-run is idempotent and supports both saved + ad-hoc definitions", () => {
    expect(WF_ROUTES).toMatch(/start_adhoc_run/)
    expect(WF_ROUTES).toMatch(/start_workflow_run/)
    expect(WF_ROUTES).toMatch(/IDEMPOTENCY_KEY_REUSED/)
  })
})

describe("config flags + mount", () => {
  it("declares the workflows kill-switch and guard ceilings", () => {
    for (const k of ["WORKFLOWS_API_ENABLED", "WORKFLOWS_MAX_CONCURRENT_PER_USER", "WORKFLOWS_MAX_STEPS",
                     "WORKFLOWS_MAX_ITERATIONS_CEILING", "WORKFLOWS_MAX_DEADLINE_SECONDS", "WORKFLOWS_MAX_NESTING_DEPTH"]) {
      expect(CONFIG, `config has ${k}`).toContain(k)
    }
  })
  it("mounts /v1/workflows and wires the recovery loop behind the flag", () => {
    expect(MAIN).toMatch(/_mount_if\(\{"api"\}, public_workflows\.router, prefix="\/v1\/workflows"/)
    expect(MAIN).toMatch(/WORKFLOWS_API_ENABLED[\s\S]{0,160}workflow_engine\.recovery_loop\(\)/)
  })
})
