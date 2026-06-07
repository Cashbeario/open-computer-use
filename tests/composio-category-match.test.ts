/**
 * composio-category-match.test.ts — defensive guards on `inferCategoryMatch`.
 *
 * NEW-2 incident (2026-06-01): the dialog crashed with
 *   "tk.categories is not iterable"
 * because the backend's wire payload omitted `categories` entirely and the
 * old code did `for (const c of tk.categories)`. These tests pin every
 * malformed shape the function is now expected to tolerate without
 * throwing — null, undefined, non-array primitives, arrays containing
 * non-string entries, missing slug, etc.
 *
 * Tests run pure JS — no React, no jsdom needed.
 */
import { describe, it, expect } from "vitest"
import { inferCategoryMatch } from "@/app/connections/connect-app-dialog"
import type { ComposioToolkit } from "@/lib/composio-store/types"

// ── Helpers ─────────────────────────────────────────────────────────────────
// Build a minimal toolkit with overridable fields. The deliberate `as any`
// at each call site lets us inject malformed values without TypeScript
// preventing the test from exercising the runtime guard.
function tk(overrides: Partial<ComposioToolkit> & Record<string, unknown> = {}): ComposioToolkit {
  return {
    slug: "gmail",
    name: "Gmail",
    description: "",
    logo_url: null,
    categories: [],
    auth_type: "OAUTH2",
    ...overrides,
  } as ComposioToolkit
}

describe("inferCategoryMatch — defensive guards (NEW-2)", () => {
  describe("rule resolution", () => {
    it("returns true for the catch-all 'all' rule", () => {
      expect(inferCategoryMatch(tk(), "all")).toBe(true)
    })

    it("returns false for unknown rule ids", () => {
      expect(inferCategoryMatch(tk(), "totally_made_up")).toBe(false)
    })
  })

  describe("'popular' synthetic category", () => {
    it("matches featured toolkit slugs", () => {
      expect(inferCategoryMatch(tk({ slug: "gmail" }), "popular")).toBe(true)
      expect(inferCategoryMatch(tk({ slug: "slack" }), "popular")).toBe(true)
      expect(inferCategoryMatch(tk({ slug: "github" }), "popular")).toBe(true)
    })

    it("rejects non-featured slugs", () => {
      expect(inferCategoryMatch(tk({ slug: "ably" }), "popular")).toBe(false)
      expect(inferCategoryMatch(tk({ slug: "random_app" }), "popular")).toBe(false)
    })

    it("is case-insensitive on the slug", () => {
      expect(inferCategoryMatch(tk({ slug: "GMAIL" }), "popular")).toBe(true)
    })
  })

  describe("slug-based matching", () => {
    it("matches by slug regex when the slug contains the rule keyword", () => {
      expect(inferCategoryMatch(tk({ slug: "gmail" }), "communication")).toBe(true)
      expect(inferCategoryMatch(tk({ slug: "github" }), "dev")).toBe(true)
    })

    it("does not match when the slug is unrelated", () => {
      expect(inferCategoryMatch(tk({ slug: "random_app" }), "communication")).toBe(
        false,
      )
    })
  })

  describe("categories array — malformed inputs (NEW-2 regression class)", () => {
    it("does not throw when categories is undefined", () => {
      // Use a slug that doesn't match the rule's regex so we exercise the
      // categories-iteration branch (which was the original crash site).
      const bad = tk({
        slug: "random_app",
        categories: undefined as unknown as string[],
      })
      expect(() => inferCategoryMatch(bad, "communication")).not.toThrow()
      expect(inferCategoryMatch(bad, "communication")).toBe(false)
    })

    it("does not throw when categories is null", () => {
      const bad = tk({
        slug: "random_app",
        categories: null as unknown as string[],
      })
      expect(() => inferCategoryMatch(bad, "communication")).not.toThrow()
      expect(inferCategoryMatch(bad, "communication")).toBe(false)
    })

    it("does not throw when categories is a string (not an array)", () => {
      const bad = tk({ categories: "email" as unknown as string[] })
      expect(() => inferCategoryMatch(bad, "communication")).not.toThrow()
      // A bare string is treated as empty since it isn't an array;
      // matching still falls back to slug regex.
      expect(inferCategoryMatch(bad, "communication")).toBe(true)
    })

    it("does not throw when categories is a number", () => {
      const bad = tk({ categories: 42 as unknown as string[] })
      expect(() => inferCategoryMatch(bad, "communication")).not.toThrow()
    })

    it("does not throw when categories is an object (not iterable)", () => {
      const bad = tk({
        categories: { email: true } as unknown as string[],
      })
      expect(() => inferCategoryMatch(bad, "communication")).not.toThrow()
    })

    it("does not throw when categories contains non-string entries", () => {
      const bad = tk({
        slug: "ably",
        categories: [
          null,
          undefined,
          42,
          {},
          { id: "email" },
          "mail",
        ] as unknown as string[],
      })
      // Non-strings are silently skipped; the string "mail" survives and
      // matches the 'communication' rule.
      expect(() => inferCategoryMatch(bad, "communication")).not.toThrow()
      expect(inferCategoryMatch(bad, "communication")).toBe(true)
    })

    it("matches when categories contains an exact rule keyword", () => {
      const subject = tk({
        slug: "ably",
        categories: ["email", "productivity"],
      })
      expect(inferCategoryMatch(subject, "communication")).toBe(true)
    })

    it("returns false when neither slug nor categories match", () => {
      const subject = tk({
        slug: "ably",
        categories: ["realtime", "infrastructure"],
      })
      expect(inferCategoryMatch(subject, "communication")).toBe(false)
    })

    it("does not throw when an array entry is a Symbol", () => {
      const bad = tk({
        categories: [Symbol("foo") as unknown as string],
      })
      expect(() => inferCategoryMatch(bad, "communication")).not.toThrow()
    })

    it("handles a deeply malformed toolkit (empty everywhere)", () => {
      const bad = {
        slug: "",
        name: "",
      } as unknown as ComposioToolkit
      expect(() => inferCategoryMatch(bad, "communication")).not.toThrow()
      expect(() => inferCategoryMatch(bad, "popular")).not.toThrow()
      expect(() => inferCategoryMatch(bad, "all")).not.toThrow()
    })
  })

  describe("multi-source matching priority", () => {
    it("returns true on slug match even when categories array is empty", () => {
      expect(
        inferCategoryMatch(tk({ slug: "github", categories: [] }), "dev"),
      ).toBe(true)
    })

    it("returns true on category match even when slug doesn't match", () => {
      // The 'productivity' rule's regex matches specific app slugs (notion,
      // linear, asana…); test with a category that the regex DOES include.
      expect(
        inferCategoryMatch(
          tk({ slug: "ably", categories: ["notion"] }),
          "productivity",
        ),
      ).toBe(true)
    })

    it("returns true on category match when slug is empty", () => {
      expect(
        inferCategoryMatch(
          tk({ slug: "", categories: ["linear"] }),
          "productivity",
        ),
      ).toBe(true)
    })
  })

  describe("regression: original crash payload", () => {
    it("matches the exact stack-trace toolkit shape without throwing", () => {
      // The original error: a toolkit object with no `categories` key at
      // all (Pydantic omitted the field because the schema didn't declare
      // it). Reproduce that shape verbatim.
      const stackTraceShape = {
        slug: "ably",
        name: "Ably",
        description: "Realtime messaging",
        logo_url: null,
        // categories deliberately absent
        // auth_type deliberately absent
      } as unknown as ComposioToolkit

      expect(() => inferCategoryMatch(stackTraceShape, "all")).not.toThrow()
      expect(() => inferCategoryMatch(stackTraceShape, "popular")).not.toThrow()
      expect(() =>
        inferCategoryMatch(stackTraceShape, "communication"),
      ).not.toThrow()
      expect(() => inferCategoryMatch(stackTraceShape, "dev")).not.toThrow()
    })
  })
})
