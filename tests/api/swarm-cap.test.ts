/**
 * Concurrent-swarm-machine cap for the Unlimited tier.
 *
 * Pins the "5 concurrent swarm machines for Unlimited subscribers"
 * invariant enforced in
 * [app/api/swarm/route.ts](../../app/api/swarm/route.ts) via
 * `computeSwarmMaxMachines`:
 *
 *     if (opts.planTier === "unlimited") return 5;
 *     if (opts.isPersistent) return opts.planMaxMachines;
 *     return Math.min(opts.planMaxMachines * 3, 10);
 *
 * The cap is the abuse-prevention valve for the flat-rate Unlimited plan:
 * unlimited credits + fully unbounded parallelism would let one user
 * burn the plan economics in a single hour. Capping to 5 keeps the
 * plan sustainable while leaving room for genuine multi-agent workflows
 * (a step up from the prior 1-concurrent design).
 *
 * The cap logic was extracted into the pure helpers
 * `computeSwarmMaxMachines` and `clampRequestedMachineCount` so the
 * route doesn't have to be mounted with a full
 * Supabase/AWS/WorkMail/Python-backend mock tree just to test these
 * 4 lines. The POST handler in route.ts is the only production
 * caller; the tests below pin both layers (compute then clamp) so a
 * regression in either silently raising the Unlimited cap above 5
 * fails loudly.
 */
import { describe, it, expect } from "vitest"

import {
  computeSwarmMaxMachines,
  clampRequestedMachineCount,
} from "@/lib/swarm-cap"

describe("swarm cap — Unlimited tier (5-concurrent invariant)", () => {
  it("Unlimited tier always returns cap=5, even with high plan.max_machines", () => {
    // Even with a pathologically high `planMaxMachines` (which would
    // otherwise feed the temporary-swarm multiplier and yield a cap of
    // min(10*3, 10)=10), the early-return for "unlimited" must clamp to
    // 5. Pathologically high `planMaxMachines` here proves the tier
    // check wins over any other input.
    expect(
      computeSwarmMaxMachines({
        planTier: "unlimited",
        planMaxMachines: 10,
        isPersistent: false,
      }),
    ).toBe(5)
  })

  it("Unlimited tier caps at 5 EVEN for persistent swarms (the trick edge case)", () => {
    // Without the explicit `planTier === "unlimited"` early-return AT
    // THE TOP, this call would fall through to the `isPersistent`
    // branch and return planMaxMachines (currently 2). The whole point
    // of the early return is to make the cap unconditional. This test
    // would have caught a silent regression if the early return ever
    // gets removed in a refactor.
    expect(
      computeSwarmMaxMachines({
        planTier: "unlimited",
        planMaxMachines: 2,
        isPersistent: true,
      }),
    ).toBe(5)
  })

  it("Unlimited end-to-end: malicious request of 99 still resolves to 5 machines", () => {
    // Two-layer defense. Layer 1: computeSwarmMaxMachines returns 5.
    // Layer 2: clampRequestedMachineCount clamps the buggy/hostile
    // client request down to 5. Either layer alone would suffice; the
    // POST handler chains both. This test pins the chained behavior so
    // the cap holds end-to-end even if one layer is later loosened.
    const cap = computeSwarmMaxMachines({
      planTier: "unlimited",
      planMaxMachines: 2,
      isPersistent: false,
    })
    expect(cap).toBe(5)
    expect(clampRequestedMachineCount(99, cap)).toBe(5)
  })

  it("Unlimited cap is strictly less than Plus's swarm budget", () => {
    // Plus ($50) sells parallelism as a feature: planMaxMachines=2,
    // temporary multiplier = min(2*3, 10) = 6.  Unlimited at 5 is
    // intentionally one step below — Plus still offers more
    // parallelism, Unlimited offers unlimited credits.  If this
    // inequality ever flips, the two plans' positioning is broken.
    const unlimitedCap = computeSwarmMaxMachines({
      planTier: "unlimited",
      planMaxMachines: 2,
      isPersistent: false,
    })
    const plusCap = computeSwarmMaxMachines({
      planTier: "plus",
      planMaxMachines: 2,
      isPersistent: false,
    })
    expect(unlimitedCap).toBeLessThan(plusCap)
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
