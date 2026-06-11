"use client"

// ─── PlatformSwitchLoader ─────────────────────────────────────────────
//   A full-screen takeover that plays the moment the user flips the platform
//   mode (Personal ⇄ Developer) from anywhere — the header switcher OR the
//   in-sidebar Developer / Personal rows. It reuses the exact visual of the
//   app-wide PageLoader (drifting ambient orbs + shine title) so the switch
//   feels like loading a whole new surface, with copy tailored to the
//   direction you're heading.
//
//   Design notes:
//   · The platform-mode store stays pure (mode-only, side-effect free). This
//     component simply OBSERVES mode changes and shows the overlay for a beat,
//     so every switch entry point gets the transition for free.
//   · Mounted once at the AppSidebar root (a stable sibling of <Sidebar>, like
//     the memory dialog) so it survives the mobile sidebar's exit animation and
//     can cover the full viewport via `fixed inset-0`.
//   · Honors prefers-reduced-motion by skipping the takeover entirely — exactly
//     like PageLoader — and never flashes on first load (see the baseline ref).

import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { useEffect, useRef, useState } from "react"
import { usePlatformMode, type PlatformMode } from "@/lib/platform-mode-store"
import { LoaderAmbient } from "@/components/common/page-loader"

const EASE = [0.16, 1, 0.3, 1] as const
// Long enough to read the message and let the orbs breathe, short enough that
// a deliberate toggle never feels punished. The exit fade adds ~0.25s on top.
const SWITCH_DURATION_MS = 1900

// Direction-aware copy. Hardcoded English to match the rest of the in-app
// developer surface (which is not localized); kept parallel so the two
// directions read as a matched pair. No em dashes by house style.
const COPY: Record<PlatformMode, { title: string; description: string }> = {
  developer: {
    title: "Entering developer mode",
    description:
      "Your API keys, logs, and usage are coming up. Everything you need to build with the Coasty API.",
  },
  consumer: {
    title: "Back to your workspace",
    description: "Chat, agents, and automation, right where you left off.",
  },
}

/* ── Mobile detection (mirrors PageLoader's, kept local to avoid coupling) ── */
function useIsMobile(breakpoint = 640) {
  const [isMobile, setIsMobile] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint - 1}px)`)
    setIsMobile(mq.matches)
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mq.addEventListener("change", handler)
    return () => mq.removeEventListener("change", handler)
  }, [breakpoint])
  return isMobile
}

export function PlatformSwitchLoader() {
  const mode = usePlatformMode((s) => s.mode)
  const reducedMotion = useReducedMotion()
  const isMobile = useIsMobile()
  const prevMode = useRef<PlatformMode | null>(null)
  const [active, setActive] = useState<PlatformMode | null>(null)

  useEffect(() => {
    // The FIRST observed mode is the baseline — this covers the store's eager
    // hydration from localStorage, so a persisted "developer" never flashes the
    // loader on a fresh page load. Only genuine, post-mount switches play it.
    if (prevMode.current === null) {
      prevMode.current = mode
      return
    }
    if (prevMode.current === mode) return
    prevMode.current = mode
    if (reducedMotion) return // honor reduced motion: no full-screen takeover
    setActive(mode)
    const t = setTimeout(() => setActive(null), SWITCH_DURATION_MS)
    return () => clearTimeout(t)
  }, [mode, reducedMotion])

  const copy = active ? COPY[active] : null

  return (
    <AnimatePresence>
      {active && copy && (
        <motion.div
          key="platform-switch-loader"
          exit={{ opacity: 0, transition: { duration: 0.25, ease: EASE } }}
          className="pointer-events-none fixed inset-0 z-[100] flex flex-col items-center justify-center bg-background"
        >
          <LoaderAmbient />

          <motion.h1
            initial={{ opacity: 0, y: isMobile ? 12 : 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: isMobile ? 0.6 : 0.85,
              ease: EASE,
              delay: isMobile ? 0.1 : 0.05,
            }}
            className="relative z-10 px-8 text-center text-[clamp(28px,5.5vw,60px)] font-semibold tracking-[-0.03em] text-foreground text-shine"
          >
            {copy.title}
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: isMobile ? 8 : 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: isMobile ? 0.5 : 0.75,
              ease: EASE,
              delay: 0.25,
            }}
            className="relative z-10 mt-3 max-w-md px-8 text-center text-sm sm:text-base leading-relaxed text-muted-foreground"
          >
            {copy.description}
          </motion.p>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
