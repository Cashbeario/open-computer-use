/**
 * Machines internal-auth security contract — source scan.
 *
 * The /api/machines routes are reachable two ways: a dashboard user with a
 * Supabase cookie session, and the FastAPI backend acting on a user's behalf
 * via the internal API key + an `X-User-ID` header. The shared helper
 * `lib/auth/internal-or-session.ts` collapses both into `{ userId, supabase }`.
 *
 * The danger: on the internal path the helper hands back a SERVICE-ROLE client
 * with RLS turned OFF, so the per-query `.eq("user_id", ...)` (or the
 * already-ownership-verified `.eq("id", ...)`) is the ONLY tenant boundary. And
 * `X-User-ID` must be honored ONLY after the internal key is verified — a
 * public request that could set the acting user via a header would be a full
 * account-takeover primitive.
 *
 * These routes need a running Next.js server + Supabase + a real internal key
 * to exercise at runtime, so we pin the contract by SCANNING THE SOURCE
 * instead. Same style as tests/proxy-response-encoding.test.ts: a future
 * refactor (or a route copied from an old cookie-only template) cannot silently
 * reintroduce a cross-tenant read or a header-trusting auth bypass on the files
 * listed here.
 *
 * Contracts pinned:
 *  (a) the helper trusts `X-User-ID` ONLY inside the internal-key branch
 *      (after a constant-time key compare); the cookie path derives identity
 *      from the verified Supabase session, never from a header.
 *  (b) machines route.ts and [id]/route.ts no longer carry a bare cookie-only
 *      `getUser ... Unauthorized` as their ONLY auth — they go through the
 *      `resolveInternalOrSession` helper.
 *  (c) every `.from("user_machines")` statement in those two route files is
 *      tenant-scoped: it carries an `.eq("user_id", ...)` filter, or the
 *      per-row `.eq("id", ...)` guard (the row was already ownership-verified
 *      by a prior `user_id`-filtered select), or — for the create INSERT — a
 *      `user_id:` field in the inserted payload. No unscoped query is allowed.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const ROOT = join(__dirname, "..")

const HELPER = "lib/auth/internal-or-session.ts"
const MACHINES_LIST = "app/api/machines/route.ts"
const MACHINES_ID = "app/api/machines/[id]/route.ts"
const ROUTE_FILES = [MACHINES_LIST, MACHINES_ID]

const read = (rel: string) => readFileSync(join(ROOT, rel), "utf-8")

// ---------------------------------------------------------------------------
// (a) The helper trusts X-User-ID ONLY inside the internal-key branch.
// ---------------------------------------------------------------------------
describe("internal-or-session helper trusts X-User-ID only behind the internal key", () => {
  const src = read(HELPER)

  it("reads the internal key and compares it constant-time", () => {
    expect(src).toMatch(/headers\.get\(\s*["']x-internal-key["']\s*\)/i)
    // Constant-time compare gate (mirrors backend hmac.compare_digest).
    expect(src).toMatch(/timingSafeEqual\s*\(/)
  })

  it("only reads X-User-ID once, and it is the only header used for identity", () => {
    const userIdReads = src.match(/headers\.get\(\s*["']x-user-id["']\s*\)/gi) || []
    expect(userIdReads.length).toBe(1)
  })

  it("the X-User-ID read sits AFTER (inside) the internal-key compare gate", () => {
    const keyCompareIdx = src.search(/timingSafeEqual\s*\(\s*internalKey/)
    const userIdIdx = src.search(/headers\.get\(\s*["']x-user-id["']\s*\)/i)
    expect(keyCompareIdx).toBeGreaterThanOrEqual(0)
    expect(userIdIdx).toBeGreaterThanOrEqual(0)
    // X-User-ID must only be consulted after the key has been verified.
    expect(userIdIdx).toBeGreaterThan(keyCompareIdx)
  })

  it("the X-User-ID read is lexically nested inside the `if (internalKey ... timingSafeEqual)` block", () => {
    // Find the start of the internal-key `if (...)` and the matching `{`.
    const ifMatch = /if\s*\(\s*[\s\S]*?timingSafeEqual\s*\(\s*internalKey[\s\S]*?\)\s*\)\s*\{/.exec(src)
    expect(ifMatch).not.toBeNull()
    const blockStart = ifMatch!.index + ifMatch![0].length - 1 // points at the `{`

    // Walk braces to find the end of that block.
    let depth = 0
    let blockEnd = -1
    for (let i = blockStart; i < src.length; i++) {
      const ch = src[i]
      if (ch === "{") depth++
      else if (ch === "}") {
        depth--
        if (depth === 0) {
          blockEnd = i
          break
        }
      }
    }
    expect(blockEnd).toBeGreaterThan(blockStart)

    const userIdIdx = src.search(/headers\.get\(\s*["']x-user-id["']\s*\)/i)
    expect(userIdIdx).toBeGreaterThan(blockStart)
    expect(userIdIdx).toBeLessThan(blockEnd)
  })

  it("the cookie (dashboard) path derives identity from the verified session, not a header", () => {
    // Cookie branch identity must come from auth.getUser(), never X-User-ID.
    expect(src).toMatch(/auth\.getUser\(\s*\)/)
    // Identity returned on the cookie path is the verified user's id.
    expect(src).toMatch(/authData(\?\.user|\.user)\.id/)
  })

  it("internal branch hands back a service-role client (RLS off — caller must filter)", () => {
    expect(src).toMatch(/SUPABASE_SERVICE_ROLE/)
    expect(src).toMatch(/createServiceRoleClient|createClient as createServiceRoleClient/)
  })
})

// ---------------------------------------------------------------------------
// (b) Route files no longer carry a bare cookie-only getUser+Unauthorized as
//     their ONLY auth — they go through resolveInternalOrSession.
// ---------------------------------------------------------------------------
describe.each(ROUTE_FILES)("%s routes through resolveInternalOrSession", (rel) => {
  const src = read(rel)

  it("imports and calls the shared resolveInternalOrSession helper", () => {
    expect(src).toMatch(
      /import\s*\{[^}]*\bresolveInternalOrSession\b[^}]*\}\s*from\s*["']@\/lib\/auth\/internal-or-session["']/
    )
    expect(src).toMatch(/await\s+resolveInternalOrSession\s*\(\s*request\s*\)/)
  })

  it("has no bare cookie-only auth.getUser() as the request gate", () => {
    // The only sanctioned getUser() lives inside the helper. A direct
    // supabase.auth.getUser() in the route file would be the old cookie-only
    // pattern that ignores the internal-key path.
    expect(src).not.toMatch(/\.auth\.getUser\(/)
  })

  it("each exported handler resolves auth via the helper before any 401", () => {
    // Count handler entry points and helper calls; every handler must resolve.
    const handlers = src.match(/export\s+async\s+function\s+(GET|POST|PUT|PATCH|DELETE)\s*\(/g) || []
    const resolves = src.match(/await\s+resolveInternalOrSession\s*\(/g) || []
    expect(handlers.length).toBeGreaterThan(0)
    expect(resolves.length).toBeGreaterThanOrEqual(handlers.length)
  })

  it("the Unauthorized 401 is guarded by the helper's null userId/supabase", () => {
    // Pattern: `if (!userId || !supabase) { ... 401 }` right after the resolve.
    expect(src).toMatch(/if\s*\(\s*!userId\s*\|\|\s*!supabase\s*\)/)
    expect(src).toMatch(/"Unauthorized"/)
  })
})

// ---------------------------------------------------------------------------
// (c) Every user_machines query carries a tenant filter in the same statement.
// ---------------------------------------------------------------------------

/**
 * Extract each `.from("user_machines") ... ;` statement body from a source
 * string. Splits on the table accessor and reads up to the statement
 * terminator. Good enough for these route files, which always terminate each
 * Supabase builder chain with a `;`.
 */
function extractUserMachineStatements(src: string): string[] {
  const re = /\.from\(\s*["']user_machines["']\s*\)([\s\S]*?);/g
  const out: string[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(src)) !== null) {
    out.push(m[1])
  }
  return out
}

/**
 * For an INSERT, the owner is set in the payload, not via `.eq`. The payload is
 * sometimes an inline object literal and sometimes a named variable declared
 * just above (e.g. `placeholderData`). Resolve both: accept if the statement's
 * insert argument literally contains `user_id:`, or if it names a variable
 * whose `const <var> = { ... user_id: ... }` declaration carries the owner.
 */
function insertCarriesOwner(stmt: string, src: string): boolean {
  const insertArg = /\.insert\(\s*([\s\S]*?)\)/.exec(stmt)
  if (!insertArg) return false
  const arg = insertArg[1].trim()
  // Inline object literal with the owner field.
  if (/user_id\s*:/.test(arg)) return true
  // Named payload variable -> resolve its declaration in the same file.
  const varName = /^[A-Za-z_$][\w$]*$/.test(arg) ? arg : null
  if (!varName) return false
  const declRe = new RegExp(
    `(?:const|let|var)\\s+${varName}\\s*(?::[^=]+)?=\\s*\\{([\\s\\S]*?)\\n\\s*\\}`,
  )
  const decl = declRe.exec(src)
  return !!decl && /user_id\s*:/.test(decl[1])
}

/** A user_machines statement is tenant-scoped if it carries a user filter. */
function isTenantScoped(stmt: string, src: string): boolean {
  // Direct tenant filter.
  if (/\.eq\(\s*["']user_id["']/.test(stmt)) return true
  // Per-row guard: the row id was already ownership-verified by a prior
  // user_id-filtered select in the same handler.
  if (/\.eq\(\s*["']id["']/.test(stmt)) return true
  // Create path: INSERT sets the owner in the payload (can't .eq on insert).
  if (/\.insert\(/.test(stmt) && insertCarriesOwner(stmt, src)) return true
  return false
}

describe.each(ROUTE_FILES)("%s — every user_machines query is tenant-scoped", (rel) => {
  const src = read(rel)
  const statements = extractUserMachineStatements(src)

  it("actually contains user_machines queries (scan is not vacuous)", () => {
    expect(statements.length).toBeGreaterThan(0)
  })

  it("no .from(\"user_machines\") query lacks a user/id/insert-owner filter", () => {
    const unscoped = statements.filter((s) => !isTenantScoped(s, src))
    // Show the offending statements if any slip through.
    expect(
      unscoped.map((s) => s.replace(/\s+/g, " ").trim().slice(0, 160))
    ).toEqual([])
  })

  it("at least one user_id-filtered query exists (the tenant entrypoint guard)", () => {
    const userIdScoped = statements.filter((s) => /\.eq\(\s*["']user_id["']/.test(s))
    expect(userIdScoped.length).toBeGreaterThan(0)
  })
})
