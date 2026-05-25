/**
 * Pure cap-computation helpers for /api/swarm.
 *
 * Lives here (not in app/api/swarm/route.ts) because Next.js route files
 * are restricted to a fixed set of exports (POST/GET/etc + framework
 * configs).  Exporting helpers directly from a route file triggers
 * TS2344 against the auto-generated `.next/types/.../route.ts`.
 *
 * The route's POST handler is the only production caller; the tests in
 * tests/api/swarm-cap.test.ts pin the invariants below so a regression
 * in either layer (compute or clamp) fails loudly.
 */

/**
 * Compute the per-request machine ceiling for a swarm POST.
 *
 * Rules:
 *   - "unlimited" tier ALWAYS caps at 5, regardless of `isPersistent`.
 *     Abuse-prevention valve for the flat-rate Unlimited plan — unlimited
 *     credits + unbounded parallelism would let one user burn the plan
 *     economics in an hour. 5 leaves room for genuine multi-agent
 *     workflows without that exposure.  (Same value surfaced as
 *     `swarmAgentsLimit: 5` on the Unlimited tier in
 *     [lib/pricing/tiers.ts](./pricing/tiers.ts).)
 *   - Persistent swarms cap at the plan's `max_machines` (they become
 *     real persistent machines, so they consume the plan's machine slot
 *     budget).
 *   - Temporary swarms cap at `min(max_machines * 3, 10)` — three
 *     parallel disposable runners per slot, with an absolute ceiling of
 *     10 to keep per-user blast radius bounded.
 *
 * Returns an integer ≥ 0 (callers should still apply their own ≥ 1
 * floor; this function trusts the inputs as plan data).
 */
export function computeSwarmMaxMachines(opts: {
  planTier: string;
  planMaxMachines: number;
  isPersistent: boolean;
}): number {
  if (opts.planTier === "unlimited") return 5;
  if (opts.isPersistent) return opts.planMaxMachines;
  return Math.min(opts.planMaxMachines * 3, 10);
}

/**
 * Clamp the user's requested machine count to the computed cap.
 *
 * Mirrors the inline `Math.min(body.machineCount || cap, cap)` pattern
 * the POST handler used pre-refactor. Treats 0/undefined/negative as
 * "no explicit request" → default to the cap. Always returns the
 * minimum of (explicit request, cap), so a malicious or buggy client
 * cannot exceed the cap by sending an inflated `machineCount`.
 */
export function clampRequestedMachineCount(
  requested: number | undefined,
  cap: number,
): number {
  if (!requested || requested < 1) return cap;
  return Math.min(requested, cap);
}
