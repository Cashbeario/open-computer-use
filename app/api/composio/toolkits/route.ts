import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

const PYTHON_BACKEND_URL = process.env.PYTHON_BACKEND_URL || "http://127.0.0.1:8001"
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || ""

export async function GET(_req: NextRequest) {
  const supabase = await createClient()
  if (!supabase) return NextResponse.json({ error: "Database connection failed" }, { status: 500 })
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError || !authData?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const userId = authData.user.id

  try {
    const upstream = new URL("/api/composio/toolkits", PYTHON_BACKEND_URL)
    const res = await fetch(upstream.toString(), {
      headers: { "X-User-ID": userId, ...(INTERNAL_API_KEY && { "X-Internal-Key": INTERNAL_API_KEY }) },
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) {
      let detail = ""
      try { const b: any = await res.clone().json(); detail = b?.detail || b?.error || "" } catch {}
      return NextResponse.json({ error: detail || "Backend error" }, { status: res.status })
    }
    return NextResponse.json(await res.json(), {
      headers: { "Cache-Control": "no-store" },
    })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Failed to reach backend" }, { status: 502 })
  }
}
