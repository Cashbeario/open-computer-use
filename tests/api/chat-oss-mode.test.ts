/**
 * OSS-mode behavior of ``POST /api/chat``.
 *
 * Why this exists
 * ---------------
 * The OSS quick start (README: one COASTY_API_KEY, no Supabase) used to die
 * on this route with a bare ``{"error":"Unauthorized"}`` 401 — the route
 * only knew the Supabase cookie / Bearer paths, so the single-key identity
 * was invisible to it and the failure read as "broken auth" instead of the
 * truth (coasty.ai exposes no public chat endpoint yet; backend/main.py
 * mounts no /v1/chat router).
 *
 * The route now short-circuits in OSS mode:
 *
 *   - key present  → 501 with code OSS_CHAT_NOT_AVAILABLE and a flat,
 *     human-readable ``error`` string (the envelope this route's clients
 *     render verbatim — see the passthrough comment in the route).
 *   - key missing (COASTY_OSS_MODE=1 edge) → 401 telling the operator to
 *     set COASTY_API_KEY.
 *   - production mode (Supabase env present) → the pre-existing Supabase
 *     401 path, byte-for-byte unchanged.
 *
 * When /v1/chat ships upstream, the 501 branch becomes a
 * ``forwardToBackend()`` call (the route documents the exact flip) and the
 * first two tests here must be REPLACED with forwarding assertions — do not
 * delete them without adding those.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { NextRequest } from "next/server"

const h = vi.hoisted(() => ({
  verifyBearerToken: vi.fn<(req: unknown) => Promise<{ user: null }>>(),
}))

// The production path consults Supabase cookies first; returning null from
// createClient models "Supabase not configured / no session" without
// touching the network.
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => null),
}))

vi.mock("@/lib/supabase/bearer-auth", () => ({
  verifyBearerToken: h.verifyBearerToken,
}))

// Access logging is irrelevant to the contract under test.
vi.mock("@/lib/observability/api-access-log", () => ({
  logApiAccess: vi.fn(),
}))

// Snapshot the mode-determining env so each test can sculpt it freely and
// the file leaves no residue for sibling suites.
const ENV_KEYS = [
  "COASTY_API_KEY",
  "COASTY_OSS_MODE",
  "COASTY_FORCE_PRODUCTION_MODE",
  "NEXT_PUBLIC_SUPABASE_URL",
] as const
let saved: Record<string, string | undefined>

beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]))
  for (const k of ENV_KEYS) delete process.env[k]
  h.verifyBearerToken.mockReset().mockResolvedValue({ user: null })
})

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k]
    else process.env[k] = saved[k]
  }
})

function makeChatRequest(): NextRequest {
  return new NextRequest("https://localhost:3000/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages: [{ role: "user", content: "hi" }] }),
  })
}

async function postChat(): Promise<Response> {
  const { POST } = await import("@/app/api/chat/route")
  return POST(makeChatRequest())
}

describe("POST /api/chat in OSS mode", () => {
  it("returns 501 OSS_CHAT_NOT_AVAILABLE with a flat string error when the key is set", async () => {
    process.env.COASTY_API_KEY = "sk-coasty-test-unit-test-key"
    // NEXT_PUBLIC_SUPABASE_URL deliberately unset → isOssMode() auto-detects.

    const resp = await postChat()
    expect(resp.status).toBe(501)

    const body = await resp.json()
    expect(body.code).toBe("OSS_CHAT_NOT_AVAILABLE")
    // Flat envelope contract: clients display body.error verbatim, so it
    // must be a human-readable string — never a nested object.
    expect(typeof body.error).toBe("string")
    expect(body.error).toMatch(/OSS mode/)
    // The message must route users somewhere actionable.
    expect(body.error).toMatch(/coasty\.ai|@coasty\/mcp/)
  })

  it("returns 401 pointing at COASTY_API_KEY when OSS mode is forced without a key", async () => {
    process.env.COASTY_OSS_MODE = "1"
    // No COASTY_API_KEY → getCurrentIdentity() resolves null.

    const resp = await postChat()
    expect(resp.status).toBe(401)

    const body = await resp.json()
    expect(typeof body.error).toBe("string")
    expect(body.error).toContain("COASTY_API_KEY")
    expect(body.error).toContain("coasty.ai/developers")
  })

  it("does not consult Supabase or Bearer auth in OSS mode", async () => {
    process.env.COASTY_API_KEY = "sk-coasty-test-unit-test-key"

    await postChat()
    expect(h.verifyBearerToken).not.toHaveBeenCalled()
  })

  it("production mode is unchanged: Supabase 401 envelope, OSS branch never taken", async () => {
    // Production: Supabase URL present → isOssMode() false even if a key
    // leaked into the env (the safety property of lib/oss-mode.ts:39-43).
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co"
    process.env.COASTY_API_KEY = "sk-coasty-test-leaked-into-prod"

    const resp = await postChat()
    expect(resp.status).toBe(401)

    const body = await resp.json()
    // The pre-existing production envelope, not the OSS message.
    expect(body).toEqual({ error: "Unauthorized" })
    expect(h.verifyBearerToken).toHaveBeenCalledTimes(1)
  })
})
