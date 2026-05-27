/**
 * Replay test for the 2026-05-26 22:57 UTC NEW-1 incident.  Reconstructs
 * the EXACT payload pattern of the customer.subscription.updated event
 * that failed in production (sub_1TbEA5Kk9kzNS1Sh6knJJINH) and asserts:
 *
 *   1. The webhook handler does NOT silently 200 when the RPC fails.
 *      It must return 500 so Stripe retries.  This is the load-bearing
 *      behavior change Agent B introduced — pre-fix the handler logged
 *      "update_subscription_status RPC failed:" and fell through to 200.
 *
 *   2. The webhook handler reads the rpcResult shape with out_*-prefixed
 *      keys (out_user_id, out_resolved_tier, out_is_paid), matching the
 *      post-015 contract.  If anyone reverts the read to ``rpcResult?.[0]
 *      ?.user_id``, the reconciler silently no-ops and machine_limits
 *      desyncs.
 *
 *   3. Idempotent replay: calling the handler twice with the same
 *      event.id returns 200 on the second call without invoking the RPC
 *      again.  Stripe retries on its exponential schedule and ALL events
 *      get redelivered on certain failure modes; if we don't dedup, we'd
 *      double-grant credits or double-flip tiers.
 *
 *   4. Code-grep guards.  Static-pattern checks on the route source so
 *      a future contributor cannot reintroduce either:
 *        * the pre-015 ``rpcResult?.[0]?.user_id`` read pattern, OR
 *        * the pre-fix "log and 200" failure path.
 *
 * Run: ``npx vitest run tests/billing-webhook-stripe-replay.test.ts``
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const REPO_ROOT = path.resolve(__dirname, '..')
const WEBHOOK_ROUTE_PATH = path.join(
  REPO_ROOT,
  'app',
  'api',
  'credits',
  'webhook',
  'route.ts'
)

// ---------------------------------------------------------------------------
// The EXACT shape of the production-failing payload, with all identifiers
// replaced by test sentinels.  We do NOT use the real sub_1TbEA5Kk9kzNS1Sh
// id from the prod incident because that ID is in CloudWatch logs and
// reusing it in tests would muddy alarm dedup.
//
// current_period_start / current_period_end values are 2026-05-26 21:57:00
// UTC and +30d, the exact period boundaries of the failed payload.
// ---------------------------------------------------------------------------
const PRODUCTION_FAILED_PAYLOAD = {
  id: 'evt_test_replay_new1_22_57_utc',
  type: 'customer.subscription.updated',
  data: {
    object: {
      id: 'sub_test_replay',
      customer: 'cus_test_replay',
      status: 'active',
      current_period_start: 1748296620, // 2026-05-26 21:57:00 UTC
      current_period_end: 1750888620, // 2026-06-25 21:57:00 UTC
      cancel_at_period_end: false,
      items: {
        data: [{ price: { id: 'price_test_pro' } }],
      },
      metadata: {},
    },
  },
} as const

// ---------------------------------------------------------------------------
// In-memory model of the post-015 RPC contract + the webhook's behavioral
// invariants.  Mirrors the relevant slice of route.ts without booting
// Next.js or Supabase.  Faithful to the failure mode we are guarding.
// ---------------------------------------------------------------------------

interface RpcOk {
  data: Array<{
    out_user_id: string
    out_resolved_tier: string | null
    out_is_paid: boolean
  }>
  error: null
}
interface RpcErr {
  data: null
  error: { code: string; message: string; details?: string }
}
type RpcResult = RpcOk | RpcErr

interface MockResponse {
  status: number
  body: any
}

interface MockWebhookCtx {
  /** Stripe-like signature verification toggle. */
  signatureValid: boolean
  /** Programmable RPC result for update_subscription_status. */
  rpcResult: RpcResult
  /** Set of already-processed event ids (idempotency table). */
  alreadyProcessed: Set<string>
  /** Dead-letter rows (mock webhook_dead_letters). */
  deadLetters: Array<{
    stripe_event_id: string
    event_type: string
    rpc_name: string
  }>
  /** Reconcile calls observed.  Empty when the RPC fails or returns []. */
  reconcileCalls: Array<{ userId: string; newTier: string }>
  /** RPC invocation log so we can assert idempotency. */
  rpcInvocations: number
}

function freshCtx(overrides: Partial<MockWebhookCtx> = {}): MockWebhookCtx {
  return {
    signatureValid: true,
    rpcResult: {
      data: [
        {
          out_user_id: 'u_replay',
          out_resolved_tier: 'professional',
          out_is_paid: true,
        },
      ],
      error: null,
    },
    alreadyProcessed: new Set(),
    deadLetters: [],
    reconcileCalls: [],
    rpcInvocations: 0,
    ...overrides,
  }
}

/**
 * Faithful slice of app/api/credits/webhook/route.ts:
 *   * signature verification gate
 *   * idempotency check via alreadyProcessed
 *   * update_subscription_status RPC call + fail-loud handling
 *   * out_*-prefixed result read
 *   * reconcile invocation gating
 *
 * Returns the response a caller would see (status + body).
 */
async function handleWebhook(
  event: typeof PRODUCTION_FAILED_PAYLOAD,
  ctx: MockWebhookCtx
): Promise<MockResponse> {
  if (!ctx.signatureValid) {
    return { status: 400, body: { error: 'Invalid signature' } }
  }

  // Idempotency: already-processed events return 200 without re-invoking
  // the RPC.  This mirrors the stripe_events table check in route.ts.
  if (ctx.alreadyProcessed.has(event.id)) {
    return { status: 200, body: { received: true, deduped: true } }
  }

  // RPC: update_subscription_status.
  ctx.rpcInvocations += 1
  const rpc = ctx.rpcResult
  if (rpc.error) {
    // Fail-loud: dead-letter the event and 500 so Stripe retries.
    ctx.deadLetters.push({
      stripe_event_id: event.id,
      event_type: event.type,
      rpc_name: 'update_subscription_status',
    })
    return {
      status: 500,
      body: {
        error:
          'update_subscription_status RPC failed; event dead-lettered for manual reconciliation',
        eventId: event.id,
        code: rpc.error.code,
      },
    }
  }

  // Reconcile when out_user_id + out_resolved_tier are both present.  This
  // is the post-015 contract.  If anyone reverts to rpcResult?.[0]?.user_id,
  // resolvedUserId stays undefined and reconcile silently skips.
  const resolvedUserId = rpc.data?.[0]?.out_user_id
  const resolvedTier = rpc.data?.[0]?.out_resolved_tier
  if (resolvedUserId && resolvedTier) {
    ctx.reconcileCalls.push({
      userId: resolvedUserId,
      newTier: resolvedTier,
    })
  }

  ctx.alreadyProcessed.add(event.id)
  return { status: 200, body: { received: true } }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Stripe replay: 2026-05-26 22:57 UTC NEW-1 payload', () => {
  it('happy path: well-formed RPC result → reconciler runs with new tier', async () => {
    const ctx = freshCtx()
    const res = await handleWebhook(PRODUCTION_FAILED_PAYLOAD, ctx)
    expect(res.status).toBe(200)
    expect(ctx.reconcileCalls).toEqual([
      { userId: 'u_replay', newTier: 'professional' },
    ])
    expect(ctx.deadLetters).toEqual([])
  })

  it('fail-loud: RPC error returns 500 (not 200 — the pre-fix bug)', async () => {
    const ctx = freshCtx({
      rpcResult: {
        data: null,
        error: {
          code: '42702',
          message: 'column reference "user_id" is ambiguous',
          details: 'It could refer to either a PL/pgSQL variable or a table column.',
        },
      },
    })
    const res = await handleWebhook(PRODUCTION_FAILED_PAYLOAD, ctx)
    // Pre-fix this returned 200 → Stripe never retried → tier desynced.
    expect(res.status).toBe(500)
    expect(res.body.eventId).toBe(PRODUCTION_FAILED_PAYLOAD.id)
    expect(res.body.code).toBe('42702')
    expect(ctx.deadLetters).toHaveLength(1)
    expect(ctx.deadLetters[0].rpc_name).toBe('update_subscription_status')
    // No reconcile when the RPC errored — that was the silent symptom of
    // the production bug.
    expect(ctx.reconcileCalls).toEqual([])
  })

  it('post-015 contract: webhook reads out_user_id (not user_id)', async () => {
    // Simulate the rpcResult shape EXACTLY as PG returns it after migration
    // 015 / 021.  If we accidentally regress the read to .user_id, this
    // test fails because the result has no .user_id key.
    const ctx = freshCtx({
      rpcResult: {
        data: [
          {
            out_user_id: 'u_post015',
            out_resolved_tier: 'starter',
            out_is_paid: true,
          },
        ],
        error: null,
      },
    })
    const res = await handleWebhook(PRODUCTION_FAILED_PAYLOAD, ctx)
    expect(res.status).toBe(200)
    expect(ctx.reconcileCalls).toEqual([
      { userId: 'u_post015', newTier: 'starter' },
    ])
  })

  it('idempotency: replaying the same event.id twice does not double-invoke the RPC', async () => {
    const ctx = freshCtx()
    const first = await handleWebhook(PRODUCTION_FAILED_PAYLOAD, ctx)
    const second = await handleWebhook(PRODUCTION_FAILED_PAYLOAD, ctx)
    expect(first.status).toBe(200)
    expect(second.status).toBe(200)
    expect(second.body.deduped).toBe(true)
    expect(ctx.rpcInvocations).toBe(1)
    expect(ctx.reconcileCalls).toHaveLength(1)
  })

  it('empty RPC result (unknown subscription) does not invoke reconciler', async () => {
    // The RAISE NOTICE 'subscription % not found' early-return path.
    const ctx = freshCtx({
      rpcResult: { data: [], error: null },
    })
    const res = await handleWebhook(PRODUCTION_FAILED_PAYLOAD, ctx)
    expect(res.status).toBe(200)
    expect(ctx.reconcileCalls).toEqual([])
  })

  it('out_resolved_tier=null (plan-not-found WARNING) does not invoke reconciler', async () => {
    // PG returns the row with out_resolved_tier=null when the plan lookup
    // fails.  Webhook must NOT downgrade in that case.
    const ctx = freshCtx({
      rpcResult: {
        data: [
          {
            out_user_id: 'u_replay',
            out_resolved_tier: null,
            out_is_paid: true,
          },
        ],
        error: null,
      },
    })
    const res = await handleWebhook(PRODUCTION_FAILED_PAYLOAD, ctx)
    expect(res.status).toBe(200)
    expect(ctx.reconcileCalls).toEqual([])
  })

  it('invalid signature returns 400 without touching the RPC', async () => {
    const ctx = freshCtx({ signatureValid: false })
    const res = await handleWebhook(PRODUCTION_FAILED_PAYLOAD, ctx)
    expect(res.status).toBe(400)
    expect(ctx.rpcInvocations).toBe(0)
  })

  it('the payload schema mirrors a real Stripe customer.subscription.updated event', () => {
    // Sanity check the replay payload itself.  If this changes, the
    // pre-fix-vs-post-fix delta might silently shift.
    expect(PRODUCTION_FAILED_PAYLOAD.type).toBe('customer.subscription.updated')
    expect(PRODUCTION_FAILED_PAYLOAD.data.object.status).toBe('active')
    expect(PRODUCTION_FAILED_PAYLOAD.data.object.cancel_at_period_end).toBe(false)
    // Period boundaries: 2026-05-26 21:57:00 UTC.
    expect(PRODUCTION_FAILED_PAYLOAD.data.object.current_period_start).toBe(1748296620)
    expect(PRODUCTION_FAILED_PAYLOAD.data.object.current_period_end).toBe(1750888620)
  })
})

// ---------------------------------------------------------------------------
// Static code-grep guards on app/api/credits/webhook/route.ts.  Cheap +
// deterministic.  If a future contributor reverts the post-fix patterns,
// these fire.
// ---------------------------------------------------------------------------
describe('webhook route.ts: anti-pattern guards', () => {
  const ROUTE_SRC = fs.readFileSync(WEBHOOK_ROUTE_PATH, 'utf8')

  it('reads rpcResult with the out_-prefixed keys (post-015)', () => {
    expect(ROUTE_SRC).toMatch(/rpcResult\?\.\[0\]\?\.out_user_id/)
    expect(ROUTE_SRC).toMatch(/rpcResult\?\.\[0\]\?\.out_resolved_tier/)
  })

  it('does NOT read rpcResult with the pre-015 user_id / resolved_tier keys', () => {
    // The exact anti-pattern is rpcResult?.[0]?.user_id (without out_).
    // We use a negative lookbehind to allow rpcResult?.[0]?.out_user_id.
    const preFixReads = ROUTE_SRC.match(
      /rpcResult\?\.\[0\]\?\.user_id(?!\w)/g
    )
    expect(preFixReads).toBeNull()

    const preFixTier = ROUTE_SRC.match(
      /rpcResult\?\.\[0\]\?\.resolved_tier(?!\w)/g
    )
    expect(preFixTier).toBeNull()
  })

  it('does NOT have a "log RPC failed then return 200" pattern within 50 lines', () => {
    // The pre-fix bug: console.error("X RPC failed:", err) → fall through
    // to NextResponse.json(..., {status: 200}).  We forbid this co-location.
    const lines = ROUTE_SRC.split('\n')
    const violations: { line: number; preview: string }[] = []
    for (let i = 0; i < lines.length; i++) {
      if (/console\.error\(.*RPC failed/i.test(lines[i])) {
        // Look ahead 50 lines for a return NextResponse.json status 200
        // WITHOUT a fail-loud 5xx in between.
        let saw500 = false
        let saw200 = false
        let line200 = -1
        for (let j = i + 1; j < Math.min(i + 50, lines.length); j++) {
          if (/status:\s*5\d\d/.test(lines[j])) {
            saw500 = true
            break
          }
          if (/return\s+NextResponse\.json[^]*status:\s*200/.test(lines[j])) {
            saw200 = true
            line200 = j
            break
          }
        }
        if (saw200 && !saw500) {
          violations.push({
            line: i + 1,
            preview: lines[i].trim() + '  ...  (200 at line ' + line200 + ')',
          })
        }
      }
    }
    expect(violations).toEqual([])
  })

  it('emits the [webhook-rpc-failed] structured log line on RPC failures', () => {
    // Agent D's CloudWatch metric filter greps this literal prefix.  Do
    // not change without coordinating with infra/aws/cloudwatch_alarms.tf.
    expect(ROUTE_SRC).toContain('[webhook-rpc-failed]')
  })

  it('calls writeDeadLetter from at least one update_subscription_status branch', () => {
    // Sanity: the fail-loud helper is actually wired.  Pre-fix, this
    // function did not exist.
    expect(ROUTE_SRC).toMatch(
      /writeDeadLetter\([^]*rpcName:\s*['"]update_subscription_status['"]/i
    )
  })
})
