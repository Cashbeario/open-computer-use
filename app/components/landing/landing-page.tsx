"use client"

import { useState, useEffect, useCallback } from "react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { captureUtmParams } from "@/lib/posthog/analytics"
import { useSearchParams } from "next/navigation"
import { DEVELOPERS_API_ENABLED, DATA_LANDING_ENABLED } from "@/lib/feature-flags"
import { LandingHeader } from "./landing-header"
import { LandingFooter } from "./landing-footer"
import { HeroVideoMatrix, type LandingView } from "./hero-video-matrix"
import { TopAnnouncementBanner } from "./top-announcement-banner"
import { BenchmarkSection } from "./sections/benchmark"
import { DifferentSection } from "./sections/different"
import { DemoSection } from "./sections/demo"
import { PricingSection } from "./sections/pricing"
import { FAQSection } from "./sections/faq"
import {
  DevQuickstartSection,
  DevCapabilitiesSection,
  DevPricingSection,
  DevFaqSection,
} from "./sections/developer"
import {
  DataWhySection,
  DataSpecSection,
  DataBuyersSection,
  DataCustomSection,
  DataProcessSection,
} from "./sections/data"
import { SectionDivider } from "./guide-lines"

// The landing views that are currently enabled. "product" is always on;
// the other stories ship behind their own kill-switches.
const ENABLED_VIEWS: readonly LandingView[] = [
  "product",
  ...(DEVELOPERS_API_ENABLED ? (["developers"] as const) : []),
  ...(DATA_LANDING_ENABLED ? (["data"] as const) : []),
]

// Views offered in the hero switcher. The data story is deliberately NOT
// listed — it stays reachable only through its /?view=data deep link, so it
// can be shared with prospects without advertising it on the public pill.
const TOGGLE_VIEWS: readonly LandingView[] = ENABLED_VIEWS.filter((v) => v !== "data")

// Minimal landing IA: a calm hero, then five tight sections separated by a
// single hairline divider, then the footer. The old floating HeroTaskShots
// video matrix and the section-reflow plumbing were removed — every section
// now sits centred at its natural width with consistent vertical rhythm.
//
// When DEVELOPERS_API_ENABLED is on, the hero gains a Product/Developers
// toggle that swaps the whole story below it for the public API view
// (quickstart, API surface, metered pricing, dev FAQ). The view is
// deep-linkable via ?view=developers and crossfades section stacks without
// touching the shared header/hero/footer chrome.
export function LandingPage() {
  const [isMobile, setIsMobile] = useState(false)
  const [view, setView] = useState<LandingView>("product")
  const searchParams = useSearchParams()
  const prefersReduced = useReducedMotion()
  // The view swap is a crossfade; under reduced motion it snaps instead.
  const swapFade = {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
    transition: { duration: prefersReduced ? 0 : 0.25, ease: [0.22, 1, 0.36, 1] as const },
  }

  // Capture referral code + UTM params from the URL.
  useEffect(() => {
    const ref = searchParams.get("ref")
    if (ref) {
      localStorage.setItem("coasty_referral_code", ref)
      const url = new URL(window.location.href)
      url.searchParams.delete("ref")
      window.history.replaceState({}, "", url.toString())
    }
    captureUtmParams()
  }, [searchParams])

  // Deep link: /?view=developers or /?view=data opens that view directly
  // (only while the corresponding story is enabled).
  useEffect(() => {
    const v = searchParams.get("view")
    if (v && v !== "product" && (ENABLED_VIEWS as readonly string[]).includes(v)) {
      setView(v as LandingView)
    }
  }, [searchParams])

  // Keep the URL in sync (replace, not push — toggling shouldn't pollute
  // back-button history).
  const switchView = useCallback((v: LandingView) => {
    setView(v)
    const url = new URL(window.location.href)
    if (v === "product") url.searchParams.delete("view")
    else url.searchParams.set("view", v)
    window.history.replaceState({}, "", url.toString())
  }, [])

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768)
    onResize()
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [])

  return (
    <div className="min-h-screen bg-background relative isolate overflow-x-clip">
      {/* Dismissible announcement bar, fixed above the header. */}
      <TopAnnouncementBanner />

      <div id="landing-header-wrap">
        <LandingHeader dataView={view === "data"} />
      </div>

      {/* Hero — natural scroll, one viewport tall. */}
      <HeroVideoMatrix
        isMobile={isMobile}
        view={view}
        views={TOGGLE_VIEWS}
        onViewChange={TOGGLE_VIEWS.length > 1 ? switchView : undefined}
      />

      <main className="relative bg-background">
        <AnimatePresence mode="wait" initial={false}>
          {view === "data" ? (
            <motion.div key="data" {...swapFade}>
              <SectionDivider />
              <DataWhySection isMobile={isMobile} />
              <SectionDivider />
              <DataSpecSection isMobile={isMobile} />
              <SectionDivider />
              <DataBuyersSection isMobile={isMobile} />
              <SectionDivider />
              <DataCustomSection isMobile={isMobile} />
              <SectionDivider />
              <DataProcessSection isMobile={isMobile} />
              <SectionDivider />
            </motion.div>
          ) : view === "developers" ? (
            <motion.div key="developers" {...swapFade}>
              <SectionDivider />
              <DevQuickstartSection isMobile={isMobile} />
              <SectionDivider />
              <DevCapabilitiesSection isMobile={isMobile} />
              <SectionDivider />
              <DevPricingSection isMobile={isMobile} />
              <SectionDivider />
              <DevFaqSection isMobile={isMobile} />
              <SectionDivider />
            </motion.div>
          ) : (
            <motion.div key="product" {...swapFade}>
              <SectionDivider />
              <BenchmarkSection isMobile={isMobile} />
              <SectionDivider />
              <DifferentSection isMobile={isMobile} />
              <SectionDivider />
              <DemoSection isMobile={isMobile} />
              <SectionDivider />
              <PricingSection isMobile={isMobile} />
              <SectionDivider />
              <FAQSection isMobile={isMobile} />
              <SectionDivider />
            </motion.div>
          )}
        </AnimatePresence>
        <LandingFooter />
      </main>
    </div>
  )
}
