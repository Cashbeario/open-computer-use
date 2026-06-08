"use client"

import { useState, useEffect } from "react"
import { captureUtmParams } from "@/lib/posthog/analytics"
import { useSearchParams } from "next/navigation"
import { LandingHeader } from "./landing-header"
import { LandingFooter } from "./landing-footer"
import { HeroVideoMatrix } from "./hero-video-matrix"
import { TopAnnouncementBanner } from "./top-announcement-banner"
import { BenchmarkSection } from "./sections/benchmark"
import { DifferentSection } from "./sections/different"
import { DemoSection } from "./sections/demo"
import { PricingSection } from "./sections/pricing"
import { FAQSection } from "./sections/faq"
import { SectionDivider } from "./guide-lines"

// Minimal landing IA: a calm hero, then five tight sections separated by a
// single hairline divider, then the footer. The old floating HeroTaskShots
// video matrix and the section-reflow plumbing were removed — every section
// now sits centred at its natural width with consistent vertical rhythm.
export function LandingPage() {
  const [isMobile, setIsMobile] = useState(false)
  const searchParams = useSearchParams()

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
        <LandingHeader />
      </div>

      {/* Hero — natural scroll, one viewport tall. */}
      <HeroVideoMatrix isMobile={isMobile} />

      <main className="relative bg-background">
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
        <LandingFooter />
      </main>
    </div>
  )
}
