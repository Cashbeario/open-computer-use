"use client"

import { useState, useEffect } from "react"
import { captureUtmParams } from "@/lib/posthog/analytics"
import { cn } from "@/lib/utils"
import { useTheme } from "next-themes"
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
import { GuideLines, SectionDivider as SharedSectionDivider } from "./guide-lines"
import dynamic from "next/dynamic"

// Cursor murmuration — boids flock of OS-pointer arrows. Self-gates by
// device tier internally: WebGL on desktop/tablet, nothing on mobile and
// reduced-motion. Loads three.js only when the WebGL path is actually used.
const CursorMurmuration = dynamic(() => import("@/components/CursorMurmuration"), {
  ssr: false,
  loading: () => null,
})

export function LandingPage() {
  const [isMobile, setIsMobile] = useState(false)
  const [mounted, setMounted] = useState(false)
  const { resolvedTheme } = useTheme()

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

  // Detect mobile — single mount effect that batches all initial state
  useEffect(() => {
    const isSmallDevice = window.innerWidth < 768
    setIsMobile(isSmallDevice)
    setMounted(true)

    const onResize = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const SectionDivider = SharedSectionDivider

  return (
    <>
      {/* `isolate` creates a stacking context here so the cursor canvas can
          sit at a negative z-index (below all siblings) without escaping
          behind the page background. Without this, `-z-10` on `#beams-bg`
          would render the canvas behind the body and disappear. */}
      <div className="min-h-screen bg-background relative isolate overflow-x-clip">

      <div id="guide-lines-wrap">
        <GuideLines />
      </div>

      {/* Cursor murmuration — hundreds of tiny pointer arrows flocking like
          starlings. WebGL on desktop, static SVG on mobile / reduced-motion.
          The element ID is preserved so the hero scroll choreography in
          [hero-video-matrix.tsx](./hero-video-matrix.tsx) can keep fading
          this layer as the user scrolls. In light mode the layer is
          inverted so the white-cursor scene reads as black-on-light. */}
      <div id="beams-bg" className={cn("fixed inset-0 -z-10 pointer-events-none", mounted && resolvedTheme !== "dark" && "invert")} aria-hidden="true">
        <div className="mx-auto h-full max-w-7xl px-4 sm:px-6 relative">
          <div className="absolute inset-y-0 left-4 sm:left-6 right-4 sm:right-6 overflow-hidden [mask-image:radial-gradient(ellipse_90%_85%_at_50%_45%,black_0%,black_38%,transparent_82%)] sm:[mask-image:radial-gradient(ellipse_110%_95%_at_50%_45%,black_0%,black_45%,transparent_92%)]">
            {mounted && <CursorMurmuration />}
          </div>
        </div>
      </div>

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
          {/* Guide lines for the content area — mirrored copy of the outer
              GuideLines, scoped to #hero-crossfade so they paint on top of
              this layer's `bg-background` instead of being hidden by it.
              They fade in with the content via the parent's opacity. */}
          <GuideLines />

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
