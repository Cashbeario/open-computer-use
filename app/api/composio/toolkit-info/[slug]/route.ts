/**
 * Next.js API route — lazy fetch a toolkit's auth scheme detail.
 *
 * Composio's lightweight `toolkits.list()` catalog (returned by GET
 * /api/composio/toolkits) doesn't always include `auth_schemes` on each
 * item — the SDK only populates that field on the per-toolkit detail
 * endpoint. This proxy forwards to backend GET /api/composio/toolkit-info/
 * {slug} which calls `get_toolkit_auth_scheme()` and returns the full
 * shape including the OAuth-managed flag and any required credential
 * fields. The connect dialog calls this on-demand when the user selects
 * a toolkit so the credential UI can branch correctly (OAuth popup vs
 * inline API_KEY/BEARER/BASIC form) without paying the per-toolkit
 * detail-fetch cost during catalog load.
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
const VALID_SLUG = /^[a-z0-9_-]{1,64}$/i

interface RouteParams {
  params: Promise<{ slug: string }>
}

interface BackendErrorBody {
  detail?: string | { error?: string; message?: string }
  error?: string
}

export async function GET(
  req: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  const t0 = Date.now()
  let status = 500
  let userIdForLog: string | undefined
  let slugForLog: string | undefined
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

    const { slug } = await params
    slugForLog = slug
    if (!slug || !VALID_SLUG.test(slug)) {
      status = 400
      return NextResponse.json(
        { error: "Invalid toolkit slug" },
        { status, headers: { "Cache-Control": "no-store" } }
      )
    }

    try {
      const upstream = new URL(
        `/api/composio/toolkit-info/${encodeURIComponent(slug)}`,
        PYTHON_BACKEND_URL
      )
      const res = await fetch(upstream.toString(), {
        method: "GET",
        headers: {
          "X-User-ID": authUser.id,
          ...(INTERNAL_API_KEY && { "X-Internal-Key": INTERNAL_API_KEY }),
        },
        signal: AbortSignal.timeout(10_000),
        cache: "no-store",
      })

      if (!res.ok) {
        let detail = ""
        try {
          const body = (await res.clone().json()) as BackendErrorBody
          if (typeof body?.detail === "string") detail = body.detail
          else if (typeof body?.detail === "object")
            detail = body.detail?.error || body.detail?.message || ""
          else detail = body?.error || ""
        } catch {
          detail = await res.text().catch(() => "")
        }
        status = res.status
        return NextResponse.json(
          { error: detail || "Backend error" },
          { status, headers: { "Cache-Control": "no-store" } }
        )
      }

      const data: unknown = await res.json()
      status = 200
      return NextResponse.json(data, {
        status,
        // Short cache OK — auth schemes don't change minute-to-minute and
        // the dialog will pick up changes on next mount.
        headers: { "Cache-Control": "private, max-age=60" },
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
      op: "composio.toolkit_info",
      toolkit: slugForLog,
      user_id: userIdForLog,
    })
  }
}
