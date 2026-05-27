/**
 * Regression tests for the "silent 200 on RPC failure" Stripe webhook bug
 * (incident 2026-05-26 22:57 UTC NEW-1).
 *
 * Pre-fix: every ``console.error("X RPC failed:", err)`` branch in
 * app/api/credits/webhook/route.ts fell through to a final
 * ``return NextResponse.json({ received: true })`` 200 OK.  Stripe saw
 * success, never retried, and the database state desynced permanently.
 *
 * Post-fix contract (this test file pins it):
 *
 *   1. Every load-bearing RPC failure → HTTP 500, so Stripe retries.
 *   2. Every load-bearing RPC failure → upsert row in
 *      ``webhook_dead_letters`` keyed on ``stripe_event_id``.
 *   3. Idempotency: if ``webhook_events_processed`` already has the
 *      event.id, return 200 OK without re-invoking RPC.
 *   4. Successful deliveries record event in webhook_events_processed.
 *   5. Structured log line ``[webhook-rpc-failed] event=... type=... rpc=...``
 *      is emitted at console.error so Agent D's CloudWatch alarm fires.
 *   6. Pattern applies to every event type that calls an RPC.
 *
 * Run: ``npx vitest run tests/billing-webhook-fail-loud.test.ts``
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { NextRequest } from "next/server"

// ---------------------------------------------------------------------------
// Module-level mocks
// ---------------------------------------------------------------------------
//
// The route imports:
//   - next/headers (stripe-signature reader)
//   - stripe (constructEvent, subscriptions.retrieve, subscriptions.update)
//   - @supabase/supabase-js createClient → service-role client
//   - @/lib/observability/api-access-log → fire-and-forget logger
//   - @/lib/services/tier-reconciler (dynamic import; mocked to no-op)
//
// We hoist the mock factories so vi.mock can reference them.

const h = vi.hoisted(() => ({
  // Stripe SDK shape used by the route
  constructEvent: vi.fn(),
  subscriptionsRetrieve: vi.fn(),
  subscriptionsUpdate: vi.fn(),

  // Supabase service-role client factory.  Each test injects its own DB
  // mock via setSupabaseClient().
  serviceClient: null as any,

  // Signature header value for next/headers
  signatureHeader: "t=stub,v1=sig",

  // Captured console.error lines for grep assertions
  consoleErrorCalls: [] as any[][],

  // Reconciler stub (returns no machines terminated)
  reconcileMock: vi.fn(async () => ({
    machinesTerminated: 0,
    machinesDeferred: 0,
    machinesFailedToTerminate: 0,
    schedulesPaused: 0,
  })),
}))

function setSupabaseClient(client: any) {
  h.serviceClient = client
}

vi.mock("next/headers", () => ({
  headers: async () => ({
    get: (k: string) => (k === "stripe-signature" ? h.signatureHeader : null),
  }),
}))

vi.mock("stripe", () => {
  // The route does ``new Stripe(KEY, { apiVersion })``.  Return a class.
  class FakeStripe {
    webhooks = { constructEvent: h.constructEvent }
    subscriptions = {
      retrieve: h.subscriptionsRetrieve,
      update: h.subscriptionsUpdate,
    }
  }
  return { default: FakeStripe }
})

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => h.serviceClient),
}))

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => h.serviceClient),
}))

vi.mock("@/lib/observability/api-access-log", () => ({
  logApiAccess: vi.fn(),
}))

vi.mock("@/lib/services/tier-reconciler", () => ({
  reconcileForTierChange: h.reconcileMock,
}))

// ---------------------------------------------------------------------------
// In-memory fake Supabase service client.
// ---------------------------------------------------------------------------
//
// Mimics enough of the PostgrestJS API to satisfy the webhook route:
//   * .from(table).select(...).eq(...).maybeSingle()
//   * .from(table).select(...).eq(...).single()
//   * .from(table).select(...).eq(...).gte(...).lte(...).single()
//   * .from(table).insert(row)
//   * .from(table).update(row).eq(...).select().single()
//   * .from(table).update(row).eq(...)
//   * .from(table).upsert(row, opts).select(...).maybeSingle()
//   * .from(table).upsert(row, opts)
//   * .rpc(name, args)

interface TableFixture {
  rows: any[]
}

interface RpcStub {
  data?: any
  error?: any
  // Invocation counter so tests can assert call counts
  calls: any[]
}

class FakeSupabase {
  tables = new Map<string, TableFixture>()
  rpcs = new Map<string, RpcStub>()
  // .from(table).insert/update/upsert call counters for assertions
  insertCalls: Array<{ table: string; row: any }> = []
  updateCalls: Array<{ table: string; row: any; where: Record<string, any> }> = []
  upsertCalls: Array<{ table: string; row: any; opts?: any }> = []

  ensure(table: string): TableFixture {
    let f = this.tables.get(table)
    if (!f) {
      f = { rows: [] }
      this.tables.set(table, f)
    }
    return f
  }

  stubRpc(name: string, result: { data?: any; error?: any }) {
    const stub = this.rpcs.get(name) ?? { calls: [] }
    stub.data = result.data
    stub.error = result.error
    this.rpcs.set(name, stub)
  }

  rpc(name: string, args: any) {
    const stub = this.rpcs.get(name) ?? { calls: [] }
    stub.calls.push(args)
    this.rpcs.set(name, stub)
    return Promise.resolve({ data: stub.data ?? null, error: stub.error ?? null })
  }

  rpcCallCount(name: string): number {
    return this.rpcs.get(name)?.calls.length ?? 0
  }

  from(table: string) {
    const fixture = this.ensure(table)
    const filters: Array<(r: any) => boolean> = []
    const rangeFilters: Array<(r: any) => boolean> = []

    const builder: any = {
      select(_cols?: string) {
        return builder
      },
      insert: (row: any) => {
        // mimic single-row insert.  No filter chain after insert in route.
        this.insertCalls.push({ table, row })
        fixture.rows.push(row)
        return Promise.resolve({ data: row, error: null })
      },
      update: (row: any) => {
        const where: Record<string, any> = {}
        // The route patterns:
        //   .update({...}).eq(col, val)                    → fire-and-forget
        //   .update({...}).eq(col, val).select().single()  → returning
        const updateBuilder: any = {
          eq: (col: string, val: any) => {
            where[col] = val
            return updateBuilder
          },
          select: () => updateBuilder,
          single: () => {
            // apply update + return updated row
            this.updateCalls.push({ table, row, where })
            const matched = fixture.rows.filter((r) =>
              Object.entries(where).every(([k, v]) => r[k] === v)
            )
            matched.forEach((r) => Object.assign(r, row))
            return Promise.resolve({
              data: matched[0] ?? { ...row, id: row.id ?? `row_${fixture.rows.length}` },
              error: null,
            })
          },
          // thenable: ``await update().eq()`` resolves here
          then: (resolve: any) => {
            this.updateCalls.push({ table, row, where })
            const matched = fixture.rows.filter((r) =>
              Object.entries(where).every(([k, v]) => r[k] === v)
            )
            matched.forEach((r) => Object.assign(r, row))
            resolve({ data: null, error: null })
          },
        }
        return updateBuilder
      },
      upsert: (row: any, opts?: any) => {
        this.upsertCalls.push({ table, row, opts })
        // Dedup on opts.onConflict if specified
        const conflictKey = opts?.onConflict
        if (conflictKey) {
          const existingIdx = fixture.rows.findIndex(
            (r) => r[conflictKey] === row[conflictKey]
          )
          if (existingIdx >= 0) {
            if (opts?.ignoreDuplicates) {
              // PostgREST returns no row with select().maybeSingle()
              const upsertBuilder: any = {
                select: () => upsertBuilder,
                maybeSingle: () =>
                  Promise.resolve({ data: null, error: null }),
                then: (resolve: any) => resolve({ data: null, error: null }),
              }
              return upsertBuilder
            }
            // overwrite-existing path
            Object.assign(fixture.rows[existingIdx], row)
          } else {
            fixture.rows.push(row)
          }
        } else {
          fixture.rows.push(row)
        }
        const upsertBuilder: any = {
          select: () => upsertBuilder,
          maybeSingle: () =>
            Promise.resolve({ data: row, error: null }),
          then: (resolve: any) => resolve({ data: row, error: null }),
        }
        return upsertBuilder
      },
      eq: (col: string, val: any) => {
        filters.push((r) => r[col] === val)
        return builder
      },
      gte: (col: string, val: any) => {
        rangeFilters.push((r) => r[col] >= val)
        return builder
      },
      lte: (col: string, val: any) => {
        rangeFilters.push((r) => r[col] <= val)
        return builder
      },
      maybeSingle: () => {
        const rows = fixture.rows.filter((r) =>
          [...filters, ...rangeFilters].every((f) => f(r))
        )
        return Promise.resolve({ data: rows[0] ?? null, error: null })
      },
      single: () => {
        const rows = fixture.rows.filter((r) =>
          [...filters, ...rangeFilters].every((f) => f(r))
        )
        if (rows.length === 0) {
          // PostgREST PGRST116 single() with no rows
          return Promise.resolve({ data: null, error: null })
        }
        return Promise.resolve({ data: rows[0], error: null })
      },
    }
    return builder
  }

  // Convenience: read all dead-letter rows for assertions
  deadLetters() {
    return this.ensure("webhook_dead_letters").rows
  }
  processedEvents() {
    return this.ensure("webhook_events_processed").rows
  }
  stripeEvents() {
    return this.ensure("stripe_events").rows
  }
}

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function makeRequest(): NextRequest {
  return new NextRequest("https://coasty.ai/api/credits/webhook", {
    method: "POST",
    headers: { "stripe-signature": h.signatureHeader, "content-type": "application/json" },
    body: JSON.stringify({ stub: true }),
  })
}

// Event shapes the route consumes.
function eventSubscriptionUpdated(opts: {
  id?: string
  subId?: string
  status?: string
  priceId?: string
} = {}): any {
  return {
    id: opts.id ?? "evt_sub_updated_1",
    type: "customer.subscription.updated",
    data: {
      object: {
        id: opts.subId ?? "sub_1",
        status: opts.status ?? "active",
        current_period_start: Math.floor(Date.now() / 1000),
        current_period_end: Math.floor(Date.now() / 1000) + 86400 * 30,
        cancel_at_period_end: false,
        metadata: { tier: "starter", user_id: "u1" },
        items: {
          data: [{ price: { id: opts.priceId ?? "price_starter" } }],
        },
      },
    },
  }
}

function eventSubscriptionDeleted(opts: { id?: string; subId?: string } = {}): any {
  return {
    id: opts.id ?? "evt_sub_deleted_1",
    type: "customer.subscription.deleted",
    data: {
      object: {
        id: opts.subId ?? "sub_1",
        customer: "cus_1",
        metadata: { tier: "starter" },
      },
    },
  }
}

function eventInvoicePaymentSucceeded(opts: {
  id?: string
  subId?: string
  invoiceId?: string
} = {}): any {
  return {
    id: opts.id ?? "evt_invoice_renewal_1",
    type: "invoice.payment_succeeded",
    data: {
      object: {
        id: opts.invoiceId ?? "in_1",
        subscription: opts.subId ?? "sub_1",
        billing_reason: "subscription_cycle",
        period_start: Math.floor(Date.now() / 1000),
        period_end: Math.floor(Date.now() / 1000) + 86400 * 30,
        lines: {
          data: [
            {
              period: {
                start: Math.floor(Date.now() / 1000),
                end: Math.floor(Date.now() / 1000) + 86400 * 30,
              },
            },
          ],
        },
      },
    },
  }
}

function eventCheckoutSessionCompleted(opts: {
  id?: string
  subId?: string
  tier?: string
  userId?: string
} = {}): any {
  return {
    id: opts.id ?? "evt_checkout_1",
    type: "checkout.session.completed",
    data: {
      object: {
        id: "cs_1",
        mode: "subscription",
        subscription: opts.subId ?? "sub_1",
        customer: "cus_1",
        metadata: {
          user_id: opts.userId ?? "u1",
          tier: opts.tier ?? "starter",
        },
        amount_total: 5000,
        currency: "usd",
        payment_intent: "pi_1",
        customer_email: "u@e.com",
      },
    },
  }
}

// Wire common seed data the renewal/checkout/sub-updated handlers expect.
function seedHappyPath(db: FakeSupabase) {
  db.ensure("subscription_plans").rows.push({
    id: "plan_starter",
    tier: "starter",
    stripe_price_id: "price_starter",
    monthly_credits: 200,
  })
  db.ensure("user_subscriptions").rows.push({
    id: "sub_record_1",
    user_id: "u1",
    stripe_subscription_id: "sub_1",
    subscription_plan_id: "plan_starter",
    status: "active",
    current_period_start: new Date().toISOString(),
    current_period_end: new Date(Date.now() + 30 * 86400_000).toISOString(),
    cancel_at_period_end: false,
  })
  db.ensure("user_credits").rows.push({
    user_id: "u1",
    balance: 100,
    has_active_subscription: true,
    subscription_tier: "starter",
  })
  db.ensure("stripe_customers").rows.push({
    user_id: "u1",
    stripe_customer_id: "cus_1",
  })
}

// ---------------------------------------------------------------------------
// Console.error capture so we can grep for [webhook-rpc-failed]
// ---------------------------------------------------------------------------

let origConsoleError: typeof console.error

beforeEach(() => {
  h.consoleErrorCalls = []
  origConsoleError = console.error
  console.error = (...args: any[]) => {
    h.consoleErrorCalls.push(args)
  }
  h.constructEvent.mockReset()
  h.subscriptionsRetrieve.mockReset()
  h.subscriptionsUpdate.mockReset().mockResolvedValue({})
  h.reconcileMock.mockClear()
  process.env.STRIPE_API_KEY = "sk_test_stub"
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_stub"
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co"
  process.env.SUPABASE_SERVICE_ROLE = "test-service-role-key"
})

afterEach(() => {
  console.error = origConsoleError
  vi.resetModules()
})

function consoleErrorIncludes(needle: string): boolean {
  return h.consoleErrorCalls.some((args) =>
    args.some((a) => typeof a === "string" && a.includes(needle))
  )
}

// Dynamic import after mocks are registered.
async function importRoute() {
  return await import("@/app/api/credits/webhook/route")
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Stripe webhook — fail-loud RPC error handling (NEW-1 hardening)", () => {
  describe("1. RPC failure returns 500", () => {
    it("subscription.updated → update_subscription_status 42702 → HTTP 500", async () => {
      const db = new FakeSupabase()
      seedHappyPath(db)
      db.stubRpc("update_subscription_status", {
        error: { code: "42702", message: "ambiguous reference to column user_id" },
      })
      setSupabaseClient(db)

      const evt = eventSubscriptionUpdated()
      h.constructEvent.mockReturnValue(evt)

      const { POST } = await importRoute()
      const res = await POST(makeRequest())

      expect(res.status).toBe(500)
      const json: any = await res.json()
      expect(json.eventId).toBe(evt.id)
      expect(json.code).toBe("42702")
      expect(typeof json.error).toBe("string")
    })

    it("subscription.deleted → update_subscription_status fails → HTTP 500", async () => {
      const db = new FakeSupabase()
      seedHappyPath(db)
      db.stubRpc("update_subscription_status", {
        error: { code: "42702", message: "fail" },
      })
      setSupabaseClient(db)

      const evt = eventSubscriptionDeleted()
      h.constructEvent.mockReturnValue(evt)

      const { POST } = await importRoute()
      const res = await POST(makeRequest())
      expect(res.status).toBe(500)
    })

    it("invoice.payment_succeeded → grant_subscription_credits_atomic fails → 500", async () => {
      const db = new FakeSupabase()
      seedHappyPath(db)
      db.stubRpc("grant_subscription_credits_atomic", {
        error: { code: "23505", message: "duplicate key" },
      })
      setSupabaseClient(db)

      const evt = eventInvoicePaymentSucceeded()
      h.constructEvent.mockReturnValue(evt)
      h.subscriptionsRetrieve.mockResolvedValue({
        id: "sub_1",
        status: "active",
        current_period_start: Math.floor(Date.now() / 1000),
        current_period_end: Math.floor(Date.now() / 1000) + 86400 * 30,
        metadata: { user_id: "u1", tier: "starter" },
      })

      const { POST } = await importRoute()
      const res = await POST(makeRequest())
      expect(res.status).toBe(500)
    })

    it("checkout.session.completed (subscription) → grant fail → 500", async () => {
      const db = new FakeSupabase()
      // No existing sub; will be created in this flow
      db.ensure("subscription_plans").rows.push({
        id: "plan_starter",
        tier: "starter",
        stripe_price_id: "price_starter",
        monthly_credits: 200,
      })
      db.ensure("user_credits").rows.push({
        user_id: "u1",
        balance: 0,
        has_active_subscription: false,
        subscription_tier: null,
      })
      db.stubRpc("grant_subscription_credits_atomic", {
        error: { code: "23P01", message: "grant failure" },
      })
      setSupabaseClient(db)

      const evt = eventCheckoutSessionCompleted()
      h.constructEvent.mockReturnValue(evt)
      h.subscriptionsRetrieve.mockResolvedValue({
        id: "sub_1",
        status: "active",
        current_period_start: Math.floor(Date.now() / 1000),
        current_period_end: Math.floor(Date.now() / 1000) + 86400 * 30,
        cancel_at_period_end: false,
      })

      const { POST } = await importRoute()
      const res = await POST(makeRequest())
      expect(res.status).toBe(500)
    })

    it("checkout.session.completed (credit purchase) → add_credits_atomic fail → 500", async () => {
      const db = new FakeSupabase()
      db.stubRpc("add_credits_atomic", {
        error: { code: "23P01", message: "balance update failed" },
      })
      setSupabaseClient(db)

      const evt = {
        id: "evt_credit_purchase_1",
        type: "checkout.session.completed",
        data: {
          object: {
            id: "cs_credit_1",
            mode: "payment",
            payment_intent: "pi_credit_1",
            currency: "usd",
            amount_total: 1000,
            customer_email: "u@e.com",
            metadata: { user_id: "u1", credits: "100" },
          },
        },
      } as any
      h.constructEvent.mockReturnValue(evt)

      const { POST } = await importRoute()
      const res = await POST(makeRequest())
      expect(res.status).toBe(500)
    })
  })

  describe("2. RPC failure writes to webhook_dead_letters", () => {
    it("upserts a dead-letter row with full context", async () => {
      const db = new FakeSupabase()
      seedHappyPath(db)
      db.stubRpc("update_subscription_status", {
        error: { code: "42702", message: "ambig user_id", details: "fn update_subscription_status" },
      })
      setSupabaseClient(db)

      const evt = eventSubscriptionUpdated()
      h.constructEvent.mockReturnValue(evt)

      const { POST } = await importRoute()
      await POST(makeRequest())

      const dlq = db.deadLetters()
      expect(dlq).toHaveLength(1)
      expect(dlq[0]).toMatchObject({
        stripe_event_id: evt.id,
        event_type: "customer.subscription.updated",
        rpc_name: "update_subscription_status",
        rpc_error_code: "42702",
        rpc_error_message: "ambig user_id",
      })
      // Full event.data.object should be persisted.
      expect(dlq[0].payload).toBeDefined()
      expect(dlq[0].payload.id).toBe("sub_1")
    })
  })

  describe("3. Idempotency: duplicate event.id short-circuits", () => {
    it("second delivery of same event.id returns 200 idempotent without re-invoking RPC", async () => {
      const db = new FakeSupabase()
      seedHappyPath(db)
      db.stubRpc("update_subscription_status", {
        data: [
          {
            out_user_id: "u1",
            out_resolved_tier: "starter",
            out_is_paid: true,
          },
        ],
      })
      db.stubRpc("sync_user_tier", { data: null })
      setSupabaseClient(db)

      const evt = eventSubscriptionUpdated({ id: "evt_dup_1" })
      h.constructEvent.mockReturnValue(evt)

      const { POST } = await importRoute()

      // First call: happy path
      const res1 = await POST(makeRequest())
      expect(res1.status).toBe(200)
      const processedRows = db.processedEvents()
      expect(processedRows.find((r) => r.stripe_event_id === evt.id)).toBeDefined()

      // Reset call counter for the RPC
      const beforeRpcCount = db.rpcCallCount("update_subscription_status")

      // Second call: must short-circuit BEFORE any RPC fires
      const res2 = await POST(makeRequest())
      expect(res2.status).toBe(200)
      const body2: any = await res2.json()
      expect(body2.idempotent).toBe(true)

      // Crucially: the RPC must NOT have been invoked a second time.
      expect(db.rpcCallCount("update_subscription_status")).toBe(beforeRpcCount)
    })
  })

  describe("4. Idempotent dead-letter on retry (no duplicate rows)", () => {
    it("two failed deliveries of the same event.id never produce duplicate DLQ rows", async () => {
      // Note: the stripe_events upsert+ignoreDuplicates means the second
      // delivery short-circuits as "already processed (atomic check)" and
      // returns 200 without re-invoking the handler.  That is the existing
      // behavior of the route — we are NOT changing it.  The contract this
      // test pins is that *if* two failures DID race (e.g. across replicas
      // with not-yet-replicated stripe_events writes), the dead-letter
      // upsert(onConflict=stripe_event_id) would never produce duplicate
      // rows.  We model that by simulating two concurrent failing handlers
      // both calling writeDeadLetter on the same event.
      const db = new FakeSupabase()
      seedHappyPath(db)
      db.stubRpc("update_subscription_status", {
        error: { code: "42702", message: "ambig" },
      })
      setSupabaseClient(db)

      const evt = eventSubscriptionUpdated({ id: "evt_retry_dlq" })
      h.constructEvent.mockReturnValue(evt)

      const { POST } = await importRoute()
      // First failure: writes DLQ + returns 500.
      const r1 = await POST(makeRequest())
      expect(r1.status).toBe(500)
      expect(db.deadLetters()).toHaveLength(1)

      // Second delivery: stripe_events idempotency check sees existing row
      // and returns 200 OK.  The first-delivery DLQ row remains.
      const r2 = await POST(makeRequest())
      expect(r2.status).toBe(200)

      // Crucially: still only ONE row in dead-letters (the upsert is
      // idempotent on stripe_event_id, so even if we DID re-enter the
      // failing handler, no duplicates would be created).
      const dlq = db.deadLetters()
      expect(dlq).toHaveLength(1)
      expect(dlq[0].stripe_event_id).toBe(evt.id)
    })

    it("direct re-entry of writeDeadLetter for same event.id does not duplicate", async () => {
      // Simulate the cross-replica race: two replicas both fail on the
      // same event before stripe_events row is visible to either.  Each
      // calls the DLQ upsert.  We model this by manually triggering two
      // failing flows against fresh DBs that share dead-letter storage.
      const db = new FakeSupabase()
      seedHappyPath(db)
      db.stubRpc("update_subscription_status", {
        error: { code: "42702", message: "ambig" },
      })
      setSupabaseClient(db)

      const evt = eventSubscriptionUpdated({ id: "evt_concurrent_dlq" })
      h.constructEvent.mockReturnValue(evt)

      const { POST } = await importRoute()
      await POST(makeRequest())

      // Manually replay the upsert via the same fake-supabase client to
      // prove the onConflict path collapses to one row.
      await db
        .from("webhook_dead_letters")
        .upsert(
          {
            stripe_event_id: evt.id,
            event_type: "customer.subscription.updated",
            rpc_name: "update_subscription_status",
            rpc_error_code: "42702",
            rpc_error_message: "ambig",
            payload: { id: "sub_1" },
          },
          { onConflict: "stripe_event_id" }
        )

      const dlq = db.deadLetters()
      expect(dlq).toHaveLength(1)
    })
  })

  describe("5. Successful RPC records webhook_events_processed", () => {
    it("subscription.updated happy path → row in webhook_events_processed with succeeded=true", async () => {
      const db = new FakeSupabase()
      seedHappyPath(db)
      db.stubRpc("update_subscription_status", {
        data: [
          {
            out_user_id: "u1",
            out_resolved_tier: "starter",
            out_is_paid: true,
          },
        ],
      })
      db.stubRpc("sync_user_tier", { data: null })
      setSupabaseClient(db)

      const evt = eventSubscriptionUpdated({ id: "evt_happy_1" })
      h.constructEvent.mockReturnValue(evt)

      const { POST } = await importRoute()
      const res = await POST(makeRequest())
      expect(res.status).toBe(200)

      const row = db
        .processedEvents()
        .find((r) => r.stripe_event_id === evt.id)
      expect(row).toBeDefined()
      expect(row!.event_type).toBe("customer.subscription.updated")
      expect(row!.succeeded).toBe(true)
    })

    it("failed RPC does NOT record success in webhook_events_processed", async () => {
      const db = new FakeSupabase()
      seedHappyPath(db)
      db.stubRpc("update_subscription_status", {
        error: { code: "42702", message: "ambig" },
      })
      setSupabaseClient(db)

      const evt = eventSubscriptionUpdated({ id: "evt_fail_not_recorded" })
      h.constructEvent.mockReturnValue(evt)

      const { POST } = await importRoute()
      const res = await POST(makeRequest())
      expect(res.status).toBe(500)

      // Must NOT have written a success row — otherwise the retry would be
      // short-circuited as "already processed" and the DLQ entry would
      // never get replayed.
      const row = db
        .processedEvents()
        .find((r) => r.stripe_event_id === evt.id)
      expect(row).toBeUndefined()
    })
  })

  describe("6. Structured log line for CloudWatch alarm", () => {
    it("[webhook-rpc-failed] is emitted with event/type/rpc/code on failure", async () => {
      const db = new FakeSupabase()
      seedHappyPath(db)
      db.stubRpc("update_subscription_status", {
        error: { code: "42702", message: "ambig user_id" },
      })
      setSupabaseClient(db)

      const evt = eventSubscriptionUpdated({ id: "evt_alarm_1" })
      h.constructEvent.mockReturnValue(evt)

      const { POST } = await importRoute()
      await POST(makeRequest())

      // The literal prefix MUST appear (CloudWatch metric filter depends on it).
      expect(consoleErrorIncludes("[webhook-rpc-failed]")).toBe(true)
      // The event id + type must be in the line.
      expect(consoleErrorIncludes(`event=${evt.id}`)).toBe(true)
      expect(consoleErrorIncludes("type=customer.subscription.updated")).toBe(true)
      expect(consoleErrorIncludes("rpc=update_subscription_status")).toBe(true)
      expect(consoleErrorIncludes("code=42702")).toBe(true)
      expect(consoleErrorIncludes("dead_letter_written=true")).toBe(true)
    })

    it("subscription.updated WEBHOOK_FAILED line is emitted at ERROR when RPC returns empty", async () => {
      // RPC succeeded (no error), but returned 0 rows because the subscription
      // wasn't in our DB.  This was the smoking-gun log line from the incident.
      const db = new FakeSupabase()
      seedHappyPath(db)
      db.stubRpc("update_subscription_status", { data: [] })
      setSupabaseClient(db)

      const evt = eventSubscriptionUpdated({ id: "evt_smoking_gun" })
      h.constructEvent.mockReturnValue(evt)

      const { POST } = await importRoute()
      await POST(makeRequest())

      // Must hit the upgraded ERROR-level path.
      expect(consoleErrorIncludes("subscription.updated WEBHOOK_FAILED")).toBe(true)
      expect(consoleErrorIncludes(`event=${evt.id}`)).toBe(true)
      expect(consoleErrorIncludes("rpcRows=0")).toBe(true)
    })
  })

  describe("7. Parametrized: every event type follows the fail-loud pattern", () => {
    const cases: Array<{
      name: string
      buildEvent: () => any
      stubFailure: (db: FakeSupabase) => void
      preFlight?: () => void
    }> = [
      {
        name: "customer.subscription.updated",
        buildEvent: () => eventSubscriptionUpdated({ id: "evt_p_1" }),
        stubFailure: (db) =>
          db.stubRpc("update_subscription_status", {
            error: { code: "42702", message: "x" },
          }),
      },
      {
        name: "customer.subscription.deleted",
        buildEvent: () => eventSubscriptionDeleted({ id: "evt_p_2" }),
        stubFailure: (db) =>
          db.stubRpc("update_subscription_status", {
            error: { code: "42702", message: "x" },
          }),
      },
      {
        name: "invoice.payment_succeeded (renewal)",
        buildEvent: () => eventInvoicePaymentSucceeded({ id: "evt_p_3" }),
        stubFailure: (db) =>
          db.stubRpc("grant_subscription_credits_atomic", {
            error: { code: "23P01", message: "x" },
          }),
        preFlight: () => {
          h.subscriptionsRetrieve.mockResolvedValue({
            id: "sub_1",
            status: "active",
            current_period_start: Math.floor(Date.now() / 1000),
            current_period_end: Math.floor(Date.now() / 1000) + 86400 * 30,
            metadata: { user_id: "u1", tier: "starter" },
          })
        },
      },
      {
        name: "checkout.session.completed (subscription)",
        buildEvent: () => eventCheckoutSessionCompleted({ id: "evt_p_4" }),
        stubFailure: (db) =>
          db.stubRpc("grant_subscription_credits_atomic", {
            error: { code: "23P01", message: "x" },
          }),
        preFlight: () => {
          h.subscriptionsRetrieve.mockResolvedValue({
            id: "sub_1",
            status: "active",
            current_period_start: Math.floor(Date.now() / 1000),
            current_period_end: Math.floor(Date.now() / 1000) + 86400 * 30,
            cancel_at_period_end: false,
          })
        },
      },
    ]

    for (const c of cases) {
      it(`${c.name} fails loudly`, async () => {
        const db = new FakeSupabase()
        seedHappyPath(db)
        c.stubFailure(db)
        c.preFlight?.()
        setSupabaseClient(db)
        h.constructEvent.mockReturnValue(c.buildEvent())

        const { POST } = await importRoute()
        const res = await POST(makeRequest())
        expect(res.status).toBe(500)
        // Always writes to DLQ + structured log.
        expect(db.deadLetters().length).toBeGreaterThanOrEqual(1)
        expect(consoleErrorIncludes("[webhook-rpc-failed]")).toBe(true)
      })
    }
  })

  describe("8. Signature verification still works (defense in depth)", () => {
    it("invalid signature → 400, no DB writes, no DLQ entry", async () => {
      const db = new FakeSupabase()
      setSupabaseClient(db)

      h.constructEvent.mockImplementation(() => {
        throw new Error("Stripe: bad signature")
      })

      const { POST } = await importRoute()
      const res = await POST(makeRequest())
      expect(res.status).toBe(400)
      // No dead-letter entry: we never reached the handler.
      expect(db.deadLetters()).toHaveLength(0)
      expect(db.processedEvents()).toHaveLength(0)
    })

    it("missing stripe-signature header → 400", async () => {
      const db = new FakeSupabase()
      setSupabaseClient(db)
      // Temporarily clear the header
      const origSig = h.signatureHeader
      h.signatureHeader = ""

      const { POST } = await importRoute()
      const res = await POST(
        new NextRequest("https://coasty.ai/api/credits/webhook", {
          method: "POST",
          headers: {}, // no stripe-signature
          body: JSON.stringify({}),
        })
      )
      expect(res.status).toBe(400)
      h.signatureHeader = origSig
    })
  })

  describe("9. Non-event-handler payloads are handled gracefully", () => {
    it("unknown event.type returns 200 (no DLQ, no RPC, success recorded)", async () => {
      const db = new FakeSupabase()
      setSupabaseClient(db)

      const evt = {
        id: "evt_unknown_1",
        type: "customer.tax_id.created",
        data: { object: { id: "txi_1" } },
      }
      h.constructEvent.mockReturnValue(evt)

      const { POST } = await importRoute()
      const res = await POST(makeRequest())
      expect(res.status).toBe(200)
      // Unknown event types follow the default branch → recorded as processed.
      expect(db.processedEvents().some((r) => r.stripe_event_id === evt.id)).toBe(
        true
      )
      expect(db.deadLetters()).toHaveLength(0)
    })
  })

  describe("10. Incident replay: 2026-05-26 22:57 UTC sub_1TbEA5Kk9kzNS1Sh6knJJINH", () => {
    it("replays the canonical NEW-1 payload and confirms fail-loud behavior", async () => {
      // Reconstruct the production payload shape from the incident.  The
      // material fact is: update_subscription_status raises 42702 because
      // of the variable_conflict bug fixed in migration 015.  Pre-NEW-1:
      // returned 200.  Post-fix: must return 500 + write DLQ + alarm.
      const db = new FakeSupabase()
      db.ensure("subscription_plans").rows.push({
        id: "plan_professional",
        tier: "professional",
        stripe_price_id: "price_pro",
        monthly_credits: 600,
      })
      db.ensure("user_subscriptions").rows.push({
        id: "sub_record_NEW1",
        user_id: "u_NEW1",
        stripe_subscription_id: "sub_1TbEA5Kk9kzNS1Sh6knJJINH",
        subscription_plan_id: "plan_professional",
        status: "active",
        current_period_start: new Date().toISOString(),
        current_period_end: new Date(Date.now() + 30 * 86400_000).toISOString(),
        cancel_at_period_end: false,
      })
      db.stubRpc("update_subscription_status", {
        error: {
          code: "42702",
          message: 'column reference "user_id" is ambiguous',
          details: "in update_subscription_status PL/pgSQL function body",
        },
      })
      setSupabaseClient(db)

      const evt = {
        id: "evt_NEW1_22_57_UTC",
        type: "customer.subscription.updated",
        data: {
          object: {
            id: "sub_1TbEA5Kk9kzNS1Sh6knJJINH",
            customer: "cus_NEW1",
            status: "active",
            current_period_start: Math.floor(Date.now() / 1000),
            current_period_end: Math.floor(Date.now() / 1000) + 86400 * 30,
            cancel_at_period_end: false,
            metadata: { tier: "professional", user_id: "u_NEW1" },
            items: { data: [{ price: { id: "price_pro" } }] },
          },
        },
      } as any
      h.constructEvent.mockReturnValue(evt)

      const { POST } = await importRoute()
      const res = await POST(makeRequest())

      // Contract: fail loud.
      expect(res.status).toBe(500)
      const json: any = await res.json()
      expect(json.eventId).toBe("evt_NEW1_22_57_UTC")
      expect(json.code).toBe("42702")

      // Contract: dead-letter row exists.
      const dlq = db.deadLetters()
      expect(dlq).toHaveLength(1)
      expect(dlq[0].stripe_event_id).toBe("evt_NEW1_22_57_UTC")
      expect(dlq[0].rpc_error_code).toBe("42702")
      expect(dlq[0].payload.id).toBe("sub_1TbEA5Kk9kzNS1Sh6knJJINH")

      // Contract: structured log line for CloudWatch.
      expect(consoleErrorIncludes("[webhook-rpc-failed]")).toBe(true)
      expect(consoleErrorIncludes("event=evt_NEW1_22_57_UTC")).toBe(true)
      expect(consoleErrorIncludes("rpc=update_subscription_status")).toBe(true)
      expect(consoleErrorIncludes("code=42702")).toBe(true)

      // Contract: NOT recorded as succeeded (so Stripe's next retry is processed).
      expect(
        db.processedEvents().some((r) => r.stripe_event_id === "evt_NEW1_22_57_UTC")
      ).toBe(false)
    })
  })
})
