// @vitest-environment jsdom
/**
 * /connections OAuth callback flow.
 *
 * Pins the contract documented in connections-content.tsx around the
 * `?connected=<app>` query param landing on the throwaway auth tab:
 *
 *   1. A success toast is fired naming the app.
 *   2. The connections query refetches authoritatively.
 *   3. A {type:"connected", app} message is broadcast on the
 *      "composio:connections" BroadcastChannel so the *original* tab
 *      (the one that opened the auth popup) invalidates immediately
 *      rather than waiting for window focus.
 *   4. The tab auto-closes itself ~1.2s later, AND — critically — that
 *      close call survives the router.replace() URL strip that happens
 *      synchronously in the same effect. The previous implementation
 *      tied the timer to the effect's cleanup, so router.replace's
 *      searchParams flip would cancel the close before it ever fired.
 *      This test is the regression guard against that class of bug.
 *   5. Even if close is denied, router.replace() strips the query params
 *      so the user lands on a clean /connections URL.
 *
 * And the symmetric listener contract:
 *
 *   6. A *separate* tab on /connections that receives a "connected"
 *      broadcast from a sibling tab refetches its own connections cache.
 *   7. The same tab does NOT subscribe (or self-trigger) when it itself
 *      is on ?connected= — it's the source, not a peer.
 *
 * And the negative case:
 *
 *   8. The `?pending` branch (Composio finished OAuth but our session
 *      cookie was missing on the callback) refreshes the connections list
 *      but does NOT close the tab — this is the user's primary tab, not a
 *      throwaway popup.
 *
 * A regression on any of these silently breaks the "click Connect →
 * authorize → the original chat tab is instantly aware, the popup is
 * gone" UX, with no test failure. This file is that test.
 */
import React from "react"
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  beforeAll,
  afterAll,
  type Mock,
} from "vitest"
import { render, act } from "@testing-library/react"

// ── Hoisted spies. ───────────────────────────────────────────────────────
// vi.mock() calls are hoisted above top-level `const ...` declarations, so
// any spy referenced inside a mock factory must itself be hoisted. This
// `vi.hoisted` block is the canonical pattern.
const {
  routerReplace,
  routerPush,
  routerRefresh,
  searchParamsRef,
  toastSuccess,
  toastError,
  refetchConnections,
  disconnectSpy,
  postMessageSpy,
  bcRegistry,
} = vi.hoisted(() => {
  return {
    routerReplace: vi.fn(),
    routerPush: vi.fn(),
    routerRefresh: vi.fn(),
    searchParamsRef: {
      current: new URLSearchParams(),
    } as { current: URLSearchParams },
    toastSuccess: vi.fn(),
    toastError: vi.fn(),
    refetchConnections: vi.fn(async () => ({ data: [] }) as unknown),
    disconnectSpy: vi.fn(async () => undefined),
    postMessageSpy: vi.fn(),
    bcRegistry: new Map<string, Set<{ post: (data: unknown) => void; ref: object }>>(),
  }
})

// ── next-intl passthrough ────────────────────────────────────────────────
// Identity translator + key+value echo so we can assert the app name lands
// in the toast string ("toasts.connected gmail").
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key} ${Object.values(values).join(" ")}` : key,
}))

// ── framer-motion — strip motion props, render plain tags. ───────────────
vi.mock("framer-motion", () => {
  const R = require("react") as typeof import("react")
  const motion = new Proxy(
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
  )
  return {
    motion,
    AnimatePresence: ({ children }: { children: React.ReactNode }) =>
      R.createElement(R.Fragment, null, children),
  }
})

// ── next/navigation — controllable router + searchParams. ────────────────
// `searchParamsRef` is mutated by individual tests *before* render so the
// useEffect that drives the OAuth-callback branch sees the right shape.
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: routerReplace,
    push: routerPush,
    refresh: routerRefresh,
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
  useSearchParams: () => searchParamsRef.current,
}))

// ── sonner — capture toast calls. ────────────────────────────────────────
vi.mock("sonner", () => ({
  toast: {
    success: toastSuccess,
    error: toastError,
    message: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
}))

// ── composio hooks — refetch is the spy under assertion (both the
// OAuth-callback branch and the BroadcastChannel listener call it).
vi.mock("@/lib/composio-store/use-composio", () => ({
  useComposioConnections: () => ({
    data: [],
    isLoading: false,
    error: null,
    refetch: refetchConnections,
  }),
  useComposioToolkits: () => ({
    data: [],
    isLoading: false,
    error: null,
  }),
  useDisconnectApp: () => ({ disconnect: disconnectSpy }),
}))

// Heavy children stubbed out — they pull in their own fetches we don't want
// to invoke and they're irrelevant to the callback-handling contract.
vi.mock("@/app/connections/connect-app-dialog", () => ({
  ConnectAppDialog: () => null,
}))
vi.mock("@/app/connections/empty-state", () => ({
  EmptyState: () => null,
}))
vi.mock("@/components/common/page-loader", () => ({
  PageLoader: ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
}))

// ── Minimal in-memory BroadcastChannel polyfill for jsdom. ───────────────
// jsdom doesn't ship BroadcastChannel. The component constructs one in two
// places (post-success broadcast + cross-tab listener) and both paths are
// wrapped in try/catch — without a polyfill, the broadcast branch is a
// silent no-op and the assertion that "the original tab is told" can't be
// observed. We install a tiny same-process implementation: all instances
// of the same channel name share a Set of listeners; postMessage fans out
// to everyone EXCEPT the poster (standard BC semantics).
type BCEntry = { post: (data: unknown) => void; ref: object }
// bcRegistry and postMessageSpy are hoisted at the top of the file so that
// vi.mock() factories can reference them. Declared here only for type sake.

class FakeBroadcastChannel {
  name: string
  onmessage: ((ev: { data: unknown }) => void) | null = null
  private _entry: BCEntry
  private _closed = false
  constructor(name: string) {
    this.name = name
    const set = bcRegistry.get(name) ?? new Set()
    bcRegistry.set(name, set)
    const self = this
    this._entry = {
      ref: self,
      post: (data) => {
        if (self._closed) return
        // Deliver asynchronously to mimic the real BC microtask hop, so a
        // sender's same-tab subscriber doesn't reentrantly observe its own
        // send (though, per the BC spec, same-instance is filtered above).
        queueMicrotask(() => {
          if (self._closed) return
          self.onmessage?.({ data })
        })
      },
    }
    set.add(this._entry)
  }
  postMessage(data: unknown) {
    postMessageSpy(this.name, data)
    const set = bcRegistry.get(this.name)
    if (!set) return
    for (const entry of set) {
      if (entry.ref === this) continue // no self-delivery on same instance
      entry.post(data)
    }
  }
  close() {
    this._closed = true
    bcRegistry.get(this.name)?.delete(this._entry)
  }
  addEventListener() { /* not used by the component */ }
  removeEventListener() { /* not used by the component */ }
}

const realBroadcastChannel = (globalThis as { BroadcastChannel?: unknown })
  .BroadcastChannel
beforeAll(() => {
  ;(globalThis as { BroadcastChannel?: unknown }).BroadcastChannel =
    FakeBroadcastChannel
})
afterAll(() => {
  ;(globalThis as { BroadcastChannel?: unknown }).BroadcastChannel =
    realBroadcastChannel
})

// ── window.close spy. ────────────────────────────────────────────────────
let windowCloseSpy: Mock
const originalWindowClose = window.close
beforeEach(() => {
  vi.useFakeTimers()
  routerReplace.mockClear()
  routerPush.mockClear()
  routerRefresh.mockClear()
  toastSuccess.mockClear()
  toastError.mockClear()
  refetchConnections.mockClear()
  postMessageSpy.mockClear()
  bcRegistry.clear()
  windowCloseSpy = vi.fn()
  Object.defineProperty(window, "close", {
    configurable: true,
    writable: true,
    value: windowCloseSpy,
  })
})
afterEach(() => {
  vi.useRealTimers()
  Object.defineProperty(window, "close", {
    configurable: true,
    writable: true,
    value: originalWindowClose,
  })
  searchParamsRef.current = new URLSearchParams()
})

// Import AFTER the mocks above are registered.
import { ConnectionsContent } from "@/app/connections/connections-content"

/**
 * Drain microtasks so awaited refresh() promises and the
 * BroadcastChannel's queueMicrotask delivery both settle while fake
 * timers are installed.
 */
async function flush() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

describe("ConnectionsContent — OAuth callback (?connected=<app>)", () => {
  it("toasts, refreshes, broadcasts, schedules window.close(1200ms), and strips the param — and the close survives the post-replace re-render", async () => {
    searchParamsRef.current = new URLSearchParams("connected=gmail")

    let rerender: ReturnType<typeof render>["rerender"]
    await act(async () => {
      const r = render(<ConnectionsContent />)
      rerender = r.rerender
    })
    await flush()

    // 1. Success toast with the app name interpolated.
    expect(toastSuccess).toHaveBeenCalledTimes(1)
    expect(toastSuccess.mock.calls[0][0]).toContain("gmail")

    // 2. Authoritative refresh of the connections cache.
    expect(refetchConnections).toHaveBeenCalled()

    // 3. Cross-tab broadcast so the *original* (chat / dialog) tab learns
    //    about the new connection without waiting for window focus.
    expect(postMessageSpy).toHaveBeenCalledWith("composio:connections", {
      type: "connected",
      app: "gmail",
    })

    // 5. Param-stripping replace fires regardless of close success — this
    //    is the fallback for tabs the user opened by hand.
    expect(routerReplace).toHaveBeenCalledWith("/connections", {
      scroll: false,
    })

    // 4a. The close is scheduled but hasn't fired yet (timer pending).
    expect(windowCloseSpy).not.toHaveBeenCalled()

    // 4b. THE REGRESSION GUARD — simulate the searchParams flip that
    //     Next.js commits ~50ms after router.replace(). In production
    //     this re-runs the [searchParams] effect; if the close-timer is
    //     closure-scoped with a clearTimeout in cleanup, the cleanup
    //     fires here and cancels the close. The fixed implementation
    //     stores the timer on a ref so it survives this re-render.
    searchParamsRef.current = new URLSearchParams()
    await act(async () => {
      rerender!(<ConnectionsContent />)
    })
    await flush()
    // Timer must still be pending — re-render did NOT cancel it.
    expect(windowCloseSpy).not.toHaveBeenCalled()

    // Now advance to the 1200ms mark — the close fires from the original
    // setTimeout, surviving the re-render in between.
    await act(async () => {
      vi.advanceTimersByTime(1200)
    })
    expect(windowCloseSpy).toHaveBeenCalledTimes(1)
  })

  it("a sibling broadcast on composio:connections triggers refresh() in the listening tab", async () => {
    // No query params: this tab is the *original* tab listening for the
    // sibling auth tab's broadcast. It should refetch on receipt.
    searchParamsRef.current = new URLSearchParams()

    await act(async () => {
      render(<ConnectionsContent />)
    })
    await flush()

    // Baseline: mount itself does NOT refetch (the OAuth-callback effect
    // is only entered when ?connected= is present).
    const baseline = refetchConnections.mock.calls.length

    // Simulate a sibling tab finishing OAuth and broadcasting.
    await act(async () => {
      const sibling = new (
        globalThis as unknown as {
          BroadcastChannel: new (n: string) => InstanceType<
            typeof FakeBroadcastChannel
          >
        }
      ).BroadcastChannel("composio:connections")
      sibling.postMessage({ type: "connected", app: "slack" })
      sibling.close()
    })
    await flush()

    expect(refetchConnections.mock.calls.length).toBeGreaterThan(baseline)
  })

  it("the source tab does NOT subscribe to its own broadcast (no redundant refetch on a closing tab)", async () => {
    // The source tab itself has ?connected= set, so the listener-effect
    // must early-return without subscribing. This guards against the
    // self-broadcast amplification noted in the adversarial review.
    searchParamsRef.current = new URLSearchParams("connected=gmail")

    await act(async () => {
      render(<ConnectionsContent />)
    })
    await flush()

    // The OAuth-callback effect's direct refresh() runs once. After it,
    // refetchConnections must not be called *again* by a self-broadcast
    // delivery — i.e. the listener wasn't subscribed.
    const refetchCallsAfterMount = refetchConnections.mock.calls.length

    // Drain the microtask queue further — if a listener had been
    // subscribed, the post on this tab would have already delivered by
    // now and bumped the refetch count.
    await flush()
    await flush()

    expect(refetchConnections.mock.calls.length).toBe(refetchCallsAfterMount)
  })

  it("?pending refreshes but does NOT auto-close the tab", async () => {
    // The pending branch is the "Composio finished OAuth but our session
    // cookie wasn't on the callback request" path. It must refetch (so the
    // new connection appears once the cookie resolves), strip params, and
    // — critically — leave the tab open, because this is the user's
    // primary tab, not a script-opened throwaway.
    searchParamsRef.current = new URLSearchParams("pending=1")

    await act(async () => {
      render(<ConnectionsContent />)
    })
    await flush()

    expect(refetchConnections).toHaveBeenCalled()
    expect(routerReplace).toHaveBeenCalledWith("/connections", {
      scroll: false,
    })

    // No success toast (that's the ?connected branch).
    expect(toastSuccess).not.toHaveBeenCalled()

    // Push fake time past the would-be close window. Nothing should fire.
    await act(async () => {
      vi.advanceTimersByTime(5000)
    })
    expect(windowCloseSpy).not.toHaveBeenCalled()
  })
})
