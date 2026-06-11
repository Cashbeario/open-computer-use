/**
 * LEGACY proxy — /api/v1/cua/*
 *
 * This URL surface is the original public CUA API path. Marked DEPRECATED:
 * the canonical path is now /v1/* (see app/v1/[...path]/route.ts). We keep
 * this alive through 2026-11-01 (env: API_KEY_LEGACY_SUNSET_DATE) so existing
 * customer integrations don't break overnight.
 *
 * Per RFC 8594 we surface deprecation via response headers:
 *   * Sunset: <date> — machine-readable end-of-life timestamp
 *   * Deprecation: true — boolean flag
 *   * Link: </v1/...>; rel="successor-version" — points to the new path
 *
 * Modern HTTP clients honour these automatically. SDKs we publish should
 * detect the Sunset header and emit a console warning.
 */

import { NextRequest, NextResponse } from "next/server"
import { fetchUpstreamWithRetry, isRetryable } from "@/lib/api/upstream-fetch"

const PYTHON_BACKEND_URL =
  process.env.PYTHON_BACKEND_URL || "http://127.0.0.1:8001"

// Sunset date — IMF-fixdate per RFC 9651. Override via env if ops decides
// to extend the legacy window.
const LEGACY_SUNSET_DATE =
  process.env.API_KEY_LEGACY_SUNSET_DATE_HTTP ||
  "Sun, 01 Nov 2026 00:00:00 GMT"

async function proxyToBackend(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params
  const backendPath = `/api/v1/cua/${path.join("/")}`

  // Build target URL, preserving query params
  const url = new URL(backendPath, PYTHON_BACKEND_URL)
  req.nextUrl.searchParams.forEach((value, key) => {
    url.searchParams.set(key, value)
  })

  // Forward all relevant headers (X-API-Key, Content-Type)
  const headers: Record<string, string> = {
    "Content-Type": req.headers.get("Content-Type") || "application/json",
    // Uncompressed upstream body — undici would transparently decompress a
    // gzipped one anyway, and forwarding the upstream's stale
    // content-encoding/content-length headers on a decompressed stream made
    // Cloudflare 502 every backend response >= the gzip floor (see the
    // canonical /v1 proxy for the full incident note).
    "Accept-Encoding": "identity",
  }

  // Pass through the X-API-Key header for CUA API auth
  const apiKey = req.headers.get("X-API-Key")
  if (apiKey) {
    headers["X-API-Key"] = apiKey
  }
  // Authorization: Bearer <api-key> is an accepted auth alternative.
  const authz = req.headers.get("Authorization")
  if (authz) {
    headers["Authorization"] = authz
  }
  // Idempotency-Key passthrough — lets the backend dedupe + replay, which also
  // makes a transient-failure retry safe for billed writes.
  const idemp = req.headers.get("Idempotency-Key")
  if (idemp) {
    headers["Idempotency-Key"] = idemp
  }

  const fetchOptions: RequestInit = {
    method: req.method,
    headers,
  }

  // Forward body for non-GET/HEAD requests
  // SECURITY: Reject oversized request bodies (max 15MB — enough for a screenshot + metadata)
  const MAX_BODY_BYTES = 15 * 1024 * 1024
  if (req.method !== "GET" && req.method !== "HEAD") {
    try {
      const contentLength = req.headers.get("content-length")
      if (contentLength && parseInt(contentLength, 10) > MAX_BODY_BYTES) {
        return NextResponse.json(
          { error: { code: "PAYLOAD_TOO_LARGE", message: "Request body exceeds 15MB limit", type: "validation_error" } },
          { status: 413 },
        )
      }
      const body = await req.text()
      if (body.length > MAX_BODY_BYTES) {
        return NextResponse.json(
          { error: { code: "PAYLOAD_TOO_LARGE", message: "Request body exceeds 15MB limit", type: "validation_error" } },
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

  // Stream the response back, preserving status and headers
  const response = result.response
  const responseHeaders = new Headers()
  response.headers.forEach((value, key) => {
    const lower = key.toLowerCase()
    // Skip hop-by-hop headers, plus content-encoding/content-length: undici
    // already decompressed the body, so the upstream's values describe bytes
    // we are NOT sending — forwarding them makes Cloudflare reject the
    // response as malformed (502). Next.js re-frames the response itself.
    if (
      ![
        "transfer-encoding",
        "connection",
        "keep-alive",
        "content-encoding",
        "content-length",
      ].includes(lower)
    ) {
      responseHeaders.set(key, value)
    }
  })

  // Deprecation signal — every response from the legacy alias carries
  // these so SDK clients can surface a warning. The Link header points
  // to the canonical replacement path (RFC 8288 link relation).
  responseHeaders.set("Deprecation", "true")
  responseHeaders.set("Sunset", LEGACY_SUNSET_DATE)
  const successorPath = `/v1/${path.join("/")}`
  responseHeaders.set("Link", `<${successorPath}>; rel="successor-version"`)
  responseHeaders.set(
    "Warning",
    `299 - "Deprecated: the /api/v1/cua/* path is deprecated. Use ${successorPath} instead. Sunset: ${LEGACY_SUNSET_DATE}."`,
  )

  return new Response(response.body, {
    status: response.status,
    headers: responseHeaders,
  })
}

export const GET = proxyToBackend
export const POST = proxyToBackend
export const PUT = proxyToBackend
export const DELETE = proxyToBackend

// Allow long-running requests (sessions, predictions can take time)
export const maxDuration = 300
