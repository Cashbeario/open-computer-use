// @vitest-environment jsdom
/**
 * Pins the sign-out kill-switch on Next.js's error boundaries.
 *
 * Why this exists
 * ---------------
 * Sign-out hard-navigates with `window.location.replace("/")`. Between
 * `supabase.auth.signOut()` and the navigation actually landing, anything
 * in the React tree that throws (a descendant assuming `user` is non-null,
 * a query failing on a just-cleared auth cookie, a websocket disconnect
 * handler) gets caught by Next's automatic error boundary and mounts
 * `app/error.tsx` (or `app/global-error.tsx`) as a full-page "Something
 * went wrong" UI for 50–300ms before the navigation completes. The
 * user-visible symptom was: "I click logout, see an error message, then
 * the landing page."
 *
 * Both error pages now read `isSigningOut()` and render nothing during
 * that window. This test pins that invariant — if a refactor drops the
 * guard, the bug comes back invisibly, so we catch it here.
 */
import React from "react"
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { render, cleanup } from "@testing-library/react"

// next-intl is used by app/error.tsx — stub it so we don't have to mount
// a real i18n provider in a unit test.
vi.mock("next-intl", () => ({
  useTranslations:
    () =>
      (key: string) => key,
}))

// next/font is used by app/global-error.tsx — stub.
vi.mock("@/lib/fonts", () => ({
  SVG_SYSTEM_STACK: "system-ui",
}))

import ErrorPage from "@/app/error"
import GlobalErrorPage from "@/app/global-error"
import { markSigningOut, clearSigningOut } from "@/lib/user-store/sign-out-state"

const noop = () => {}
const fakeError = Object.assign(new Error("boom"), { digest: "abc123" })

beforeEach(() => {
  clearSigningOut()
})

afterEach(() => {
  cleanup()
  clearSigningOut()
})

describe("app/error.tsx — sign-out kill switch", () => {
  it("renders the error UI when NOT signing out", () => {
    const { container } = render(<ErrorPage error={fakeError} reset={noop} />)
    // We don't assert exact copy (i18n stub returns the key) — just that
    // the page has some rendered content with the try-again button.
    expect(container.querySelector("button")).not.toBeNull()
    expect(container.textContent ?? "").toMatch(/error/i)
  })

  it("renders nothing when sign-out is in flight", () => {
    markSigningOut()
    const { container } = render(<ErrorPage error={fakeError} reset={noop} />)
    // The component returns null during sign-out — the test renderer
    // wraps that in an empty div, so we assert there is no content.
    expect(container.textContent ?? "").toBe("")
    expect(container.querySelector("button")).toBeNull()
  })

  it("stops suppressing after clearSigningOut() (failed sign-out path)", () => {
    markSigningOut()
    clearSigningOut()
    const { container } = render(<ErrorPage error={fakeError} reset={noop} />)
    expect(container.querySelector("button")).not.toBeNull()
  })
})

describe("app/global-error.tsx — sign-out kill switch", () => {
  // global-error renders <html>/<body>, which can't legally nest inside the
  // jsdom document body. We mount it inside a detached container instead —
  // the kill-switch behaviour we're testing fires BEFORE the nested
  // <html>/<body> would be created anyway, so the markup difference is
  // irrelevant for this assertion.
  it("renders nothing user-visible while signing out", () => {
    markSigningOut()
    const detached = document.createElement("div")
    render(<GlobalErrorPage error={fakeError} reset={noop} />, {
      container: detached,
    })
    // While suppressed, the body content is empty (no heading, no button).
    expect(detached.querySelector("h1")).toBeNull()
    expect(detached.querySelector("button")).toBeNull()
  })

  it("renders the global error UI when NOT signing out", () => {
    const detached = document.createElement("div")
    render(<GlobalErrorPage error={fakeError} reset={noop} />, {
      container: detached,
    })
    expect(detached.querySelector("h1")?.textContent).toMatch(
      /something went wrong/i,
    )
    expect(detached.querySelector("button")?.textContent).toMatch(/try again/i)
  })
})
