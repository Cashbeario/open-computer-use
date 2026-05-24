/**
 * Concurrent-swarm-machine cap for the Unlimited tier.
 *
 * Pins the "1 concurrent swarm machine for Unlimited subscribers"
 * invariant enforced at
 * [app/api/swarm/route.ts:152-156](../../app/api/swarm/route.ts#L152-L156):
 *
 *     const swarmMaxMachines = planTier === "unlimited"
 *       ? 1
 *       : isPersistent
 *         ? planMaxMachines
 *         : Math.min(planMaxMachines * 3, 10);
 *
 * The cap is the abuse-prevention valve for the $249 flat-rate plan:
 * unlimited credits + N parallel agents would let one user burn the
 * plan economics in a single hour. Capping to 1 forces serial usage,
 * which the token-based throttle ([backend/app/services/unlimited_throttle.py](../../backend/app/services/unlimited_throttle.py))
 * then bounds the cost of.
 *
 * The cap logic was extracted into the pure helpers
 * `computeSwarmMaxMachines` and `clampRequestedMachineCount` so the
 * route doesn't have to be mounted with a full
 * Supabase/AWS/WorkMail/Python-backend mock tree just to test these
 * 4 lines. The POST handler in route.ts is the only production
 * caller; the tests below pin both layers (compute then clamp) so a
 * regression in either silently raising the Unlimited cap above 1
 * fails loudly.
 */
import { describe, it, expect } from "vitest"

import {
  computeSwarmMaxMachines,
  clampRequestedMachineCount,
} from "@/app/api/swarm/route"

describe("swarm cap — Unlimited tier (1-concurrent invariant)", () => {
  it("Unlimited tier always returns cap=1, even with high plan.max_machines", () => {
    // Even though Unlimited's plan.max_machines is 2 (matches Plus),
    // the swarm cap is the harder invariant of "1 concurrent agent" —
    // so the POST handler must clamp to 1, never planMaxMachines.
    // Pathologically high `planMaxMachines` here proves the tier check
    // wins over any other input.
    expect(
      computeSwarmMaxMachines({
        planTier: "unlimited",
        planMaxMachines: 10,
        isPersistent: false,
      }),
    ).toBe(1)
  })

  it("Unlimited tier caps at 1 EVEN for persistent swarms (the trick edge case)", () => {
    // Without the explicit `planTier === "unlimited"` early-return AT
    // THE TOP, this call would fall through to the `isPersistent`
    // branch and return planMaxMachines (currently 2). The whole point
    // of the early return is to make the cap unconditional. This test
    // would have caught a silent 2x-cap regression if the early return
    // ever gets removed in a refactor.
    expect(
      computeSwarmMaxMachines({
        planTier: "unlimited",
        planMaxMachines: 2,
        isPersistent: true,
      }),
    ).toBe(1)
  })

  it("Unlimited end-to-end: malicious request of 99 still resolves to 1 machine", () => {
    // Two-layer defense. Layer 1: computeSwarmMaxMachines returns 1.
    // Layer 2: clampRequestedMachineCount clamps the buggy/hostile
    // client request down to 1. Either layer alone would suffice; the
    // POST handler chains both. This test pins the chained behavior so
    // the cap holds end-to-end even if one layer is later loosened.
    const cap = computeSwarmMaxMachines({
      planTier: "unlimited",
      planMaxMachines: 2,
      isPersistent: false,
    })
    expect(cap).toBe(1)
    expect(clampRequestedMachineCount(99, cap)).toBe(1)
  })
})

describe("swarm cap — non-Unlimited baseline (so the test above is meaningful)", () => {
  it("temporary swarm on a planMax=2 tier returns 6 (= planMax * 3)", () => {
    // Plus/Pro baseline. The 3x multiplier reflects that temporary
    // swarm runners are disposable, so a user can briefly fan out
    // beyond their persistent-machine budget. If THIS test broke, the
    // Unlimited cap test above would be meaningless (the cap would be
    // 1 because every tier returns 1).
    expect(
      computeSwarmMaxMachines({
        planTier: "plus",
        planMaxMachines: 2,
        isPersistent: false,
      }),
    ).toBe(6)
  })

  it("clampRequestedMachineCount: 0/undefined → cap; explicit-but-over → cap; under → request", () => {
    // Pins the three branches of the clamp helper in one assertion
    // block (saves a test slot for the 10-test budget):
    //   - "no count given" → user accepted the maximum, which IS the cap
    //   - "explicit count over the cap" → cap (a malicious or buggy
    //     client cannot exceed the cap by inflating machineCount)
    //   - "explicit count under the cap" → request (the user's
    //     preference is respected when it's within bounds)
    expect(clampRequestedMachineCount(undefined, 6)).toBe(6)
    expect(clampRequestedMachineCount(0, 6)).toBe(6)
    expect(clampRequestedMachineCount(99, 6)).toBe(6)
    expect(clampRequestedMachineCount(3, 6)).toBe(3)
  })
})
