import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { logApiAccess } from "@/lib/observability/api-access-log"

const PYTHON_BACKEND_URL = process.env.PYTHON_BACKEND_URL || "http://127.0.0.1:8001"
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || ""

export async function GET(req: NextRequest) {
  const t0 = Date.now()
  let status = 500
  let userIdForLog: string | undefined
  try {
    const supabase = await createClient()
    if (!supabase) {
      status = 500
      return NextResponse.json({ error: "Database connection failed" }, { status })
    }
    const { data: authData, error: authError } = await supabase.auth.getUser()
    if (authError || !authData?.user) {
      status = 401
      return NextResponse.json({ error: "Unauthorized" }, { status })
    }
    const userId = authData.user.id
    userIdForLog = userId

    try {
      const upstream = new URL("/api/composio/toolkits", PYTHON_BACKEND_URL)
      const res = await fetch(upstream.toString(), {
        headers: { "X-User-ID": userId, ...(INTERNAL_API_KEY && { "X-Internal-Key": INTERNAL_API_KEY }) },
        signal: AbortSignal.timeout(10_000),
      })
      if (!res.ok) {
        let detail = ""
        try { const b: { detail?: string; error?: string } = await res.clone().json(); detail = b?.detail || b?.error || "" } catch { /* body not JSON */ }
        status = res.status
        return NextResponse.json({ error: detail || "Backend error" }, { status })
      }
      status = 200
      return NextResponse.json(await res.json(), {
        status,
        headers: { "Cache-Control": "no-store" },
      })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to reach backend"
      status = 502
      return NextResponse.json({ error: msg }, { status })
    }
  } finally {
    logApiAccess(req, status, Date.now() - t0, {
      op: "composio.toolkits.list",
      user_id: userIdForLog,
    })
  }
}
