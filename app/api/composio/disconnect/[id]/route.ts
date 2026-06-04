/**
 * Next.js API route — revoke a Composio connection by id.
 * Proxies DELETE to FastAPI backend.
 *
 * Auth: Supabase cookie session (web) with Bearer-token fallback (Electron),
 * mirroring app/api/chat/route.ts:32-78.
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { verifyBearerToken } from "@/lib/supabase/bearer-auth"
import { logApiAccess } from "@/lib/observability/api-access-log"

const PYTHON_BACKEND_URL =
  process.env.PYTHON_BACKEND_URL || "http://127.0.0.1:8001"
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || ""

// Composio connection ids are short nanoid-style strings. Restrict to a safe
// charset to keep us out of path-traversal / header-injection territory.
const VALID_ID = /^[a-zA-Z0-9_-]{1,64}$/

if (!INTERNAL_API_KEY && process.env.NODE_ENV === "production") {
  console.error(
    "[composio/disconnect] INTERNAL_API_KEY missing — backend will 401"
  )
}

interface BackendErrorBody {
  detail?: string
  error?: string
}

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function DELETE(
  req: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  const t0 = Date.now()
  let status = 500
  let userIdForLog: string | undefined
  let idForLog: string | undefined
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

    const { id } = await params
    idForLog = id
    if (!id || !VALID_ID.test(id)) {
      status = 400
      return NextResponse.json(
        { error: "Invalid connection id" },
        { status, headers: { "Cache-Control": "no-store" } }
      )
    }

    try {
      const upstream = new URL(
        `/api/composio/connections/${encodeURIComponent(id)}`,
        PYTHON_BACKEND_URL
      )
      const res = await fetch(upstream.toString(), {
        method: "DELETE",
        headers: {
          "X-User-ID": userIdForLog,
          ...(INTERNAL_API_KEY && { "X-Internal-Key": INTERNAL_API_KEY }),
        },
        signal: AbortSignal.timeout(10_000),
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

      // Backend returns { status: "ok" } or 204; normalize either to { status: "ok" }.
      let body: unknown = { status: "ok" }
      if (res.status !== 204) {
        try {
          body = await res.json()
        } catch {
          body = { status: "ok" }
        }
      }

      status = 200
      return NextResponse.json(body, {
        status,
        headers: { "Cache-Control": "no-store" },
      })
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
      op: "composio.disconnect",
      connection_id: idForLog,
      user_id: userIdForLog,
    })
  }
}
