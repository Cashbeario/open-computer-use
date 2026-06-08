// @vitest-environment jsdom
/**
 * developer-home-summary.test.tsx — the developer-mode chat homepage.
 *
 * (1) Render test for <DeveloperHomeSummary/>: the wallet balance shows in USD,
 *     the stat strip and the quick links into the developer sections render.
 * (2) Source-level anti-drift over chat.tsx: in developer mode the empty-state
 *     renders the summary instead of the greeting, and the chat input is hidden.
 */
import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { readFileSync } from "node:fs"
import { join } from "node:path"

// next/link → plain anchor (no router needed in the test).
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: any) => (
    <a href={typeof href === "string" ? href : "#"} {...rest}>{children}</a>
  ),
}))

// Signed-in user.
vi.mock("@/lib/user-store/provider", () => ({
  useUser: () => ({ user: { display_name: "Ada Lovelace" } }),
}))

// Mock ONLY the data hook; keep the real formatNum / formatUsd helpers.
vi.mock("@/app/components/developers/developers-shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/app/components/developers/developers-shared")>()
  return {
    ...actual,
    useDeveloperData: () => ({
      keys: [],
      setKeys: () => {},
      stats: {
        keyCount: 3, totalRequests: 100, totalCredits: 50, requests24h: 12,
        requests7d: 88, credits7d: 40, avgCreditsPerRequest: 2, peakHour: null,
        balance: 1234, walletBalanceCents: 1234, tier: "professional",
      },
      byEndpoint: {}, daily: [], recent: [], loading: false, refetch: async () => {},
    }),
  }
})

import { DeveloperHomeSummary } from "@/app/components/developers/developer-home-summary"

describe("DeveloperHomeSummary — developer-mode homepage", () => {
  it("shows the API wallet balance in USD as the signature element", () => {
    render(<DeveloperHomeSummary />)
    expect(screen.getByText("API wallet balance")).toBeTruthy()
    // 1234 cents -> $12.34 (USD, never credits)
    expect(screen.getByText("$12.34")).toBeTruthy()
    expect(screen.queryByText(/credit/i)).toBeNull()
  })

  it("greets the signed-in developer and shows the tier", () => {
    render(<DeveloperHomeSummary />)
    expect(screen.getByText(/Welcome back, Ada\./)).toBeTruthy()
    expect(screen.getByText(/professional tier/i)).toBeTruthy()
  })

  it("renders the hairline stat strip from the usage data", () => {
    render(<DeveloperHomeSummary />)
    expect(screen.getByText("Requests · 7d")).toBeTruthy()
    expect(screen.getByText("Active keys")).toBeTruthy()
    expect(screen.getByText("88")).toBeTruthy()  // requests7d
    expect(screen.getByText("3")).toBeTruthy()   // keyCount
  })

  it("links into every developer section", () => {
    const { container } = render(<DeveloperHomeSummary />)
    for (const href of ["/developers/keys", "/developers/usage", "/developers/logs", "/developers/docs"]) {
      expect(container.querySelector(`a[href="${href}"]`), `link to ${href}`).toBeTruthy()
    }
  })
})

describe("chat homepage wiring (anti-drift over chat.tsx)", () => {
  const CHAT = readFileSync(join(process.cwd(), "app/components/chat/chat.tsx"), "utf8")

  it("reads platform mode and derives isDeveloperHome from it + showOnboarding", () => {
    expect(CHAT).toMatch(/usePlatformMode\(\(s\)\s*=>\s*s\.mode\)/)
    expect(CHAT).toMatch(/const isDeveloperHome\s*=\s*showOnboarding\s*&&\s*platformMode === "developer"/)
  })

  it("renders the summary instead of the greeting on the developer homepage", () => {
    expect(CHAT).toMatch(/isDeveloperHome && !swarmFullscreen && \(\s*\n?\s*<DeveloperHomeSummary/)
    // greeting is suppressed in developer mode
    expect(CHAT).toMatch(/showOnboarding && !swarmFullscreen && !isDeveloperHome &&/)
  })

  it("hides the chat input container on the developer homepage", () => {
    expect(CHAT).toMatch(/\{!isDeveloperHome && \(\s*\n?\s*<motion\.div\s*\n?\s*className=\{cn\(/)
  })
})
