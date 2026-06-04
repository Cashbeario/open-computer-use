// @vitest-environment jsdom
/**
 * openAuthTab — popup-safe "open authorization in a new tab" helper.
 *
 * The OAuth hand-off is two async steps (POST /connect → navigate to the
 * returned URL). Opening the tab AFTER the await would be killed by popup
 * blockers, so the helper opens a blank tab synchronously and navigates it
 * later. These tests pin that contract plus the blocked / error fallbacks.
 */
import { describe, it, expect, vi, afterEach } from "vitest"
import { openAuthTab } from "@/lib/composio-store/open-auth-tab"

afterEach(() => {
  vi.restoreAllMocks()
})

function fakeWindow() {
  return {
    location: { href: "" },
    opener: {} as unknown,
    close: vi.fn(),
  } as unknown as Window
}

describe("openAuthTab", () => {
  it("opens a blank tab synchronously, severs opener, then navigates and closes", () => {
    const win = fakeWindow()
    const openSpy = vi
      .spyOn(window, "open")
      .mockReturnValue(win as unknown as Window)

    const tab = openAuthTab()

    // Opened immediately (within the user gesture), pointed at about:blank.
    expect(openSpy).toHaveBeenCalledWith("about:blank", "_blank")
    expect(tab.blocked).toBe(false)
    // Reverse-tabnabbing guard: opener is severed while still same-origin.
    expect((win as unknown as { opener: unknown }).opener).toBeNull()

    tab.navigate("https://oauth.composio.dev/redirect?state=abc")
    expect((win as unknown as { location: { href: string } }).location.href).toBe(
      "https://oauth.composio.dev/redirect?state=abc",
    )

    tab.close()
    expect((win as unknown as { close: ReturnType<typeof vi.fn> }).close).toHaveBeenCalledTimes(1)
  })

  it("reports blocked when window.open returns null; navigate/close are safe no-ops", () => {
    vi.spyOn(window, "open").mockReturnValue(null)

    const tab = openAuthTab()

    expect(tab.blocked).toBe(true)
    // Must never throw even though there is no tab to act on.
    expect(() => tab.navigate("https://oauth.composio.dev/x")).not.toThrow()
    expect(() => tab.close()).not.toThrow()
  })

  it("reports blocked when window.open itself throws", () => {
    vi.spyOn(window, "open").mockImplementation(() => {
      throw new Error("popup blocked by policy")
    })

    const tab = openAuthTab()
    expect(tab.blocked).toBe(true)
  })

  it("tolerates a tab the user closed between open and navigate", () => {
    const win = fakeWindow()
    Object.defineProperty(win, "location", {
      get() {
        throw new Error("window closed")
      },
    })
    vi.spyOn(window, "open").mockReturnValue(win as unknown as Window)

    const tab = openAuthTab()
    expect(tab.blocked).toBe(false)
    // Setting .location.href on a closed window throws internally — swallowed.
    expect(() => tab.navigate("https://oauth.composio.dev/x")).not.toThrow()
  })
})
