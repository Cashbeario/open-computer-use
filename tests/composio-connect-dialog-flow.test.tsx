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

beforeEach(() => {
  fetchMock = vi.fn()
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
    // Composio brand tile present — and NO fetch has fired yet.
    const panel = await screen.findByTestId("connect-confirm")
    expect(panel).toBeTruthy()
    expect(screen.getByTestId("connect-confirm-title").textContent).toContain("Asana")
    expect(screen.getByTestId("composio-wordmark")).toBeTruthy()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("Connect opens the authorization in a NEW TAB and closes the dialog", async () => {
    const tab = fakeTab()
    const openSpy = vi
      .spyOn(window, "open")
      .mockReturnValue(tab as unknown as Window)
    fetchMock.mockResolvedValueOnce({
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
      expect(fetchMock).toHaveBeenCalledWith(
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

  it("a backend failure keeps the confirm panel open and surfaces the error", async () => {
    const tab = fakeTab()
    vi.spyOn(window, "open").mockReturnValue(tab as unknown as Window)
    fetchMock.mockResolvedValueOnce({
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
      expect(screen.getByTestId("connect-confirm-error").textContent).toContain(
        "Composio is down",
      )
    })
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
