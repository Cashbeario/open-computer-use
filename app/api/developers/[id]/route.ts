import { createClient } from "@/lib/supabase/server"
import { createServiceClient } from "@/lib/supabase/service"
import type { SupabaseClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()
    if (!supabase) {
      return NextResponse.json({ error: "Service unavailable" }, { status: 500 })
    }

    const { data: authData } = await supabase.auth.getUser()
    if (!authData?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Service-role for the write (RLS-independent); scoped to the caller's own
    // key via id + user_id, so it can only revoke keys the user owns.
    // Loosely-typed (api_keys isn't in the generated schema types); runtime is
    // unchanged from the previously-untyped cookie client.
    const db = createServiceClient() as unknown as SupabaseClient | null
    if (!db) {
      return NextResponse.json({ error: "Service unavailable" }, { status: 500 })
    }

    const { error } = await db
      .from("api_keys")
      .update({ is_active: false })
      .eq("id", id)
      .eq("user_id", authData.user.id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ status: "ok", key_id: id })
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}
