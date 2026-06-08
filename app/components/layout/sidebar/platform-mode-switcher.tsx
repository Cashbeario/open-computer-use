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

import { useState } from "react"
import { IconChevronDown, IconCheck } from "@tabler/icons-react"
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

export function PlatformModeSwitcher({ className }: { className?: string }) {
  const mode = usePlatformMode((s) => s.mode)
  const setMode = usePlatformMode((s) => s.setMode)
  const [open, setOpen] = useState(false)
  const active = MODE_BY_ID[mode]

  const select = (next: PlatformMode) => {
    setMode(next) // store ignores invalid / same-mode internally
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-testid="platform-mode-trigger"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label={`Platform: ${active.label}. Click to switch platform`}
          className={cn(
            // A quietly alive pill: a subtle aurora drifts behind the label so
            // the platform switcher stands out from the static header chrome
            // without shouting. `overflow-hidden` clips the glow to the rounded
            // pill; the label/chevron ride above it on z-10.
            "group relative flex h-8 min-w-0 items-center gap-1 overflow-hidden rounded-lg px-1.5",
            "text-foreground/75 hover:text-foreground data-[state=open]:text-foreground",
            "hover:bg-foreground/[0.04] dark:hover:bg-white/[0.04]",
            "data-[state=open]:bg-foreground/[0.05] dark:data-[state=open]:bg-white/[0.05]",
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
            className="mode-aurora pointer-events-none opacity-90 transition-opacity duration-700 group-hover:opacity-100 group-data-[state=open]:opacity-100"
          >
            <span className="mode-aurora-blob b1" />
            <span className="mode-aurora-blob b2" />
            <span className="mode-aurora-blob b3" />
          </span>

          <span className="relative z-10 min-w-0 flex-1 truncate text-left text-[13px] font-medium tracking-[-0.01em]">
            {active.label}
          </span>
          <IconChevronDown
            size={13}
            stroke={2}
            className="relative z-10 shrink-0 text-foreground/40 transition-transform duration-200 group-data-[state=open]:rotate-180"
          />
        </button>
      </PopoverTrigger>

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
