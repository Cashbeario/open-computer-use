// @vitest-environment jsdom
/**
 * awaiting-human-banner.test.tsx — covers the human-handoff UI.
 *
 * This component is the only path a swarm user has to resume a machine that
 * stopped for 2FA / CAPTCHA / approval. If it breaks, the agent waits 300s
 * for nothing and times out. The tests below lock in:
 *
 *   • The interactive vs passive (completed) modes both render correctly
 *   • The compact layout used by the 280px MachinePlayerCard works
 *   • Resume click POSTs to the right URL and flips into the completed mode
 *   • Connect click resolves the VNC URL via /api/machines/{id} and opens
 *     a new tab — and falls back to a copyable URL when the browser blocks
 *     the popup (Safari, Firefox-strict, popup blockers)
 *   • Empty / missing reason is replaced with the default — a blank banner
 *     would be a UX dead end
 *   • Long reasons get a title attribute for hover-to-read
 */
import React from "react"
import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
} from "vitest"
import { render, cleanup, fireEvent, screen, waitFor } from "@testing-library/react"

// Mock next-intl ONCE at the module level — useTranslations returns an
// identity function over the key so assertions can rely on the raw keys.
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => `t.${key}`,
}))

import { AwaitingHumanBanner } from "@/app/components/chat/awaiting-human-banner"

// ───────────────────────────────────────────────────────────────────────────
// Test helpers
// ───────────────────────────────────────────────────────────────────────────

interface MockFetchOptions {
  /** Body returned by /api/machines/{id} */
  machine?: Record<string, unknown>
  /** Status returned by /api/machines/{id} */
  machineStatus?: number
  /** Status returned by /api/chat/resume-human/{id} */
  resumeStatus?: number
}

function setupMockFetch(opts: MockFetchOptions = {}) {
  const machineBody = opts.machine ?? {
    machine: {
      publicIpAddress: "203.0.113.42",
      websocketPort: 6080,
      vncPassword: "secret123",
    },
  }
  const machineStatus = opts.machineStatus ?? 200
  const resumeStatus = opts.resumeStatus ?? 200

  // Wide signature — TypeScript needs both args in the tuple so that
  // assertions on the init (method, headers, body) compile.
  const fetchMock = vi.fn(async (url: string | URL, _init?: RequestInit) => {
    const u = String(url)
    if (u.includes("/api/chat/resume-human/")) {
      return new Response(JSON.stringify({ resumed: true }), {
        status: resumeStatus,
        headers: { "Content-Type": "application/json" },
      })
    }
    if (u.includes("/api/machines/")) {
      return new Response(JSON.stringify(machineBody), {
        status: machineStatus,
        headers: { "Content-Type": "application/json" },
      })
    }
    throw new Error(`Unexpected fetch URL: ${u}`)
  })
  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

beforeEach(() => {
  // Reset between tests so window.open spies and clipboard state don't leak.
  vi.useRealTimers()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

// ───────────────────────────────────────────────────────────────────────────
// Active / completed mode rendering
// ───────────────────────────────────────────────────────────────────────────

describe("AwaitingHumanBanner — render modes", () => {
  it("renders the active state with reason and both action buttons", () => {
    setupMockFetch()
    render(
      <AwaitingHumanBanner
        reason="2FA code required from your authenticator app"
        machineId="vm-1"
        isActive
      />,
    )
    // The "Your turn" header is present (i18n key, mocked to t.yourTurn)
    expect(screen.getByText("t.yourTurn")).toBeTruthy()
    // The reason text appears verbatim
    expect(
      screen.getByText("2FA code required from your authenticator app"),
    ).toBeTruthy()
    // Both action buttons present
    expect(screen.getByText("t.connectToDesktop")).toBeTruthy()
    expect(screen.getByText("t.doneContinue")).toBeTruthy()
  })

  it("renders the passive completed state when isActive is false", () => {
    setupMockFetch()
    render(<AwaitingHumanBanner reason="2FA" machineId="vm-1" isActive={false} />)
    // Completed pill text shows the i18n key
    expect(screen.getByText("t.completed")).toBeTruthy()
    // NO interactive buttons — important so completed swarms in the history
    // view don't have dead-clickable "Resume" buttons.
    expect(screen.queryByText("t.doneContinue")).toBeNull()
    expect(screen.queryByText("t.connectToDesktop")).toBeNull()
  })

  it("renders the passive completed state when isActive is omitted entirely", () => {
    setupMockFetch()
    render(<AwaitingHumanBanner reason="2FA" machineId="vm-1" />)
    expect(screen.getByText("t.completed")).toBeTruthy()
  })
})

// ───────────────────────────────────────────────────────────────────────────
// Default-reason and long-reason handling
// ───────────────────────────────────────────────────────────────────────────

describe("AwaitingHumanBanner — reason text handling", () => {
  it("falls back to a generic reason when the agent emitted an empty string", () => {
    setupMockFetch()
    render(<AwaitingHumanBanner reason="" machineId="vm-1" isActive />)
    // The default text mentions intervention so users at least know to act.
    expect(
      screen.getByText(/Human intervention requested/i),
    ).toBeTruthy()
  })

  it("falls back to default when reason is only whitespace", () => {
    setupMockFetch()
    // Use a JS-expression value so the escape sequences are real whitespace
    // bytes, not the literal characters \n \t (JSX string attributes don't
    // process backslash escapes).
    render(
      <AwaitingHumanBanner
        reason={"   \n\t  "}
        machineId="vm-1"
        isActive
      />,
    )
    expect(
      screen.getByText(/Human intervention requested/i),
    ).toBeTruthy()
  })

  it("adds a title attribute on long reasons so users can hover to read full text", () => {
    setupMockFetch()
    const longReason =
      "This is an extremely long reason text that goes on and on and on " +
      "to test that we add a title attribute past the 80 character threshold."
    expect(longReason.length).toBeGreaterThan(80)
    render(
      <AwaitingHumanBanner reason={longReason} machineId="vm-1" isActive />,
    )
    const para = screen.getByText(longReason)
    expect(para.getAttribute("title")).toBe(longReason)
  })

  it("does NOT add a title attribute on short reasons (avoids hover noise)", () => {
    setupMockFetch()
    render(<AwaitingHumanBanner reason="2FA needed" machineId="vm-1" isActive />)
    const para = screen.getByText("2FA needed")
    expect(para.getAttribute("title")).toBeNull()
  })
})

// ───────────────────────────────────────────────────────────────────────────
// Compact mode (used by the 280px MachinePlayerCard)
// ───────────────────────────────────────────────────────────────────────────

describe("AwaitingHumanBanner — compact mode", () => {
  it("renders all the same content in compact mode", () => {
    setupMockFetch()
    render(
      <AwaitingHumanBanner
        compact
        reason="2FA required"
        machineId="vm-1"
        isActive
      />,
    )
    // All the active-state content is still present
    expect(screen.getByText("t.yourTurn")).toBeTruthy()
    expect(screen.getByText("2FA required")).toBeTruthy()
    expect(screen.getByText("t.connectToDesktop")).toBeTruthy()
    expect(screen.getByText("t.doneContinue")).toBeTruthy()
  })

  it("uses flex-col-reverse for compact button stack (primary action on top)", () => {
    setupMockFetch()
    const { container } = render(
      <AwaitingHumanBanner
        compact
        reason="2FA"
        machineId="vm-1"
        isActive
      />,
    )
    // The button group is the last direct child of the banner container.
    // In compact mode it must use flex-col-reverse so "Done, Continue"
    // (the primary action) renders ABOVE "Connect to Desktop".
    const banner = container.querySelector('[data-testid="awaiting-human-banner"]')
    expect(banner).toBeTruthy()
    const buttonGroup = banner!.querySelector(".flex-col-reverse")
    expect(buttonGroup).toBeTruthy()
  })

  it("compact completed state still shows the completed message", () => {
    setupMockFetch()
    render(
      <AwaitingHumanBanner
        compact
        reason="2FA"
        machineId="vm-1"
        isActive={false}
      />,
    )
    expect(screen.getByText("t.completed")).toBeTruthy()
  })
})

// ───────────────────────────────────────────────────────────────────────────
// Resume button — POSTs and flips state
// ───────────────────────────────────────────────────────────────────────────

describe("AwaitingHumanBanner — resume action", () => {
  it("POSTs to /api/chat/resume-human/{id} and switches to completed state on 200", async () => {
    const fetchMock = setupMockFetch()
    render(
      <AwaitingHumanBanner
        reason="2FA"
        machineId="vm-xyz"
        isActive
      />,
    )

    const resumeBtn = screen.getByText("t.doneContinue").closest("button")
    expect(resumeBtn).toBeTruthy()
    fireEvent.click(resumeBtn!)

    // First — should call the resume endpoint with POST
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled()
    })
    const resumeCall = fetchMock.mock.calls.find((c) =>
      String(c[0]).includes("/api/chat/resume-human/"),
    )
    expect(resumeCall).toBeTruthy()
    expect(String(resumeCall![0])).toBe("/api/chat/resume-human/vm-xyz")
    expect((resumeCall![1] as RequestInit | undefined)?.method).toBe("POST")

    // Then — banner switches to completed pill
    await waitFor(() => {
      expect(screen.getByText("t.completed")).toBeTruthy()
    })
  })

  it("does NOT flip to completed if the resume endpoint returns 500", async () => {
    setupMockFetch({ resumeStatus: 500 })
    render(
      <AwaitingHumanBanner reason="2FA" machineId="vm-1" isActive />,
    )

    const resumeBtn = screen.getByText("t.doneContinue").closest("button")
    fireEvent.click(resumeBtn!)

    // Wait a tick for the promise to settle. Banner should still show
    // active state — the resume button is re-enabled for retry.
    await waitFor(() => {
      // Active state still rendered
      expect(screen.getByText("t.yourTurn")).toBeTruthy()
    })
    // Completed pill is NOT shown
    expect(screen.queryByText("t.completed")).toBeNull()
  })

  it("does not call the API but surfaces an explicit error when machineId is empty", async () => {
    // Regression: previously the click silently no-op'd with no UI feedback,
    // making users think the button was broken. Now the same condition shows
    // an inline alert so they know what's wrong and try refreshing.
    const fetchMock = setupMockFetch()
    render(<AwaitingHumanBanner reason="2FA" machineId="" isActive />)
    const resumeBtn = screen.getByText("t.doneContinue").closest("button")
    fireEvent.click(resumeBtn!)
    // No fetch should have happened — guard still in place
    await new Promise((r) => setTimeout(r, 10))
    const resumeCall = fetchMock.mock.calls.find((c) =>
      String(c[0]).includes("/api/chat/resume-human/"),
    )
    expect(resumeCall).toBeFalsy()
    // But there IS now visible error feedback
    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeTruthy()
    })
    expect(screen.getByText(/Machine ID missing/i)).toBeTruthy()
  })

  it("surfaces an inline error when the resume API returns a non-200 status", async () => {
    setupMockFetch({ resumeStatus: 502 })
    render(<AwaitingHumanBanner reason="2FA" machineId="vm-x" isActive />)
    fireEvent.click(screen.getByText("t.doneContinue").closest("button")!)
    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeTruthy()
    })
    expect(screen.getByText(/Resume failed: 502/i)).toBeTruthy()
  })
})

// ───────────────────────────────────────────────────────────────────────────
// Connect to Desktop — VNC URL + popup-blocked fallback
// ───────────────────────────────────────────────────────────────────────────

describe("AwaitingHumanBanner — connect action", () => {
  it("opens a noVNC URL with IP+port+password from /api/machines/{id}", async () => {
    setupMockFetch({
      machine: {
        machine: {
          publicIpAddress: "203.0.113.42",
          websocketPort: 6080,
          vncPassword: "longerthan8chars",
        },
      },
    })
    // Cast through unknown — TS doesn't know jsdom's window.open returns
    // a Window stub; the test only cares that we got *something* truthy.
    const openSpy = vi.fn((..._args: unknown[]) => ({}) as unknown as Window)
    vi.stubGlobal("open", openSpy)

    render(
      <AwaitingHumanBanner reason="2FA" machineId="vm-vnc" isActive />,
    )
    const connectBtn = screen.getByText("t.connectToDesktop").closest("button")
    fireEvent.click(connectBtn!)

    await waitFor(() => {
      expect(openSpy).toHaveBeenCalled()
    })
    const opened = openSpy.mock.calls[0][0] as string
    // Password is TightVNC-truncated to first 8 chars then URL-encoded
    expect(opened).toContain("203.0.113.42:6080")
    expect(opened).toContain("vnc.html")
    expect(opened).toContain("password=longerth")
  })

  it("renders the popup-blocked fallback when window.open returns null", async () => {
    setupMockFetch()
    // Simulate browser popup blocker
    vi.stubGlobal("open", vi.fn((..._args: unknown[]) => null))

    render(
      <AwaitingHumanBanner reason="2FA" machineId="vm-blocked" isActive />,
    )
    const connectBtn = screen.getByText("t.connectToDesktop").closest("button")
    fireEvent.click(connectBtn!)

    // Fallback row appears with role="alert"
    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeTruthy()
    })
    // The button (not the surrounding "— copy URL?" text) carries the
    // copy action. Use role+name to disambiguate from the prompt text.
    expect(
      screen.getByRole("button", { name: /Copy URL/i }),
    ).toBeTruthy()
    expect(screen.getByText(/Popup blocked/i)).toBeTruthy()
  })

  it("Copy URL button writes the VNC URL into the clipboard", async () => {
    setupMockFetch({
      machine: {
        machine: {
          publicIpAddress: "10.0.0.5",
          websocketPort: 6080,
          vncPassword: "pw",
        },
      },
    })
    vi.stubGlobal("open", vi.fn((..._args: unknown[]) => null)) // blocked
    // Patch navigator.clipboard directly instead of replacing the whole
    // navigator object (jsdom's navigator has read-only members that break
    // when wholesale-replaced via stubGlobal).
    const writeText = vi.fn(async (_text: string) => undefined)
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      writable: true,
      configurable: true,
    })

    render(
      <AwaitingHumanBanner reason="2FA" machineId="vm-c" isActive />,
    )
    fireEvent.click(screen.getByText("t.connectToDesktop").closest("button")!)

    // Wait for the popup-blocked fallback (specifically the Copy URL button)
    // to mount.
    const copyBtn = await waitFor(() =>
      screen.getByRole("button", { name: /Copy URL/i }),
    )

    fireEvent.click(copyBtn)

    await waitFor(() => {
      expect(writeText).toHaveBeenCalled()
    })
    const url = writeText.mock.calls[0][0] as string
    expect(url).toContain("10.0.0.5:6080")
    expect(url).toContain("vnc.html")
  })

  it("falls back to /machines page when /api/machines/{id} returns 404", async () => {
    setupMockFetch({ machineStatus: 404 })
    // Cast through unknown — TS doesn't know jsdom's window.open returns
    // a Window stub; the test only cares that we got *something* truthy.
    const openSpy = vi.fn((..._args: unknown[]) => ({}) as unknown as Window)
    vi.stubGlobal("open", openSpy)

    render(
      <AwaitingHumanBanner reason="2FA" machineId="vm-missing" isActive />,
    )
    fireEvent.click(screen.getByText("t.connectToDesktop").closest("button")!)

    await waitFor(() => {
      expect(openSpy).toHaveBeenCalled()
    })
    const opened = openSpy.mock.calls[0][0] as string
    // Fallback navigates to the machines page filtered by id
    expect(opened).toBe("/machines?id=vm-missing")
  })

  it("falls back to /machines page when the API response has no public IP", async () => {
    setupMockFetch({
      machine: {
        machine: {
          // no IP
          websocketPort: 6080,
        },
      },
    })
    // Cast through unknown — TS doesn't know jsdom's window.open returns
    // a Window stub; the test only cares that we got *something* truthy.
    const openSpy = vi.fn((..._args: unknown[]) => ({}) as unknown as Window)
    vi.stubGlobal("open", openSpy)

    render(
      <AwaitingHumanBanner reason="2FA" machineId="vm-noip" isActive />,
    )
    fireEvent.click(screen.getByText("t.connectToDesktop").closest("button")!)

    await waitFor(() => {
      expect(openSpy).toHaveBeenCalled()
    })
    expect(openSpy.mock.calls[0][0]).toBe("/machines?id=vm-noip")
  })
})
