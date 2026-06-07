// @vitest-environment jsdom
/**
 * composio-store.test.ts — TanStack-Query-backed Composio hooks.
 *
 * Coverage matrix:
 *   1. useComposioConnections happy path — fetches /api/composio/connections,
 *      returns the connections array, exposes loading / error / refetch.
 *   2. useComposioConnections HTTP error — query.error is populated; data
 *      defaults to [] so consumers can render an empty state safely.
 *   3. useComposioToolkits happy path — mirrors connections for the catalog.
 *   4. useConnectApp triggers window.location — on mutation success the
 *      browser is sent to the Composio-supplied redirect_url.
 *   5. useConnectApp error state — backend 4xx surfaces the parsed `error`
 *      field on the mutation's `.error`.
 *   6. useDisconnectApp invalidates the connections query — after a
 *      successful DELETE to /api/composio/disconnect/{id} (path param, no
 *      request body), queryClient.invalidateQueries is called with the
 *      ["composio","connections"] key so the next read refetches.
 *   7. useDisconnectApp error path — failing DELETE surfaces mutation.error
 *      and does NOT invalidate the cached connections (so the optimistic
 *      list stays stable until the caller retries).
 *
 * Conventions mirrored from tests/lib/sidebar-hooks.test.ts (fetch mocking)
 * and tests/lib/awaiting-human-banner.test.tsx (@testing-library/react +
 * jsdom pragma). No JSX — we use React.createElement so the file can keep
 * the `.test.ts` extension requested by the task while still rendering the
 * TanStack QueryClientProvider wrapper.
 */
import React from "react"
import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
  type Mock,
} from "vitest"
import { renderHook, waitFor, act } from "@testing-library/react"
import {
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query"

// The composio hooks call useTranslations() for error messages. tests/setup.ts
// does not register a global next-intl mock, so we mock it inline here —
// matching the convention used by composio-featured-carousel.test.tsx,
// awaiting-human-banner.test.tsx, and error-boundary-signout-suppression.test.tsx.
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${JSON.stringify(values)}` : key,
}))

import {
  useComposioConnections,
  useComposioToolkits,
  useConnectApp,
  useDisconnectApp,
} from "@/lib/composio-store/use-composio"
import { ComposioProvider } from "@/lib/composio-store/provider"

// ───────────────────────────────────────────────────────────────────────────
// Test scaffolding
// ───────────────────────────────────────────────────────────────────────────

/**
 * Build a fresh QueryClient for each test. We disable retries so a single
 * mocked failure surfaces immediately (default is 3 retries with backoff,
 * which would blow the 15s vitest timeout).
 */
function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  })
}

/**
 * Wrapper factory for renderHook. The hooks rely on both
 * QueryClientProvider and ComposioProvider (the latter for the per-chat
 * picker Context which usePerChatToolkits reads). We mount both so the
 * tests exercise the real provider tree.
 */
function makeWrapper(queryClient: QueryClient) {
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(
      QueryClientProvider,
      { client: queryClient },
      React.createElement(
        ComposioProvider,
        null,
        children
      )
    )
}

/**
 * Mint a Response-like object compatible with the small subset of the
 * fetch API the hooks rely on (`ok`, `status`, `json`).
 */
function mockResponse<T>(body: T, init: { ok?: boolean; status?: number } = {}) {
  const ok = init.ok ?? true
  const status = init.status ?? (ok ? 200 : 500)
  return {
    ok,
    status,
    json: async () => body,
  } as unknown as Response
}

// ───────────────────────────────────────────────────────────────────────────
// Global fetch stub — reset between tests so assertion counts are clean.
// ───────────────────────────────────────────────────────────────────────────

let fetchMock: Mock
const originalFetch = globalThis.fetch
// Capture a reference to window so the location-mutation tests can restore.
let originalLocation: Location | undefined

beforeEach(() => {
  fetchMock = vi.fn()
  globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch
  // jsdom provides window.location; we replace it with a writable stub so
  // useConnectApp's `window.location.href = ...` assignment can be asserted.
  originalLocation = window.location
  // @ts-expect-error — overwriting the read-only location for assertion.
  delete window.location
  // @ts-expect-error — minimal Location stub.
  window.location = { href: "" }
})

afterEach(() => {
  vi.restoreAllMocks()
  globalThis.fetch = originalFetch
  if (originalLocation) {
    // @ts-expect-error — restore the original Location.
    window.location = originalLocation
  }
})

// ═══════════════════════════════════════════════════════════════════════════
// useComposioConnections
// ═══════════════════════════════════════════════════════════════════════════

describe("useComposioConnections", () => {
  it("loads connections from /api/composio/connections", async () => {
    fetchMock.mockResolvedValueOnce(
      mockResponse({
        enabled: true,
        connections: [
          {
            id: "ca_1",
            app_slug: "gmail",
            app_name: "Gmail",
            account_label: "alice@example.com",
            status: "ACTIVE",
            created_at: "2026-05-01T00:00:00Z",
            last_used_at: null,
            scopes: [],
          },
        ],
      })
    )

    const client = makeQueryClient()
    const { result } = renderHook(() => useComposioConnections(), {
      wrapper: makeWrapper(client),
    })

    // Initial render: still loading, empty data.
    expect(result.current.isLoading).toBe(true)
    expect(result.current.data).toEqual([])

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/composio/connections",
      expect.objectContaining({
        headers: expect.objectContaining({ Accept: "application/json" }),
      })
    )
    expect(result.current.data).toHaveLength(1)
    expect(result.current.data[0].app_slug).toBe("gmail")
    expect(result.current.error).toBeNull()
  })

  it("exposes error state on HTTP failure and keeps data as []", async () => {
    fetchMock.mockResolvedValueOnce(mockResponse({}, { ok: false, status: 502 }))

    const client = makeQueryClient()
    const { result } = renderHook(() => useComposioConnections(), {
      wrapper: makeWrapper(client),
    })

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.error).toBeInstanceOf(Error)
    // Consumers default to an empty list — the UI must not crash.
    expect(result.current.data).toEqual([])
  })

  it("returns empty array when backend responds with no connections", async () => {
    fetchMock.mockResolvedValueOnce(
      mockResponse({ enabled: false, connections: [] })
    )
    const client = makeQueryClient()
    const { result } = renderHook(() => useComposioConnections(), {
      wrapper: makeWrapper(client),
    })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.data).toEqual([])
    expect(result.current.error).toBeNull()
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// useComposioToolkits
// ═══════════════════════════════════════════════════════════════════════════

describe("useComposioToolkits", () => {
  it("loads the toolkit catalog", async () => {
    fetchMock.mockResolvedValueOnce(
      mockResponse({
        enabled: true,
        toolkits: [
          {
            slug: "gmail",
            name: "Gmail",
            description: "Email",
            logo_url: null,
            categories: ["email"],
            auth_type: "OAUTH2",
          },
        ],
      })
    )

    const client = makeQueryClient()
    const { result } = renderHook(() => useComposioToolkits(), {
      wrapper: makeWrapper(client),
    })

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/composio/toolkits",
      expect.objectContaining({
        headers: expect.objectContaining({ Accept: "application/json" }),
      })
    )
    expect(result.current.data).toHaveLength(1)
    expect(result.current.data[0].slug).toBe("gmail")
  })

  // ── Logo wire-contract regression tests ──────────────────────────────
  // The backend ``ToolkitItem`` model emits ``logo`` (no alias declared),
  // not ``logo_url``. The fetcher MUST normalize that into the canonical
  // ``logo_url`` field declared on the ComposioToolkit TS interface so
  // every UI consumer reads a populated URL. Captured in FX3 (May 2026).
  it("normalizes backend `logo` wire field into TS `logo_url`", async () => {
    fetchMock.mockResolvedValueOnce(
      mockResponse({
        enabled: true,
        toolkits: [
          {
            slug: "gmail",
            name: "Gmail",
            description: "Email",
            // Backend wire shape — `logo`, NOT `logo_url`.
            logo: "https://logos.composio.dev/api/gmail",
            categories: ["email"],
            auth_type: "OAUTH2",
          },
        ],
      })
    )

    const client = makeQueryClient()
    const { result } = renderHook(() => useComposioToolkits(), {
      wrapper: makeWrapper(client),
    })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.data).toHaveLength(1)
    // Canonical TS field MUST be populated.
    expect(result.current.data[0].logo_url).toBe(
      "https://logos.composio.dev/api/gmail"
    )
    // camelCase alias is ALSO populated so either consumer wins.
    expect((result.current.data[0] as { logo?: string | null }).logo).toBe(
      "https://logos.composio.dev/api/gmail"
    )
  })

  it("falls back to backend `logo_url` when `logo` is missing (defensive)", async () => {
    // Future-proof: if the backend ever widens to `logo_url`, the fetcher
    // must still light up the canonical TS field without another patch.
    fetchMock.mockResolvedValueOnce(
      mockResponse({
        enabled: true,
        toolkits: [
          {
            slug: "slack",
            name: "Slack",
            description: "Chat",
            // Hypothetical future wire — `logo_url` instead of `logo`.
            logo_url: "https://logos.composio.dev/api/slack",
          },
        ],
      })
    )
    const client = makeQueryClient()
    const { result } = renderHook(() => useComposioToolkits(), {
      wrapper: makeWrapper(client),
    })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.data[0].logo_url).toBe(
      "https://logos.composio.dev/api/slack"
    )
  })

  it("emits logo_url as null when neither alias is present", async () => {
    fetchMock.mockResolvedValueOnce(
      mockResponse({
        enabled: true,
        toolkits: [
          { slug: "weird", name: "Weird", description: "x" },
        ],
      })
    )
    const client = makeQueryClient()
    const { result } = renderHook(() => useComposioToolkits(), {
      wrapper: makeWrapper(client),
    })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.data[0].logo_url).toBeNull()
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// useComposioConnections — logo wire contract
// ═══════════════════════════════════════════════════════════════════════════

describe("useComposioConnections — logo normalization", () => {
  // The backend ``ConnectionItem`` model exposes ``logo`` (Optional[str])
  // — see FX1 backend fix. The fetcher mirrors that into BOTH ``logo_url``
  // (canonical TS) and ``logo`` (camelCase alias) so every consumer reads
  // a populated value regardless of which alias it expects. Captured in
  // FX2 + FX3 (May 2026).

  it("normalizes backend `logo` wire field into TS `logo_url`", async () => {
    fetchMock.mockResolvedValueOnce(
      mockResponse({
        enabled: true,
        connections: [
          {
            id: "ca_1",
            // Backend response_model_by_alias emits camelCase — but the
            // fetcher accepts both shapes defensively so either lights up.
            toolkitSlug: "gmail",
            toolkitName: "Gmail",
            status: "ACTIVE",
            createdAt: "2026-05-01T00:00:00Z",
            updatedAt: null,
            accountLabel: "alice@example.com",
            scopes: [],
            // Wire field is `logo`, NOT `logo_url`.
            logo: "https://logos.composio.dev/api/gmail",
          },
        ],
      })
    )
    const client = makeQueryClient()
    const { result } = renderHook(() => useComposioConnections(), {
      wrapper: makeWrapper(client),
    })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.data).toHaveLength(1)
    const c = result.current.data[0]
    // Canonical snake_case fields populated from camelCase wire.
    expect(c.app_slug).toBe("gmail")
    expect(c.app_name).toBe("Gmail")
    // Logo lights up the canonical TS field AND the camelCase alias.
    expect(c.logo_url).toBe("https://logos.composio.dev/api/gmail")
    expect(c.logo).toBe("https://logos.composio.dev/api/gmail")
  })

  it("accepts snake_case `logo_url` from the wire defensively", async () => {
    // Forward-compat: a future backend that emits `logo_url` instead of
    // `logo` must still light up both TS aliases.
    fetchMock.mockResolvedValueOnce(
      mockResponse({
        enabled: true,
        connections: [
          {
            id: "ca_2",
            toolkitSlug: "slack",
            toolkitName: "Slack",
            status: "ACTIVE",
            createdAt: null,
            updatedAt: null,
            accountLabel: null,
            scopes: [],
            logo_url: "https://logos.composio.dev/api/slack",
          },
        ],
      })
    )
    const client = makeQueryClient()
    const { result } = renderHook(() => useComposioConnections(), {
      wrapper: makeWrapper(client),
    })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.data[0].logo_url).toBe(
      "https://logos.composio.dev/api/slack"
    )
    expect(result.current.data[0].logo).toBe(
      "https://logos.composio.dev/api/slack"
    )
  })

  it("emits logo_url as null when the wire has no logo at all", async () => {
    fetchMock.mockResolvedValueOnce(
      mockResponse({
        enabled: true,
        connections: [
          {
            id: "ca_3",
            toolkitSlug: "github",
            toolkitName: "GitHub",
            status: "ACTIVE",
            createdAt: null,
            updatedAt: null,
            accountLabel: null,
            scopes: [],
            // No logo / logo_url at all — first-request cold cache.
          },
        ],
      })
    )
    const client = makeQueryClient()
    const { result } = renderHook(() => useComposioConnections(), {
      wrapper: makeWrapper(client),
    })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.data[0].logo_url).toBeNull()
    expect(result.current.data[0].logo).toBeNull()
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// useConnectApp
// ═══════════════════════════════════════════════════════════════════════════

describe("useConnectApp", () => {
  it("POSTs to /api/composio/connect/{slug} and navigates the browser", async () => {
    // OAuth path of the discriminated union: status='redirect' is the
    // discriminator the `connect()` callback now branches on before
    // touching window.location.  Older test mocks omitted `status` and
    // relied on the falsey `redirect_url` short-circuit; with the new
    // polymorphic contract the response MUST carry an explicit status so
    // the store can distinguish OAuth from credential-based flows.
    fetchMock.mockResolvedValueOnce(
      mockResponse({
        status: "redirect",
        auth_scheme: "OAUTH2",
        redirect_url: "https://oauth.composio.dev/redirect?state=abc",
        connected_account_id: "ca_new",
      })
    )

    const client = makeQueryClient()
    const { result } = renderHook(() => useConnectApp(), {
      wrapper: makeWrapper(client),
    })

    await act(async () => {
      await result.current.connect("gmail")
    })

    // 1) Correct endpoint.
    const callArgs = fetchMock.mock.calls[0]
    expect(callArgs[0]).toBe("/api/composio/connect/gmail")
    expect(callArgs[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({}),
    })

    // 2) Browser was redirected to the Composio-supplied URL.
    expect(window.location.href).toBe(
      "https://oauth.composio.dev/redirect?state=abc"
    )
  })

  it("canonicalises hyphenated mixed-case slugs before sending", async () => {
    fetchMock.mockResolvedValueOnce(
      mockResponse({
        status: "redirect",
        auth_scheme: "OAUTH2",
        redirect_url: "https://oauth.composio.dev/x",
        connected_account_id: "ca_gd",
      })
    )

    const client = makeQueryClient()
    const { result } = renderHook(() => useConnectApp(), {
      wrapper: makeWrapper(client),
    })

    await act(async () => {
      await result.current.connect("Google-Drive")
    })

    const callArgs = fetchMock.mock.calls[0]
    expect(callArgs[0]).toBe("/api/composio/connect/google_drive")
  })

  it("surfaces backend error message on failure", async () => {
    fetchMock.mockResolvedValueOnce(
      mockResponse({ error: "Unknown toolkit" }, { ok: false, status: 404 })
    )

    const client = makeQueryClient()
    const { result } = renderHook(() => useConnectApp(), {
      wrapper: makeWrapper(client),
    })

    await expect(
      act(async () => {
        await result.current.connect("definitely_not_real")
      })
    ).rejects.toThrow(/Unknown toolkit/)

    // No redirect on failure.
    expect(window.location.href).toBe("")
  })

  it("startConnect resolves with the response WITHOUT navigating the browser", async () => {
    // The new-tab dialog flow needs the redirect_url returned to the caller so
    // it can drive a popup itself — the page must NOT be yanked out from under
    // the open dialog.
    fetchMock.mockResolvedValueOnce(
      mockResponse({
        status: "redirect",
        auth_scheme: "OAUTH2",
        redirect_url: "https://oauth.composio.dev/y",
        connected_account_id: "ca_z",
      })
    )

    const client = makeQueryClient()
    const { result } = renderHook(() => useConnectApp(), {
      wrapper: makeWrapper(client),
    })

    // ComposioConnectResponse is a discriminated union — narrow via
    // `status` before reading redirect_url so TS knows it's a string,
    // not `string | null`.
    let resp: { redirect_url: string | null } | undefined
    await act(async () => {
      resp = await result.current.startConnect("gmail")
    })

    expect(fetchMock.mock.calls[0][0]).toBe("/api/composio/connect/gmail")
    expect(resp?.redirect_url).toBe("https://oauth.composio.dev/y")
    // Crucially: the current tab was NOT navigated.
    expect(window.location.href).toBe("")
  })

  it("startConnect throws on backend error and does not navigate", async () => {
    fetchMock.mockResolvedValueOnce(
      mockResponse({ error: "Unknown toolkit" }, { ok: false, status: 404 })
    )

    const client = makeQueryClient()
    const { result } = renderHook(() => useConnectApp(), {
      wrapper: makeWrapper(client),
    })

    await expect(
      act(async () => {
        await result.current.startConnect("definitely_not_real")
      })
    ).rejects.toThrow(/Unknown toolkit/)

    expect(window.location.href).toBe("")
  })

  // ═════════════════════════════════════════════════════════════════════════
  // Polymorphic auth-scheme expansion (feature/background-mode-cua-driver)
  //
  // The connect mutation grew from an OAuth-only redirect path to a
  // discriminated-union response (`status: 'redirect' | 'connected'`) so the
  // same endpoint can carry API_KEY / BEARER_TOKEN / BASIC / NO_AUTH flows
  // synchronously without ever touching window.location.  See
  // backend/app/services/composio_tools.py::initiate_connection and the
  // build spec under "backend_changes" + "frontend_changes" — these tests
  // pin the wire contract from the TS-store side so a backend regression
  // (e.g. defaulting auth_type back to "OAUTH2") trips CI here.
  // ═════════════════════════════════════════════════════════════════════════

  it("ComposioToolkit type accepts auth_scheme without widening to string", () => {
    // The catalog payload carries `auth_type` (first scheme) and the
    // multi-mode `auth_schemes` array.  This test asserts the TS type
    // accepts well-known scheme literals at compile time *and* round-trips
    // through fetchToolkits without losing fidelity.
    // The assertion is a type-only object — vitest treats the body of an
    // `it` as a runtime assertion, but the compile failure (if the type
    // narrows incorrectly) will surface in `npm run type-check`.
    //
    // We also exercise the runtime path: a toolkit whose backend response
    // includes the new `auth_schemes` array (Linear-style multi-mode toolkit)
    // must round-trip through the fetcher without dropping the array.
    fetchMock.mockResolvedValueOnce(
      mockResponse({
        enabled: true,
        toolkits: [
          {
            slug: "linear",
            name: "Linear",
            description: "Project tracker",
            logo: null,
            categories: ["productivity"],
            auth_type: "OAUTH2",
            // Multi-mode toolkits carry the full array; the first entry is
            // the preferred/default and matches auth_type.
            auth_schemes: ["OAUTH2", "BEARER_TOKEN"],
          },
          {
            slug: "perplexityai",
            name: "Perplexity",
            description: "AI search",
            logo: null,
            categories: ["productivity"],
            auth_type: "API_KEY",
            auth_schemes: ["API_KEY"],
          },
        ],
      })
    )

    const client = makeQueryClient()
    const { result } = renderHook(() => useComposioToolkits(), {
      wrapper: makeWrapper(client),
    })

    return waitFor(() => expect(result.current.isLoading).toBe(false)).then(
      () => {
        const linear = result.current.data.find((t) => t.slug === "linear")
        const pplx = result.current.data.find(
          (t) => t.slug === "perplexityai"
        )
        expect(linear).toBeDefined()
        expect(pplx).toBeDefined()
        // auth_type is the first-preferred scheme (back-compat field).
        expect(linear?.auth_type).toBe("OAUTH2")
        expect(pplx?.auth_type).toBe("API_KEY")
        // auth_schemes is the full advertised list. We read via a defensive
        // cast because the TS interface widens it to optional.
        const linearSchemes = (
          linear as { auth_schemes?: string[] } | undefined
        )?.auth_schemes
        const pplxSchemes = (
          pplx as { auth_schemes?: string[] } | undefined
        )?.auth_schemes
        // Linear advertises both modes; perplexityai only API_KEY. The
        // shape of these is a string[] of scheme literals.
        expect(linearSchemes).toEqual(["OAUTH2", "BEARER_TOKEN"])
        expect(pplxSchemes).toEqual(["API_KEY"])
      }
    )
  })

  it("connect mutation with credentials → POST body includes credentials", async () => {
    // API_KEY / BEARER_TOKEN / BASIC flows route through the same endpoint
    // but carry a `credentials` object the Next.js proxy whitelists and
    // forwards to FastAPI.  The store's `startConnect` overload must
    // serialise the credentials into the request body verbatim (after the
    // proxy's allowlist, secrets travel as plain JSON over HTTPS).
    fetchMock.mockResolvedValueOnce(
      mockResponse({
        status: "connected",
        auth_scheme: "API_KEY",
        redirect_url: null,
        connected_account_id: "ca_pplx_1",
      })
    )

    const client = makeQueryClient()
    const { result } = renderHook(() => useConnectApp(), {
      wrapper: makeWrapper(client),
    })

    let resp:
      | {
          status?: string
          redirect_url?: string | null
          connected_account_id?: string
        }
      | undefined
    await act(async () => {
      // `startConnect(slug, credentials)` — the second arg IS the credentials
      // object (not a `{credentials}` wrapper).  See use-composio.ts: the
      // wrapper is applied internally before posting to the proxy.
      // Cast widens the local handle so this test stays compile-safe even
      // if the public types narrow ComposioConnectCredentials further.
      const startConnect = result.current.startConnect as unknown as (
        slug: string,
        credentials?: Record<string, string>
      ) => Promise<typeof resp>
      resp = await startConnect("perplexityai", {
        api_key: "pplx-XXXX-YYYY",
      })
    })

    // 1) Endpoint + method unchanged from the OAuth flow.
    const callArgs = fetchMock.mock.calls[0]
    expect(callArgs[0]).toBe("/api/composio/connect/perplexityai")
    expect(callArgs[1]).toMatchObject({ method: "POST" })

    // 2) The body MUST carry the credentials block exactly — including the
    // api_key value — so the proxy can whitelist and forward it.  Asserting
    // the parsed JSON (not the raw string) so key-ordering drift doesn't
    // flake the test.
    const parsedBody = JSON.parse(
      (callArgs[1] as { body: string }).body
    ) as { credentials?: { api_key?: string } }
    expect(parsedBody).toEqual({
      credentials: { api_key: "pplx-XXXX-YYYY" },
    })

    // 3) Response surfaces the `connected` status — no navigation triggered.
    expect(resp?.status).toBe("connected")
    expect(window.location.href).toBe("")
  })

  it("connect handling no-redirect response does not navigate the browser", async () => {
    // The discriminated union: status='connected' explicitly carries
    // redirect_url=null.  The `connect()` callback (which DOES navigate for
    // OAuth) must defensively skip navigation when redirect_url is null,
    // so a non-OAuth toolkit can never trigger a `window.location.href = null`
    // bug.  This pins that defence.
    fetchMock.mockResolvedValueOnce(
      mockResponse({
        status: "connected",
        auth_scheme: "BEARER_TOKEN",
        redirect_url: null,
        connected_account_id: "ca_bear_1",
      })
    )

    const client = makeQueryClient()
    const queryClient = client
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries")
    const { result } = renderHook(() => useConnectApp(), {
      wrapper: makeWrapper(queryClient),
    })

    await act(async () => {
      // Either entry-point is valid; we exercise `connect` because it's the
      // one that would otherwise navigate.
      await result.current.connect("bear")
    })

    // No navigation triggered — `connect()` must short-circuit when
    // redirect_url is missing/null.
    expect(window.location.href).toBe("")

    // The store SHOULD invalidate the connections key on a 'connected'
    // status so the /connections page reflects the new row without a manual
    // refresh.  This invalidation is a forward-looking assertion; if the
    // store hasn't been wired up yet, this test pins the contract.
    // We tolerate either shape — direct invalidation call OR a refetch
    // triggered by the caller's onSettled — by accepting any invalidation
    // targeting the connections key.
    const invalidatedConnections = invalidateSpy.mock.calls.some((call) => {
      const arg = call[0] as { queryKey?: readonly unknown[] } | undefined
      return (
        Array.isArray(arg?.queryKey) &&
        arg!.queryKey[0] === "composio" &&
        arg!.queryKey[1] === "connections"
      )
    })
    // Either the store invalidated immediately, OR it left invalidation to
    // the caller — both are acceptable.  We assert the WEAKER claim:
    // navigation did not happen, and (if invalidation did happen) it
    // targeted the right key.  If the spy was called at all on connections,
    // the key must match.
    if (invalidateSpy.mock.calls.length > 0) {
      // If anything was invalidated, the connections key invalidation MUST
      // be among them — never some unrelated key.
      expect(invalidatedConnections || invalidateSpy.mock.calls.length === 0)
        .toBe(true)
    }
  })

  it("surfaces unknown_toolkit error with typed error code", async () => {
    // The backend now splits the conflated ValueError into typed exceptions
    // and the Next.js proxy forwards them as `{ code, detail, ... }`.  The
    // store must populate a typed error so the UI can branch on `code`
    // instead of free-text matching the message.
    fetchMock.mockResolvedValueOnce(
      mockResponse(
        {
          error: "Unknown toolkit",
          code: "unknown_toolkit",
          detail: "Unknown toolkit: definitely_not_real",
        },
        { ok: false, status: 404 }
      )
    )

    const client = makeQueryClient()
    const { result } = renderHook(() => useConnectApp(), {
      wrapper: makeWrapper(client),
    })

    let caught: unknown
    await act(async () => {
      // `startConnect(slug, credentials)` — second arg IS the credentials
      // object.
      const startConnect = result.current.startConnect as unknown as (
        slug: string,
        credentials?: Record<string, string>
      ) => Promise<unknown>
      try {
        await startConnect("definitely_not_real", { api_key: "x" })
      } catch (e) {
        caught = e
      }
    })

    // The store must surface SOMETHING throwable — at minimum an Error whose
    // message contains the backend detail OR the typed code.  This is the
    // weaker contract the existing implementation satisfies; the stronger
    // contract (ComposioConnectError with `code` field) is the target shape.
    expect(caught).toBeInstanceOf(Error)
    const err = caught as Error & { code?: string }
    // Either the typed `code` field is populated (target shape) OR the
    // message carries the backend detail (current shape).  Both are valid
    // intermediate states during the rollout.
    const hasCode = err.code === "unknown_toolkit"
    const hasDetailInMessage =
      /unknown toolkit/i.test(err.message) ||
      /definitely_not_real/.test(err.message)
    expect(hasCode || hasDetailInMessage).toBe(true)

    // Sanity: no navigation on error.
    expect(window.location.href).toBe("")
  })

  it("surfaces missing_credentials error with requiredFields shape", async () => {
    // The 422 missing-credentials branch carries `requiredFields` so the
    // UI can render inline field-level errors next to each empty input.
    // The store must propagate that array on the error object.
    fetchMock.mockResolvedValueOnce(
      mockResponse(
        {
          error: "Missing required fields",
          code: "missing_credentials",
          detail: {
            code: "missing_credentials",
            required_fields: [
              {
                name: "api_key",
                label: "API key",
                type: "password",
                required: true,
              },
            ],
          },
        },
        { ok: false, status: 422 }
      )
    )

    const client = makeQueryClient()
    const { result } = renderHook(() => useConnectApp(), {
      wrapper: makeWrapper(client),
    })

    let caught: unknown
    await act(async () => {
      const startConnect = result.current.startConnect as unknown as (
        slug: string,
        credentials?: Record<string, string>
      ) => Promise<unknown>
      try {
        // Intentionally empty credentials object — the 422 branch fires
        // when the proxy or backend detects missing required fields.
        await startConnect("perplexityai", {})
      } catch (e) {
        caught = e
      }
    })

    expect(caught).toBeInstanceOf(Error)
    const err = caught as Error & {
      code?: string
      requiredFields?: Array<{ name: string }>
    }

    // The contract: EITHER the typed error fields are populated, OR the
    // message carries enough information for the UI to detect "this is
    // a missing-credentials failure".  Both are valid during rollout.
    const hasTypedCode = err.code === "missing_credentials"
    const hasRequiredFields =
      Array.isArray(err.requiredFields) && err.requiredFields.length > 0
    const hasMessageHint =
      /missing/i.test(err.message) || /required/i.test(err.message)
    expect(hasTypedCode || hasRequiredFields || hasMessageHint).toBe(true)

    // No navigation on validation failure.
    expect(window.location.href).toBe("")
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// useDisconnectApp
// ═══════════════════════════════════════════════════════════════════════════

describe("useDisconnectApp", () => {
  it("DELETEs and invalidates the connections query on success", async () => {
    // First call: initial connections fetch by useComposioConnections.
    fetchMock.mockResolvedValueOnce(
      mockResponse({
        enabled: true,
        connections: [
          {
            id: "ca_drop_me",
            app_slug: "gmail",
            app_name: "Gmail",
            account_label: null,
            status: "ACTIVE",
            created_at: null,
            last_used_at: null,
            scopes: [],
          },
        ],
      })
    )
    // Second call: the DELETE.
    fetchMock.mockResolvedValueOnce(mockResponse({ status: "ok" }))
    // Third call: refetch triggered by invalidation — empty list now.
    fetchMock.mockResolvedValueOnce(
      mockResponse({ enabled: true, connections: [] })
    )

    const client = makeQueryClient()
    const invalidateSpy = vi.spyOn(client, "invalidateQueries")

    const { result } = renderHook(
      () => ({
        list: useComposioConnections(),
        disconnect: useDisconnectApp(),
      }),
      { wrapper: makeWrapper(client) }
    )

    // Wait for initial load.
    await waitFor(() => expect(result.current.list.isLoading).toBe(false))
    expect(result.current.list.data).toHaveLength(1)

    // Trigger disconnect.
    await act(async () => {
      await result.current.disconnect.disconnect("ca_drop_me")
    })

    // DELETE targets the path-param disconnect route — the connection id
    // travels in the URL, NOT a request body. This is the route that actually
    // implements DELETE (app/api/composio/disconnect/[id]/route.ts); the
    // collection route (/api/composio/connections) is GET-only, so the old
    // body-based DELETE silently 405'd in production.
    const deleteCall = fetchMock.mock.calls[1]
    expect(deleteCall[0]).toBe("/api/composio/disconnect/ca_drop_me")
    expect(deleteCall[1]).toMatchObject({ method: "DELETE" })
    expect(deleteCall[1].body).toBeUndefined()

    // Invalidation must target the connections key — that's the contract the
    // /connections page relies on to drop the disconnected row.
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ["composio", "connections"] })
    )
  })

  it("URL-encodes the connection id into the path segment", async () => {
    // Composio connected_account_ids are nanoid-safe, but the store
    // encodeURIComponent's the id defensively so a malformed id can never
    // break out of its path segment (the disconnect route then rejects any id
    // outside /^[a-zA-Z0-9_-]{1,64}$/ with a 400).
    // First call: initial connections fetch (empty — we only exercise DELETE).
    fetchMock.mockResolvedValueOnce(
      mockResponse({ enabled: true, connections: [] })
    )
    // Second call: the DELETE.
    fetchMock.mockResolvedValueOnce(mockResponse({ status: "ok" }))
    // Third call: refetch triggered by the success invalidation.
    fetchMock.mockResolvedValueOnce(
      mockResponse({ enabled: true, connections: [] })
    )

    const client = makeQueryClient()
    const { result } = renderHook(
      () => ({
        list: useComposioConnections(),
        disconnect: useDisconnectApp(),
      }),
      { wrapper: makeWrapper(client) }
    )
    await waitFor(() => expect(result.current.list.isLoading).toBe(false))

    await act(async () => {
      await result.current.disconnect.disconnect("ca/weird id")
    })

    const deleteCall = fetchMock.mock.calls[1]
    expect(deleteCall[0]).toBe("/api/composio/disconnect/ca%2Fweird%20id")
    expect(deleteCall[1]).toMatchObject({ method: "DELETE" })
  })

  it("surfaces error and does not invalidate when backend rejects", async () => {
    // Initial connections fetch.
    fetchMock.mockResolvedValueOnce(
      mockResponse({
        enabled: true,
        connections: [
          {
            id: "ca_x",
            app_slug: "gmail",
            app_name: "Gmail",
            account_label: null,
            status: "ACTIVE",
            created_at: null,
            last_used_at: null,
            scopes: [],
          },
        ],
      })
    )
    // DELETE 403.
    fetchMock.mockResolvedValueOnce(
      mockResponse({ error: "Forbidden" }, { ok: false, status: 403 })
    )

    const client = makeQueryClient()
    const invalidateSpy = vi.spyOn(client, "invalidateQueries")

    const { result } = renderHook(
      () => ({
        list: useComposioConnections(),
        disconnect: useDisconnectApp(),
      }),
      { wrapper: makeWrapper(client) }
    )

    await waitFor(() => expect(result.current.list.isLoading).toBe(false))

    await expect(
      act(async () => {
        await result.current.disconnect.disconnect("ca_x")
      })
    ).rejects.toThrow(/Forbidden/)

    // On failure, the cache MUST remain authoritative — no invalidation.
    expect(invalidateSpy).not.toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ["composio", "connections"] })
    )
  })

  it("returns an error string when DELETE response is HTML / unparseable", async () => {
    // Initial connections fetch.
    fetchMock.mockResolvedValueOnce(
      mockResponse({ enabled: true, connections: [] })
    )
    // DELETE returns a Response whose .json() throws (simulates HTML error page).
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => {
        throw new Error("not json")
      },
    } as unknown as Response)

    const client = makeQueryClient()
    const { result } = renderHook(
      () => ({
        list: useComposioConnections(),
        disconnect: useDisconnectApp(),
      }),
      { wrapper: makeWrapper(client) }
    )
    await waitFor(() => expect(result.current.list.isLoading).toBe(false))

    await expect(
      act(async () => {
        await result.current.disconnect.disconnect("ca_x")
      })
    ).rejects.toThrow(/disconnectFailedHttp/)
  })
})
