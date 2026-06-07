// @vitest-environment jsdom
/**
 * ConnectAppDialog — end-to-end two-step flow.
 *
 * Pins the behaviour the feature request asked for:
 *   1. Picking an app in the catalogue does NOT immediately start OAuth — it
 *      surfaces the in-dialog Composio confirmation panel.
 *   2. The panel's "Connect" opens the authorization in a NEW TAB (the current
 *      tab / dialog is never navigated away), and the dialog closes once the
 *      tab is launched.
 *   3. A backend failure keeps the dialog on the confirm panel and surfaces
 *      the error (no false navigation).
 */
import React from "react"
import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key} ${Object.values(values).join(" ")}` : key,
}))

// Real framer-motion (it renders fine in jsdom) with reduced-motion forced ON
// so FeaturedStrip is a static grid — same approach as the logo-render suite.
vi.mock("framer-motion", async () => {
  const actual = await vi.importActual<typeof import("framer-motion")>("framer-motion")
  return { ...actual, useReducedMotion: () => true }
})

import { ConnectAppDialog } from "@/app/connections/connect-app-dialog"
import { ComposioProvider } from "@/lib/composio-store/provider"
import type { ComposioToolkit } from "@/lib/composio-store/types"

// A NON-featured toolkit so it appears exactly once (in the grid, not also in
// the featured strip), keeping the click target unambiguous.
const ASANA: ComposioToolkit = {
  slug: "asana",
  name: "Asana",
  description: "Work management",
  logo_url: "https://logos/asana",
  categories: ["productivity"],
  auth_type: "OAUTH2",
}

// `connectFetch` is the channel under test — every `mockResolvedValueOnce` /
// `toHaveBeenCalledWith` assertion in this suite is about the connect POST
// (`/api/composio/connect/<slug>`). It is fed by the URL-aware router below.
let connectFetch: Mock
// `fetchMock` is the umbrella spy installed on `globalThis.fetch`. It routes
// known auxiliary endpoints (toolkit-info enrichment) to benign success stubs
// and forwards everything else to `connectFetch`. Tests retain it only for
// "was anything fetched at all" debugging — the real assertions go through
// `connectFetch`.
let fetchMock: Mock
const originalFetch = globalThis.fetch

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity, staleTime: Infinity },
      mutations: { retry: false },
    },
  })
  // Pre-seed both caches so useComposio's queries never fire an (unmocked)
  // fetch on mount — the only fetch we want to observe is the connect POST.
  client.setQueryData(["composio", "toolkits"], [ASANA])
  client.setQueryData(["composio", "connections"], [])
  function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(
      QueryClientProvider,
      { client },
      React.createElement(ComposioProvider, null, children),
    )
  }
  return Wrapper
}

function fakeTab() {
  return { location: { href: "" }, opener: {} as unknown, close: vi.fn() }
}

// Benign success stub for `GET /api/composio/toolkit-info/<slug>`. The dialog
// fires this lazy auth-scheme enrichment request the moment the user lands on
// the confirm view (see `useToolkitInfo` in lib/composio-store/use-composio.ts).
// These tests pin OAuth-only behaviour via Asana's `auth_type: "OAUTH2"`, so
// the enrichment payload only needs to be well-formed — the dialog also
// gracefully falls back to catalog data if the fetch fails.
function toolkitInfoOk(slug: string): Response {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      enabled: true,
      slug,
      rawSlug: slug,
      name: slug,
      authScheme: "OAUTH2",
      authSchemes: [
        { mode: "OAUTH2", fields: [], composioManaged: true },
      ],
    }),
  } as unknown as Response
}

beforeEach(() => {
  connectFetch = vi.fn()
  fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString()
    // Route the lazy auth-scheme enrichment to a benign stub — every test
    // here lives on OAuth toolkits and doesn't care about the payload.
    if (url.includes("/api/composio/toolkit-info/")) {
      const slug = url.split("/api/composio/toolkit-info/")[1] ?? ""
      return Promise.resolve(toolkitInfoOk(decodeURIComponent(slug)))
    }
    // Everything else (the connect POST) is the channel under test.
    return connectFetch(input, init) as Promise<Response>
  })
  globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch
})

afterEach(() => {
  vi.restoreAllMocks()
  globalThis.fetch = originalFetch
})

function renderDialog(onOpenChange = vi.fn()) {
  render(
    <ConnectAppDialog
      open
      onOpenChange={onOpenChange}
      toolkits={[ASANA]}
      connections={[]}
    />,
    { wrapper: makeWrapper() },
  )
  return { onOpenChange }
}

describe("ConnectAppDialog — pick → confirm → new tab", () => {
  it("picking an app shows the Composio confirm panel instead of navigating", async () => {
    renderDialog()

    // The catalogue grid card (aria-label is hardcoded English in the card).
    fireEvent.click(screen.getByRole("button", { name: "Connect Asana" }))

    // We land on the confirm panel, with the app name in the headline and the
    // Composio brand tile present — and NO connect POST has fired yet. (A
    // benign GET to /api/composio/toolkit-info/<slug> fires on confirm-view
    // mount as best-effort auth-scheme enrichment; it is *not* an OAuth
    // hand-off and is intentionally excluded from this assertion.)
    const panel = await screen.findByTestId("connect-confirm")
    expect(panel).toBeTruthy()
    expect(screen.getByTestId("connect-confirm-title").textContent).toContain("Asana")
    expect(screen.getByTestId("composio-wordmark")).toBeTruthy()
    expect(connectFetch).not.toHaveBeenCalled()
  })

  it("Connect opens the authorization in a NEW TAB and closes the dialog", async () => {
    const tab = fakeTab()
    const openSpy = vi
      .spyOn(window, "open")
      .mockReturnValue(tab as unknown as Window)
    connectFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        redirect_url: "https://oauth.composio.dev/redirect?state=abc",
        connected_account_id: "ca_new",
      }),
    } as unknown as Response)

    const { onOpenChange } = renderDialog()
    fireEvent.click(screen.getByRole("button", { name: "Connect Asana" }))
    await screen.findByTestId("connect-confirm")

    fireEvent.click(screen.getByTestId("connect-confirm-cta"))

    // Tab opened synchronously, before the POST resolved.
    expect(openSpy).toHaveBeenCalledWith("about:blank", "_blank")

    await waitFor(() => {
      // The POST went to the canonical connect route…
      expect(connectFetch).toHaveBeenCalledWith(
        "/api/composio/connect/asana",
        expect.objectContaining({ method: "POST" }),
      )
      // …the pre-opened tab was pointed at the Composio URL…
      expect(tab.location.href).toBe(
        "https://oauth.composio.dev/redirect?state=abc",
      )
      // …and the dialog closed itself after launching.
      expect(onOpenChange).toHaveBeenCalledWith(false)
    })

    // The current tab was never navigated.
    expect(window.location.href).not.toContain("oauth.composio.dev")
  })

  it("a 5xx backend failure shows the localized upstream-unavailable message (NOT raw upstream text), offers a Retry button, and keeps the dialog open", async () => {
    // The mock returns a 500 with an upstream-flavored error string. The
    // dialog used to render this raw — leaking Cloudflare 520 HTML body
    // text into the red error pill when Composio's edge fell over for
    // toolkits like X/Twitter. The fix:
    //   1. parseConnectErrorBody synthesizes code='upstream_unavailable'
    //      for any 5xx without a structured code.
    //   2. localizeConnectError ALWAYS uses the localized friendly copy
    //      for upstream_unavailable, never backendMessage.
    //   3. ComposioConnectError.retryable=true triggers the Retry button.
    const tab = fakeTab()
    vi.spyOn(window, "open").mockReturnValue(tab as unknown as Window)
    connectFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      clone() {
        return this
      },
      json: async () => ({ error: "Composio is down" }),
      text: async () => "Composio is down",
    } as unknown as Response)

    const { onOpenChange } = renderDialog()
    fireEvent.click(screen.getByRole("button", { name: "Connect Asana" }))
    await screen.findByTestId("connect-confirm")
    fireEvent.click(screen.getByTestId("connect-confirm-cta"))

    await waitFor(() => {
      const errEl = screen.getByTestId("connect-confirm-error")
      // The localized key (next-intl test mock returns the key verbatim)
      // is shown — NOT the raw upstream message.
      expect(errEl.textContent).toContain("composioUnavailable")
      expect(errEl.textContent).not.toContain("Composio is down")
    })

    // Retryable: a "Try again" button is rendered next to the dismiss X.
    expect(screen.getByTestId("connect-confirm-retry")).toBeTruthy()

    // The dangling blank tab was closed, and the dialog stayed open.
    expect(tab.close).toHaveBeenCalled()
    expect(onOpenChange).not.toHaveBeenCalledWith(false)
  })

  it("Back returns from the confirm panel to the catalogue", async () => {
    renderDialog()
    fireEvent.click(screen.getByRole("button", { name: "Connect Asana" }))
    await screen.findByTestId("connect-confirm")

    fireEvent.click(screen.getByTestId("connect-confirm-back"))

    await waitFor(() => {
      expect(screen.queryByTestId("connect-confirm")).toBeNull()
    })
    // Back in the catalogue: the search box is visible again.
    expect(screen.getByTestId("connect-dialog-search")).toBeTruthy()
  })
})
