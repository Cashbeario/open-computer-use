/**
 * Public Coasty API proxy — /v1/* (canonical)
 *
 * This is the marketing-friendly URL surface for the public API. Customers
 * call https://coasty.ai/v1/predict, /v1/sessions, etc. (or the api.coasty.ai
 * subdomain when it's set up at the edge).
 *
 * The handler is a thin pass-through to the FastAPI backend's /v1/* router
 * (mounted in backend/main.py). Auth is X-API-Key (or Authorization: Bearer)
 * — handled by the backend's get_api_key_context dependency, NOT by Next.js.
 *
 * The legacy /api/v1/cua/* alias remains live (see app/api/v1/cua/...) until
 * the legacy-key sunset date in API_KEY_LEGACY_SUNSET_DATE (2026-11-01).
 *
 * Limits enforced here (Cloudflare and ALB also enforce upstream):
 *  * 15MB body limit (a screenshot + metadata fits in 4-8MB; cap at 15MB)
 *  * 90s upstream fetch timeout (must finish before Cloudflare's ~100s)
 *  * 300s maxDuration (Vercel/Next.js function-level timeout)
 */

import { NextRequest, NextResponse } from "next/server"
import { fetchUpstreamWithRetry, isRetryable } from "@/lib/api/upstream-fetch"

const PYTHON_BACKEND_URL =
  process.env.PYTHON_BACKEND_URL || "http://127.0.0.1:8001"

// Reject bodies larger than this. 15MB is enough for a 1280x720 JPEG-65
// screenshot plus metadata + reasonable trajectory history. Bigger bodies
// almost always mean misuse (e.g. user pasting a 4K PNG by accident).
const MAX_BODY_BYTES = 15 * 1024 * 1024

// Headers we must NOT forward back to the client.
//
// Hop-by-hop headers are connection-specific and break under HTTP/2 stream
// multiplexing. content-encoding/content-length are stripped for a different
// reason: Node's fetch (undici) TRANSPARENTLY DECOMPRESSES gzipped upstream
// bodies but leaves the original headers on response.headers. Copying them
// onto the decompressed stream emits a plaintext body labeled
// "Content-Encoding: gzip" with the compressed byte count — Cloudflare's
// strict parser rejects that as a malformed origin response and serves its
// own 502 HTML page, while the (lenient) ALB logs a delivered 200. The
// backend gzips every JSON body >= 1000 bytes (GZipMiddleware in
// backend/main.py), so exactly the larger responses 502'd: GET /machines
// with a real machine list deterministically, session predict whenever the
// reasoning text pushed the body over the floor. Next.js re-frames the
// response itself, so dropping both headers is always correct here.
const HOP_BY_HOP = new Set([
  "transfer-encoding",
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailers",
  "upgrade",
  "content-encoding",
  "content-length",
])

async function proxyToBackend(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params

  // Defensive: refuse path traversal attempts in the catch-all segment.
  // Next.js dynamic routes already filter out leading slashes, but a path
  // segment containing ".." would let the request escape the /v1/ namespace
  // when joined naively. We don't trust the join — explicitly reject the
  // segment if any component looks suspicious.
  for (const seg of path) {
    if (seg === "" || seg === "." || seg === ".." || seg.includes("/") || seg.includes("\\")) {
      return NextResponse.json(
        {
          error: {
            code: "INVALID_PATH",
            message: "Invalid path segment.",
            type: "validation_error",
          },
        },
        { status: 400 },
      )
    }
  }

  const backendPath = `/v1/${path.join("/")}`

  // Build target URL, preserving query params.
  const url = new URL(backendPath, PYTHON_BACKEND_URL)
  req.nextUrl.searchParams.forEach((value, key) => {
    url.searchParams.set(key, value)
  })

  // Forward auth + content-type headers. We deliberately do NOT forward
  // arbitrary client headers — opening that surface lets the caller pass
  // X-User-ID or X-Internal-Key and trick the backend's middleware. Keep
  // the proxy minimal.
  const headers: Record<string, string> = {
    "Content-Type": req.headers.get("Content-Type") || "application/json",
    // Ask the backend for an uncompressed body. Without this, undici
    // advertises gzip, the backend compresses (>= 1000B), and undici
    // immediately decompresses — wasted CPU on both ends of an in-VPC hop,
    // plus the header/body mismatch hazard documented on HOP_BY_HOP above.
    // Cloudflare re-compresses toward the client on its own.
    "Accept-Encoding": "identity",
  }

  // Pass through X-API-Key (canonical).
  const apiKey = req.headers.get("X-API-Key")
  if (apiKey) {
    headers["X-API-Key"] = apiKey
  }
  // Also pass through Authorization: Bearer ... — accepted as an API-key
  // alternative by the backend dependency (sk-coasty-* / cua_sk_* tokens
  // detected by prefix). Supabase JWTs would be rejected by the backend
  // since /v1/* skips the InternalAPIKeyMiddleware path.
  const authz = req.headers.get("Authorization")
  if (authz) {
    headers["Authorization"] = authz
  }

  // Idempotency-Key passthrough — backend stores the result for 24h and
  // dedupes by this key.
  const idemp = req.headers.get("Idempotency-Key")
  if (idemp) {
    headers["Idempotency-Key"] = idemp
  }

  const fetchOptions: RequestInit = {
    method: req.method,
    headers,
  }

  // Forward body for non-GET/HEAD requests. Reject oversized bodies BEFORE
  // forwarding (don't waste backend bandwidth on requests we'd kill anyway).
  if (req.method !== "GET" && req.method !== "HEAD") {
    try {
      const contentLength = req.headers.get("content-length")
      if (contentLength && parseInt(contentLength, 10) > MAX_BODY_BYTES) {
        return NextResponse.json(
          {
            error: {
              code: "PAYLOAD_TOO_LARGE",
              message: `Request body exceeds ${MAX_BODY_BYTES / 1024 / 1024}MB limit`,
              type: "validation_error",
            },
          },
          { status: 413 },
        )
      }
      const body = await req.text()
      if (body.length > MAX_BODY_BYTES) {
        return NextResponse.json(
          {
            error: {
              code: "PAYLOAD_TOO_LARGE",
              message: `Request body exceeds ${MAX_BODY_BYTES / 1024 / 1024}MB limit`,
              type: "validation_error",
            },
          },
          { status: 413 },
        )
      }
      if (body) {
        fetchOptions.body = body
      }
    } catch {
      // No body
    }
  }

  // Retry transient origin blips (deploy drain / keep-alive reset). Safe for
  // reads, and for writes carrying an Idempotency-Key (backend dedupes/replays).
  const retryable = isRetryable(req.method, Boolean(idemp))
  const result = await fetchUpstreamWithRetry(url.toString(), fetchOptions, retryable)

  if (result.failed || !result.response) {
    return NextResponse.json(
      {
        error: {
          code: result.timedOut ? "PREDICTION_TIMEOUT" : "SERVICE_UNAVAILABLE",
          message: result.timedOut
            ? "Request timed out. The AI model may be under heavy load — please retry."
            : "API service temporarily unavailable",
          type: "server_error",
        },
      },
      { status: result.timedOut ? 504 : 503 },
    )
  }

  // Stream the response back, preserving status and headers.
  const response = result.response
  const responseHeaders = new Headers()
  response.headers.forEach((value, key) => {
    const lower = key.toLowerCase()
    if (!HOP_BY_HOP.has(lower)) {
      responseHeaders.set(key, value)
    }
  })
  return new Response(response.body, {
    status: response.status,
    headers: responseHeaders,
  })
}

export const GET = proxyToBackend
export const POST = proxyToBackend
export const PUT = proxyToBackend
export const PATCH = proxyToBackend
export const DELETE = proxyToBackend

// Allow long-running requests (sessions, predictions can take time)
export const maxDuration = 300
