"use client"

// ─── PlatformModeSwitcher ─────────────────────────────────────────────
//   The "text box next to the logo" that names the platform the user is in
//   (Consumer vs Developer) and lets them switch. A compact pill showing the
//   current mode + a chevron; clicking opens a small two-option dropdown.
//
//   State lives in `usePlatformMode` (persisted). No hydration gate is needed:
//   the switcher is expanded-only (see AppSidebar) and the sidebar is collapsed
//   at SSR / first paint, so it never renders on the server. By the time it
//   mounts client-side, persist has already rehydrated — reading `mode`
//   directly is correct and avoids a one-frame "wrong mode" flash.

import { useEffect, useState } from "react"
import { IconSelector, IconCheck } from "@tabler/icons-react"
import { cn } from "@/lib/utils"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { usePlatformMode, type PlatformMode } from "@/lib/platform-mode-store"

type ModeMeta = {
  id: PlatformMode
  label: string
  description: string
  badge?: string
}

const MODES: ModeMeta[] = [
  {
    id: "consumer",
    label: "Personal",
    description: "Chat, agents & automation",
  },
  {
    id: "developer",
    label: "Developer",
    description: "Build with the Coasty API",
    badge: "Beta",
  },
]

// Constant lookup; exhaustive over PlatformMode so a missing case is a type
// error, never an undefined at runtime.
const MODE_BY_ID: Record<PlatformMode, ModeMeta> = {
  consumer: MODES[0],
  developer: MODES[1],
}

// One-time discovery: once the user has opened (and thereby learned about) the
// switcher, the first-run nudge never shows again. Kept out of the platform
// mode store on purpose — that store persists ONLY the chosen mode.
const SWITCH_DISCOVERED_KEY = "coasty:platform-switch-discovered"

export function PlatformModeSwitcher({ className }: { className?: string }) {
  const mode = usePlatformMode((s) => s.mode)
  const setMode = usePlatformMode((s) => s.setMode)
  const [open, setOpen] = useState(false)
  const active = MODE_BY_ID[mode]

  // First-run nudge: a hairline ring pulses to announce the switcher is
  // interactive. Read the flag after mount (client-only; avoids any SSR/
  // hydration divergence) and retire it the moment the user opens the menu.
  const [showNudge, setShowNudge] = useState(false)
  useEffect(() => {
    try {
      if (localStorage.getItem(SWITCH_DISCOVERED_KEY) !== "1") setShowNudge(true)
    } catch {
      /* private mode / storage disabled — simply skip the nudge */
    }
  }, [])

  const dismissNudge = () => {
    setShowNudge(false)
    try {
      localStorage.setItem(SWITCH_DISCOVERED_KEY, "1")
    } catch {
      /* ignore — the in-memory state already hid it for this session */
    }
  }

  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    if (next) dismissNudge() // opening it = the user has discovered switching
  }

  const select = (next: PlatformMode) => {
    setMode(next) // store ignores invalid / same-mode internally
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      {/* Relative wrapper so the discovery ring can sit OUTSIDE the pill's
          overflow-hidden without being clipped. Carries the shrink behaviour;
          the forwarded className still lands on the trigger button below. */}
      <div className="relative inline-flex min-w-0">
        <PopoverTrigger asChild>
          <button
            type="button"
            data-testid="platform-mode-trigger"
            aria-haspopup="menu"
            aria-expanded={open}
            aria-label={`Platform: ${active.label}. Click to switch platform`}
            title="Switch platform — Personal or Developer"
            className={cn(
              // A quietly alive pill that also reads as a real control: a
              // hairline border says "interactive", the ⇅ selector glyph says
              // "switchable", and a subtle aurora drifts behind the label so it
              // stands out from the static header chrome without shouting.
              // `overflow-hidden` clips the glow to the rounded pill; the
              // label/icon ride above it on z-10.
              "group relative flex h-8 min-w-0 items-center gap-1 overflow-hidden rounded-lg border px-1.5",
              "border-border/40 hover:border-border/70 dark:border-white/[0.08] dark:hover:border-white/[0.16]",
              "text-foreground/75 hover:text-foreground data-[state=open]:text-foreground",
              "hover:bg-foreground/[0.04] dark:hover:bg-white/[0.04]",
              "data-[state=open]:bg-foreground/[0.05] dark:data-[state=open]:bg-white/[0.05] data-[state=open]:border-border/70 dark:data-[state=open]:border-white/[0.16]",
              "transition-colors duration-150",
              "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/50",
              className,
            )}
          >
            {/* Aurora — three blurred, slowly drifting blobs, radially masked to
                fade at the edges. Brightens a touch on hover / when open; a
                static soft glow remains under prefers-reduced-motion. */}
            <span
              aria-hidden="true"
              className="mode-aurora pointer-events-none opacity-100 transition-opacity duration-700"
            >
              <span className="mode-aurora-blob b1" />
              <span className="mode-aurora-blob b2" />
              <span className="mode-aurora-blob b3" />
            </span>

            <span className="mode-label-shimmer relative z-10 min-w-0 flex-1 truncate text-left text-[13px] font-medium leading-[1.45] tracking-[-0.01em]">
              {active.label}
            </span>
            {/* ⇅ — the conventional "this control switches between options"
                glyph; more legible than a plain dropdown chevron about the
                fact that there's another mode to switch to. */}
            <IconSelector
              size={14}
              stroke={2}
              className="relative z-10 shrink-0 text-foreground/55 transition-colors group-hover:text-foreground/80 group-data-[state=open]:text-foreground/80"
            />
          </button>
        </PopoverTrigger>

        {/* First-run discovery nudge — a hairline ring pulses a few times to
            announce the switcher is interactive, then retires for good. */}
        {showNudge && <span aria-hidden="true" className="mode-switch-nudge" />}
      </div>

      <PopoverContent
        side="bottom"
        align="start"
        sideOffset={8}
        collisionPadding={12}
        // Clamp to the viewport so it never overflows a narrow phone; on the
        // wider mobile sidebar sheet it still opens downward in-place.
        className="w-60 max-w-[calc(100vw-1.5rem)] rounded-xl border border-border/60 bg-popover p-1 shadow-2xl dark:border-white/[0.06]"
      >
        <div className="px-2.5 pt-1.5 pb-1">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Platform
          </span>
        </div>
        <div className="space-y-0.5" role="menu" aria-label="Platform mode">
          {MODES.map((m) => {
            const isActive = m.id === active.id
            return (
              <button
                key={m.id}
                type="button"
                role="menuitemradio"
                aria-checked={isActive}
                data-testid={`platform-mode-option-${m.id}`}
                onClick={() => select(m.id)}
                className={cn(
                  // Slightly taller rows on touch (mobile sheet) for a
                  // comfortable tap target; compact on desktop.
                  "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 sm:py-1.5 text-left transition-colors",
                  isActive
                    ? "bg-foreground/[0.05] dark:bg-white/[0.05]"
                    : "hover:bg-foreground/[0.035] dark:hover:bg-white/[0.035]",
                )}
              >
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-[12.5px] font-medium text-foreground/90">
                      {m.label}
                    </span>
                    {m.badge && (
                      <span className="shrink-0 rounded-full bg-foreground/[0.07] px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide text-foreground/55 dark:bg-white/[0.08]">
                        {m.badge}
                      </span>
                    )}
                  </span>
                  <span className="truncate text-[10.5px] text-muted-foreground">
                    {m.description}
                  </span>
                </span>
                {isActive && (
                  <IconCheck
                    size={14}
                    stroke={2.2}
                    className="shrink-0 text-foreground/70"
                  />
                )}
              </button>
            )
          })}
        </div>
      </PopoverContent>
    </Popover>
  )
}
