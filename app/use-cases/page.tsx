"use client"

/**
 * Use Cases hub — rebuilt to share the landing page's design language.
 *
 * Same vocabulary as the landing: Geist Sans + Mono, strict monochrome (no
 * brand hue — the per-use-case `color` field in data.ts is intentionally
 * ignored here), hairline dividers, glass-card chrome, the signature quint
 * ease. Every use-case card and its `/use-cases/{slug}` link is preserved,
 * plus the mono "Use Cases" eyebrow (carries the SEO keyword) and the final
 * CTA. Content (hero copy, hero stats, labels, outcomes) is kept verbatim.
 *
 * Removed from the previous version: the colored card chrome, the `font-bold`
 * headline, and the bespoke `.public-card-enter` / `.public-fade-up` CSS
 * animation classes — replaced by the canonical framer-motion reveal so the
 * page matches pricing / the landing exactly.
 *
 * SEO / metadata lives in the sibling layout.tsx (untouched). data.ts is the
 * single source of truth for the cards and is not modified.
 */

import Link from "next/link"
import { motion } from "framer-motion"
import { ArrowRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { LandingHeader } from "@/app/components/landing/landing-header"
import { LandingFooter } from "@/app/components/landing/landing-footer"
import { SectionDivider } from "@/app/components/landing/guide-lines"
import { USE_CASES } from "./data"

const EASE = [0.22, 1, 0.36, 1] as const

const PRIMARY_PILL = cn(
  "group inline-flex items-center justify-center gap-2 rounded-full font-medium",
  "bg-foreground text-background",
  "shadow-[0_1px_0_0_rgba(255,255,255,0.08)_inset,0_6px_18px_-10px_rgba(0,0,0,0.22)]",
  "dark:shadow-[0_1px_0_0_rgba(0,0,0,0.10)_inset,0_6px_18px_-10px_rgba(0,0,0,0.40)]",
  "transition-[box-shadow,transform] duration-300 hover:scale-[1.012] active:scale-[0.985]",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
  "px-7 py-3 text-[14.5px]",
)

export default function UseCasesPage() {
  return (
    <div className="relative min-h-screen overflow-x-clip bg-background text-foreground">
      <LandingHeader />

      <main className="relative">
        {/* ─── Hero ──────────────────────────────────────────────────────
            Centered editorial gradient headline ("type from paper" sheen)
            over a quiet neutral wash. The mono eyebrow carries the
            "Use Cases" SEO keyword. */}
        <section className="relative overflow-hidden px-5 pt-32 pb-10 sm:px-10 sm:pt-40 sm:pb-14">
          <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
            <div
              className="absolute left-1/2 top-0 h-[460px] w-[760px] max-w-[120vw] -translate-x-1/2"
              style={{
                background:
                  "radial-gradient(ellipse at center, color-mix(in oklab, var(--foreground) 5%, transparent), transparent 70%)",
              }}
            />
          </div>

          <div className="relative mx-auto max-w-3xl text-center">
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, ease: EASE }}
              className="mb-5 font-mono text-[11px] uppercase tracking-[0.24em] text-foreground/45"
            >
              Use Cases
            </motion.p>
            <motion.h1
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.95, delay: 0.05, ease: EASE }}
              className={cn(
                "font-semibold tracking-[-0.045em] text-balance pb-1 sm:pb-2",
                "bg-clip-text text-transparent",
                "bg-gradient-to-b from-foreground to-foreground/85 dark:from-white dark:to-white/82",
                "text-[2.1rem] leading-[1.1] sm:text-5xl sm:leading-[1.08] lg:text-[3.25rem]",
              )}
            >
              10x on autopilot.
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.18, ease: EASE }}
              className="mx-auto mt-5 max-w-xl text-[15px] leading-[1.55] text-foreground/65 dark:text-white/65 sm:text-base"
            >
              An AI agent that controls a real computer. It delivers competitor reports, QA tests, lead lists, and more. Pick a use case and see what you get.
            </motion.p>
          </div>
        </section>

        <SectionDivider />

        {/* ─── Use Case Grid ─────────────────────────────────────────────
            Landing glass-card recipe (monochrome) — top sheen hairline,
            hover lift + shadow. Each card links to /use-cases/{slug}. */}
        <section className="px-5 py-20 sm:px-10 sm:py-24 lg:py-28">
          <div className="mx-auto max-w-6xl">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3">
              {USE_CASES.map((uc, i) => {
                const Icon = uc.icon

                return (
                  <motion.div
                    key={uc.slug}
                    initial={{ opacity: 0, y: 16 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, amount: 0, margin: "0px 0px -80px 0px" }}
                    transition={{ duration: 0.5, ease: EASE, delay: (i % 3) * 0.06 }}
                  >
                    <Link
                      href={`/use-cases/${uc.slug}`}
                      className={cn(
                        "group relative flex h-full flex-col overflow-hidden rounded-2xl",
                        "border border-foreground/10 bg-card/40 backdrop-blur-[2px]",
                        "transition-[border-color,box-shadow,transform] duration-500",
                        "hover:border-foreground/20 hover:-translate-y-0.5",
                        "hover:shadow-[0_1px_2px_rgba(0,0,0,0.04),0_18px_44px_-22px_rgba(0,0,0,0.18)]",
                        "dark:hover:shadow-[0_1px_2px_rgba(0,0,0,0.3),0_18px_44px_-22px_rgba(0,0,0,0.5)]",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                      )}
                    >
                      {/* Top sheen hairline */}
                      <span
                        aria-hidden
                        className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-foreground/15 to-transparent"
                      />

                      {/* Visual hero: large stat + monochrome icon backdrop */}
                      <div className="relative overflow-hidden px-5 pt-6 pb-3 sm:px-6">
                        <Icon
                          aria-hidden
                          className="absolute -right-3 -top-3 size-24 text-foreground/[0.04] transition-all duration-500 group-hover:scale-110 group-hover:text-foreground/[0.07] dark:text-foreground/[0.05]"
                          strokeWidth={1}
                        />
                        <div className="relative">
                          <span className="text-3xl font-semibold tracking-tight tabular-nums text-foreground sm:text-4xl">
                            {uc.heroStat}
                          </span>
                          <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/60">
                            {uc.heroStatLabel}
                          </p>
                        </div>
                      </div>

                      {/* Content */}
                      <div className="flex flex-1 flex-col px-5 pb-5 sm:px-6 sm:pb-6">
                        <div className="mb-2 flex items-center gap-2">
                          <Icon
                            aria-hidden
                            className="size-3.5 text-foreground/40 transition-colors duration-500 group-hover:text-foreground/70"
                            strokeWidth={1.8}
                          />
                          <h3 className="text-sm font-semibold tracking-tight text-foreground">
                            {uc.label}
                          </h3>
                        </div>

                        <p className="flex-1 text-[13px] leading-relaxed text-muted-foreground/70">
                          {uc.outcome}
                        </p>

                        <div className="mt-4 flex items-center gap-1.5 text-[11px] font-medium text-foreground/45 transition-colors duration-300 group-hover:text-foreground">
                          <span>See details</span>
                          <ArrowRight className="size-3 transition-transform duration-300 group-hover:translate-x-0.5" />
                        </div>
                      </div>
                    </Link>
                  </motion.div>
                )
              })}
            </div>
          </div>
        </section>

        <SectionDivider />

        {/* ─── Final CTA ─────────────────────────────────────────────────
            Solid foreground pill (the landing hero's primary CTA chrome). */}
        <section className="px-5 py-20 sm:px-10 sm:py-28">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0, margin: "0px 0px -80px 0px" }}
            transition={{ duration: 0.6, ease: EASE }}
            className="mx-auto max-w-2xl text-center"
          >
            <h2
              className={cn(
                "font-semibold tracking-[-0.03em] text-balance pb-1 sm:pb-2",
                "bg-clip-text text-transparent",
                "bg-gradient-to-b from-foreground to-foreground/85 dark:from-white dark:to-white/82",
                "text-[1.75rem] leading-[1.15] sm:text-4xl",
              )}
            >
              Ready to 10x your output?
            </h2>
            <div className="mt-8 flex flex-col items-center gap-4">
              <Link href="/auth" className={PRIMARY_PILL}>
                Try Coasty Free
                <ArrowRight className="h-3.5 w-3.5 transition-transform duration-300 ease-out group-hover:translate-x-0.5" />
              </Link>
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-foreground/35">
                No credit card required
              </p>
            </div>
          </motion.div>
        </section>
      </main>

      <LandingFooter />
    </div>
  )
}
