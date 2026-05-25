/**
 * swarm-tree-awaiting-human.test.ts — regression tests for the awaiting_human
 * extraction path in buildTimelineSteps.
 *
 * Three input shapes must all land in the TimelineStep with a populated
 * machineId (required by the resume/connect buttons in AwaitingHumanBanner —
 * the buttons are a no-op without it):
 *
 *   1. Live SSE — typed `machine_id` + `reason` fields on the SwarmEvent.
 *   2. Polled DB row — `content` holds JSON `{reason, machine_id}` because
 *      the swarm_run_events table has no dedicated columns for those fields.
 *   3. Legacy row — `content` is a plain string reason, no machine_id
 *      anywhere; banner falls back to disabled state but reason is preserved.
 *
 * Without this coverage, the silent-button bug (machine_id never threading
 * through the pipeline) would silently regress.
 */
import { describe, it, expect } from "vitest"
import {
  buildTimelineSteps,
  type SwarmEvent,
} from "@/app/components/swarms/swarm-tree"

function evt(over: Partial<SwarmEvent>): SwarmEvent {
  return {
    id: "e1",
    swarm_id: "s1",
    machine_index: 0,
    event_type: "awaiting_human",
    content: "",
    screenshot: null,
    tool_name: null,
    created_at: "2026-05-25T00:00:00Z",
    ...over,
  }
}

describe("buildTimelineSteps — awaiting_human extraction", () => {
  it("uses the typed machine_id and reason fields when present (live SSE path)", () => {
    const steps = buildTimelineSteps([
      evt({
        machine_id: "vm-live",
        reason: "Please solve the CAPTCHA",
        content: "ignored when typed fields are populated",
      }),
    ])
    expect(steps).toHaveLength(1)
    const s = steps[0]!
    expect(s.status).toBe("awaiting_human")
    expect(s.machineId).toBe("vm-live")
    expect(s.awaitingHumanReason).toBe("Please solve the CAPTCHA")
    expect(s.text).toBe("Please solve the CAPTCHA")
  })

  it("decodes JSON content for machine_id and reason (polled DB path)", () => {
    // This is the shape that swarm/route.ts persists into swarm_run_events.
    // The DB has no machine_id / reason columns, so they ride in content.
    const steps = buildTimelineSteps([
      evt({
        content: JSON.stringify({
          reason: "2FA required",
          machine_id: "vm-from-db",
        }),
      }),
    ])
    expect(steps).toHaveLength(1)
    expect(steps[0]!.machineId).toBe("vm-from-db")
    expect(steps[0]!.awaitingHumanReason).toBe("2FA required")
  })

  it("treats plain-string content as the reason when JSON parse fails (legacy path)", () => {
    // Older rows persisted reason as a raw string; machine_id is unknown.
    const steps = buildTimelineSteps([
      evt({ content: "Need human eyes on this page" }),
    ])
    expect(steps).toHaveLength(1)
    expect(steps[0]!.machineId).toBe("")
    expect(steps[0]!.awaitingHumanReason).toBe(
      "Need human eyes on this page",
    )
  })

  it("falls back to a generic reason when nothing is populated", () => {
    // Empty content + no typed reason — banner still gets SOMETHING readable.
    const steps = buildTimelineSteps([evt({})])
    expect(steps).toHaveLength(1)
    expect(steps[0]!.awaitingHumanReason).toBe("Human intervention needed")
  })

  it("prefers typed reason but falls back to JSON machine_id when only the latter is in content", () => {
    // Mixed source: typed reason set, machine_id only in JSON content.
    // Both paths must merge correctly.
    const steps = buildTimelineSteps([
      evt({
        reason: "Typed reason wins",
        content: JSON.stringify({
          reason: "JSON reason loses",
          machine_id: "vm-merged",
        }),
      }),
    ])
    expect(steps[0]!.awaitingHumanReason).toBe("Typed reason wins")
    expect(steps[0]!.machineId).toBe("vm-merged")
  })

  it("flushes any in-progress text step before pushing the awaiting_human step", () => {
    // The awaiting banner should appear as its own step, not concatenated
    // onto the prior text — otherwise the buttons would render mid-paragraph
    // in the swarm tree.
    const steps = buildTimelineSteps([
      evt({
        id: "t1",
        event_type: "text",
        content: "Working on the form...",
      }),
      evt({
        id: "h1",
        reason: "Now I need you",
        machine_id: "vm-flush",
      }),
    ])
    expect(steps).toHaveLength(2)
    expect(steps[0]!.status).not.toBe("awaiting_human")
    expect(steps[1]!.status).toBe("awaiting_human")
    expect(steps[1]!.machineId).toBe("vm-flush")
  })
})
