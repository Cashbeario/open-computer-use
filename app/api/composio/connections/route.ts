/**
 * Next.js API route — list Composio connections for the authenticated user.
 * Proxies to FastAPI backend with X-User-ID + X-Internal-Key headers.
 *
 * Auth: Supabase cookie session (web) with Bearer-token fallback (Electron),
 * mirroring app/api/chat/route.ts:32-78.
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { verifyBearerToken } from "@/lib/supabase/bearer-auth"

const PYTHON_BACKEND_URL =
  process.env.PYTHON_BACKEND_URL || "http://127.0.0.1:8001"
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || ""

if (!INTERNAL_API_KEY && process.env.NODE_ENV === "production") {
  console.error(
    "[composio/connections] INTERNAL_API_KEY missing — backend will 401"
  )
}

interface BackendErrorBody {
  detail?: string
  error?: string
}

export async function GET(req: NextRequest): Promise<NextResponse> {
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
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: { "Cache-Control": "no-store" } }
    )
  }

  const userId = authUser.id

  try {
    const upstream = new URL("/api/composio/connections", PYTHON_BACKEND_URL)
    const res = await fetch(upstream.toString(), {
      method: "GET",
      headers: {
        "X-User-ID": userId,
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
      return NextResponse.json(
        { error: detail || "Backend error" },
        { status: res.status, headers: { "Cache-Control": "no-store" } }
      )
    }

    const data: unknown = await res.json()
    return NextResponse.json(data, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    })
  } catch (err: unknown) {
    const name = err instanceof Error ? err.name : ""
    const message = err instanceof Error ? err.message : "Failed to reach backend"
    const msg =
      name === "TimeoutError" || name === "AbortError"
        ? "Backend timeout"
        : message
    return NextResponse.json(
      { error: msg },
      { status: 502, headers: { "Cache-Control": "no-store" } }
    )
  }
}
