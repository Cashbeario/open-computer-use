import { createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"
import { logApiAccess } from "@/lib/observability/api-access-log"

/**
 * POST /api/me/data/delete
 *
 * Proxy to the FastAPI DSR endpoint that purges every per-user row + filesystem
 * artifact and (by default) closes the account by deleting the Supabase
 * auth.users row. This re-wires the delete flow whose backing route was
 * previously removed — the backend machinery already existed.
 *
 * Auth: the caller's Supabase session is verified here, then forwarded to the
 * backend as the canonical internal-proxy headers (X-User-ID + X-Internal-Key),
 * which the backend's InternalAPIKeyMiddleware maps to a verified_user_id. We
 * never trust a client-supplied user id.
 *
 * Note: /api/* is excluded from the Next.js middleware matcher, so this route
 * does its own auth and needs no CSRF token (same model as the other /api
 * proxy routes).
 */

const PYTHON_BACKEND_URL =
  process.env.PYTHON_BACKEND_URL || "http://127.0.0.1:8001"
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || ""

export async function POST(request: NextRequest) {
  // A destructive DSR endpoint needs an access trail more than any other
  // route — log every exit path, success or refusal.
  const t0 = Date.now()
  const supabase = await createClient()
  if (!supabase) {
    logApiAccess(request, 500, Date.now() - t0, { op: "dsr_delete" })
    return NextResponse.json(
      { error: "Database connection failed" },
      { status: 500 }
    )
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) {
    logApiAccess(request, 401, Date.now() - t0, { op: "dsr_delete" })
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let body: { confirm?: boolean; close_account?: boolean } = {}
  try {
    body = await request.json()
  } catch {
    // Empty/invalid body — the confirm guard below rejects it.
  }
  if (body?.confirm !== true) {
    logApiAccess(request, 400, Date.now() - t0, { op: "dsr_delete", user_id: user.id })
    return NextResponse.json({ error: "confirm must be true" }, { status: 400 })
  }

  try {
    const res = await fetch(`${PYTHON_BACKEND_URL}/api/me/data/delete`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-User-ID": user.id,
        ...(INTERNAL_API_KEY && { "X-Internal-Key": INTERNAL_API_KEY }),
      },
      body: JSON.stringify({
        confirm: true,
        // Default to full account closure; allow an explicit opt-out for a
        // data-only purge.
        close_account: body.close_account !== false,
      }),
    })
    const text = await res.text()
    logApiAccess(request, res.status, Date.now() - t0, {
      op: "dsr_delete",
      user_id: user.id,
      close_account: body.close_account !== false,
    })
    return new NextResponse(text, {
      status: res.status,
      headers: {
        "Content-Type":
          res.headers.get("content-type") || "application/json",
      },
    })
  } catch (e) {
    console.error("[me/data/delete] proxy failed:", e)
    logApiAccess(request, 502, Date.now() - t0, { op: "dsr_delete", user_id: user.id })
    return NextResponse.json(
      { error: "Failed to reach the data service" },
      { status: 502 }
    )
  }
}
