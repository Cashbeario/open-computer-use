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
import type {
  ComposioConnection,
  ComposioConnectionsResponse,
  ComposioConnectResponse,
  ComposioToolkit,
  ComposioToolkitsResponse,
} from "./types"

const CONNECTIONS_KEY = ["composio", "connections"] as const
const TOOLKITS_KEY = ["composio", "toolkits"] as const

const STALE_CONNECTIONS_MS = 30_000
const STALE_TOOLKITS_MS = 60_000

// ── Internal fetchers ──────────────────────────────────────────────
//
// Fetchers are built via factories that receive a `next-intl` translator
// so any thrown error messages are localized. Hooks below bind a
// translator scoped to the `connections.errors` namespace via
// `useTranslations` and memoise the resulting fetcher.

type ErrorsT = (
  key: "loadConnectionsFailed" | "loadToolkitsFailed" | "startConnectionFailed" | "disconnectFailedHttp",
  values?: Record<string, string | number>
) => string

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
    toolkitSlug: string
  ): Promise<ComposioConnectResponse> {
    const slug = toolkitSlug.trim().toLowerCase().replace(/-/g, "_")
    const res = await fetch(
      `/api/composio/connect/${encodeURIComponent(slug)}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({}),
      }
    )
    if (!res.ok) {
      let detail = ""
      try {
        const body = (await res.json()) as { error?: string; detail?: string }
        detail = body?.error || body?.detail || ""
      } catch {
        // swallow
      }
      throw new Error(
        detail || t("startConnectionFailed", { status: res.status })
      )
    }
    return (await res.json()) as ComposioConnectResponse
  }
}

function makeDeleteConnection(t: ErrorsT) {
  return async function deleteConnection(connectionId: string): Promise<void> {
    const res = await fetch("/api/composio/connections", {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ connectedAccountId: connectionId }),
    })
    if (!res.ok) {
      let detail = ""
      try {
        const body = (await res.json()) as { error?: string; detail?: string }
        detail = body?.error || body?.detail || ""
      } catch {
        // swallow
      }
      throw new Error(
        detail || t("disconnectFailedHttp", { status: res.status })
      )
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
 * Initiate an OAuth connection for the given toolkit. On success,
 * navigates the browser to the Composio-provided redirect URL.
 *
 * Returns:
 *   - connect(toolkit_slug): kicks off the flow; throws on backend error.
 *   - isConnecting: true while the mutation is in flight.
 */
export function useConnectApp() {
  const t = useTranslations("connections.errors")
  const mutationFn = useMemo(() => makePostConnect(t as ErrorsT), [t])

  const mutation = useMutation<ComposioConnectResponse, Error, string>({
    mutationFn,
    onSuccess: (data) => {
      if (typeof window !== "undefined" && data?.redirect_url) {
        window.location.href = data.redirect_url
      }
    },
  })

  const connect = useCallback(
    async (toolkit_slug: string): Promise<void> => {
      await mutation.mutateAsync(toolkit_slug)
    },
    [mutation]
  )

  return {
    connect,
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

  const mutation = useMutation<void, Error, string>({
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
  const { connect, isConnecting, error: connectError } = useConnectApp()
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
