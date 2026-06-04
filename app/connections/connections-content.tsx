"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { motion } from "framer-motion"
import { Plug, Plus, RefreshCw } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { PageLoader } from "@/components/common/page-loader"
import {
  useComposioConnections,
  useComposioToolkits,
  useDisconnectApp,
} from "@/lib/composio-store/use-composio"
import type {
  ComposioConnection,
  ConnectionStatus,
} from "@/lib/composio-store/types"
import { ConnectionCard } from "./connection-card"
import { ConnectAppDialog } from "./connect-app-dialog"
import { EmptyState } from "./empty-state"

type FilterId = "all" | ConnectionStatus

export function ConnectionsContent() {
  const t = useTranslations("connections")
  const tLoader = useTranslations("pageLoaders.connections")
  const router = useRouter()
  const searchParams = useSearchParams()

  const {
    data: connections,
    isLoading: connectionsLoading,
    error: connectionsError,
    refetch: refetchConnections,
  } = useComposioConnections()
  const { data: toolkits, isLoading: toolkitsLoading } = useComposioToolkits()
  const { disconnect } = useDisconnectApp()

  const loading = connectionsLoading || toolkitsLoading
  const error = connectionsError?.message ?? null
  const refresh = async () => {
    await refetchConnections()
  }

  const [statusFilter, setStatusFilter] = useState<FilterId>("all")
  const [showConnectDialog, setShowConnectDialog] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  // When an empty-state showcase tile is clicked, surface the dialog with
  // that toolkit's slug pre-seeded so the user lands on a focused view.
  const [dialogPreselect, setDialogPreselect] = useState<string | null>(null)

  // Holds the pending window.close() timeout. We use a ref (not a let inside
  // the effect) so the timer survives across re-renders — specifically the
  // re-render triggered by router.replace below. If the timer lived inside
  // the effect's closure, the effect cleanup would clearTimeout() it on the
  // searchParams flip, cancelling window.close() before it ever fires.
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Query-param handling (toasts + cleanup) ───────────────────────────────
  // ?connected=<app>             → success toast + refresh + auto-close
  //                                (this tab is the throwaway auth tab the
  //                                connect dialog opened; close it so the
  //                                user isn't left on /connections in a
  //                                duplicate / dev-host URL like
  //                                0.0.0.0:3000)
  // ?error=<reason>&app=<app>    → error toast
  // ?reconnect=<toolkit>         → auto-open connect dialog
  // After handling, strip params via router.replace. Note: NO effect cleanup
  // is returned here — the close-timer outlives this effect intentionally.
  // The unmount cleanup is owned by the separate effect below.
  useEffect(() => {
    const connectedApp = searchParams.get("connected")
    const errorReason = searchParams.get("error")
    const errorApp = searchParams.get("app") || searchParams.get("toolkit")
    const reconnect = searchParams.get("reconnect")
    const pending = searchParams.get("pending")

    let dirty = false

    if (connectedApp) {
      toast.success(t("toasts.connected", { app: connectedApp }))
      // Authoritative refresh so the new connection shows up immediately
      refresh().catch(() => {
        /* refresh swallows its own errors */
      })
      // Notify any other open tab on the same origin (most often the tab
      // that opened the connect dialog in the first place — it might be a
      // chat or the connections page itself) so it can invalidate its
      // connections cache immediately rather than waiting for window focus.
      // Posted from a one-shot channel instance; the listener below — in
      // peer tabs — has its own instance and is the one that receives it.
      try {
        const ch = new BroadcastChannel("composio:connections")
        ch.postMessage({ type: "connected", app: connectedApp })
        ch.close()
      } catch {
        /* BroadcastChannel unsupported — opener will refetch on focus. */
      }
      // Schedule the tab-close. Stored on a ref so the timer survives this
      // effect's re-run when router.replace flips searchParams below — if
      // we stored it on a `let` and cleared it in cleanup, the close would
      // be cancelled by React tearing the effect down on the dep change.
      //
      // This tab was opened by `window.open()` from openAuthTab() inside
      // the connect dialog click handler, and navigated through Composio →
      // /api/composio/callback → here. Browsers generally permit
      // window.close() for script-opened windows even after cross-origin
      // navigations; if it is denied (some embedded webviews, opener-null
      // policies, or a tab the user opened manually with the URL), the
      // router.replace below has already stripped the param so the user
      // is parked on a clean /connections page rather than the raw
      // callback URL — strictly fallback, not the happy path.
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current)
      closeTimerRef.current = setTimeout(() => {
        closeTimerRef.current = null
        try {
          window.close()
        } catch {
          /* not allowed — fall back to staying on /connections */
        }
      }, 1200)
      dirty = true
    }

    if (errorReason) {
      toast.error(t("toasts.error"), {
        description: errorApp ? `${errorApp}: ${errorReason}` : errorReason,
      })
      dirty = true
    }

    if (reconnect) {
      setShowConnectDialog(true)
      dirty = true
    }

    if (pending) {
      // Composio finished the OAuth round-trip but our session cookie wasn't
      // available on the callback. Refresh to pick up the new connection.
      refresh().catch(() => {})
      dirty = true
    }

    if (dirty) {
      router.replace("/connections", { scroll: false })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  // ── Unmount cleanup ───────────────────────────────────────────────────────
  // Owns the close-timer's lifetime so it's only cleared on real unmount
  // (e.g. user navigates away), not on every searchParams change.
  useEffect(() => {
    return () => {
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current)
        closeTimerRef.current = null
      }
    }
  }, [])

  // ── Cross-tab refresh from a sibling OAuth completion ────────────────────
  // Listen for the broadcast posted from the auth-completion tab above so
  // the *original* tab (where the user clicked Connect) refreshes the moment
  // OAuth finishes, not when the user happens to refocus the window. Cheap,
  // best-effort; silently no-ops when BroadcastChannel is unsupported.
  //
  // GUARD: if THIS tab itself just landed on ?connected=<app>, it is the
  // sender, not a peer — skip subscribing so we don't trigger a redundant
  // refresh inside the throwaway tab that's about to close. (BroadcastChannel
  // never echoes within a single instance, but the two effects in this file
  // create two distinct instances in the same document, which would otherwise
  // see each other's posts.)
  useEffect(() => {
    if (searchParams.get("connected")) return
    let ch: BroadcastChannel | null = null
    try {
      ch = new BroadcastChannel("composio:connections")
      ch.onmessage = (ev) => {
        if (ev?.data?.type === "connected") {
          refresh().catch(() => {})
        }
      }
    } catch {
      /* not supported */
    }
    return () => {
      try { ch?.close() } catch { /* already closed */ }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  // ── Derived filter chip counts ────────────────────────────────────────────
  const counts = useMemo(() => {
    const by: Record<string, number> = {
      all: connections.length,
      ACTIVE: 0,
      INITIATED: 0,
      EXPIRED: 0,
      FAILED: 0,
      INACTIVE: 0,
    }
    for (const c of connections) {
      if (by[c.status] !== undefined) by[c.status] += 1
    }
    return by
  }, [connections])

  const statusFilters: { id: FilterId; label: string; count: number }[] = [
    { id: "all", label: t("filters.all"), count: counts.all },
    { id: "ACTIVE", label: t("filters.active"), count: counts.ACTIVE },
    { id: "INITIATED", label: t("filters.connecting"), count: counts.INITIATED },
    { id: "EXPIRED", label: t("filters.expired"), count: counts.EXPIRED },
    { id: "FAILED", label: t("filters.failed"), count: counts.FAILED },
  ]

  const filteredConnections = useMemo(
    () =>
      statusFilter === "all"
        ? connections
        : connections.filter(
            (c: ComposioConnection) => c.status === statusFilter
          ),
    [connections, statusFilter]
  )

  const activeCount = counts.ACTIVE

  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      await refresh()
    } finally {
      setRefreshing(false)
    }
  }

  const handleDisconnect = async (id: string) => {
    // ConnectionCard owns the disconnect success/error toasts
    // (connections.card.toast.*, which correctly interpolate {appName}). Here
    // we only perform the revoke and let any error PROPAGATE so the card's
    // own catch can surface it — and, critically, skip its success toast on
    // failure. Previously this also fired t("toasts.disconnected"), which
    // threw a next-intl FORMATTING_ERROR (the {appName} variable was never
    // provided) and double-toasted alongside the card on success.
    await disconnect(id)
  }

  return (
    <PageLoader
      isLoading={loading && connections.length === 0}
      title={tLoader("title")}
      description={tLoader("description")}
    >
      <div className="h-full overflow-y-auto overflow-x-hidden scrollbar-invisible relative">
        {/* Ambient background — mirrors /machines */}
        <div className="pointer-events-none fixed inset-0 overflow-hidden">
          <div
            className="absolute -top-[30%] -right-[15%] h-[60%] w-[50%] rounded-full opacity-[0.02] dark:opacity-[0.04] blur-[120px]"
            style={{
              background:
                "radial-gradient(circle, currentColor, transparent 70%)",
            }}
          />
          <div
            className="absolute -bottom-[20%] -left-[10%] h-[50%] w-[40%] rounded-full opacity-[0.015] dark:opacity-[0.035] blur-[100px]"
            style={{
              background:
                "radial-gradient(circle, currentColor, transparent 70%)",
            }}
          />
        </div>

        <div className="container mx-auto p-4 sm:p-6 lg:p-8 max-w-7xl space-y-6 relative z-10">
          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4"
          >
            <div>
              <div className="flex items-center gap-3">
                <h1
                  data-testid="connections-page-title"
                  className="text-2xl sm:text-3xl font-medium tracking-tight"
                >
                  {t("title")}
                </h1>
                <span className="inline-flex items-center rounded-full border border-border/60 bg-background px-2.5 py-0.5 text-xs font-medium tabular-nums text-muted-foreground">
                  {activeCount} {t("connectedSuffix")}
                </span>
              </div>
              <p
                data-testid="connections-page-subtitle"
                className="mt-1.5 text-muted-foreground text-sm"
              >
                {t("subtitle")}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                data-testid="connections-refresh-button"
                variant="ghost"
                size="sm"
                onClick={handleRefresh}
                disabled={refreshing || loading}
                aria-label={t("refresh")}
                className="h-9 w-9 p-0 rounded-xl text-muted-foreground hover:text-foreground"
              >
                <RefreshCw
                  className={`h-4 w-4 ${
                    refreshing || loading ? "animate-spin" : ""
                  }`}
                />
              </Button>
              <Button
                data-testid="connections-new-connection-cta"
                onClick={() => setShowConnectDialog(true)}
                size="sm"
                className="h-9 rounded-xl gap-2 px-4 font-medium"
              >
                <Plus className="h-4 w-4" />
                {t("newConnection")}
              </Button>
            </div>
          </motion.div>

          {/* Error banner — explanatory + Retry */}
          {error && !loading && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              className="flex items-center justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-500/[0.04] px-4 py-3"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-amber-700 dark:text-amber-300">
                  {t("toasts.error")}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {error}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleRefresh}
                className="h-8 rounded-lg px-3 text-xs"
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 me-1.5 ${
                    refreshing ? "animate-spin" : ""
                  }`}
                />
                {t("retry")}
              </Button>
            </motion.div>
          )}

          {/* Status filters */}
          {connections.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: 0.4,
                delay: 0.1,
                ease: [0.22, 1, 0.36, 1],
              }}
              className="flex flex-wrap gap-1.5"
            >
              {statusFilters.map((filter) => (
                <button
                  key={filter.id}
                  data-testid={`filter-pill-${filter.id.toLowerCase() === 'initiated' ? 'connecting' : filter.id.toLowerCase()}`}
                  onClick={() => setStatusFilter(filter.id)}
                  className={`
                    px-3.5 py-1.5 rounded-lg text-sm transition-all duration-200
                    ${
                      statusFilter === filter.id
                        ? "bg-foreground text-background font-medium shadow-sm"
                        : "bg-transparent hover:bg-foreground/[0.05] text-muted-foreground hover:text-foreground"
                    }
                  `}
                >
                  <span className="flex items-center gap-2">
                    {filter.label}
                    {filter.count > 0 && (
                      <span
                        className={`
                          text-[11px] tabular-nums px-1.5 py-0.5 rounded-full
                          ${
                            statusFilter === filter.id
                              ? "bg-background/20"
                              : "bg-foreground/[0.06]"
                          }
                        `}
                      >
                        {filter.count}
                      </span>
                    )}
                  </span>
                </button>
              ))}
            </motion.div>
          )}

          {/* Loaded grid / Empty state / Skeleton / Filter-empty */}
          {loading && connections.length === 0 ? (
            <SkeletonGrid />
          ) : connections.length === 0 ? (
            <EmptyState
              popularToolkits={toolkits}
              onConnect={(slug) => {
                setDialogPreselect(slug ?? null)
                setShowConnectDialog(true)
              }}
            />
          ) : filteredConnections.length === 0 ? (
            // Use the FRIENDLY filter label (Active / Connecting / Expired /
            // Failed) instead of the raw enum value (ACTIVE / INITIATED /
            // EXPIRED / FAILED) so the empty-state copy reads naturally
            // instead of shouting in all-caps.
            (() => {
              const activeFilter = statusFilters.find((f) => f.id === statusFilter)
              const filterLabel = activeFilter?.label ?? statusFilter
              return (
                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4 }}
                >
                  <Card className="border-border/30 bg-card/30 backdrop-blur-sm">
                    <CardContent className="flex flex-col items-center justify-center py-14">
                      <Plug className="h-10 w-10 text-muted-foreground/40 mb-4" />
                      <h3 className="text-base font-medium mb-1.5">
                        {t("noFilteredConnections", { filter: filterLabel })}
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        {t("noFilteredDescription", { filter: filterLabel })}
                      </p>
                    </CardContent>
                  </Card>
                </motion.div>
              )
            })()
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredConnections.map((connection: ComposioConnection, i: number) => (
                <motion.div
                  key={connection.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    duration: 0.35,
                    delay: 0.05 + i * 0.04,
                    ease: [0.22, 1, 0.36, 1],
                  }}
                >
                  <ConnectionCard
                    connection={connection}
                    onDisconnect={() => handleDisconnect(connection.id)}
                  />
                </motion.div>
              ))}
            </div>
          )}

          {/* Connect new app dialog */}
          <ConnectAppDialog
            open={showConnectDialog}
            onOpenChange={(open) => {
              setShowConnectDialog(open)
              if (!open) setDialogPreselect(null)
            }}
            toolkits={toolkits}
            connections={connections}
            preselectSlug={dialogPreselect}
          />
        </div>
      </div>
    </PageLoader>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Local subcomponents — kept in this file because they are layout-coupled
// (mirror the empty-state and skeleton shapes used on /machines).
// ─────────────────────────────────────────────────────────────────────────────

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="rounded-2xl border border-border/30 bg-card/30 backdrop-blur-sm overflow-hidden"
        >
          <div className="h-24 bg-foreground/[0.03] animate-pulse" />
          <div className="p-4 space-y-3">
            <div className="h-4 w-1/2 rounded-md bg-foreground/[0.05] animate-pulse" />
            <div className="h-3 w-3/4 rounded-md bg-foreground/[0.04] animate-pulse" />
            <div className="h-9 w-full rounded-xl bg-foreground/[0.04] animate-pulse mt-4" />
          </div>
        </div>
      ))}
    </div>
  )
}

// Empty state lives in ./empty-state.tsx — it surfaces a curated showcase of
// popular apps with logos so first-time visitors see what's possible.
