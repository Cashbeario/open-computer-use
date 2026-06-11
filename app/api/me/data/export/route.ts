import { createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"
import { logApiAccess } from "@/lib/observability/api-access-log"

/**
 * GET /api/me/data/export
 *
 * Proxy to the FastAPI portability endpoint that returns a JSON dump of
 * everything stored under the caller's user_id. Re-wires the export flow whose
 * route was previously removed. Auth + header forwarding mirror the delete
 * proxy (verified Supabase session → X-User-ID + X-Internal-Key).
 *
 * Query: ?include_screenshots=false to omit base64 screenshot blobs (smaller,
 * faster download — text records are still complete). Defaults to the backend's
 * behavior otherwise.
 *
 * On success the response is returned as a downloadable attachment so the
 * browser saves it directly.
 */

const PYTHON_BACKEND_URL =
  process.env.PYTHON_BACKEND_URL || "http://127.0.0.1:8001"
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || ""

export async function GET(request: NextRequest) {
  // A full-account data export is exactly the access worth an audit trail —
  // log every exit path, success or refusal.
  const t0 = Date.now()
  const supabase = await createClient()
  if (!supabase) {
    logApiAccess(request, 500, Date.now() - t0, { op: "dsr_export" })
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
    logApiAccess(request, 401, Date.now() - t0, { op: "dsr_export" })
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const includeScreenshots =
    request.nextUrl.searchParams.get("include_screenshots")
  const qs = includeScreenshots === "false" ? "?include_screenshots=false" : ""

  try {
    const res = await fetch(`${PYTHON_BACKEND_URL}/api/me/data/export${qs}`, {
      method: "GET",
      headers: {
        "X-User-ID": user.id,
        ...(INTERNAL_API_KEY && { "X-Internal-Key": INTERNAL_API_KEY }),
      },
    })
    const text = await res.text()
    const headers: Record<string, string> = { "Content-Type": "application/json" }
    if (res.ok) {
      headers["Content-Disposition"] =
        'attachment; filename="coasty-data-export.json"'
    }
    logApiAccess(request, res.status, Date.now() - t0, {
      op: "dsr_export",
      user_id: user.id,
      include_screenshots: includeScreenshots !== "false",
    })
    return new NextResponse(text, { status: res.status, headers })
  } catch (e) {
    console.error("[me/data/export] proxy failed:", e)
    logApiAccess(request, 502, Date.now() - t0, { op: "dsr_export", user_id: user.id })
    return NextResponse.json(
      { error: "Failed to reach the data service" },
      { status: 502 }
    )
  }
}
