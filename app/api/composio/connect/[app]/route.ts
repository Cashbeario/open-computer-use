/**
 * Next.js API route — initiate Composio OAuth for a toolkit.
 * Proxies POST to FastAPI backend; returns { redirect_url } for the browser.
 *
 * Auth: Supabase cookie session (web) with Bearer-token fallback (Electron),
 * mirroring app/api/chat/route.ts:32-78.
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { verifyBearerToken } from "@/lib/supabase/bearer-auth"
import { logApiAccess } from "@/lib/observability/api-access-log"
import { resolveRequestOrigin } from "@/lib/origin"

const PYTHON_BACKEND_URL =
  process.env.PYTHON_BACKEND_URL || "http://127.0.0.1:8001"
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || ""
const VALID_APP = /^[a-z0-9_]+$/

if (!INTERNAL_API_KEY && process.env.NODE_ENV === "production") {
  console.error(
    "[composio/connect] INTERNAL_API_KEY missing — backend will 401"
  )
}

interface BackendErrorBody {
  detail?: string
  error?: string
}

interface RouteParams {
  params: Promise<{ app: string }>
}

export async function POST(
  req: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  const t0 = Date.now()
  let status = 500
  let userIdForLog: string | undefined
  let appForLog: string | undefined
  try {
    // Authenticate user — cookies first (web), then Bearer token (Electron).
    let authUser: { id: string; email?: string } | null = null

    const supabase = await createClient()
    if (supabase) {
      const { data: authData, error: authError } = await supabase.auth.getUser()
      if (!authError && authData?.user) {
        authUser = {
          id: authData.user.id,
          email: authData.user.email ?? undefined,
        }
      }
    }

    if (!authUser) {
      const bearer = await verifyBearerToken(req)
      if (bearer.user) {
        authUser = bearer.user
      }
    }

    if (!authUser) {
      status = 401
      return NextResponse.json(
        { error: "Unauthorized" },
        { status, headers: { "Cache-Control": "no-store" } }
      )
    }

    userIdForLog = authUser.id

    // Validate the app/toolkit slug strictly: lowercase, digits, underscores only.
    const { app } = await params
    appForLog = app
    if (!app || !VALID_APP.test(app)) {
      status = 400
      return NextResponse.json(
        { error: "Invalid toolkit slug" },
        { status, headers: { "Cache-Control": "no-store" } }
      )
    }

    // Build server-side callback URL. Caller cannot tamper with it.
    // The origin is resolved via the hardened helper — NEXT_PUBLIC_APP_URL
    // first (operator-pinned), then ALB / CloudFront forwarded headers,
    // then APP_DOMAIN as a production safety net. See lib/origin.ts.
    const baseUrl = resolveRequestOrigin(req)
    const callbackUrl = `${baseUrl}/api/composio/callback/${encodeURIComponent(app)}`

    try {
      const upstream = new URL(
        `/api/composio/connect/${encodeURIComponent(app)}`,
        PYTHON_BACKEND_URL
      )
      const res = await fetch(upstream.toString(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-User-ID": userIdForLog,
          ...(INTERNAL_API_KEY && { "X-Internal-Key": INTERNAL_API_KEY }),
        },
        body: JSON.stringify({ callbackUrl, callback_url: callbackUrl }),
        signal: AbortSignal.timeout(15_000),
        cache: "no-store",
      })

      if (!res.ok) {
        let detail = ""
        try {
          const body = (await res.clone().json()) as BackendErrorBody
          detail = body?.detail || body?.error || ""
        } catch {
          detail = await res.text().catch(() => "")
        }
        status = res.status
        return NextResponse.json(
          { error: detail || "Backend error" },
          { status, headers: { "Cache-Control": "no-store" } }
        )
      }

      // Backend may emit either snake_case or camelCase. Normalize to snake_case
      // per the task contract: { redirect_url: string }.
      const raw = (await res.json()) as Record<string, unknown>
      const redirectUrl =
        (typeof raw.redirect_url === "string" && raw.redirect_url) ||
        (typeof raw.redirectUrl === "string" && raw.redirectUrl) ||
        ""

      if (!redirectUrl) {
        status = 502
        return NextResponse.json(
          { error: "Backend did not return a redirect_url" },
          { status, headers: { "Cache-Control": "no-store" } }
        )
      }

      const connectedAccountId =
        (typeof raw.connected_account_id === "string" && raw.connected_account_id) ||
        (typeof raw.connectedAccountId === "string" && raw.connectedAccountId) ||
        ""

      status = 200
      return NextResponse.json(
        {
          redirect_url: redirectUrl,
          ...(connectedAccountId ? { connected_account_id: connectedAccountId } : {}),
        },
        { status, headers: { "Cache-Control": "no-store" } }
      )
    } catch (err: unknown) {
      const name = err instanceof Error ? err.name : ""
      const message =
        err instanceof Error ? err.message : "Failed to reach backend"
      const msg =
        name === "TimeoutError" || name === "AbortError"
          ? "Backend timeout"
          : message
      status = 502
      return NextResponse.json(
        { error: msg },
        { status, headers: { "Cache-Control": "no-store" } }
      )
    }
  } finally {
    logApiAccess(req, status, Date.now() - t0, {
      op: "composio.connect",
      app: appForLog,
      user_id: userIdForLog,
    })
  }
}
