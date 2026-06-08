import { createClient } from "@/lib/supabase/server"
import { createServiceClient } from "@/lib/supabase/service"
import type { SupabaseClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

// Loosely-typed service client (api_wallets isn't in the generated schema
// types, mirroring how /api/developers handles api_keys). Reads are still
// scoped to the authenticated user's id, so this never crosses tenants.
function getDb(): SupabaseClient | null {
  return createServiceClient() as unknown as SupabaseClient | null
}

// GET /api/developers/wallet — the developer's dollar API-wallet balance.
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

    const db = getDb()
    if (!db) {
      return NextResponse.json({ error: "Service unavailable" }, { status: 500 })
    }

    const { data: wallet } = await db
      .from("api_wallets")
      .select(
        "balance_cents, total_topped_up_cents, total_spent_cents, currency, last_topup_at, last_spend_at",
      )
      .eq("user_id", authData.user.id)
      .maybeSingle()

    const balanceCents = Number(wallet?.balance_cents ?? 0)

    return NextResponse.json({
      balanceCents,
      balanceUsd: balanceCents / 100,
      totalToppedUpCents: Number(wallet?.total_topped_up_cents ?? 0),
      totalSpentCents: Number(wallet?.total_spent_cents ?? 0),
      currency: (wallet?.currency as string | undefined) ?? "usd",
      lastTopupAt: (wallet?.last_topup_at as string | null | undefined) ?? null,
      lastSpendAt: (wallet?.last_spend_at as string | null | undefined) ?? null,
    })
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}
