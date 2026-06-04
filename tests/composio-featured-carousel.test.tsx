// @vitest-environment jsdom
/**
 * composio-featured-carousel.test.tsx — guards for the marquee carousel.
 *
 * Coverage:
 *   1. _computeMarqueeDuration — clamps to [14s, 90s], scales linearly
 *      in the comfortable middle, never returns 0.
 *   2. FeaturedStrip duplicates the toolkit list so the loop is seamless.
 *   3. Cloned half is aria-hidden so screen readers see one copy.
 *   4. data-paused flips on mouseenter/mouseleave + touchstart/touchend.
 *   5. CSS animation-play-state reflects the paused state.
 *   6. CSS animation name + duration are set on the track element.
 *   7. Reduced-motion replaces marquee with a static grid (no testid).
 *   8. Connect button is wired — clicking a tile calls onPick(slug) once.
 *   9. Already-connected tiles do NOT call onPick on click.
 *  10. inferCategoryMatch smoke (full coverage lives in
 *      composio-category-match.test.ts).
 *
 * We render the FeaturedStrip directly (exported for tests) so we don't
 * need a full NextIntl provider tree.
 */
import React from "react"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent, within } from "@testing-library/react"

// FeaturedTile + ToolkitLogo call useTranslations for aria labels and the
// letter-fallback alt text. We mock with a passthrough so tests don't
// require a NextIntlClientProvider wrapper.
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))

import {
  _computeMarqueeDuration,
  inferCategoryMatch,
  FeaturedStrip,
} from "@/app/connections/connect-app-dialog"
import type { ComposioToolkit } from "@/lib/composio-store/types"

// Mock framer-motion's useReducedMotion via a settable module-level flag.
let mockedReducedMotion = false
vi.mock("framer-motion", async () => {
  const actual = await vi.importActual<typeof import("framer-motion")>(
    "framer-motion",
  )
  return {
    ...actual,
    useReducedMotion: () => mockedReducedMotion,
  }
})

// ── Helpers ────────────────────────────────────────────────────────────────

function tk(overrides: Partial<ComposioToolkit> = {}): ComposioToolkit {
  return {
    slug: "gmail",
    name: "Gmail",
    description: "Email",
    logo_url: "https://logos/gmail",
    categories: [],
    auth_type: "OAUTH2",
    ...overrides,
  } as ComposioToolkit
}

const TOOLKITS: ComposioToolkit[] = [
  tk({ slug: "gmail", name: "Gmail" }),
  tk({ slug: "slack", name: "Slack" }),
  tk({ slug: "github", name: "GitHub" }),
  tk({ slug: "notion", name: "Notion" }),
  tk({ slug: "linear", name: "Linear" }),
  tk({ slug: "googlecalendar", name: "Google Calendar" }),
  tk({ slug: "googledrive", name: "Google Drive" }),
  tk({ slug: "hubspot", name: "HubSpot" }),
]

function renderStrip(
  overrides: Partial<React.ComponentProps<typeof FeaturedStrip>> = {},
) {
  const onPick = vi.fn()
  const utils = render(
    <FeaturedStrip
      toolkits={TOOLKITS}
      connectedSet={new Set()}
      onPick={onPick}
      connecting={false}
      selectedSlug={null}
      {...overrides}
    />,
  )
  return { onPick, ...utils }
}

beforeEach(() => {
  mockedReducedMotion = false
})

// ═══════════════════════════════════════════════════════════════════════════
// _computeMarqueeDuration — pace stays elegant across catalog sizes
// ═══════════════════════════════════════════════════════════════════════════

describe("_computeMarqueeDuration", () => {
  it("returns the minimum floor for very small catalogs", () => {
    expect(_computeMarqueeDuration(1)).toBe(14)
    expect(_computeMarqueeDuration(2)).toBe(14)
    expect(_computeMarqueeDuration(4)).toBe(14)
  })

  it("never returns 0 for an empty array (defensive)", () => {
    expect(_computeMarqueeDuration(0)).toBeGreaterThanOrEqual(14)
  })

  it("scales linearly in the comfortable middle range", () => {
    const eight = _computeMarqueeDuration(8)
    const sixteen = _computeMarqueeDuration(16)
    expect(eight).toBeCloseTo(22, 0)
    expect(sixteen).toBeCloseTo(44, 0)
    expect(sixteen / eight).toBeCloseTo(2, 1)
  })

  it("clamps to the upper ceiling for huge catalogs", () => {
    expect(_computeMarqueeDuration(50)).toBe(90)
    expect(_computeMarqueeDuration(500)).toBe(90)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// FeaturedStrip — seamless loop, pause behaviour, animation wiring
// ═══════════════════════════════════════════════════════════════════════════

describe("FeaturedStrip — marquee behavior", () => {
  it("duplicates the toolkit list so the loop is seamless", () => {
    renderStrip()
    const carousel = screen.getByTestId("composio-featured-carousel")
    const items = within(carousel).getAllByRole("listitem", { hidden: true })
    // 8 toolkits × 2 (original + clone) = 16 listitems in the track.
    expect(items.length).toBe(TOOLKITS.length * 2)
  })

  it("marks the cloned half as aria-hidden so screen readers see one copy", () => {
    renderStrip()
    const carousel = screen.getByTestId("composio-featured-carousel")
    const allItems = within(carousel).getAllByRole("listitem", { hidden: true })

    const visible = allItems.filter(
      (el) => el.getAttribute("aria-hidden") !== "true",
    )
    const hidden = allItems.filter(
      (el) => el.getAttribute("aria-hidden") === "true",
    )

    expect(visible.length).toBe(TOOLKITS.length)
    expect(hidden.length).toBe(TOOLKITS.length)
  })

  it("data-paused starts at false", () => {
    renderStrip()
    const carousel = screen.getByTestId("composio-featured-carousel")
    expect(carousel.getAttribute("data-paused")).toBe("false")
  })

  it("pauses on mouseenter and resumes on mouseleave", () => {
    renderStrip()
    const carousel = screen.getByTestId("composio-featured-carousel")

    fireEvent.mouseEnter(carousel)
    expect(carousel.getAttribute("data-paused")).toBe("true")

    fireEvent.mouseLeave(carousel)
    expect(carousel.getAttribute("data-paused")).toBe("false")
  })

  it("pauses on touchstart and resumes on touchend", () => {
    renderStrip()
    const carousel = screen.getByTestId("composio-featured-carousel")

    fireEvent.touchStart(carousel)
    expect(carousel.getAttribute("data-paused")).toBe("true")

    fireEvent.touchEnd(carousel)
    expect(carousel.getAttribute("data-paused")).toBe("false")
  })

  it("pauses on touchstart and resumes on touchcancel", () => {
    renderStrip()
    const carousel = screen.getByTestId("composio-featured-carousel")

    fireEvent.touchStart(carousel)
    expect(carousel.getAttribute("data-paused")).toBe("true")

    fireEvent.touchCancel(carousel)
    expect(carousel.getAttribute("data-paused")).toBe("false")
  })

  it("the CSS animation-play-state reflects paused state", () => {
    renderStrip()
    const carousel = screen.getByTestId("composio-featured-carousel")
    const track = carousel.querySelector('[role="list"]') as HTMLElement

    expect(track).not.toBeNull()
    expect(track.style.animationPlayState).toBe("running")
    expect(track.style.animation).toContain("composio-marquee")

    fireEvent.mouseEnter(carousel)
    expect(track.style.animationPlayState).toBe("paused")

    fireEvent.mouseLeave(carousel)
    expect(track.style.animationPlayState).toBe("running")
  })

  it("sets a duration on the track matching the duration helper", () => {
    renderStrip()
    const carousel = screen.getByTestId("composio-featured-carousel")
    const track = carousel.querySelector('[role="list"]') as HTMLElement
    const expectedDuration = _computeMarqueeDuration(TOOLKITS.length)
    // The animation shorthand starts with "<name> <duration>s ..."
    expect(track.style.animation).toMatch(
      new RegExp(`composio-marquee ${expectedDuration}s linear infinite`),
    )
  })

  it("injects the @keyframes via a style element", () => {
    const { container } = renderStrip()
    const styleEl = container.querySelector("style")
    expect(styleEl).not.toBeNull()
    expect(styleEl?.textContent).toContain("@keyframes composio-marquee")
  })

  it("fires onPick exactly once when a tile is clicked", () => {
    const { onPick } = renderStrip()
    const carousel = screen.getByTestId("composio-featured-carousel")
    const items = within(carousel).getAllByRole("listitem", { hidden: true })
    // First item is the visible Gmail tile.
    fireEvent.click(items[0])
    expect(onPick).toHaveBeenCalledTimes(1)
    expect(onPick).toHaveBeenCalledWith("gmail")
  })

  it("does NOT fire onPick for an already-connected tile", () => {
    const { onPick } = renderStrip({
      connectedSet: new Set(["gmail"]),
    })
    const carousel = screen.getByTestId("composio-featured-carousel")
    const items = within(carousel).getAllByRole("listitem", { hidden: true })
    fireEvent.click(items[0]) // Gmail
    expect(onPick).not.toHaveBeenCalled()
  })

  it("disables every tile when `connecting` is true", () => {
    const { onPick } = renderStrip({ connecting: true })
    const carousel = screen.getByTestId("composio-featured-carousel")
    const items = within(carousel).getAllByRole("listitem", { hidden: true })
    items.forEach((el) => expect((el as HTMLButtonElement).disabled).toBe(true))
    fireEvent.click(items[1]) // Slack
    expect(onPick).not.toHaveBeenCalled()
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Reduced-motion fallback
// ═══════════════════════════════════════════════════════════════════════════

describe("FeaturedStrip — prefers-reduced-motion", () => {
  it("renders a static grid (no marquee testid) when reduced-motion is on", () => {
    mockedReducedMotion = true
    renderStrip()
    expect(screen.queryByTestId("composio-featured-carousel")).toBeNull()
    // Items are still rendered (un-duplicated): exactly the input length.
    // Each tile is a <button> with aria-label "Connect <Name>".
    expect(screen.getAllByLabelText(/^Connect /i).length).toBe(TOOLKITS.length)
  })

  it("does NOT inject the marquee keyframes when reduced-motion is on", () => {
    mockedReducedMotion = true
    const { container } = renderStrip()
    const styleEl = container.querySelector("style")
    // No marquee animation under reduced motion.
    expect(styleEl?.textContent ?? "").not.toContain("@keyframes composio-marquee")
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// inferCategoryMatch smoke
// ═══════════════════════════════════════════════════════════════════════════

describe("inferCategoryMatch (smoke)", () => {
  it("treats undefined categories as empty without throwing", () => {
    const bad = tk({
      slug: "ably",
      categories: undefined as unknown as string[],
    })
    expect(() => inferCategoryMatch(bad, "communication")).not.toThrow()
  })
})
