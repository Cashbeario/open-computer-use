"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react"
import {
  CONSENT_STORAGE_KEY,
  GEO_COOKIE,
  isOptInCountry,
  type ConsentDecision,
} from "./config"

export type ConsentState = {
  /** True once storage + geo + GPC have been read on the client. Until then,
   *  analytics stay off and no banner renders (prevents an SSR/first-paint
   *  flash and any pre-consent capture). */
  ready: boolean
  /** Whether non-essential analytics (PostHog, Umami) may run right now. */
  analyticsAllowed: boolean
  /** Whether to render the opt-in banner (opt-in region, no decision, no GPC). */
  showBanner: boolean
  /** The stored explicit decision, if any. */
  decision: ConsentDecision | null
  /** True for EU/EEA/UK visitors (drives whether opting out is the default). */
  optInRegion: boolean
  /** Persist an explicit grant and start analytics. */
  accept: () => void
  /** Persist an explicit denial and stop analytics. */
  reject: () => void
}

const DEFAULT_STATE: ConsentState = {
  ready: false,
  analyticsAllowed: false,
  showBanner: false,
  decision: null,
  optInRegion: false,
  accept: () => {},
  reject: () => {},
}

const ConsentContext = createContext<ConsentState | null>(null)

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null
  const match = document.cookie.match(
    new RegExp("(?:^|; )" + name + "=([^;]*)")
  )
  return match ? decodeURIComponent(match[1]) : null
}

function gpcEnabled(): boolean {
  if (typeof navigator === "undefined") return false
  // Global Privacy Control: a legally recognized opt-out signal (CCPA/CPRA).
  return (navigator as unknown as { globalPrivacyControl?: boolean })
    .globalPrivacyControl === true
}

export function ConsentProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false)
  const [decision, setDecision] = useState<ConsentDecision | null>(null)
  const [optInRegion, setOptInRegion] = useState(false)
  const [gpc, setGpc] = useState(false)

  useEffect(() => {
    let stored: ConsentDecision | null = null
    try {
      const v = window.localStorage.getItem(CONSENT_STORAGE_KEY)
      if (v === "granted" || v === "denied") stored = v
    } catch {
      // localStorage unavailable (private mode / sandboxed iframe). Treat as
      // "no decision" and fall back to the region default below.
    }
    setDecision(stored)
    setOptInRegion(isOptInCountry(readCookie(GEO_COOKIE)))
    setGpc(gpcEnabled())
    setReady(true)
  }, [])

  const persist = useCallback((d: ConsentDecision) => {
    setDecision(d)
    try {
      window.localStorage.setItem(CONSENT_STORAGE_KEY, d)
    } catch {
      // Best-effort: if persistence fails the user is simply re-prompted (in
      // opt-in regions) or stays on the region default — never silently tracked.
    }
  }, [])

  const accept = useCallback(() => persist("granted"), [persist])
  const reject = useCallback(() => persist("denied"), [persist])

  const value = useMemo<ConsentState>(() => {
    const base = { ready, decision, optInRegion, accept, reject }

    // GPC is a hard opt-out signal — honor it everywhere and never nag with a
    // banner. An explicit later "granted" (e.g. via settings) still wins.
    if (gpc) {
      return { ...base, analyticsAllowed: decision === "granted", showBanner: false }
    }

    // Explicit choice always wins.
    if (decision) {
      return { ...base, analyticsAllowed: decision === "granted", showBanner: false }
    }

    // No decision yet.
    if (optInRegion) {
      // EU/UK: analytics OFF until opt-in; show the banner once we're ready.
      return { ...base, analyticsAllowed: false, showBanner: ready }
    }

    // Opt-out region (US, etc.): analytics ON by default, no banner.
    return { ...base, analyticsAllowed: ready, showBanner: false }
  }, [ready, decision, optInRegion, gpc, accept, reject])

  return (
    <ConsentContext.Provider value={value}>{children}</ConsentContext.Provider>
  )
}

export function useConsent(): ConsentState {
  // Defensive default: if used outside the provider, fail closed (no tracking,
  // no banner) rather than throwing or leaking capture.
  return useContext(ConsentContext) ?? DEFAULT_STATE
}
