// @vitest-environment jsdom
/**
 * Platform-mode store — exhaustive unit coverage.
 *
 * Surfaces under test:
 *   1. Defaults & exported constants.
 *   2. The `isPlatformMode` runtime guard (the trust boundary).
 *   3. setMode / toggleMode / resetMode semantics, including the
 *      invalid-input and idempotent-no-op edge cases.
 *   4. Persistence: what lands in localStorage (only the mode, under the
 *      right key) and rehydration recovery from every flavour of corrupt
 *      storage (bad mode, missing field, non-object state, malformed JSON).
 *
 * jsdom is used purely for its localStorage; no DOM is rendered here.
 */
import { describe, it, expect, beforeEach } from "vitest"
import {
  usePlatformMode,
  isPlatformMode,
  DEFAULT_PLATFORM_MODE,
  PLATFORM_MODE_STORAGE_KEY,
  PLATFORM_MODES,
} from "@/lib/platform-mode-store"

const get = () => usePlatformMode.getState()

// Force a rehydrate from whatever is currently in localStorage. Corrupt
// payloads can make the underlying promise reject; we never want that to
// fail the test itself — only the resulting *state* is asserted.
async function rehydrate() {
  await usePlatformMode.persist.rehydrate()?.catch?.(() => {})
}

beforeEach(() => {
  localStorage.clear()
  // Reset to a known-good baseline between tests (the store is a singleton).
  usePlatformMode.setState({ mode: DEFAULT_PLATFORM_MODE })
})

describe("platform-mode store", () => {
  describe("defaults & constants", () => {
    it("defaults to consumer", () => {
      expect(get().mode).toBe("consumer")
      expect(DEFAULT_PLATFORM_MODE).toBe("consumer")
    })

    it("exposes exactly the two modes, in order", () => {
      expect([...PLATFORM_MODES]).toEqual(["consumer", "developer"])
    })

    it("uses a namespaced storage key", () => {
      expect(PLATFORM_MODE_STORAGE_KEY).toBe("coasty:platform-mode")
    })
  })

  describe("isPlatformMode guard", () => {
    it("accepts the two valid modes", () => {
      expect(isPlatformMode("consumer")).toBe(true)
      expect(isPlatformMode("developer")).toBe(true)
    })

    it("rejects everything else", () => {
      const bad: unknown[] = [
        "",
        "Consumer", // wrong case
        "DEV",
        "admin",
        " consumer ", // whitespace
        "null",
        "undefined",
        null,
        undefined,
        0,
        1,
        NaN,
        true,
        false,
        {},
        [],
        ["consumer"],
        { mode: "consumer" },
        new String("consumer"), // boxed String is an object, not a primitive
        Symbol("consumer"),
      ]
      for (const v of bad) expect(isPlatformMode(v)).toBe(false)
    })
  })

  describe("setMode", () => {
    it("switches to developer and back to consumer", () => {
      get().setMode("developer")
      expect(get().mode).toBe("developer")
      get().setMode("consumer")
      expect(get().mode).toBe("consumer")
    })

    it("ignores invalid values, leaving the mode unchanged", () => {
      get().setMode("developer")
      const invalid: unknown[] = ["nonsense", "", "CONSUMER", null, undefined, 42, {}]
      for (const v of invalid) {
        ;(get().setMode as (m: unknown) => void)(v)
        expect(get().mode).toBe("developer")
      }
    })

    it("is a no-op when set to the current mode (no throw)", () => {
      get().setMode("consumer")
      expect(() => get().setMode("consumer")).not.toThrow()
      expect(get().mode).toBe("consumer")
    })

    it("does not replace the action references across updates (stable identity)", () => {
      const setBefore = get().setMode
      const toggleBefore = get().toggleMode
      get().setMode("developer")
      expect(get().setMode).toBe(setBefore)
      expect(get().toggleMode).toBe(toggleBefore)
    })

    it("survives rapid repeated switches", () => {
      for (let i = 0; i < 50; i++) {
        get().setMode(i % 2 === 0 ? "developer" : "consumer")
      }
      expect(get().mode).toBe("consumer")
    })
  })

  describe("toggleMode", () => {
    it("flips consumer → developer → consumer", () => {
      expect(get().mode).toBe("consumer")
      get().toggleMode()
      expect(get().mode).toBe("developer")
      get().toggleMode()
      expect(get().mode).toBe("consumer")
    })

    it("flips correctly from a developer starting point", () => {
      usePlatformMode.setState({ mode: "developer" })
      get().toggleMode()
      expect(get().mode).toBe("consumer")
    })
  })

  describe("resetMode", () => {
    it("returns to the default from developer", () => {
      get().setMode("developer")
      get().resetMode()
      expect(get().mode).toBe(DEFAULT_PLATFORM_MODE)
    })

    it("is a safe no-op when already default", () => {
      get().resetMode()
      expect(get().mode).toBe("consumer")
    })
  })

  describe("persistence", () => {
    it("writes only the mode under the storage key (no leaked actions)", () => {
      get().setMode("developer")
      const raw = localStorage.getItem(PLATFORM_MODE_STORAGE_KEY)
      expect(raw).toBeTruthy()
      const parsed = JSON.parse(raw as string)
      expect(parsed.state.mode).toBe("developer")
      expect(parsed.version).toBe(1)
      expect(parsed.state.setMode).toBeUndefined()
      expect(parsed.state.toggleMode).toBeUndefined()
      expect(parsed.state.resetMode).toBeUndefined()
    })

    it("rehydrates a valid persisted mode", async () => {
      localStorage.setItem(
        PLATFORM_MODE_STORAGE_KEY,
        JSON.stringify({ state: { mode: "developer" }, version: 1 })
      )
      await rehydrate()
      expect(get().mode).toBe("developer")
    })

    it("recovers from an unrecognised mode value", async () => {
      localStorage.setItem(
        PLATFORM_MODE_STORAGE_KEY,
        JSON.stringify({ state: { mode: "garbage" }, version: 1 })
      )
      await rehydrate()
      expect(get().mode).toBe(DEFAULT_PLATFORM_MODE)
    })

    it("recovers from a missing mode field", async () => {
      localStorage.setItem(
        PLATFORM_MODE_STORAGE_KEY,
        JSON.stringify({ state: {}, version: 1 })
      )
      await rehydrate()
      expect(get().mode).toBe(DEFAULT_PLATFORM_MODE)
    })

    it("recovers from a non-object persisted state", async () => {
      localStorage.setItem(
        PLATFORM_MODE_STORAGE_KEY,
        JSON.stringify({ state: "developer", version: 1 })
      )
      await rehydrate()
      expect(get().mode).toBe(DEFAULT_PLATFORM_MODE)
    })

    it("recovers from a null persisted state", async () => {
      localStorage.setItem(
        PLATFORM_MODE_STORAGE_KEY,
        JSON.stringify({ state: null, version: 1 })
      )
      await rehydrate()
      expect(get().mode).toBe(DEFAULT_PLATFORM_MODE)
    })

    it("recovers from malformed JSON in storage", async () => {
      localStorage.setItem(PLATFORM_MODE_STORAGE_KEY, "{ not valid json")
      await rehydrate()
      expect(get().mode).toBe(DEFAULT_PLATFORM_MODE)
    })

    it("persists each switch to storage as it happens", () => {
      // NB: any state write (incl. setState) re-persists, so the realistic
      // round-trip is "does the live switch land in storage" — rehydration
      // from a stored value is covered by the cases above.
      get().setMode("developer")
      expect(
        JSON.parse(localStorage.getItem(PLATFORM_MODE_STORAGE_KEY) as string).state.mode
      ).toBe("developer")
      get().setMode("consumer")
      expect(
        JSON.parse(localStorage.getItem(PLATFORM_MODE_STORAGE_KEY) as string).state.mode
      ).toBe("consumer")
    })

    it("does not rewrite storage when setMode is a no-op (same mode)", () => {
      get().setMode("developer")
      const before = localStorage.getItem(PLATFORM_MODE_STORAGE_KEY)
      get().setMode("developer") // early-returns before set()
      expect(localStorage.getItem(PLATFORM_MODE_STORAGE_KEY)).toBe(before)
      expect(get().mode).toBe("developer")
    })

    it("resetMode round-trips to storage", () => {
      get().setMode("developer")
      get().resetMode()
      expect(
        JSON.parse(localStorage.getItem(PLATFORM_MODE_STORAGE_KEY) as string).state.mode
      ).toBe("consumer")
    })

    it.each([
      ["array", ["consumer"]],
      ["boolean true", true],
      ["boolean false", false],
      ["number 1", 1],
      ["number 0", 0],
      ["nested object", { mode: "consumer" }],
    ])("recovers from a non-string mode payload (%s)", async (_label, badMode) => {
      localStorage.setItem(
        PLATFORM_MODE_STORAGE_KEY,
        JSON.stringify({ state: { mode: badMode }, version: 1 })
      )
      await rehydrate()
      expect(get().mode).toBe(DEFAULT_PLATFORM_MODE)
    })
  })

  describe("version migration", () => {
    it("preserves a valid mode across a version mismatch (migrate path)", async () => {
      localStorage.setItem(
        PLATFORM_MODE_STORAGE_KEY,
        JSON.stringify({ state: { mode: "developer" }, version: 2 })
      )
      await rehydrate()
      expect(get().mode).toBe("developer")
    })

    it("falls back to default when an off-version payload holds an invalid mode", async () => {
      localStorage.setItem(
        PLATFORM_MODE_STORAGE_KEY,
        JSON.stringify({ state: { mode: "garbage" }, version: 0 })
      )
      await rehydrate()
      expect(get().mode).toBe(DEFAULT_PLATFORM_MODE)
    })
  })

  describe("toggleMode resilience", () => {
    it("yields a valid mode even from a corrupted in-memory state", () => {
      // setState bypasses setMode's guard; toggle must still land on a real mode.
      usePlatformMode.setState({ mode: "garbage" as unknown as "consumer" })
      get().toggleMode()
      expect(isPlatformMode(get().mode)).toBe(true)
      expect(get().mode).toBe("developer")
    })
  })
})
