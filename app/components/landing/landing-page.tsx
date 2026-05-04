"use client"

import { useState, useEffect } from "react"
import { captureUtmParams } from "@/lib/posthog/analytics"
import { useSearchParams } from "next/navigation"
import { LandingHeader } from "./landing-header"
import { LandingFooter } from "./landing-footer"
import { HeroVideoMatrix } from "./hero-video-matrix"
import { TopAnnouncementBanner } from "./top-announcement-banner"
import { BenchmarkSection } from "./sections/benchmark"
import { WhyCoastySection } from "./sections/why-coasty"
import { DemoSection } from "./sections/demo"
import { CostSection } from "./sections/cost"
import { FeaturesSection } from "./sections/features"
import { PricingSection } from "./sections/pricing"
import { FAQSection } from "./sections/faq"
import { SectionDivider as SharedSectionDivider } from "./guide-lines"

export function LandingPage() {
  const [isMobile, setIsMobile] = useState(false)

  const searchParams = useSearchParams()

  // Capture referral code and UTM params from URL
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

  // Detect mobile
  useEffect(() => {
    setIsMobile(window.innerWidth < 768)
    const onResize = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const SectionDivider = SharedSectionDivider

  return (
    <>
      <div className="min-h-screen bg-background relative isolate overflow-x-clip">

      {/* Top announcement banner — fixed above the header, dismissible,
          persisted in localStorage. The banner sets `--top-banner-h` on
          the document root; the LandingHeader's `top` reads that var so
          it sits flush below the banner whenever it's visible. */}
      <TopAnnouncementBanner />

      {/* Fixed header */}
      <div id="landing-header-wrap">
        <LandingHeader />
      </div>

      {/* Hero Section — cinematic zoom-out video matrix */}
      <HeroVideoMatrix isMobile={isMobile} />

      {/* Main content — pulled up 100vh so it fills the viewport exactly when
          the hero un-sticks. z-[1] places it above the hero. The hero's rAF
          loop cross-fades #hero-crossfade from opacity 0→1 during the dissolve
          phase, creating a seamless cinema dissolve from grid to content. */}
      <main className="relative z-[1]" style={{ marginTop: '-100vh' }}>
        <div
          id="hero-crossfade"
          className="bg-background relative"
          style={{ opacity: 0, pointerEvents: "none" }}
        >
          {/* Social Proof Bar removed — these stats now live inside the hero
              overlay (see [hero-video-matrix.tsx](./hero-video-matrix.tsx))
              so users see every value dimension at the same time as the
              headline, without an extra scroll. */}

        <SectionDivider />

        {/* ══════════════════════════════════════════════════════════════
            Guided Sections — flowing vertical layout.
            Each section sits at its natural height with consistent
            rhythm (py-20 sm:py-24 lg:py-32) inside a max-w-6xl container.
            Section transitions are handled by SectionDivider between them.
           ══════════════════════════════════════════════════════════════ */}
        <div className="max-w-7xl mx-auto">

        <BenchmarkSection isMobile={isMobile} />

        <SectionDivider />

        <FeaturesSection isMobile={isMobile} />

        <SectionDivider />

        <WhyCoastySection isMobile={isMobile} />

        <SectionDivider />

        <DemoSection isMobile={isMobile} />

        <SectionDivider />

        <CostSection isMobile={isMobile} />

        <SectionDivider />

        <PricingSection isMobile={isMobile} />

        </div>{/* end Guided Sections wrapper */}

        <SectionDivider />

        <FAQSection isMobile={isMobile} />

        <SectionDivider />

        {/* Footer */}
        <LandingFooter />
        </div>{/* end #hero-crossfade */}
      </main>
      </div>
    </>
  )
}
