"use client"

import { useBreakpoint } from "@/app/hooks/use-breakpoint"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  useSidebar,
} from "@/components/ui/sidebar"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { useUser } from "@/lib/user-store/provider"
import { useRouter } from "next/navigation"
import { useState, useEffect, useCallback, useRef } from "react"
import { IconLayoutSidebar, IconLayoutSidebarFilled } from "@tabler/icons-react"
import { DialogCollaborativeAuth } from "../../collaborative/dialog-collaborative-auth"
import { CoastyIcon } from "@/components/icons/coasty"
import { cn } from "@/lib/utils"
import { ReferralPopup } from "../../referral/referral-popup"
import { SidebarNavSection } from "./sidebar-nav-section"
import { SidebarFooterSection } from "./sidebar-footer-section"
import { PlatformModeSwitcher } from "./platform-mode-switcher"
import { PLATFORM_MODE_SWITCHER_ENABLED } from "@/lib/feature-flags"
import { MemoryDialog } from "@/app/components/layout/settings/general/memory-dialog"
import { useMemoryDialog } from "@/lib/memory-dialog-store"
import { PlatformSwitchLoader } from "./platform-switch-loader"

const SIDEBAR_PINNED_KEY = "coasty:sidebar:pinned"

// Import static CSS instead of inline <style jsx global>
import "./sidebar-animations.css"

// ─── Easter egg: Konami-lite sequence detector ─────────────────────
function useSecretSequence(sequence: string, onActivate: () => void) {
  const bufferRef = useRef("")
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!e.key) return
      bufferRef.current += e.key.toLowerCase()
      if (bufferRef.current.length > sequence.length) {
        bufferRef.current = bufferRef.current.slice(-sequence.length)
      }
      if (bufferRef.current === sequence) {
        onActivate()
        bufferRef.current = ""
      }
      clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => {
        bufferRef.current = ""
      }, 2000)
    }
    window.addEventListener("keydown", handler)
    return () => {
      window.removeEventListener("keydown", handler)
      clearTimeout(timerRef.current)
    }
  }, [sequence, onActivate])
}

// ─── Main sidebar (slim orchestrator) ─────────────────────────────
export function AppSidebar() {
  const isMobile = useBreakpoint(768)
  const { setOpenMobile, open, isMobile: isMobileSidebar, setOpen } = useSidebar()
  const expanded = isMobileSidebar || open
  const { user } = useUser()

  // ─── Pin state ────────────────────────────────────────────────
  // When pinned, we swap the sidebar's `collapsible` prop from
  // "icon" (hover-to-expand, mouse-leave collapses) to "none" (no
  // hover behavior at all). The Sidebar's mouse handlers only fire
  // when collapsible === "icon", so flipping the prop is enough to
  // freeze the sidebar in its current open state — no need to fork
  // the underlying ui/sidebar component.
  const [pinned, setPinned] = useState<boolean>(() => {
    if (typeof window === "undefined") return false
    return window.localStorage.getItem(SIDEBAR_PINNED_KEY) === "true"
  })

  // On first paint after a pinned restore, ensure the sidebar is
  // actually open (the cookie-based default may say otherwise).
  useEffect(() => {
    if (pinned) setOpen(true)
    // We only want this on mount + when pin state changes.
  }, [pinned, setOpen])

  const togglePinned = useCallback(() => {
    setPinned((prev) => {
      const next = !prev
      if (typeof window !== "undefined") {
        window.localStorage.setItem(SIDEBAR_PINNED_KEY, String(next))
      }
      if (next) setOpen(true)
      return next
    })
  }, [setOpen])

  const [isCollaborativeAuthDialogOpen, setIsCollaborativeAuthDialogOpen] = useState(false)
  const [isReferralPopupOpen, setIsReferralPopupOpen] = useState(false)

  const router = useRouter()

  // ─── Easter egg states ───────────────────────────────────────
  const [logoClicks, setLogoClicks] = useState(0)
  const [partyMode, setPartyMode] = useState(false)

  useEffect(() => {
    if (logoClicks >= 7) {
      setPartyMode(true)
      const t = setTimeout(() => {
        setPartyMode(false)
        setLogoClicks(0)
      }, 3000)
      return () => clearTimeout(t)
    }
  }, [logoClicks])

  const [rainbowMode, setRainbowMode] = useState(false)
  useSecretSequence("coast", useCallback(() => {
    setRainbowMode(true)
    setTimeout(() => setRainbowMode(false), 4000)
  }, []))

  const handleNavigation = useCallback((navigationFn: () => void) => {
    navigationFn()
    if (isMobile) {
      setOpenMobile(false)
    }
  }, [isMobile, setOpenMobile])

  const closeMobileIfNeeded = useCallback(() => {
    if (isMobile) setOpenMobile(false)
  }, [isMobile, setOpenMobile])

  return (
    <>
      <Sidebar
        side="left"
        variant="sidebar"
        // `none` while pinned freezes the hover-to-expand behavior —
        // mouseLeave no longer collapses the rail. Flipping back to
        // `icon` restores the default hover-driven behavior.
        collapsible={pinned ? "none" : "icon"}
        style={{
          "--sidebar-width": "13.5rem",
        } as React.CSSProperties}
      >
        {/* ─── Header ───────────────────────────────────────
            Same padding in both modes so the logo never shifts: its
            center stays at sidebar-x=24 (parent px-2 + button px-1 +
            logo-half 12), matching the nav icon column below.

            Expanded layout (left→right): logo (home) · platform-mode
            switcher (flex-1) · pin. The switcher and pin are expanded-
            only — neither fits the 48px collapsed rail; collapsed shows
            just the logo icon. */}
        <SidebarHeader className="p-0">
          <div className="flex items-center min-h-[44px] px-2 pt-2 pb-1 gap-1">
            <button
              onClick={() => {
                setLogoClicks(c => c + 1)
                handleNavigation(() => router.push("/"))
              }}
              className={cn(
                "flex shrink-0 items-center justify-center px-1 py-1.5 rounded-lg transition-colors duration-150",
                "hover:bg-foreground/[0.04] dark:hover:bg-white/[0.04]",
                "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/50"
              )}
              title="Coasty"
              aria-label="Coasty — home"
            >
              <div className={cn(
                "flex h-6 w-6 items-center justify-center shrink-0 transition-transform duration-500",
                partyMode && "animate-spin"
              )}>
                <CoastyIcon className="h-6 w-6 text-sidebar-primary" />
              </div>
            </button>

            {/* Platform mode switcher — the "text box next to the logo"
                naming the current platform (Consumer / Developer) and
                letting the user switch. Expanded-only, behind a flag. */}
            {expanded && PLATFORM_MODE_SWITCHER_ENABLED && (
              // Compact (shrink-to-content) so it reads as a tidy label beside
              // the logo at every width, instead of stretching across the wider
              // mobile sheet. `min-w-0` lets it truncate if the row ever gets
              // tight; the pin's `ml-auto` keeps it pinned right.
              <PlatformModeSwitcher className="min-w-0" />
            )}

            {/* ── Keep-open toggle ──
                Desktop-only — on mobile the sidebar is a sheet drawer
                with no hover-to-expand, so this has no meaning. Uses the
                sidebar-panel glyph (the modern pattern, à la VS Code /
                Linear) rather than a pushpin: solid/filled panel = locked
                open, outline panel = will auto-collapse on mouse-out.
                Color shifts from a quiet foreground/30 to a deliberate
                foreground/75 with a subtle bg when active; the icon
                lifts on hover and presses in on click. */}
            {expanded && !isMobile && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={togglePinned}
                    aria-label={pinned ? "Unpin sidebar" : "Keep sidebar open"}
                    aria-pressed={pinned}
                    className={cn(
                      "group ml-auto flex h-7 w-7 shrink-0 items-center justify-center rounded-md",
                      "transition-all duration-150 ease-out active:scale-90",
                      "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/50",
                      pinned
                        ? "text-foreground/75 bg-foreground/[0.05] hover:bg-foreground/[0.08] dark:bg-white/[0.05] dark:hover:bg-white/[0.08]"
                        : "text-foreground/30 hover:text-foreground/70 hover:bg-foreground/[0.04] dark:hover:bg-white/[0.04]"
                    )}
                  >
                    {pinned ? (
                      <IconLayoutSidebarFilled
                        size={15}
                        className="transition-transform duration-200 ease-out group-hover:scale-110"
                      />
                    ) : (
                      <IconLayoutSidebar
                        size={15}
                        stroke={1.8}
                        className="transition-transform duration-200 ease-out group-hover:scale-110"
                      />
                    )}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right" sideOffset={8}>
                  <span className="font-medium text-[12px]">
                    {pinned ? "Unpin sidebar" : "Keep sidebar open"}
                  </span>
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        </SidebarHeader>

        {/* ─── Content ──────────────────────────────────────
            Padding is intentionally constant across expand/collapse so
            every icon stays anchored at sidebar-x=24px and never shifts
            during the width transition. */}
        <SidebarContent
          className={cn(
            "pt-2 px-2 overflow-y-auto overflow-x-hidden",
            rainbowMode && "rainbow-wave"
          )}
        >
          <SidebarNavSection
            user={user}
            expanded={expanded}
            isMobile={isMobile}
            closeMobileIfNeeded={closeMobileIfNeeded}
            handleNavigation={handleNavigation}
          />
        </SidebarContent>

        {/* ─── Footer ─────────────────────────────────────── */}
        <SidebarFooter className="relative pt-0">
          <SidebarFooterSection
            user={user}
            expanded={expanded}
            isMobile={isMobile}
            closeMobileIfNeeded={closeMobileIfNeeded}
          />
        </SidebarFooter>

        {/* Dialogs */}
        <DialogCollaborativeAuth
          open={isCollaborativeAuthDialogOpen}
          setOpen={setIsCollaborativeAuthDialogOpen}
        />
        <ReferralPopup
          open={isReferralPopupOpen}
          onOpenChange={setIsReferralPopupOpen}
        />
      </Sidebar>

      {/* Memory quick-edit popup — mounted OUTSIDE the <Sidebar> tree
          so it survives the mobile sidebar's exit animation. The
          sidebar's `AnimatePresence` unmounts its entire children
          subtree ~320ms after `setOpenMobile(false)`; if this lived
          inside, it'd vanish mid-fade and read as "the popup opens
          behind the sidebar". Open/close state is shared via the
          `useMemoryDialog` store. */}
      <MemoryDialogMount />

      {/* Full-screen transition that plays on every platform-mode flip
          (Personal ⇄ Developer), from the header switcher or the in-sidebar
          rows. Mounted here (outside <Sidebar>) so it can cover the whole
          viewport and survives the mobile sidebar's exit animation. */}
      <PlatformSwitchLoader />
    </>
  )
}

// Tiny wrapper so we don't subscribe AppSidebar itself to the memory
// dialog store (which would cause unnecessary re-renders of the sidebar
// tree whenever the popup toggles).
function MemoryDialogMount() {
  const isOpen = useMemoryDialog((s) => s.isOpen)
  const setOpen = useMemoryDialog((s) => s.setOpen)
  return <MemoryDialog open={isOpen} onOpenChange={setOpen} />
}
