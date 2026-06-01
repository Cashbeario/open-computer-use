import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

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
  const { app } = await params
  const toolkitSlug = (app || "").toLowerCase().replace(/-/g, "_")
  // Origin is derived from the request URL — NEVER from user-supplied headers.
  const base = new URL(req.url).origin

  if (!VALID_SLUG.test(toolkitSlug)) {
    return noStore(
      NextResponse.redirect(
        `${base}/connections?error=${encodeURIComponent("invalid_toolkit")}`
      )
    )
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
    return noStore(
      NextResponse.redirect(
        `${base}/auth/login?next=${encodeURIComponent("/connections")}`
      )
    )
  }
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError || !authData?.user) {
    return noStore(
      NextResponse.redirect(
        `${base}/auth/login?next=${encodeURIComponent("/connections")}`
      )
    )
  }
  const userId = authData.user.id

  // If status != "success" OR connectedAccountId missing → redirect with error.
  if (status !== "success" || !connectedAccountId) {
    const errStatus = status || "missing_connection"
    return noStore(
      NextResponse.redirect(
        `${base}/connections?error=${encodeURIComponent(errStatus)}&app=${encodeURIComponent(toolkitSlug)}`
      )
    )
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
      return noStore(
        NextResponse.redirect(
          `${base}/connections?error=${encodeURIComponent("finalize_failed")}&app=${encodeURIComponent(toolkitSlug)}`
        )
      )
    }
  } catch {
    return noStore(
      NextResponse.redirect(
        `${base}/connections?error=${encodeURIComponent("finalize_failed")}&app=${encodeURIComponent(toolkitSlug)}`
      )
    )
  }

  return noStore(
    NextResponse.redirect(
      `${base}/connections?connected=${encodeURIComponent(toolkitSlug)}`
    )
  )
}
