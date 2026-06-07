// @vitest-environment jsdom
/**
 * ConnectConfirm — the in-dialog Composio hand-off panel.
 *
 * Pins the rendering + interaction contract of the confirmation screen shown
 * after a user picks an app (app logo ↔ Composio brand tile), the new-tab
 * "Connect" CTA, the back/cancel affordances, the error surface, and the
 * popup-blocked manual-link fallback.
 */
import React from "react"
import { describe, it, expect, vi } from "vitest"
import { render, fireEvent } from "@testing-library/react"

// Passthrough translator that also interpolates values so we can assert the
// toolkit name lands in the headline.
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key} ${Object.values(values).join(" ")}` : key,
}))

// Strip framer-motion props and render the bare tag so assertions are
// deterministic (no enter/exit animation timing).
vi.mock("framer-motion", () => {
  const R = require("react") as typeof import("react")
  return {
    AnimatePresence: ({ children }: { children: React.ReactNode }) =>
      R.createElement(R.Fragment, null, children),
    motion: new Proxy(
      {},
      {
        get: (_t, tag: string) =>
          R.forwardRef(function MotionMock(props: Record<string, unknown>, ref) {
            const {
              initial,
              animate,
              exit,
              transition,
              whileHover,
              whileTap,
              layout,
              layoutId,
              ...rest
            } = props
            return R.createElement(tag, { ...rest, ref })
          }),
      },
    ),
  }
})

import { ConnectConfirm } from "@/app/connections/connect-app-dialog"
import type { ComposioToolkit } from "@/lib/composio-store/types"

function tk(over: Partial<ComposioToolkit> = {}): ComposioToolkit {
  return {
    slug: "gmail",
    name: "Gmail",
    description: "Email",
    logo_url: "https://logos/gmail",
    categories: [],
    auth_type: "OAUTH2",
    ...over,
  } as ComposioToolkit
}

type Props = React.ComponentProps<typeof ConnectConfirm>

function setup(over: Partial<Props> = {}) {
  const props: Props = {
    toolkit: tk(),
    connecting: false,
    error: null,
    blockedUrl: null,
    onConnect: vi.fn(),
    onBack: vi.fn(),
    onCancel: vi.fn(),
    onDismissError: vi.fn(),
    ...over,
  }
  return { props, ...render(<ConnectConfirm {...props} />) }
}

describe("ConnectConfirm", () => {
  it("shows the app logo and the Composio brand tile side by side", () => {
    const { container, getByTestId } = setup()
    const img = container.querySelector("img")
    expect(img).not.toBeNull()
    expect(img!.getAttribute("src")).toBe("https://logos/gmail")
    // Composio is represented explicitly.
    expect(getByTestId("composio-wordmark")).toBeTruthy()
  })

  it("puts the toolkit name in the headline", () => {
    const { getByTestId } = setup({ toolkit: tk({ name: "Gmail" }) })
    expect(getByTestId("connect-confirm-title").textContent).toContain("Gmail")
  })

  it("falls back to a letter tile (no <img>) when the app has no logo", () => {
    const { container } = setup({ toolkit: tk({ logo_url: null, logo: null }) })
    // App tile renders the letter fallback; the Composio mark is an inline SVG.
    expect(container.querySelector("img")).toBeNull()
  })

  it("invokes onConnect when the Connect button is clicked", () => {
    const { getByTestId, props } = setup()
    fireEvent.click(getByTestId("connect-confirm-cta"))
    expect(props.onConnect).toHaveBeenCalledTimes(1)
  })

  it("invokes onBack when the Back button is clicked", () => {
    const { getByTestId, props } = setup()
    fireEvent.click(getByTestId("connect-confirm-back"))
    expect(props.onBack).toHaveBeenCalledTimes(1)
  })

  it("disables Connect and Back while connecting", () => {
    const { getByTestId } = setup({ connecting: true })
    expect((getByTestId("connect-confirm-cta") as HTMLButtonElement).disabled).toBe(true)
    expect((getByTestId("connect-confirm-back") as HTMLButtonElement).disabled).toBe(true)
  })

  it("renders an error and lets it be dismissed", () => {
    const { getByTestId, props } = setup({ error: "Backend exploded" })
    const errEl = getByTestId("connect-confirm-error")
    expect(errEl.textContent).toContain("Backend exploded")
    const dismissBtn = errEl.parentElement!.querySelector("button")!
    fireEvent.click(dismissBtn)
    expect(props.onDismissError).toHaveBeenCalledTimes(1)
  })

  it("surfaces a manual new-tab link (target=_blank, rel=noopener) when the popup was blocked", () => {
    const url = "https://oauth.composio.dev/redirect?state=abc"
    const { getByTestId } = setup({ blockedUrl: url })
    const link = getByTestId("connect-confirm-manual-link") as HTMLAnchorElement
    expect(link.getAttribute("href")).toBe(url)
    expect(link.getAttribute("target")).toBe("_blank")
    expect(link.getAttribute("rel")).toContain("noopener")
  })

  it("does NOT show the manual link in the normal (non-blocked) case", () => {
    const { queryByTestId } = setup({ blockedUrl: null })
    expect(queryByTestId("connect-confirm-manual-link")).toBeNull()
  })
})
