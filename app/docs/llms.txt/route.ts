/**
 * GET /docs/llms.txt — the LLM-friendly, single-document Markdown reference for
 * the Coasty Computer Use API. Served as plain text so any LLM (or human) can
 * fetch the whole API in one request. The human docs live at /docs.
 *
 * Route Handler (not a static public/ file) so the content stays in lockstep
 * with the rest of the app — it imports the same source-of-truth constant the
 * docs reference. Mirrors the app/robots.txt/route.ts serving convention.
 */
import { NextResponse } from "next/server"
import { API_DOCS_MARKDOWN } from "@/lib/coasty-api-docs-md"

export const dynamic = "force-static"
export const revalidate = 86_400

const HEADERS = {
  // text/plain so browsers + agents render it inline (same as /llms.txt).
  "Content-Type": "text/plain; charset=utf-8",
  "X-Content-Type-Options": "nosniff",
  "Cache-Control": "public, max-age=300, s-maxage=86400, stale-while-revalidate=604800",
} as const

export async function GET() {
  return new NextResponse(API_DOCS_MARKDOWN, { headers: HEADERS })
}

export async function HEAD() {
  return new NextResponse(null, { headers: HEADERS })
}
