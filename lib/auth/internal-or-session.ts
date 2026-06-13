import { createClient as createServiceRoleClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";

/**
 * Result of resolving the caller of a route that may be hit either by a
 * dashboard user (Supabase cookie session) or by the FastAPI backend acting
 * on a user's behalf (server-to-server internal API key).
 *
 * `userId` is the tenant the request operates as. `supabase` is a Supabase
 * client that MUST be used for every DB operation in the handler:
 *  - cookie path  -> RLS-scoped anon client (RLS enforces the tenant boundary)
 *  - internal path -> SERVICE-ROLE client (bypasses RLS) — so the caller is
 *    responsible for filtering every query by `userId` itself.
 *
 * SECURITY INVARIANT: the `X-User-ID` header is trusted ONLY when the request
 * also presents an `x-internal-key` that matches `process.env.INTERNAL_API_KEY`
 * via a constant-time compare. A public/dashboard request can never set the
 * acting user via a header — its identity always comes from the verified
 * Supabase session. This mirrors:
 *   - app/api/credits/auto-refill/execute/route.ts (the canonical fix)
 *   - backend/app/core/middleware.py InternalAPIKeyMiddleware (honors
 *     X-User-ID only after the internal key matches; strips it on public paths)
 * Because the internal branch uses a service-role client (RLS off), callers
 * MUST keep an explicit `.eq("user_id", userId)` on every query — that filter
 * is the ONLY tenant guard on the internal path.
 */
export interface ResolvedAuth {
  userId: string | null;
  supabase: any;
}

/**
 * Constant-time string comparison to avoid leaking the internal key via timing.
 * Mirrors the backend's hmac.compare_digest gate.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

/**
 * Resolve the acting user for a route that the backend may proxy to.
 *
 * Returns `{ userId, supabase }`. On failure to authenticate, returns
 * `{ userId: null, supabase: null }` and the caller should respond 401.
 */
export async function resolveInternalOrSession(
  request: NextRequest
): Promise<ResolvedAuth> {
  // --- Internal (server-to-server) path -----------------------------------
  // Trust X-User-ID ONLY when the internal key matches. Never read X-User-ID
  // on any other path.
  const internalKey = request.headers.get("x-internal-key");
  const expectedKey = process.env.INTERNAL_API_KEY;
  if (
    internalKey &&
    expectedKey &&
    timingSafeEqual(internalKey, expectedKey)
  ) {
    const headerUserId = request.headers.get("x-user-id");
    if (!headerUserId) {
      // Internal key present but no acting user supplied — not authenticated.
      return { userId: null, supabase: null };
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE;
    if (!supabaseUrl || !serviceRoleKey) {
      return { userId: null, supabase: null };
    }

    // SERVICE-ROLE client — bypasses RLS. Callers MUST filter by userId.
    const supabase = createServiceRoleClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    return { userId: headerUserId, supabase };
  }

  // --- Cookie (dashboard user) path ---------------------------------------
  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();
  if (!supabase) {
    return { userId: null, supabase: null };
  }
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData?.user) {
    return { userId: null, supabase: null };
  }

  return { userId: authData.user.id, supabase };
}
