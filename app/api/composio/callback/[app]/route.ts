import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { logApiAccess } from "@/lib/observability/api-access-log"
import { resolveRequestOrigin } from "@/lib/origin"

const PYTHON_BACKEND_URL = process.env.PYTHON_BACKEND_URL || "http://127.0.0.1:8001"
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || ""
const VALID_SLUG = /^[a-z0-9_-]{1,64}$/
const VALID_NANO = /^[a-zA-Z0-9_-]{1,64}$/

interface RouteParams {
  params: Promise<{ app: string }>
}

function noStore(res: NextResponse): NextResponse {
  res.headers.set("Cache-Control", "no-store")
  return res
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  const t0 = Date.now()
  // Redirects return 307/308 from NextResponse.redirect; capture the actual
  // status of the outbound response so the access log reflects reality.
  let outStatus = 307
  let userIdForLog: string | undefined
  let toolkitForLog: string | undefined
  let outcomeForLog = "unknown"
  try {
    const { app } = await params
    const toolkitSlug = (app || "").toLowerCase().replace(/-/g, "_")
    toolkitForLog = toolkitSlug
    // Resolve the public origin via the hardened helper. Precedence:
    // NEXT_PUBLIC_APP_URL -> x-forwarded-host (ALB/CloudFront) -> host
    // header -> req.url -> APP_DOMAIN safety net. Without this, behind an
    // ALB the user-visible 307 redirect leaked the container bind address
    // (https://0.0.0.0:3000/connections?connected=outlook) into the browser
    // bar. See lib/origin.ts for the full rationale and security analysis.
    const base = resolveRequestOrigin(req)

    if (!VALID_SLUG.test(toolkitSlug)) {
      outcomeForLog = "invalid_toolkit"
      const r = noStore(
        NextResponse.redirect(
          `${base}/connections?error=${encodeURIComponent("invalid_toolkit")}`
        )
      )
      outStatus = r.status
      return r
    }

    const url = new URL(req.url)
    const status = (url.searchParams.get("status") || url.searchParams.get("result") || "").toLowerCase()
    let connectedAccountId =
      url.searchParams.get("connected_account_id") ||
      url.searchParams.get("connectedAccountId") ||
      ""
    if (connectedAccountId && !VALID_NANO.test(connectedAccountId)) {
      connectedAccountId = ""
    }

    // Must be signed in. If absent → redirect to login with next=/connections.
    const supabase = await createClient()
    if (!supabase) {
      outcomeForLog = "no_supabase"
      const r = noStore(
        NextResponse.redirect(
          `${base}/auth/login?next=${encodeURIComponent("/connections")}`
        )
      )
      outStatus = r.status
      return r
    }
    const { data: authData, error: authError } = await supabase.auth.getUser()
    if (authError || !authData?.user) {
      outcomeForLog = "unauthenticated"
      const r = noStore(
        NextResponse.redirect(
          `${base}/auth/login?next=${encodeURIComponent("/connections")}`
        )
      )
      outStatus = r.status
      return r
    }
    const userId = authData.user.id
    userIdForLog = userId

    // If status != "success" OR connectedAccountId missing → redirect with error.
    if (status !== "success" || !connectedAccountId) {
      const errStatus = status || "missing_connection"
      outcomeForLog = errStatus
      const r = noStore(
        NextResponse.redirect(
          `${base}/connections?error=${encodeURIComponent(errStatus)}&app=${encodeURIComponent(toolkitSlug)}`
        )
      )
      outStatus = r.status
      return r
    }

    // Call backend POST /api/composio/finalize.
    try {
      const upstream = new URL("/api/composio/finalize", PYTHON_BACKEND_URL)
      const res = await fetch(upstream.toString(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-User-ID": userId,
          ...(INTERNAL_API_KEY && { "X-Internal-Key": INTERNAL_API_KEY }),
        },
        body: JSON.stringify({
          toolkit_slug: toolkitSlug,
          connected_account_id: connectedAccountId,
        }),
        signal: AbortSignal.timeout(10_000),
      })
      if (!res.ok) {
        outcomeForLog = "finalize_failed"
        const r = noStore(
          NextResponse.redirect(
            `${base}/connections?error=${encodeURIComponent("finalize_failed")}&app=${encodeURIComponent(toolkitSlug)}`
          )
        )
        outStatus = r.status
        return r
      }
    } catch {
      outcomeForLog = "finalize_exception"
      const r = noStore(
        NextResponse.redirect(
          `${base}/connections?error=${encodeURIComponent("finalize_failed")}&app=${encodeURIComponent(toolkitSlug)}`
        )
      )
      outStatus = r.status
      return r
    }

    outcomeForLog = "connected"
    const r = noStore(
      NextResponse.redirect(
        `${base}/connections?connected=${encodeURIComponent(toolkitSlug)}`
      )
    )
    outStatus = r.status
    return r
  } finally {
    logApiAccess(req, outStatus, Date.now() - t0, {
      op: "composio.oauth_callback",
      toolkit: toolkitForLog,
      outcome: outcomeForLog,
      user_id: userIdForLog,
    })
  }
}
