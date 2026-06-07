"use client"

// ─── ButtonConnections ────────────────────────────────────────────────
//   A compact "connected apps" teaser for the chat-input toolbar: a tidy
//   facepile of overlapping app-logo circles capped with a "+". It reads
//   the user's real Composio connections — when they've connected apps it
//   shows those; when they haven't, it teases three popular ones so the
//   capability is discoverable without feeling empty.
//
//   Clicking opens a small popover: the live connection list (or a short
//   "connect your apps" pitch), plus one CTA into the full /connections
//   page. Kept deliberately small so the composer stays uncluttered.
//
//   Auth-gated by the PARENT (only mounted when authenticated), so the
//   composio queries never fire for signed-out users.

import { useMemo, useState } from "react"
import Link from "next/link"
import { Plus, ArrowRight } from "@phosphor-icons/react"
import { cn } from "@/lib/utils"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  useComposioConnections,
  useComposioToolkits,
} from "@/lib/composio-store/use-composio"
import type { ComposioToolkit } from "@/lib/composio-store/types"

// Recognizable apps to tease when the user hasn't connected anything.
// Matched against the live catalogue so the logos are real; falls back to
// the first catalogue entries if none of these are present.
const POPULAR_SLUGS = [
  "gmail",
  "slack",
  "notion",
  "github",
  "googledrive",
  "linear",
  "google_calendar",
  "googlecalendar",
]

type TeaserApp = { slug: string; name: string; logo: string | null }

// A single app logo — the real mark, or a clean letter fallback. State-
// driven failure (never DOM mutation) so re-renders can't resurrect a
// broken <img>.
function AppLogo({ app }: { app: TeaserApp }) {
  const [failed, setFailed] = useState(false)
  const src = typeof app.logo === "string" ? app.logo.trim() : ""
  if (!src || failed) {
    return (
      <span className="text-[10px] font-semibold text-neutral-500 dark:text-neutral-300" aria-hidden>
        {app.name.slice(0, 1).toUpperCase()}
      </span>
    )
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={app.name}
      loading="lazy"
      decoding="async"
      className="h-[68%] w-[68%] object-contain"
      onError={() => setFailed(true)}
    />
  )
}

export function ButtonConnections({ className }: { className?: string }) {
  const [open, setOpen] = useState(false)
  const { data: connections } = useComposioConnections()
  const { data: toolkits } = useComposioToolkits()

  // Catalogue slug → logo, used to backfill a connection's logo when the
  // connections payload doesn't carry one.
  const logoBySlug = useMemo(() => {
    const m = new Map<string, string | null>()
    for (const tk of toolkits) m.set(tk.slug, tk.logo ?? tk.logo_url ?? null)
    return m
  }, [toolkits])

  // Unique connected apps (a user may hold several accounts of one app).
  const connectedApps = useMemo<TeaserApp[]>(() => {
    const seen = new Set<string>()
    const out: TeaserApp[] = []
    for (const c of connections) {
      const slug = (c.app_slug || c.toolkitSlug || "").toLowerCase()
      if (!slug || seen.has(slug)) continue
      seen.add(slug)
      out.push({
        slug,
        name: c.app_name || c.toolkitName || slug,
        logo: c.logo ?? c.logo_url ?? logoBySlug.get(slug) ?? null,
      })
    }
    return out
  }, [connections, logoBySlug])

  // Three popular apps to tease when nothing is connected.
  const teaserApps = useMemo<TeaserApp[]>(() => {
    if (toolkits.length === 0) return []
    const bySlug = new Map(toolkits.map((tk) => [tk.slug, tk]))
    const picks: ComposioToolkit[] = []
    const push = (tk: ComposioToolkit) => {
      if (picks.length < 3 && !picks.includes(tk)) picks.push(tk)
    }
    for (const s of POPULAR_SLUGS) {
      const tk = bySlug.get(s)
      if (tk) push(tk)
    }
    for (const tk of toolkits) push(tk)
    return picks
      .slice(0, 3)
      .map((tk) => ({ slug: tk.slug, name: tk.name, logo: tk.logo ?? tk.logo_url ?? null }))
  }, [toolkits])

  const hasConnections = connectedApps.length > 0
  const stackApps = (hasConnections ? connectedApps : teaserApps).slice(0, 3)

  // Nothing to show yet (catalogue still loading, or Composio disabled).
  if (stackApps.length === 0) return null

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={hasConnections ? "Connected apps" : "Connect apps"}
          className={cn(
            "group h-9 inline-flex shrink-0 items-center rounded-full pl-1 pr-1.5",
            // Grey highlight from the same neutral family as the chips/card
            // (theme-aware), instead of a foreground/white tint.
            "transition-colors hover:bg-neutral-200/60 dark:hover:bg-neutral-700/50",
            "data-[state=open]:bg-neutral-200/80 dark:data-[state=open]:bg-neutral-700/60",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
            className,
          )}
        >
          <span className="flex items-center">
            {stackApps.map((app, i) => (
              <span
                key={app.slug}
                style={{ zIndex: i }}
                className={cn(
                  "inline-flex h-6 w-6 items-center justify-center overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-700",
                  "ring-2 ring-neutral-100 dark:ring-neutral-800",
                  i > 0 && "-ml-2",
                  // Trim the facepile to two logos on the smallest screens
                  // so the toolbar never crowds.
                  i === 2 && "hidden sm:inline-flex",
                )}
              >
                <AppLogo app={app} />
              </span>
            ))}
            <span
              style={{ zIndex: 10 }}
              className={cn(
                "-ml-2 inline-flex h-6 w-6 items-center justify-center rounded-full",
                "ring-2 ring-neutral-100 dark:ring-neutral-800",
                // Solid filled badge so the "+" reads as the primary
                // "add" affordance rather than a faint placeholder.
                "bg-foreground text-background shadow-sm",
                // Micro-interactions: the badge lifts/scales on hover and
                // presses in on click; easing kept short and soft.
                "transition-all duration-200 ease-out",
                "group-hover:scale-110 group-hover:shadow-md group-active:scale-95",
              )}
            >
              <Plus
                size={11}
                weight="bold"
                // Quarter-turn spin on hover — subtle, and a plus reads
                // identical at 90° so it settles cleanly.
                className="transition-transform duration-300 ease-out group-hover:rotate-90"
              />
            </span>
          </span>
        </button>
      </PopoverTrigger>

      <PopoverContent
        side="top"
        align="start"
        sideOffset={10}
        collisionPadding={16}
        className="w-72 overflow-hidden rounded-2xl border border-border/60 bg-popover p-0 shadow-2xl dark:border-white/[0.06]"
      >
        <div className="flex items-center justify-between px-3.5 pt-3 pb-2.5">
          <span className="text-[13px] font-semibold text-foreground">
            {hasConnections ? "Connected apps" : "Connect apps"}
          </span>
          {hasConnections && (
            <span className="text-[11px] font-medium tabular-nums text-muted-foreground">
              {connectedApps.length}
            </span>
          )}
        </div>

        <div
          aria-hidden
          className="h-px bg-gradient-to-r from-transparent via-border to-transparent"
        />

        {hasConnections ? (
          <div className="max-h-64 overflow-y-auto p-1.5">
            {connectedApps.map((app) => (
              <div
                key={app.slug}
                className="flex items-center gap-2.5 rounded-lg px-2 py-1.5"
              >
                <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-md bg-neutral-200 dark:bg-neutral-700 ring-1 ring-border/50">
                  <AppLogo app={app} />
                </span>
                <span className="flex-1 truncate text-[12.5px] font-medium capitalize text-foreground">
                  {app.name}
                </span>
                <span
                  aria-hidden
                  className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500"
                />
              </div>
            ))}
          </div>
        ) : (
          <div className="px-4 pt-4 pb-3 text-center">
            <div className="mb-3 flex items-center justify-center">
              {teaserApps.map((app, i) => (
                <span
                  key={app.slug}
                  style={{ zIndex: i }}
                  className={cn(
                    "inline-flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-700",
                    "ring-2 ring-popover",
                    i > 0 && "-ml-2.5",
                  )}
                >
                  <AppLogo app={app} />
                </span>
              ))}
            </div>
            <p className="text-[13px] font-semibold text-foreground">
              Connect your apps
            </p>
            <p className="mx-auto mt-1 max-w-[230px] text-[11.5px] leading-relaxed text-muted-foreground">
              Let the agent work inside Gmail, Slack, Notion and 100+ more on
              your behalf.
            </p>
          </div>
        )}

        <div className="border-t border-border/40 p-1.5 dark:border-white/[0.05]">
          <Link
            href="/connections"
            onClick={() => setOpen(false)}
            className={cn(
              "flex w-full items-center justify-center gap-1.5 rounded-lg py-2",
              "bg-foreground text-background text-[12.5px] font-semibold",
              "transition-opacity hover:opacity-90",
            )}
          >
            <span>{hasConnections ? "Manage connections" : "Browse apps"}</span>
            <ArrowRight size={13} weight="bold" />
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  )
}
