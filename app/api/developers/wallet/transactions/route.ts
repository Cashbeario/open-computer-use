import { createClient } from "@/lib/supabase/server"
import { createServiceClient } from "@/lib/supabase/service"
import type { SupabaseClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"

function getDb(): SupabaseClient | null {
  return createServiceClient() as unknown as SupabaseClient | null
}

// GET /api/developers/wallet/transactions?limit=&offset= — the wallet ledger.
export async function GET(req: NextRequest) {
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

    const url = new URL(req.url)
    const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") || "50", 10) || 50, 1), 200)
    const offset = Math.max(parseInt(url.searchParams.get("offset") || "0", 10) || 0, 0)

    const { data, error } = await db
      .from("api_wallet_transactions")
      .select(
        "id, type, amount_cents, balance_after_cents, credits, endpoint, request_id, price_paid_cents, usage_description, created_at",
      )
      .eq("user_id", authData.user.id)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ transactions: data ?? [], limit, offset })
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}
