"use client"

/**
 * UnlimitedComparisonCallout — competitor-page banner that lands the
 * "Coasty <Unlimited price>/mo vs <Competitor> $X" claim in the rendered
 * HTML (not just metadata). Price strings come from priceMonthly/priceUSD
 * so they stay in sync with lib/pricing/tiers.ts.
 *
 * Why this exists:
 *   Per the Peec 2026 study, comparison pages capture ~32.5% of AI
 *   citations. The single sentence an LLM will lift from a comparison
 *   page is the explicit head-to-head price + capability claim. Keeping
 *   it in semantic HTML — not behind canvas/animation/i18n indirection —
 *   is what makes that citation actually happen.
 *
 * Structure (intentionally crawler-friendly):
 *   - <p><strong>Coasty Unlimited — {priceMonthlyLong("unlimited")}</strong>
 *     ... vs <strong>{Competitor} — {Competitor price}</strong>.</p>
 *   - One factual zinger sentence per competitor (the citation hook).
 *   - One CTA link out to /pricing#unlimited.
 *
 * The amber-smoke ambient effect is decorative; the text is the asset.
 */

import Link from "next/link"
import { motion } from "framer-motion"
import { ArrowRight, Infinity as InfinityIcon } from "lucide-react"
import { UnlimitedSmoke } from "@/app/components/effects/unlimited-smoke"
import {
  priceDollar,
  priceUSD,
} from "@/lib/pricing/format"

interface UnlimitedComparisonCalloutProps {
  competitorName: string
  competitorPrice: string
  /** Factual one-line head-to-head sentence; the AI-citation hook. */
  unlimitedZinger: string
  /** Framer-motion delay so it staggers with surrounding sections. */
  delay?: number
}

export function UnlimitedComparisonCallout({
  competitorName,
  competitorPrice,
  unlimitedZinger,
  delay = 0.12,
}: UnlimitedComparisonCalloutProps) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay }}
      className="relative isolate overflow-hidden rounded-2xl border border-foreground/20 bg-card/40 backdrop-blur-[2px] mb-12"
      aria-label={`Coasty Unlimited ${priceUSD("unlimited")} per month vs ${competitorName} ${competitorPrice}`}
    >
      <UnlimitedSmoke variant="hero" />
      {/* Top sheen hairline — matches the landing glass cards. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-8 top-0 z-10 h-px bg-gradient-to-r from-transparent via-foreground/25 to-transparent"
      />

      <div className="relative z-10 p-6 sm:p-8 lg:p-10 flex flex-col lg:flex-row lg:items-center gap-6 lg:gap-10">
        {/* Left: price + label */}
        <div className="flex-shrink-0">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-foreground/15 bg-foreground/[0.04] px-2.5 py-1 mb-3">
            <InfinityIcon className="h-3.5 w-3.5 text-foreground/60" strokeWidth={2.5} />
            <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-foreground/70">
              Coasty Unlimited
            </span>
          </div>
          <p className="text-4xl sm:text-5xl font-semibold tracking-tight leading-none">
            {priceDollar("unlimited")}<span className="text-lg sm:text-xl font-medium text-muted-foreground">/mo</span>
          </p>
          <p className="text-xs text-muted-foreground/70 mt-1">
            vs {competitorName} — {competitorPrice}
          </p>
        </div>

        {/* Center: citation-grade head-to-head sentence */}
        <div className="flex-1 min-w-0">
          <p className="text-base sm:text-lg leading-relaxed text-foreground/90">
            {unlimitedZinger}
          </p>
          <p className="text-[13px] text-muted-foreground/70 mt-2">
            The cheapest flat-rate unlimited computer-use plan available, ranked #1 on OSWorld at 82%.
          </p>
        </div>

        {/* Right: CTA */}
        <div className="flex-shrink-0">
          <Link
            href="/pricing#unlimited"
            className="group inline-flex items-center gap-2 whitespace-nowrap rounded-full bg-foreground px-6 py-2.5 text-sm font-medium text-background shadow-[0_1px_0_0_rgba(255,255,255,0.08)_inset,0_6px_18px_-10px_rgba(0,0,0,0.22)] transition-[box-shadow,transform] duration-300 hover:scale-[1.012] active:scale-[0.985] dark:shadow-[0_1px_0_0_rgba(0,0,0,0.10)_inset,0_6px_18px_-10px_rgba(0,0,0,0.40)]"
          >
            Get Unlimited
            <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5" />
          </Link>
        </div>
      </div>
    </motion.section>
  )
}
