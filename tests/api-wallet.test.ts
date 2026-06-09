/**
 * api-wallet.test.ts — guards for the separate, dollar-denominated developer
 * API wallet (migration 024 + the backend rewiring + the Stripe top-up flow).
 *
 * These are source-level anti-drift assertions in the same spirit as
 * atomic-credit-grants.test.ts: they pin the money-critical invariants so a
 * future refactor can't silently reintroduce the shared-credit coupling, drop
 * the overdraw guard, break idempotency, or re-tie API billing to the consumer
 * plan.
 */
import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const root = process.cwd()
const read = (p: string) => readFileSync(join(root, p), "utf8")

const MIGRATION = read("supabase/migrations/024_api_wallet.sql")
const BILLING = read("backend/app/services/api_billing_service.py")
const WEBHOOK = read("app/api/credits/webhook/route.ts")
const CHECKOUT = read("app/api/developers/wallet/checkout/route.ts")
const WALLET_GET = read("app/api/developers/wallet/route.ts")
const DEVROUTE = read("app/api/developers/route.ts")

const slice = (s: string, marker: string) => s.slice(s.indexOf(marker))

describe("024 migration — api_wallet schema", () => {
  it("creates api_wallets with a non-negative integer-cents balance", () => {
    expect(MIGRATION).toMatch(/CREATE TABLE IF NOT EXISTS public\.api_wallets/)
    expect(MIGRATION).toMatch(/balance_cents\s+bigint NOT NULL DEFAULT 0 CHECK \(balance_cents >= 0\)/)
  })

  it("stores money as bigint cents, never numeric/float, for the balance", () => {
    expect(MIGRATION).toMatch(/balance_cents\s+bigint/)
    expect(MIGRATION).toMatch(/total_spent_cents\s+bigint/)
    expect(MIGRATION).not.toMatch(/balance_cents\s+(numeric|real|double|float)/i)
  })

  it("creates the append-only ledger with the documented transaction types", () => {
    expect(MIGRATION).toMatch(/CREATE TABLE IF NOT EXISTS public\.api_wallet_transactions/)
    for (const t of ["topup", "usage", "refund", "promo", "adjustment", "reversal"]) {
      expect(MIGRATION, `type '${t}' allowed`).toContain(`'${t}'`)
    }
  })

  it("dedups topups on stripe_payment_intent_id and debits/refunds on (request_id, type)", () => {
    expect(MIGRATION).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS uq_api_wallet_txn_stripe_pi/)
    expect(MIGRATION).toMatch(/WHERE stripe_payment_intent_id IS NOT NULL/)
    expect(MIGRATION).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS uq_api_wallet_txn_request_type/)
    expect(MIGRATION).toMatch(/\(request_id, type\)/)
  })

  it("auto-initializes a wallet per user (signup trigger + backfill), like user_credits", () => {
    expect(MIGRATION).toMatch(/CREATE OR REPLACE FUNCTION public\.initialize_api_wallet/)
    expect(MIGRATION).toMatch(/CREATE TRIGGER trigger_initialize_api_wallet[\s\S]{0,80}AFTER INSERT ON public\.users/)
    // one-time backfill so existing accounts also get a (zero) wallet row
    expect(MIGRATION).toMatch(/INSERT INTO public\.api_wallets \(user_id\)[\s\S]{0,80}SELECT id FROM public\.users[\s\S]{0,40}ON CONFLICT \(user_id\) DO NOTHING/)
  })

  it("enables RLS: service_role writes, authenticated reads own, no user ledger writes", () => {
    expect(MIGRATION).toMatch(/ALTER TABLE public\.api_wallets ENABLE ROW LEVEL SECURITY/)
    expect(MIGRATION).toMatch(/ALTER TABLE public\.api_wallet_transactions ENABLE ROW LEVEL SECURITY/)
    expect(MIGRATION).toMatch(/Service role full access to api_wallets[\s\S]{0,120}FOR ALL TO service_role/)
    expect(MIGRATION).toMatch(/Users can view own api_wallet[\s\S]{0,120}FOR SELECT TO authenticated/)
    // The ledger must NOT be user-writable.
    expect(MIGRATION).not.toMatch(/api_wallet_transactions FOR (INSERT|UPDATE|DELETE) TO authenticated/)
  })
})

describe("debit_api_wallet RPC — atomic, idempotent, overdraw-proof", () => {
  const fn = slice(MIGRATION, "FUNCTION public.debit_api_wallet")

  it("locks the row FOR UPDATE, is SECURITY DEFINER, and is granted to service_role", () => {
    expect(MIGRATION).toMatch(/CREATE OR REPLACE FUNCTION public\.debit_api_wallet/)
    expect(fn).toMatch(/SECURITY DEFINER/)
    expect(fn).toMatch(/FROM api_wallets[\s\S]*FOR UPDATE/)
    expect(MIGRATION).toMatch(/GRANT EXECUTE ON FUNCTION public\.debit_api_wallet[\s\S]{0,160}TO service_role/)
  })

  it("refuses to overdraw and reports 'insufficient'", () => {
    expect(fn).toMatch(/v_balance < p_amount_cents/)
    expect(fn).toMatch(/outcome := 'insufficient'/)
  })

  it("is idempotent per request_id and survives the unique-violation race", () => {
    expect(fn).toMatch(/type = 'usage'/)
    expect(fn).toMatch(/outcome := 'already_charged'/)
    expect(fn).toMatch(/EXCEPTION WHEN unique_violation/)
  })
})

describe("credit_api_wallet RPC — atomic, idempotent topup/refund", () => {
  const fn = slice(MIGRATION, "FUNCTION public.credit_api_wallet")

  it("locks FOR UPDATE, catches unique_violation, and is granted to service_role", () => {
    expect(fn).toMatch(/FOR UPDATE/)
    expect(fn).toMatch(/EXCEPTION WHEN unique_violation/)
    expect(MIGRATION).toMatch(/GRANT EXECUTE ON FUNCTION public\.credit_api_wallet[\s\S]{0,220}TO service_role/)
  })

  it("only credits a positive amount and upserts the wallet row", () => {
    expect(fn).toMatch(/p_amount_cents <= 0 THEN[\s\S]{0,80}RAISE EXCEPTION/)
    expect(fn).toMatch(/INSERT INTO api_wallets \(user_id, balance_cents\)[\s\S]*ON CONFLICT \(user_id\) DO NOTHING/)
  })
})

describe("backend billing rewired to the dollar wallet", () => {
  it("converts credits to cents at 1¢/credit (predict = $0.05)", () => {
    const m = BILLING.match(/API_CREDIT_USD_CENTS\s*=\s*(\d+)/)
    expect(m).toBeTruthy()
    const rate = Number(m![1])
    expect(rate).toBe(1)
    expect(5 * rate).toBe(5) // POST /predict base = 5 credits = $0.05
    expect(BILLING).toMatch(/credits \* API_CREDIT_USD_CENTS/)
  })

  it("charges via debit_api_wallet and refunds via credit_api_wallet", () => {
    expect(BILLING).toContain('"debit_api_wallet"')
    expect(BILLING).toContain('"credit_api_wallet"')
  })

  it("no longer touches the shared consumer credit RPCs", () => {
    expect(BILLING).not.toContain("deduct_credits_partial")
    expect(BILLING).not.toMatch(/"add_credits"/)
  })

  it("removed the Unlimited free-API skip (every key bills the wallet)", () => {
    expect(BILLING).not.toContain("999_999_999")
  })

  it("reads the wallet (not user_credits) for the API balance", () => {
    expect(BILLING).toMatch(/_get_wallet_cents/)
    expect(BILLING).toMatch(/table\("api_wallets"\)/)
  })
})

describe("dollar top-up — checkout route (independent of the consumer plan)", () => {
  it("requires NO active subscription", () => {
    expect(CHECKOUT).not.toContain("Active subscription required")
    expect(CHECKOUT).not.toContain("user_subscriptions")
  })

  it("enforces min/max bounds and integer cents", () => {
    expect(CHECKOUT).toMatch(/MIN_TOPUP_CENTS = 500/)
    expect(CHECKOUT).toMatch(/MAX_TOPUP_CENTS = 500_000/)
    expect(CHECKOUT).toMatch(/Math\.round/)
    expect(CHECKOUT).toMatch(/Number\.isInteger\(amountCents\)/)
  })

  it("tags the Stripe session as an api_wallet_topup with amount_cents", () => {
    expect(CHECKOUT).toMatch(/type:\s*"api_wallet_topup"/)
    expect(CHECKOUT).toMatch(/amount_cents:/)
    expect(CHECKOUT).toMatch(/mode:\s*"payment"/)
  })
})

describe("dollar top-up — webhook handler (idempotent, fail-loud)", () => {
  it("routes api_wallet_topup BEFORE the subscription branch", () => {
    const idxTopup = WEBHOOK.indexOf('"api_wallet_topup"')
    const idxSub = WEBHOOK.indexOf('session.mode === "subscription"')
    expect(idxTopup).toBeGreaterThan(0)
    expect(idxSub).toBeGreaterThan(0)
    expect(idxTopup).toBeLessThan(idxSub)
  })

  it("credits the wallet via credit_api_wallet (type topup, deduped on PaymentIntent)", () => {
    expect(WEBHOOK).toContain("async function handleApiWalletTopup")
    const fn = slice(WEBHOOK, "async function handleApiWalletTopup")
    expect(fn).toMatch(/credit_api_wallet/)
    expect(fn).toMatch(/p_type:\s*"topup"/)
    expect(fn).toMatch(/p_stripe_payment_intent_id/)
  })

  it("dead-letters + fails loud on RPC failure so Stripe retries", () => {
    const fn = slice(WEBHOOK, "async function handleApiWalletTopup")
    expect(fn).toMatch(/writeDeadLetter/)
    expect(fn).toMatch(/failLoudResponse/)
  })
})

describe("developer dashboard surfaces the dollar wallet", () => {
  it("GET /api/developers reads the wallet and returns dollar fields", () => {
    expect(DEVROUTE).toMatch(/from\("api_wallets"\)/)
    expect(DEVROUTE).toMatch(/walletBalanceCents/)
    expect(DEVROUTE).toMatch(/walletBalanceUsd/)
  })

  it("GET /api/developers/wallet returns balanceCents + balanceUsd", () => {
    expect(WALLET_GET).toMatch(/from\("api_wallets"\)/)
    expect(WALLET_GET).toMatch(/balanceCents/)
    expect(WALLET_GET).toMatch(/balanceUsd/)
  })
})
