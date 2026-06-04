"use client"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useComposio } from "@/lib/composio-store/provider"
import type { ComposioConnection, ComposioToolkit } from "@/lib/composio-store/types"
import { ConnectAppDialog } from "@/app/connections/connect-app-dialog"
import { ToolkitLogo } from "@/app/connections/toolkit-logo"
import { ArrowRight, Loader2, Plug, Plus, Trash2 } from "lucide-react"
import { useTranslations } from "next-intl"
import { useRouter } from "next/navigation"
import { useMemo, useState } from "react"

type StatusToken = "ACTIVE" | "INITIATED" | "EXPIRED" | "FAILED" | "INACTIVE"

const STATUS_KEY: Record<StatusToken, string> = {
  ACTIVE: "active",
  INITIATED: "initiated",
  EXPIRED: "expired",
  FAILED: "failedShort",
  INACTIVE: "inactive",
}

const STATUS_DOT: Record<StatusToken, string> = {
  ACTIVE: "bg-emerald-500",
  INITIATED: "bg-blue-500 animate-pulse",
  EXPIRED: "bg-amber-500",
  FAILED: "bg-red-500",
  INACTIVE: "bg-foreground/20",
}

function StatusPill({ status }: { status: string }) {
  const t = useTranslations("connections")
  const token = (STATUS_KEY[status as StatusToken] ? (status as StatusToken) : "INACTIVE")
  return (
    <span data-testid="settings-integration-row-status-pill" className="inline-flex items-center gap-1.5 rounded-full bg-foreground/[0.04] dark:bg-white/[0.06] px-2 py-0.5 text-[10.5px] font-medium tracking-[0.01em] text-foreground/65">
      <span className={cn("h-1.5 w-1.5 rounded-full", STATUS_DOT[token])} />
      {t(`status.${STATUS_KEY[token]}`)}
    </span>
  )
}

function ConnectionRow({
  connection,
  toolkits,
  onDisconnect,
  pending,
}: {
  connection: ComposioConnection
  /** Catalog snapshot used to resolve the per-app logo when the connection
   *  itself doesn't carry one (older backends omit the field). */
  toolkits: ComposioToolkit[]
  onDisconnect: (id: string) => void
  pending: boolean
}) {
  const t = useTranslations("connections.row")
  // Belt-and-suspenders: both fields are optional on the wire; provide a
  // generic fallback so aria labels never receive `undefined`.
  const displayName = connection.toolkitName || connection.toolkitSlug || "app"
  // Same 3-tier resolve the /connections card uses (connection-card.tsx:393-394):
  // (1) connection.logo_url, (2) connection.logo, (3) catalog join via slug.
  // The slug field on connections is either toolkitSlug (canonical) or app_slug
  // (legacy alias) — mirror useComposio's normalization.
  const slug = connection.toolkitSlug ?? connection.app_slug
  const toolkitLogoUrl = useMemo(() => {
    if (connection.logo_url) return connection.logo_url
    if (connection.logo) return connection.logo
    const tk = slug
      ? toolkits.find(
          (t: ComposioToolkit) => t.slug === slug || t.slug === connection.app_slug,
        )
      : undefined
    return tk?.logo_url ?? tk?.logo ?? null
  }, [connection.logo_url, connection.logo, connection.app_slug, slug, toolkits])
  return (
    <div className="group flex items-center gap-3 px-2 py-2.5 rounded-md hover:bg-foreground/[0.025] dark:hover:bg-white/[0.03] transition-colors">
      <ToolkitLogo
        src={toolkitLogoUrl}
        name={displayName}
        alt={displayName}
        size="sm"
        variant="dialog"
      />
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium leading-tight text-foreground/90 truncate">
          {connection.toolkitName || connection.toolkitSlug}
        </p>
        <p className="text-[11px] text-muted-foreground/45 leading-tight mt-0.5 truncate">
          {connection.toolkitSlug}
        </p>
      </div>
      <StatusPill status={connection.status} />
      <Button
        data-testid="settings-integration-row-disconnect"
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 px-2 text-[11.5px] text-muted-foreground/60 hover:text-foreground"
        onClick={() => onDisconnect(connection.id)}
        disabled={pending}
        aria-label={t("disconnectAriaLabel", { name: displayName })}
      >
        {pending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <>
            <Trash2 className="h-3.5 w-3.5 me-1" />
            {t("disconnect")}
          </>
        )}
      </Button>
    </div>
  )
}

export function ComposioSection() {
  const router = useRouter()
  const { connections, toolkits, loading, disconnect } = useComposio()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const tSettings = useTranslations("settings.integrations")
  const tEmpty = useTranslations("connections.empty")

  const handleDisconnect = async (id: string) => {
    setPendingId(id)
    try {
      await disconnect(id)
    } finally {
      setPendingId((current) => (current === id ? null : current))
    }
  }

  const visible = connections

  return (
    <div className="space-y-6">
      <div>
        <h3 data-testid="settings-integrations-heading" className="text-[13px] font-medium text-foreground/70">{tSettings("heading")}</h3>
        <p className="mt-1 text-[12.5px] text-muted-foreground/55 leading-snug">
          {tSettings("subheading")}
        </p>
      </div>

      <div className="rounded-lg border border-border/30 dark:border-white/[0.05] bg-card/30 overflow-hidden">
        {loading && visible.length === 0 ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground/40">
            <Loader2 className="h-4 w-4 animate-spin" />
          </div>
        ) : visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-foreground/[0.04] dark:bg-white/[0.06] mb-3">
              <Plug className="h-4 w-4 text-muted-foreground/40" strokeWidth={1.75} />
            </div>
            <p className="text-[13px] font-medium text-foreground/75">{tEmpty("title")}</p>
            <p className="text-[11.5px] text-muted-foreground/45 mt-1 max-w-[260px]">
              {tEmpty("description")}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border/20 dark:divide-white/[0.04] p-1">
            {visible.map((c: ComposioConnection) => (
              <ConnectionRow
                key={c.id}
                connection={c}
                toolkits={toolkits ?? []}
                onDisconnect={handleDisconnect}
                pending={pendingId === c.id}
              />
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 rounded-lg gap-1.5 px-3 text-[12px] font-medium whitespace-nowrap"
          onClick={() => setDialogOpen(true)}
        >
          <Plus className="h-3.5 w-3.5" />
          {tSettings("connectNewApp")}
        </Button>

        <button
          data-testid="settings-integrations-manage-cta"
          type="button"
          onClick={() => router.push("/connections")}
          className="inline-flex items-center gap-1 whitespace-nowrap text-[11.5px] text-muted-foreground/55 hover:text-foreground transition-colors"
        >
          {tSettings("manageOnFullPage")}
          <ArrowRight className="h-3 w-3 rtl:rotate-180" />
        </button>
      </div>

      <ConnectAppDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        toolkits={toolkits}
        connections={connections}
      />
    </div>
  )
}
