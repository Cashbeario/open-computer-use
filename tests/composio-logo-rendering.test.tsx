// @vitest-environment jsdom
/**
 * composio-logo-rendering.test.tsx — pins the Composio logo render contract.
 *
 * Background — this suite is the regression net for the multi-surface logo
 * regression captured in the FX1-FX3 fix reports (May 2026). Three surfaces
 * derive logos from independent code paths:
 *
 *   1. ToolkitLogo (`app/connections/toolkit-logo.tsx`) — shared primitive
 *      consumed by both the connect dialog FeaturedTile and the empty-state
 *      ShowcaseTile. The previous `document.createElement + img.replaceWith`
 *      onError handler used to clash with React's reconciler.
 *   2. FeaturedTile (inside connect-app-dialog `FeaturedStrip`) — reads
 *      `tk.logo_url ?? tk.logo ?? null` so either alias lights up a tile.
 *   3. ConnectionThumbnail (inside `connection-card.tsx`) — derives logos
 *      via a multi-step fallback chain: `connection.logo_url ?? logo ??
 *      toolkit?.logo_url ?? https://logos.composio.dev/api/{slug}` and
 *      finally a letter tile on <img> load error.
 *   4. ShowcaseTile (inside `empty-state.tsx`) — reads `tile.logo_url ??
 *      null` after the empty-state's backfill loop, which itself accepts
 *      either `logo_url` or `logo`.
 *
 * Each surface is asserted independently so that a future regression in
 * any single one fails loudly here instead of silently shipping a tile of
 * empty squares.
 *
 * Conventions mirror tests/composio-featured-carousel.test.tsx:
 *   - jsdom env + @testing-library/react
 *   - global next-intl passthrough mock in tests/setup.ts
 *   - framer-motion `useReducedMotion` flag is mockable per-test
 *   - QueryClient + ComposioProvider wrapper for hooks-backed components
 */
import React from "react"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, fireEvent } from "@testing-library/react"
import {
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query"

// FeaturedTile + ToolkitLogo call useTranslations for aria labels and the
// letter-fallback alt text. We mock with a passthrough so tests don't
// require a NextIntlClientProvider wrapper.
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "en",
}))

// framer-motion's `useReducedMotion` decides whether FeaturedStrip renders
// the marquee or a static grid. Pin reduced motion ON for these tests so we
// can deterministically locate FeaturedTile buttons without the cloned half
// of the marquee track polluting the result set.
let mockedReducedMotion = true
vi.mock("framer-motion", async () => {
  const actual = await vi.importActual<typeof import("framer-motion")>(
    "framer-motion",
  )
  return {
    ...actual,
    useReducedMotion: () => mockedReducedMotion,
  }
})

import {
  FeaturedStrip,
} from "@/app/connections/connect-app-dialog"
import { ToolkitLogo } from "@/app/connections/toolkit-logo"
import { ConnectionCard } from "@/app/connections/connection-card"
import { EmptyState } from "@/app/connections/empty-state"
import { ComposioProvider } from "@/lib/composio-store/provider"
import type {
  ComposioToolkit,
  ComposioConnection,
} from "@/lib/composio-store/types"

// ── Helpers ────────────────────────────────────────────────────────────────

function tk(overrides: Partial<ComposioToolkit> = {}): ComposioToolkit {
  return {
    slug: "gmail",
    name: "Gmail",
    description: "Email",
    logo_url: "https://logos.composio.dev/api/gmail",
    categories: [],
    auth_type: "OAUTH2",
    ...overrides,
  } as ComposioToolkit
}

function conn(overrides: Partial<ComposioConnection> = {}): ComposioConnection {
  return {
    id: "ca_1",
    app_slug: "gmail",
    app_name: "Gmail",
    account_label: "alice@example.com",
    status: "ACTIVE",
    created_at: "2026-05-01T00:00:00Z",
    last_used_at: null,
    scopes: [],
    logo_url: null,
    ...overrides,
  } as ComposioConnection
}

/**
 * Wrapper for hooks-backed components. ConnectionCard reads
 * useComposioToolkits + useConnectApp, both of which require both a
 * QueryClient and the ComposioProvider context.
 */
function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: {
      // staleTime: Infinity so the pre-seeded `composio/toolkits` cache
      // isn't immediately marked stale (which would trigger an
      // unmocked fetch on mount and pollute the assertion).
      queries: { retry: false, gcTime: Infinity, staleTime: Infinity },
      mutations: { retry: false },
    },
  })
  // Pre-seed the toolkits cache to a stable empty list so the card's
  // catalog-join fallback is exercised (the deterministic URL fallback
  // path is what makes the card show a logo even with an empty catalog).
  client.setQueryData(["composio", "toolkits"], [])
  function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(
      QueryClientProvider,
      { client },
      React.createElement(ComposioProvider, null, children),
    )
  }
  return { client, Wrapper }
}

beforeEach(() => {
  // Default to reduced-motion ON so FeaturedStrip renders a static grid.
  mockedReducedMotion = true
})

// ═══════════════════════════════════════════════════════════════════════════
// ToolkitLogo — shared primitive, two visual variants, one fallback contract
// ═══════════════════════════════════════════════════════════════════════════

describe("ToolkitLogo (shared primitive)", () => {
  it("renders an <img> with the given src when the URL is non-empty", () => {
    const { container } = render(
      <ToolkitLogo
        src="https://logos.composio.dev/api/gmail"
        name="Gmail"
        alt="Gmail logo"
      />,
    )
    const img = container.querySelector("img")
    expect(img).not.toBeNull()
    expect(img!.getAttribute("src")).toBe(
      "https://logos.composio.dev/api/gmail",
    )
    expect(img!.getAttribute("alt")).toBe("Gmail logo")
  })

  it("renders the letter-tile fallback when src is null", () => {
    const { container } = render(
      <ToolkitLogo src={null} name="Gmail" alt="Gmail logo" />,
    )
    expect(container.querySelector("img")).toBeNull()
    // First letter, uppercased, lives in an aria-hidden span.
    const span = container.querySelector("span[aria-hidden]")
    expect(span).not.toBeNull()
    expect(span!.textContent).toBe("G")
  })

  it("renders the letter-tile fallback when src is undefined", () => {
    const { container } = render(
      <ToolkitLogo src={undefined} name="Slack" alt="Slack logo" />,
    )
    expect(container.querySelector("img")).toBeNull()
    expect(container.querySelector("span[aria-hidden]")!.textContent).toBe("S")
  })

  it("treats whitespace-only / empty-string src as missing", () => {
    // Empty string would resolve to the document URL if we ever rendered
    // <img src="">, which is the exact bug the React-state fallback fixes.
    const { container: c1 } = render(
      <ToolkitLogo src="" name="GitHub" alt="GitHub logo" />,
    )
    expect(c1.querySelector("img")).toBeNull()

    const { container: c2 } = render(
      <ToolkitLogo src="   " name="GitHub" alt="GitHub logo" />,
    )
    expect(c2.querySelector("img")).toBeNull()
  })

  it("swaps to the letter fallback when the image fails to load (no DOM mutation)", () => {
    const { container } = render(
      <ToolkitLogo
        src="https://broken.example.com/missing.png"
        name="Notion"
        alt="Notion logo"
      />,
    )
    const img = container.querySelector("img")
    expect(img).not.toBeNull()
    // Fire the onError handler — React state flips, letter is rendered.
    fireEvent.error(img!)
    expect(container.querySelector("img")).toBeNull()
    expect(container.querySelector("span[aria-hidden]")!.textContent).toBe("N")
  })

  it("supports both 'dialog' and 'showcase' visual variants without breaking the fallback", () => {
    const { container: cDialog } = render(
      <ToolkitLogo
        src={null}
        name="Linear"
        alt="Linear logo"
        variant="dialog"
      />,
    )
    expect(cDialog.querySelector("span[aria-hidden]")!.textContent).toBe("L")

    const { container: cShowcase } = render(
      <ToolkitLogo
        src={null}
        name="Linear"
        alt="Linear logo"
        variant="showcase"
      />,
    )
    expect(cShowcase.querySelector("span[aria-hidden]")!.textContent).toBe("L")
  })

  it("renders a fresh <img> when src changes after a previous failure", () => {
    // Regression for the React state flag: useEffect on [src] must reset
    // imgFailed so a new URL gets a fresh attempt instead of being
    // permanently locked to the letter tile.
    const { container, rerender } = render(
      <ToolkitLogo
        src="https://broken.example.com/missing.png"
        name="GitHub"
        alt="GitHub logo"
      />,
    )
    fireEvent.error(container.querySelector("img")!)
    expect(container.querySelector("img")).toBeNull()
    rerender(
      <ToolkitLogo
        src="https://logos.composio.dev/api/github"
        name="GitHub"
        alt="GitHub logo"
      />,
    )
    const img = container.querySelector("img")
    expect(img).not.toBeNull()
    expect(img!.getAttribute("src")).toBe(
      "https://logos.composio.dev/api/github",
    )
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// FeaturedTile (via FeaturedStrip) — reads tk.logo_url ?? tk.logo
// ═══════════════════════════════════════════════════════════════════════════

describe("FeaturedStrip FeaturedTile — logo rendering", () => {
  function renderStrip(toolkits: ComposioToolkit[]) {
    return render(
      <FeaturedStrip
        toolkits={toolkits}
        connectedSet={new Set()}
        onPick={vi.fn()}
        connecting={false}
        selectedSlug={null}
      />,
    )
  }

  it("renders an <img> with the expected src when toolkit.logo_url is set", () => {
    const { container } = renderStrip([
      tk({ slug: "gmail", name: "Gmail", logo_url: "https://logos/gmail" }),
    ])
    const img = container.querySelector("img")
    expect(img).not.toBeNull()
    expect(img!.getAttribute("src")).toBe("https://logos/gmail")
  })

  it("falls back to the letter tile when logo_url is null", () => {
    const { container } = renderStrip([
      tk({ slug: "slack", name: "Slack", logo_url: null }),
    ])
    expect(container.querySelector("img")).toBeNull()
    // First letter of the toolkit name lives in the fallback span.
    const span = container.querySelector("span[aria-hidden]")
    expect(span).not.toBeNull()
    expect(span!.textContent).toBe("S")
  })

  it("uses the camelCase `logo` alias when logo_url is missing", () => {
    // The wire field is `logo` from the backend; the fetcher mirrors it
    // into both aliases but a defensive tile read of `logo_url ?? logo`
    // means either alias must light up the tile.
    const t = tk({
      slug: "github",
      name: "GitHub",
      logo_url: null,
      // exercising the alias path
      logo: "https://logos/github",
    })
    const { container } = renderStrip([t])
    const img = container.querySelector("img")
    expect(img).not.toBeNull()
    expect(img!.getAttribute("src")).toBe("https://logos/github")
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// ConnectionCard — logo derivation + onError state swap
// ═══════════════════════════════════════════════════════════════════════════

describe("ConnectionCard — logo rendering", () => {
  it("renders an <img> using connection.logo_url when set", () => {
    const { Wrapper } = makeWrapper()
    const { container } = render(
      <ConnectionCard
        connection={conn({
          id: "ca_logo",
          app_slug: "gmail",
          app_name: "Gmail",
          logo_url: "https://logos/gmail-direct",
        })}
        onDisconnect={vi.fn()}
      />,
      { wrapper: Wrapper },
    )
    const img = container.querySelector("img")
    expect(img).not.toBeNull()
    expect(img!.getAttribute("src")).toBe("https://logos/gmail-direct")
  })

  it("falls back to the deterministic logos.composio.dev URL when logo_url is null", () => {
    // Even with an empty toolkits catalog (Wrapper pre-seeds it to []), the
    // card MUST render an <img> using the per-slug deterministic fallback —
    // never silently degrade to the letter tile during catalog warm-up.
    const { Wrapper } = makeWrapper()
    const { container } = render(
      <ConnectionCard
        connection={conn({
          id: "ca_fallback",
          app_slug: "slack",
          app_name: "Slack",
          logo_url: null,
        })}
        onDisconnect={vi.fn()}
      />,
      { wrapper: Wrapper },
    )
    const img = container.querySelector("img")
    expect(img).not.toBeNull()
    expect(img!.getAttribute("src")).toBe(
      "https://logos.composio.dev/api/slack",
    )
  })

  it("falls back to the letter tile when the <img> fails to load (React state, NOT display:none)", () => {
    // The previous regression was `e.currentTarget.style.display = "none"`
    // which left an empty square. The fix is a React state flag flipping to
    // render <Plug> / letter fallback.
    const { Wrapper } = makeWrapper()
    const { container } = render(
      <ConnectionCard
        connection={conn({
          id: "ca_broken",
          app_slug: "weird",
          app_name: "WeirdApp",
          logo_url: "https://logos/weird",
        })}
        onDisconnect={vi.fn()}
      />,
      { wrapper: Wrapper },
    )
    const img = container.querySelector("img")
    expect(img).not.toBeNull()
    fireEvent.error(img!)
    // After error: no <img>, and the letter span replaces it. Critically,
    // the previously-broken <img style="display:none"> would have kept the
    // <img> in the tree — this assertion guards against that regression.
    expect(container.querySelector("img")).toBeNull()
    const letter = container.querySelector("span[aria-hidden]")
    expect(letter).not.toBeNull()
    expect(letter!.textContent).toBe("W")
  })

  it("prefers the camelCase `logo` alias when `logo_url` is absent", () => {
    const { Wrapper } = makeWrapper()
    const { container } = render(
      <ConnectionCard
        connection={conn({
          id: "ca_alias",
          app_slug: "notion",
          app_name: "Notion",
          logo_url: null,
          logo: "https://logos/notion-via-alias",
        })}
        onDisconnect={vi.fn()}
      />,
      { wrapper: Wrapper },
    )
    const img = container.querySelector("img")
    expect(img).not.toBeNull()
    expect(img!.getAttribute("src")).toBe(
      "https://logos/notion-via-alias",
    )
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// EmptyState ShowcaseTile — backfill loop + logo derivation
// ═══════════════════════════════════════════════════════════════════════════

describe("EmptyState ShowcaseTile — logo rendering", () => {
  it("renders an <img> for every popularToolkit that has a logo_url", () => {
    const popular = [
      tk({ slug: "gmail", name: "Gmail", logo_url: "https://logos/gmail" }),
      tk({ slug: "slack", name: "Slack", logo_url: "https://logos/slack" }),
    ]
    const { container } = render(
      <EmptyState onConnect={vi.fn()} popularToolkits={popular} />,
    )
    const imgs = Array.from(container.querySelectorAll("img"))
    // At least one <img> per supplied logo. The EmptyState backfills with
    // FEATURED_SLUGS so the showcase always renders 8 tiles total, but
    // the seeded tiles must contribute their real <img> srcs.
    const srcs = imgs.map((i) => i.getAttribute("src"))
    expect(srcs).toContain("https://logos/gmail")
    expect(srcs).toContain("https://logos/slack")
  })

  it("falls back to letter tiles when no popularToolkits have logos", () => {
    // FALLBACK_TILES all have logo_url: null. With no logo-bearing entries
    // in the catalog, every ShowcaseTile MUST render the letter fallback.
    const { container } = render(
      <EmptyState onConnect={vi.fn()} popularToolkits={[]} />,
    )
    expect(container.querySelectorAll("img").length).toBe(0)
    // ToolkitLogo's fallback renders an aria-hidden span containing the
    // first letter. There must be at least one per FALLBACK_TILES entry.
    const letters = Array.from(
      container.querySelectorAll("span[aria-hidden]"),
    ).map((el) => el.textContent)
    // Cover the eight FALLBACK_TILES first-letters.
    expect(letters).toEqual(
      expect.arrayContaining(["G", "S", "N", "L", "H"]),
    )
  })

  it("accepts the camelCase `logo` alias during the backfill loop", () => {
    // Per the empty-state backfill: `if (!t.logo_url && !t.logo) continue;`
    // — so a toolkit that ONLY has `logo` (no `logo_url`) must still be
    // pushed into the showcase grid AND render its <img>.
    const popular = [
      tk({
        slug: "github",
        name: "GitHub",
        logo_url: null,
        // exercising the alias path on the backfill
        logo: "https://logos/github-via-alias",
      }),
      // Non-FEATURED slug so it must come in via backfill, not the curated set.
      tk({
        slug: "stripe",
        name: "Stripe",
        logo_url: null,
        // exercising the alias path on the backfill
        logo: "https://logos/stripe-via-alias",
      }),
    ]
    const { container } = render(
      <EmptyState onConnect={vi.fn()} popularToolkits={popular} />,
    )
    const srcs = Array.from(container.querySelectorAll("img")).map((i) =>
      i.getAttribute("src"),
    )
    expect(srcs).toContain("https://logos/github-via-alias")
    expect(srcs).toContain("https://logos/stripe-via-alias")
  })
})
