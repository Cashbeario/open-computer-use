"use client"

import { useTranslations } from "next-intl"
import { LandingSectionHeader } from "../section-shell"

/**
 * "What makes it different" — the merged differentiator section that replaces
 * the cinematic why-coasty vignettes and the Features bento. Text-led, four
 * points, one signature element (a hairline grid). No spotlights, vignettes,
 * eyebrows, or per-item motion — the section header carries the only entrance.
 *
 * Copy is pulled from the existing `whyCoasty` i18n namespace (localized in all
 * locales), matching every sibling section's useTranslations() wiring.
 */

const POINT_KEYS = ["worksLikeHuman", "noScripts", "handlesUnexpected", "runsInIsolation"] as const

export function DifferentSection({ isMobile = false }: { isMobile?: boolean }) {
  const t = useTranslations("whyCoasty")

  return (
    <section id="different" className="py-20 sm:py-24 lg:py-32 px-8 sm:px-10 lg:px-12">
      <div className="mx-auto max-w-4xl">
        <LandingSectionHeader title={t("title")} isMobile={isMobile} />

        {/* Hairline grid: cells sit on a faint background that shows through the
            1px gaps, so the dividers need no extra chrome. */}
        <div className="grid overflow-hidden rounded-2xl border border-foreground/[0.08] bg-foreground/[0.06] gap-px sm:grid-cols-2">
          {POINT_KEYS.map((key) => (
            <div key={key} className="bg-background p-6 sm:p-8">
              <h3 className="text-[15px] sm:text-base font-semibold tracking-tight text-foreground">
                {t(`${key}.title`)}
              </h3>
              <p className="mt-2 text-[13.5px] sm:text-sm leading-relaxed text-muted-foreground">
                {t(`${key}.description`)}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
