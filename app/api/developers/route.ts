import { createClient } from "@/lib/supabase/server"
import { createServiceClient } from "@/lib/supabase/service"
import type { SupabaseClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"
import * as crypto from "crypto"

// Cookie/RLS client authenticates the request; the service-role client does
// the actual table I/O. The `api_keys` table grants the authenticated role
// only SELECT + UPDATE policies (no INSERT), and `api_usage` is service-
// managed, so the RLS client can list/revoke but NOT mint keys or read usage.
// Every query in these routes is scoped by the authenticated `user_id`, so
// using the service role here is safe and mirrors the FastAPI backend, which
// also writes `api_keys` with the service role.
function getDb(): SupabaseClient | null {
  // Cast away the strict generated-schema typing: api_keys / api_usage /
  // user_credits aren't in app/types/database.types.ts, and the cookie client
  // these routes used before was untyped (Promise<any>). Runtime is identical.
  return createServiceClient() as unknown as SupabaseClient | null
}

// ── Key prefix + hashing configuration ──
//
// Must stay in lockstep with backend/app/services/api_key_service.py.
// Both sides write to the same `api_keys` table; if the algorithms drift the
// frontend-issued key won't validate on the backend.
//
// Sunset for legacy cua_sk_ keys: 2026-11-01 (env: API_KEY_LEGACY_SUNSET_DATE).
const KEY_PREFIX_LEGACY = "cua_sk_"
const KEY_PREFIX_LIVE = "sk-coasty-live-"
const KEY_PREFIX_TEST = "sk-coasty-test-"

const HASH_VERSION_SHA256 = "sha256-v1"
const HASH_VERSION_HMAC_SHA256 = "hmac-sha256-v1"

// When false (env override), new keys mint as legacy cua_sk_ format. Used for
// rollback if the new format causes a regression. Defaults to true.
const NEW_FORMAT_ENABLED =
  (process.env.API_KEY_NEW_FORMAT_ENABLED ?? "true").toLowerCase() !== "false"

// Per-user limit + scopes default — MUST stay in lockstep with backend
// api_key_service.DEFAULT_SCOPES_LIST. A key minted here is validated by the
// FastAPI backend's scope gates, so a too-narrow default silently 403s the
// runs/workflows/machines surface (INSUFFICIENT_SCOPE) even though the key is
// otherwise valid. These are the conservative defaults a fresh key receives.
const MAX_KEYS_PER_USER = 20
const DEFAULT_SCOPES = [
  "predict",
  "session",
  "ground",
  "parse",
  // Full machine lifecycle is granted by default: provision/terminate/
  // start/stop/restart/TTL (machines:write), inspect (machines:read), drive
  // (actions:exec), shell (terminal:exec), files both ways, snapshots.
  // Driving VMs is the documented purpose of the product; ownership is
  // enforced on every call. Only the two high-risk scopes (connection:read —
  // plaintext SSH/VNC secrets — and browser:execute — arbitrary JS) stay
  // opt-in below.
  "machines:read",
  "machines:write",
  "actions:exec",
  "terminal:exec",
  "files:read",
  "files:write",
  "snapshots:write",
  // Runs + Workflows are the headline developer-agent surface — granted by
  // default so a fresh key can start a run / workflow without re-minting.
  "runs:read",
  "runs:write",
  "workflows:read",
  "workflows:write",
]

// The complete set of scopes a key MAY hold — mirrors backend
// api_key_service.ALL_SCOPES. Used to validate caller-supplied scopes: anything
// in here is allowed (even if not granted by default), anything else is a typo
// and is rejected with INVALID_SCOPE. High-risk scopes (connection:read,
// browser:execute) are not in DEFAULT_SCOPES but can be requested explicitly
// at key-creation time.
const ALL_SCOPES: ReadonlySet<string> = new Set([
  ...DEFAULT_SCOPES,
  "keys", // listing/revoking own keys via the API
  "usage", // reading usage summary
  "browser:execute",
  "connection:read",
  "schedules:read",
  "schedules:write",
  "triggers:write",
])

/**
 * Hash a raw key. Mirrors `_hash_sha256` / `_hash_hmac_sha256` in
 * backend/app/services/api_key_service.py. The pepper lives in env vars and
 * is never written to the DB.
 *
 * - kind='legacy' → SHA-256(raw_key)
 * - kind='live' or 'test' → HMAC-SHA256(API_KEY_PEPPER, raw_key)
 *
 * If the pepper env var is empty (misconfigured), HMAC falls back to plain
 * SHA-256 so dev environments still work — same behaviour as the backend.
 */
function hashKey(rawKey: string, kind: "legacy" | "live" | "test"): {
  hash: string
  hashVersion: string
  pepperId: string | null
} {
  if (kind === "legacy") {
    const h = crypto.createHash("sha256").update(rawKey).digest("hex")
    return { hash: h, hashVersion: HASH_VERSION_SHA256, pepperId: null }
  }
  const pepper = process.env.API_KEY_PEPPER ?? ""
  if (!pepper) {
    // Misconfigured pepper — fall back to plain SHA-256 with a console warning.
    // Backend behaviour mirrors this; we log to keep the symptom visible.
    console.warn(
      "[developers] API_KEY_PEPPER is empty — falling back to SHA-256 for hmac-sha256-v1 hash. " +
        "Set API_KEY_PEPPER in production to enable HMAC hashing.",
    )
    const h = crypto.createHash("sha256").update(rawKey).digest("hex")
    return { hash: h, hashVersion: HASH_VERSION_HMAC_SHA256, pepperId: null }
  }
  const hmac = crypto.createHmac("sha256", pepper).update(rawKey).digest("hex")
  const pepperId = process.env.API_KEY_PEPPER_ID ?? "v1"
  return { hash: hmac, hashVersion: HASH_VERSION_HMAC_SHA256, pepperId }
}

function generateKey(kind: "legacy" | "live" | "test"): string {
  const random = crypto.randomBytes(24).toString("hex") // 48 hex chars
  switch (kind) {
    case "live":
      return KEY_PREFIX_LIVE + random
    case "test":
      return KEY_PREFIX_TEST + random
    case "legacy":
      return KEY_PREFIX_LEGACY + random
  }
}

export async function GET() {
  try {
    const supabase = await createClient()
    if (!supabase) {
      return NextResponse.json({ error: "Service unavailable" }, { status: 500 })
    }

    const { data: authData } = await supabase.auth.getUser()
    if (!authData?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const userId = authData.user.id
    const db = getDb()
    if (!db) {
      return NextResponse.json({ error: "Service unavailable" }, { status: 500 })
    }
    const now = Date.now()
    const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString()
    const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString()
    const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000).toISOString()

    // Fetch keys
    const { data: keys, error } = await db
      .from("api_keys")
      .select("id, name, tier, scopes, created_at, last_used_at, key_prefix")
      .eq("user_id", userId)
      .eq("is_active", true)
      .order("created_at", { ascending: false })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Fetch 30-day usage with full detail
    const { data: usage } = await db
      .from("api_usage")
      .select("endpoint, credits_charged, created_at, request_id")
      .eq("user_id", userId)
      .gte("created_at", thirtyDaysAgo)
      .order("created_at", { ascending: false })

    const rows: { endpoint: string; credits_charged: number; created_at: string; request_id: string }[] = usage ?? []

    // ── Aggregate stats ──
    const totalRequests = rows.length
    const totalCredits = rows.reduce((s: number, r) => s + (r.credits_charged ?? 0), 0)

    // Requests in last 24h and 7d
    const requests24h = rows.filter(r => r.created_at >= oneDayAgo).length
    const requests7d = rows.filter(r => r.created_at >= sevenDaysAgo).length
    const credits7d = rows.filter(r => r.created_at >= sevenDaysAgo).reduce((s: number, r) => s + (r.credits_charged ?? 0), 0)

    // ── Per-endpoint breakdown ──
    const byEndpoint: Record<string, { requests: number; credits: number }> = {}
    for (const r of rows) {
      const ep = r.endpoint ?? "unknown"
      if (!byEndpoint[ep]) byEndpoint[ep] = { requests: 0, credits: 0 }
      byEndpoint[ep].requests++
      byEndpoint[ep].credits += r.credits_charged ?? 0
    }

    // ── Daily activity (last 14 days) ──
    const dailyMap: Record<string, { requests: number; credits: number }> = {}
    for (let i = 0; i < 14; i++) {
      const d = new Date(now - i * 24 * 60 * 60 * 1000)
      const key = d.toISOString().slice(0, 10) // YYYY-MM-DD
      dailyMap[key] = { requests: 0, credits: 0 }
    }
    for (const r of rows) {
      const day = r.created_at?.slice(0, 10)
      if (day && dailyMap[day]) {
        dailyMap[day].requests++
        dailyMap[day].credits += r.credits_charged ?? 0
      }
    }
    const daily = Object.entries(dailyMap)
      .map(([date, v]) => ({ date, ...v }))
      .sort((a, b) => a.date.localeCompare(b.date))

    // ── Recent requests (rich per-request log) ──
    // Read the full request log (`api_requests`) rather than the billing
    // ledger (`api_usage`) so Logs can show status, latency, errors, and
    // tokens — and crucially INCLUDE failed requests and free `parse` calls,
    // which never reach `api_usage` (record_usage only runs on the billed
    // success path). We deliberately do NOT surface the resolved `model` id —
    // the underlying engine is an internal detail, not part of the developer
    // contract. Defensive: `api_requests` is provisioned outside the repo
    // migrations, so if the table/columns differ we fall back to the thin
    // `api_usage`-derived logs rather than 500-ing the whole dashboard.
    type RecentRow = {
      endpoint: string
      credits: number
      time: string
      request_id: string | null
      status?: string | null
      error_code?: string | null
      error_message?: string | null
      duration_ms?: number | null
      cua_version?: string | null
      input_tokens?: number | null
      output_tokens?: number | null
      was_refunded?: boolean
      instruction?: string | null
    }
    let recent: RecentRow[]
    try {
      const { data: reqRows, error: reqErr } = await db
        .from("api_requests")
        .select(
          "request_id, endpoint, status, error_code, error_message, credits_charged, " +
            "duration_ms, cua_version, input_tokens, output_tokens, was_refunded, created_at, instruction",
        )
        .eq("user_id", userId)
        .gte("created_at", thirtyDaysAgo)
        .order("created_at", { ascending: false })
        .limit(200)
      if (reqErr) throw new Error(reqErr.message)
      // supabase-js infers the long concatenated select as GenericStringError[]
      // at the type level (runtime is unaffected); cast to a plain row shape.
      recent = ((reqRows ?? []) as unknown as Record<string, unknown>[]).map((r) => {
        const instruction = (r.instruction as string | null) ?? null
        return {
          endpoint: (r.endpoint as string) ?? "unknown",
          credits: (r.credits_charged as number | null) ?? 0,
          time: r.created_at as string,
          request_id: (r.request_id as string | null) ?? null,
          // CUA run status (continue/done/fail) where present. The pass/fail
          // OUTCOME is derived client-side from error_code.
          status: (r.status as string | null) ?? null,
          error_code: (r.error_code as string | null) ?? null,
          error_message: (r.error_message as string | null) ?? null,
          duration_ms: (r.duration_ms as number | null) ?? null,
          cua_version: (r.cua_version as string | null) ?? null,
          input_tokens: (r.input_tokens as number | null) ?? null,
          output_tokens: (r.output_tokens as number | null) ?? null,
          was_refunded: Boolean(r.was_refunded),
          // Preview only — the full task text is the developer's own data, but
          // keep the payload lean across 200 rows.
          instruction:
            instruction && instruction.length > 200 ? instruction.slice(0, 200) + "…" : instruction,
        }
      })
    } catch {
      // Older/absent api_requests schema — degrade to the billing-ledger logs.
      recent = rows.slice(0, 200).map(r => ({
        endpoint: r.endpoint,
        credits: r.credits_charged ?? 0,
        time: r.created_at,
        request_id: r.request_id ?? null,
      }))
    }

    // ── Peak hour ──
    const hourBuckets: number[] = new Array(24).fill(0)
    for (const r of rows) {
      const h = new Date(r.created_at).getHours()
      hourBuckets[h]++
    }
    const peakHour = hourBuckets.indexOf(Math.max(...hourBuckets))

    // ── API wallet (dollar balance, independent of the consumer plan) ──
    // Billing for developer API usage is drawn from the prepaid dollar wallet,
    // NOT the consumer credit balance. Tier is still read from the consumer
    // subscription because rate-limit tiers remain coupled for now (billing
    // was decoupled; tiers are a fast-follow).
    const { data: walletData } = await db
      .from("api_wallets")
      .select("balance_cents, total_topped_up_cents, total_spent_cents")
      .eq("user_id", userId)
      .maybeSingle()
    const { data: creditsData } = await db
      .from("user_credits")
      .select("subscription_tier")
      .eq("user_id", userId)
      .maybeSingle()
    const walletBalanceCents = Number(walletData?.balance_cents ?? 0)

    return NextResponse.json({
      keys: keys ?? [],
      stats: {
        keyCount: keys?.length ?? 0,
        totalRequests,
        totalCredits,
        requests24h,
        requests7d,
        credits7d,
        avgCreditsPerRequest: totalRequests > 0 ? Math.round((totalCredits / totalRequests) * 10) / 10 : 0,
        peakHour: totalRequests > 0 ? peakHour : null,
        // Dollar wallet balance (independent of consumer credits).
        walletBalanceCents,
        walletBalanceUsd: walletBalanceCents / 100,
        walletToppedUpCents: Number(walletData?.total_topped_up_cents ?? 0),
        walletSpentCents: Number(walletData?.total_spent_cents ?? 0),
        // `balance` retained for back-compat; now reflects wallet cents.
        balance: walletBalanceCents,
        tier: creditsData?.subscription_tier ?? "",
      },
      byEndpoint,
      daily,
      recent,
    })
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    if (!supabase) {
      return NextResponse.json({ error: "Service unavailable" }, { status: 500 })
    }

    const { data: authData } = await supabase.auth.getUser()
    if (!authData?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const db = getDb()
    if (!db) {
      return NextResponse.json({ error: "Service unavailable" }, { status: 500 })
    }

    const body = await request.json()
    const { name, scopes, kind: requestedKind } = body

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 })
    }

    // Validate kind ∈ {live, test} from caller. Default to live (or legacy
    // when the rollout flag is off). 'legacy' is rejected from the API —
    // ops can flip the env var if they need to mint legacy keys.
    let kind: "live" | "test" | "legacy"
    if (requestedKind === "test") {
      kind = "test"
    } else if (requestedKind === "live" || requestedKind === undefined || requestedKind === null) {
      kind = NEW_FORMAT_ENABLED ? "live" : "legacy"
    } else {
      return NextResponse.json(
        {
          error: {
            code: "INVALID_KEY_KIND",
            message: "kind must be 'live' or 'test'.",
            type: "validation_error",
          },
        },
        { status: 400 },
      )
    }

    // Per-user key cap (defense-in-depth — backend also enforces).
    const { count: existingCount } = await db
      .from("api_keys")
      .select("id", { count: "exact", head: true })
      .eq("user_id", authData.user.id)
      .eq("is_active", true)

    if ((existingCount ?? 0) >= MAX_KEYS_PER_USER) {
      return NextResponse.json(
        {
          error: {
            code: "KEY_LIMIT_REACHED",
            message: `Maximum ${MAX_KEYS_PER_USER} API keys per account.`,
            type: "rate_limit_error",
          },
        },
        { status: 429 },
      )
    }

    // Validate scope allowlist — refuse to mint a key with a typo'd scope.
    const requestedScopes: string[] = Array.isArray(scopes) && scopes.length > 0
      ? scopes
      : DEFAULT_SCOPES
    for (const s of requestedScopes) {
      if (typeof s !== "string" || !ALL_SCOPES.has(s)) {
        return NextResponse.json(
          {
            error: {
              code: "INVALID_SCOPE",
              message: `Unknown scope: ${s}`,
              type: "validation_error",
            },
          },
          { status: 400 },
        )
      }
    }

    const rawKey = generateKey(kind)
    const { hash: keyHash, hashVersion, pepperId } = hashKey(rawKey, kind)
    const keyId = crypto.randomBytes(8).toString("hex")

    const { error } = await db.from("api_keys").insert({
      id: keyId,
      user_id: authData.user.id,
      key_hash: keyHash,
      key_prefix: rawKey.slice(0, 16), // 16-char prefix for UI display
      name: name.trim(),
      tier: "free",
      scopes: requestedScopes,
      is_active: true,
      key_kind: kind,
      hash_version: hashVersion,
      pepper_id: pepperId,
    })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      key: rawKey,
      key_id: keyId,
      name: name.trim(),
      scopes: requestedScopes,
      kind,
      created_at: new Date().toISOString(),
    })
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}
