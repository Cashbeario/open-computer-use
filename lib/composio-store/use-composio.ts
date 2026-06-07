"use client"

/**
 * Composio store — query + mutation hooks.
 *
 * All hooks key off of TanStack Query (already provided app-wide by
 * lib/tanstack-query/tanstack-query-provider.tsx). The per-chat picker
 * hooks bridge into the Context exported from ./provider.
 *
 * Query keys:
 *   ["composio", "connections"] — user's connected accounts
 *   ["composio", "toolkits"]    — full catalogue
 *
 * Stale times:
 *   connections — 30s, refetchOnWindowFocus enabled (status can change
 *     when the user completes OAuth in another tab)
 *   toolkits    — 60s, focus refetch left to TanStack defaults (off)
 */

import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"
import { useTranslations } from "next-intl"
import { useCallback, useMemo } from "react"
import { useComposioContext } from "./provider"
import {
  ComposioConnectError,
  type ComposioConnectCredentials,
  type ComposioConnectErrorCode,
  type ComposioConnection,
  type ComposioConnectionsResponse,
  type ComposioConnectResponse,
  type ComposioRequiredField,
  type ComposioToolkit,
  type ComposioToolkitInfo,
  type ComposioToolkitsResponse,
} from "./types"

const CONNECTIONS_KEY = ["composio", "connections"] as const
const TOOLKITS_KEY = ["composio", "toolkits"] as const
const TOOLKIT_INFO_KEY = (slug: string) =>
  ["composio", "toolkit-info", slug.toLowerCase()] as const

const STALE_CONNECTIONS_MS = 30_000
const STALE_TOOLKITS_MS = 60_000
// Toolkit-info responses are stable (auth scheme rarely changes for a
// given app), so 5 min keeps the lazy fetches cheap. The dialog only
// fetches when the user actually opens the confirm step, so the cache is
// warm by the time they click Connect.
const STALE_TOOLKIT_INFO_MS = 5 * 60_000

// ── Internal fetchers ──────────────────────────────────────────────
//
// Fetchers are built via factories that receive a `next-intl` translator
// so any thrown error messages are localized. Hooks below bind a
// translator scoped to the `connections.errors` namespace via
// `useTranslations` and memoise the resulting fetcher.

type ErrorsT = (
  key:
    | "loadConnectionsFailed"
    | "loadToolkitsFailed"
    | "startConnectionFailed"
    | "disconnectFailedHttp"
    | "unknownToolkit"
    | "unsupportedAuthScheme"
    | "missingCredentials"
    | "invalidCredentials"
    | "credentialValidationFailed"
    | "composioUnavailable",
  values?: Record<string, string | number>
) => string

/**
 * Backend FastAPI error payloads come back as either the FastAPI default
 * `{ detail: "..." | { code, message, requiredFields? } }` or the Next.js
 * proxy wrapper `{ error: "..." }`. This helper parses both into a typed
 * shape without throwing on malformed JSON.
 */
async function parseConnectErrorBody(res: Response): Promise<{
  code?: ComposioConnectErrorCode
  message?: string
  requiredFields?: ComposioRequiredField[]
}> {
  const synthesizeFor5xx = (
    parsed: {
      code?: ComposioConnectErrorCode
      message?: string
      requiredFields?: ComposioRequiredField[]
    },
  ): {
    code?: ComposioConnectErrorCode
    message?: string
    requiredFields?: ComposioRequiredField[]
  } => {
    // Defence in depth: if the backend regressed and forwarded raw upstream
    // HTML (e.g. a Cloudflare 520 page) without a structured code, refuse
    // to bubble it. Synthesize `upstream_unavailable` so the localized
    // friendly copy + Retry button kicks in regardless. Status-code-based,
    // so this triggers for the Cloudflare 520→ Next.js proxy 502/503 chain
    // even if the body has no type tag.
    if (!parsed.code && res.status >= 500) {
      return { ...parsed, code: "upstream_unavailable", message: undefined }
    }
    return parsed
  }
  try {
    const body = (await res.json()) as {
      error?: string
      detail?:
        | string
        | {
            code?: ComposioConnectErrorCode
            message?: string
            error?: string
            type?: string
            required_fields?: ComposioRequiredField[]
            requiredFields?: ComposioRequiredField[]
          }
    }
    if (typeof body.detail === "object" && body.detail !== null) {
      const d = body.detail
      // The backend's structured detail uses `type` as the discriminator
      // (`_detail(error, type_)` in backend/app/api/routes/composio.py).
      // The Next.js proxy at app/api/composio/connect/[app]/route.ts
      // forwards the body unchanged in some paths, so we must read BOTH
      // `code` and `type` to find the discriminator, and BOTH `message`
      // and `error` to find the human-readable string.
      const parsed = {
        code: (d.code ?? (d.type as ComposioConnectErrorCode | undefined)),
        message: d.message ?? d.error ?? body.error,
        requiredFields: d.requiredFields ?? d.required_fields,
      }
      return synthesizeFor5xx(parsed)
    }
    return synthesizeFor5xx({
      message:
        (typeof body.detail === "string" ? body.detail : undefined) ??
        body.error,
    })
  } catch {
    // JSON parse failed — likely raw HTML body. Synthesize the same
    // structured code so the user gets the friendly message, not [object Object].
    return synthesizeFor5xx({})
  }
}

/**
 * Translate a backend `code` + status into a localised error message
 * using the `connections.errors.*` namespace. Falls back to the raw
 * backend message, then to a generic HTTP message.
 */
function localizeConnectError(
  t: ErrorsT,
  code: ComposioConnectErrorCode | undefined,
  status: number,
  backendMessage: string | undefined,
  requiredFields: ComposioRequiredField[] | undefined
): string {
  switch (code) {
    case "unknown_toolkit":
      return t("unknownToolkit")
    case "unsupported_auth_scheme":
      return t("unsupportedAuthScheme")
    case "missing_credentials": {
      const fields = (requiredFields ?? [])
        .map((f) => f.label || f.name)
        .join(", ")
      return t("missingCredentials", { fields: fields || "" })
    }
    case "invalid_credentials":
      return t("invalidCredentials")
    case "credential_validation_failed":
      return t("credentialValidationFailed")
    case "upstream_unavailable":
    case "composio_unavailable":
      // ALWAYS use the localized friendly copy for upstream outages —
      // never `backendMessage`, which on a Cloudflare 520 leak path could
      // contain raw HTML body text from Composio's edge error page.
      return t("composioUnavailable")
    default:
      // Belt-and-braces: even with no structured code, a 5xx status means
      // the failure is on the upstream side and the user shouldn't see
      // whatever string the backend forwarded. (parseConnectErrorBody
      // synthesizes `upstream_unavailable` for this case, so this default
      // branch is essentially dead — kept for paranoia.)
      if (status >= 500) {
        return t("composioUnavailable")
      }
      return backendMessage || t("startConnectionFailed", { status })
  }
}

/**
 * Strip HTML tags and clamp length on an error string. Last-line defence
 * against any future code path that forwards raw upstream HTML (e.g. a
 * Cloudflare 520 body) into the user-facing error pill. We render the
 * result as plain JSX text (React escapes anyway), so this is purely a
 * UX guard against multi-KB walls of HTML showing up in a 12px red pill.
 */
function sanitizeErrorForDisplay(raw: string): string {
  if (!raw) return raw
  // Drop anything that looks like an HTML tag — Cloudflare 520 bodies
  // include <html>, <head>, <body>, <h1>, etc. as inline text.
  const stripped = raw.replace(/<[^>]*>/g, "").trim()
  // Clamp at 280 chars — toast-friendly. Anything longer is almost
  // certainly an upstream HTML body or a stack trace.
  return stripped.length > 280 ? stripped.slice(0, 277) + "..." : stripped
}

function makeFetchConnections(t: ErrorsT) {
  return async function fetchConnections(): Promise<ComposioConnection[]> {
    const res = await fetch("/api/composio/connections", {
      headers: { Accept: "application/json" },
    })
    if (!res.ok) {
      throw new Error(t("loadConnectionsFailed", { status: res.status }))
    }
    const data: ComposioConnectionsResponse = await res.json()
    const raw = (data?.connections ?? []) as unknown as Array<
      Record<string, unknown>
    >
    // Backend (FastAPI) emits ConnectionItem with `response_model_by_alias=True`,
    // so the wire keys are camelCase (`toolkitSlug`, `toolkitName`,
    // `createdAt`, `updatedAt`, `lastUsedAt`, `accountLabel`). The canonical
    // TS shape `ComposioConnection` is snake_case, so we remap from the
    // wire keys into both snake_case (canonical) and camelCase (alias)
    // fields so every consumer reads a populated value regardless of which
    // shape it expects.
    //
    // Logo is not in the backend ConnectionItem model today but we read
    // both potential keys defensively so a future backend widening shows
    // up without another patch.
    return raw.map((c) => {
      const toolkitSlug = (c.toolkitSlug ?? c.app_slug ?? "") as string
      const toolkitName = (c.toolkitName ?? c.app_name ?? "") as string
      const createdAt = (c.createdAt ?? c.created_at ?? null) as
        | string
        | null
      const lastUsedAt = (c.lastUsedAt ?? c.last_used_at ?? null) as
        | string
        | null
      const accountLabel = (c.accountLabel ?? c.account_label ?? null) as
        | string
        | null
      const scopes = Array.isArray(c.scopes) ? (c.scopes as string[]) : []
      const logo = ((c as { logo_url?: string | null }).logo_url ??
        (c as { logo?: string | null }).logo ??
        null) as string | null
      return {
        ...(c as unknown as ComposioConnection),
        // Canonical snake_case fields the TS interface promises.
        app_slug: toolkitSlug,
        app_name: toolkitName,
        created_at: createdAt,
        last_used_at: lastUsedAt,
        account_label: accountLabel,
        scopes,
        logo_url: logo,
        logo,
        // camelCase aliases for UI consumers.
        toolkitSlug,
        toolkitName,
        createdAt,
        updatedAt: lastUsedAt,
      }
    })
  }
}

function makeFetchToolkits(t: ErrorsT) {
  return async function fetchToolkits(): Promise<ComposioToolkit[]> {
    const res = await fetch("/api/composio/toolkits", {
      headers: { Accept: "application/json" },
    })
    if (!res.ok) {
      throw new Error(t("loadToolkitsFailed", { status: res.status }))
    }
    const data: ComposioToolkitsResponse = await res.json()
    const raw = (data?.toolkits ?? []) as unknown as Array<
      Record<string, unknown>
    >
    // Backend wire field is `logo` (ToolkitItem.logo, no alias on the model),
    // so the catalogue logo URL arrives as `tk.logo`. The canonical TS field
    // is `logo_url` (with `logo` as a camelCase alias). Read both potential
    // keys and write both so every downstream consumer renders the same URL
    // regardless of which alias it reads.
    return raw.map((tk) => {
      const logo = ((tk as { logo?: string | null }).logo ??
        (tk as { logo_url?: string | null }).logo_url ??
        null) as string | null
      return {
        ...(tk as unknown as ComposioToolkit),
        logo_url: logo,
        logo,
      }
    })
  }
}

function makePostConnect(t: ErrorsT) {
  return async function postConnect(
    toolkitSlug: string,
    extra?: { credentials?: ComposioConnectCredentials }
  ): Promise<ComposioConnectResponse> {
    const slug = toolkitSlug.trim().toLowerCase().replace(/-/g, "_")
    // Send `{ credentials }` only when the caller supplies them, so the
    // OAuth path remains a literal `{}` body — preserves byte-identical
    // wire shape for OAuth toolkits, and lets the Next.js proxy
    // (`app/api/composio/connect/[app]/route.ts`) decide whether to
    // forward credentials to FastAPI.
    const hasCreds =
      extra?.credentials &&
      Object.keys(extra.credentials).length > 0
    const res = await fetch(
      `/api/composio/connect/${encodeURIComponent(slug)}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(
          hasCreds ? { credentials: extra!.credentials } : {}
        ),
      }
    )
    if (!res.ok) {
      const parsed = await parseConnectErrorBody(res)
      const code: ComposioConnectErrorCode = parsed.code ?? "unknown"
      const localized = localizeConnectError(
        t,
        parsed.code,
        res.status,
        parsed.message,
        parsed.requiredFields
      )
      throw new ComposioConnectError({
        code,
        status: res.status,
        message: sanitizeErrorForDisplay(localized),
        requiredFields: parsed.requiredFields,
      })
    }
    return (await res.json()) as ComposioConnectResponse
  }
}

function makeDeleteConnection(t: ErrorsT) {
  return async function deleteConnection(connectionId: string): Promise<void> {
    // Revoke via the path-param route `DELETE /api/composio/disconnect/{id}`,
    // which validates the id against `/^[a-zA-Z0-9_-]{1,64}$/` and proxies to
    // the FastAPI backend `DELETE /api/composio/connections/{id}`. The id is
    // the Composio connected_account_id (a nanoid) and is already URL-safe,
    // but we encodeURIComponent it defensively so a malformed id can never
    // escape its path segment. The id travels entirely in the URL — there is
    // no request body (the disconnect route reads only the path param).
    const res = await fetch(
      `/api/composio/disconnect/${encodeURIComponent(connectionId)}`,
      {
        method: "DELETE",
        headers: { Accept: "application/json" },
      }
    )
    if (!res.ok) {
      const parsed = await parseConnectErrorBody(res)
      const code: ComposioConnectErrorCode = parsed.code ?? "upstream"
      throw new ComposioConnectError({
        code,
        status: res.status,
        message:
          parsed.message ?? t("disconnectFailedHttp", { status: res.status }),
      })
    }
  }
}

// ── Public hooks ───────────────────────────────────────────────────

/**
 * Live list of the user's Composio connections. Refetches on window
 * focus so OAuth completions in other tabs are picked up promptly.
 */
export function useComposioConnections() {
  const t = useTranslations("connections.errors")
  const queryFn = useMemo(() => makeFetchConnections(t as ErrorsT), [t])

  const query = useQuery<ComposioConnection[], Error>({
    queryKey: CONNECTIONS_KEY,
    queryFn,
    staleTime: STALE_CONNECTIONS_MS,
    refetchOnWindowFocus: true,
  })

  return {
    data: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  }
}

/**
 * The full Composio toolkit catalogue. Lower-frequency refresh.
 */
export function useComposioToolkits() {
  const t = useTranslations("connections.errors")
  const queryFn = useMemo(() => makeFetchToolkits(t as ErrorsT), [t])

  const query = useQuery<ComposioToolkit[], Error>({
    queryKey: TOOLKITS_KEY,
    queryFn,
    staleTime: STALE_TOOLKITS_MS,
  })

  return {
    data: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
  }
}

/**
 * Lazy-fetch a toolkit's auth scheme detail when the connect dialog needs
 * authoritative per-scheme info.
 *
 * Why this exists: Composio's lightweight `toolkits.list()` catalog often
 * omits `auth_schemes[]` on the per-item record — that data is only
 * populated by the per-toolkit detail endpoint inside the SDK. Without
 * this, non-OAuth toolkits (Perplexity, OpenAI, Anthropic, …) end up in
 * the catalog with an empty schemes array and the dialog can't tell that
 * they need an API key input. This hook hits the lazy backend endpoint
 * GET /api/composio/toolkit-info/{slug} which calls the SDK's per-toolkit
 * lookup (`get_toolkit_auth_scheme`) and returns the full descriptor.
 *
 * The hook is GATED via `enabled` so it only fires when the dialog is on
 * the confirm step for a specific toolkit — not for every card on the
 * browse grid (which would be 100s of requests). Stale time is generous
 * (5 min) because auth schemes don't churn.
 */
export function useToolkitInfo(slug: string | null | undefined) {
  const t = useTranslations("connections.errors")
  const normSlug = (slug ?? "").trim().toLowerCase()

  const queryFn = useMemo(
    () => async () => {
      const res = await fetch(
        `/api/composio/toolkit-info/${encodeURIComponent(normSlug)}`,
        { headers: { Accept: "application/json" } }
      )
      if (!res.ok) {
        // Surface a friendly error but don't throw — the dialog falls back
        // to the catalog auth_schemes when this fetch fails.
        let detail = ""
        try {
          const body: { error?: string } = await res.clone().json()
          detail = body?.error || ""
        } catch {
          /* not JSON */
        }
        const tFn = t as unknown as (
          k: string,
          v?: Record<string, string | number>
        ) => string
        throw new Error(
          detail ||
            tFn("loadToolkitsFailed", { status: res.status }) ||
            `Failed to load toolkit info (HTTP ${res.status})`
        )
      }
      return (await res.json()) as ComposioToolkitInfo
    },
    [normSlug, t]
  )

  const query = useQuery<ComposioToolkitInfo, Error>({
    queryKey: TOOLKIT_INFO_KEY(normSlug),
    queryFn,
    staleTime: STALE_TOOLKIT_INFO_MS,
    enabled: normSlug.length > 0,
    // The fetch is best-effort enrichment — don't retry on transient
    // errors; the dialog falls back to catalog data without noise.
    retry: false,
  })

  return {
    data: query.data,
    isLoading: query.isLoading && normSlug.length > 0,
    isFetching: query.isFetching,
    error: query.error,
  }
}

/**
 * Initiate a Composio connection for the given toolkit.
 *
 * Supports both OAuth (redirect-based) and credential-based flows
 * (API_KEY, BEARER_TOKEN, BASIC, NO_AUTH, …). The mutation itself does
 * not navigate; the surrounding callbacks below decide whether to:
 *   - navigate to `redirect_url` for OAuth toolkits, OR
 *   - invalidate the connections query for synchronously-created
 *     connections (`status === 'connected'`, `connection_created`).
 *
 * Public surface:
 *   - connect(toolkit_slug): redirects the CURRENT tab to the Composio
 *     authorisation URL (OAuth) or resolves once the connection is
 *     created (credential-based). Used by the connection-card
 *     "reconnect" action. Throws `ComposioConnectError` on backend
 *     error.
 *   - startConnect(toolkit_slug, credentials?): resolves with the
 *     full discriminated response WITHOUT navigating, so a caller can
 *     pop it open in a new tab (OAuth) or render a success state
 *     inline (credential-based) without yanking the dialog out from
 *     under an in-progress submission. Throws `ComposioConnectError`
 *     on backend error.
 *   - submitCredentials(toolkit_slug, credentials): semantic alias of
 *     startConnect for credential-form callers — same behaviour,
 *     clearer intent at the call site.
 *   - isConnecting: true while the mutation is in flight.
 *   - error: the last `ComposioConnectError` (or null).
 */
export function useConnectApp() {
  const t = useTranslations("connections.errors")
  const queryClient = useQueryClient()
  const mutationFn = useMemo(() => makePostConnect(t as ErrorsT), [t])

  const mutation = useMutation<
    ComposioConnectResponse,
    ComposioConnectError,
    { slug: string; credentials?: ComposioConnectCredentials }
  >({
    mutationFn: ({ slug, credentials }) => mutationFn(slug, { credentials }),
    onSuccess: (data) => {
      // For credential-based schemes the backend has already created the
      // connection; invalidate the connections list so it shows up
      // immediately in the UI without waiting for the 30s stale window
      // or a focus refetch.
      if (data.status === "connected" && data.connection_created) {
        queryClient.invalidateQueries({ queryKey: CONNECTIONS_KEY })
      }
    },
  })

  const connect = useCallback(
    async (toolkit_slug: string): Promise<void> => {
      const data = await mutation.mutateAsync({ slug: toolkit_slug })
      if (data.status === "redirect" && data.redirect_url) {
        if (typeof window !== "undefined") {
          window.location.href = data.redirect_url
        }
        return
      }
      // status === "connected" — onSuccess already invalidated the list.
    },
    [mutation]
  )

  const startConnect = useCallback(
    (
      toolkit_slug: string,
      credentials?: ComposioConnectCredentials
    ): Promise<ComposioConnectResponse> =>
      mutation.mutateAsync({ slug: toolkit_slug, credentials }),
    [mutation]
  )

  const submitCredentials = useCallback(
    (
      toolkit_slug: string,
      credentials: ComposioConnectCredentials
    ): Promise<ComposioConnectResponse> =>
      mutation.mutateAsync({ slug: toolkit_slug, credentials }),
    [mutation]
  )

  return {
    connect,
    startConnect,
    submitCredentials,
    isConnecting: mutation.isPending,
    error: mutation.error,
  }
}

/**
 * Revoke a connection. Invalidates the connections query on success so
 * the UI re-renders without the removed entry.
 */
export function useDisconnectApp() {
  const queryClient = useQueryClient()
  const t = useTranslations("connections.errors")
  const mutationFn = useMemo(() => makeDeleteConnection(t as ErrorsT), [t])

  const mutation = useMutation<void, ComposioConnectError, string>({
    mutationFn,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CONNECTIONS_KEY })
    },
  })

  const disconnect = useCallback(
    async (connection_id: string): Promise<void> => {
      await mutation.mutateAsync(connection_id)
    },
    [mutation]
  )

  return {
    disconnect,
    isDisconnecting: mutation.isPending,
    error: mutation.error,
  }
}

/**
 * Aggregate facade used by the connections UI. Combines the connection
 * list, toolkit catalogue, connect/disconnect mutations, and a manual
 * refresh into a single object so consumers can destructure once.
 *
 * Shape is intentionally stable for connections-content.tsx,
 * connect-app-dialog.tsx, connection-card.tsx, and composio-section.tsx.
 */
export function useComposio() {
  const queryClient = useQueryClient()
  const connectionsQ = useComposioConnections()
  const toolkitsQ = useComposioToolkits()
  const {
    connect,
    startConnect,
    submitCredentials,
    isConnecting,
    error: connectError,
  } = useConnectApp()
  const {
    disconnect,
    isDisconnecting,
    error: disconnectError,
  } = useDisconnectApp()

  const refresh = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: CONNECTIONS_KEY }),
      queryClient.invalidateQueries({ queryKey: TOOLKITS_KEY }),
    ])
  }, [queryClient])

  return {
    connections: connectionsQ.data,
    toolkits: toolkitsQ.data,
    loading: connectionsQ.isLoading || toolkitsQ.isLoading,
    error:
      connectionsQ.error ||
      toolkitsQ.error ||
      connectError ||
      disconnectError ||
      null,
    refresh,
    connect,
    startConnect,
    submitCredentials,
    disconnect,
    isConnecting,
    isDisconnecting,
  }
}

/**
 * v2 stub: read the per-chat toolkit allow-list. Always returns null
 * in v1 — callers should treat null as "use the user's full active
 * toolkit set".
 */
export function usePerChatToolkits(chatId: string): string[] | null {
  const { getPerChatToolkits } = useComposioContext()
  return getPerChatToolkits(chatId)
}

/**
 * v2 stub: returns a no-op setter for the per-chat picker. Stable
 * reference so callers can pass it to memoised children today.
 */
export function useSetPerChatToolkits(): (
  chatId: string,
  toolkits: string[] | null
) => void {
  const { setPerChatToolkits } = useComposioContext()
  return setPerChatToolkits
}
