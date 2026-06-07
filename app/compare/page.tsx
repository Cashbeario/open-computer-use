"use client"

/**
 * Compare hub (/compare) — restyled into the landing page's design language.
 *
 * Same vocabulary as the landing + pricing pages: Geist Sans + Mono, strict
 * monochrome (no brand hue), hairline dividers, glass-card chrome, the
 * signature quint ease, gradient "type-from-paper" hero. The competitor grid
 * keeps the existing comparison links/data and the `comparePage` i18n
 * namespace verbatim. SEO metadata lives in the sibling layout.tsx (untouched).
 *
 * Note: the competitor cards wrap a <Link>, so they use the plain-CSS
 * `public-card-enter` stagger (see globals.css) instead of framer-motion
 * variants — wrapping a <Link> in <motion.*> swallows the first pointerdown on
 * mobile (motion's tap-vs-drag gesture disambiguation), causing a double-tap
 * bug. Framer is used only on non-Link elements (hero, CTA).
 */

import Link from "next/link"
import { LandingHeader } from "@/app/components/landing/landing-header"
import { LandingFooter } from "@/app/components/landing/landing-footer"
import { SectionDivider } from "@/app/components/landing/guide-lines"
import { ArrowRight, ArrowUpRight } from "lucide-react"
import { motion } from "framer-motion"
import { useTranslations } from "next-intl"
import { cn } from "@/lib/utils"

const EASE = [0.22, 1, 0.36, 1] as const

const competitors = [
  { slug: "anthropic-computer-use", name: "Anthropic Computer Use", tagline: "Managed platform vs raw API", category: "AI Agent" },
  { slug: "openai-operator", name: "OpenAI Operator", tagline: "Higher benchmarks, multi-model, open source", category: "AI Agent" },
  { slug: "adept-ai", name: "Adept AI", tagline: "Production-ready with proven results", category: "AI Agent" },
  { slug: "multion", name: "Multion", tagline: "Full desktop control, not just browser", category: "AI Agent" },
  { slug: "browserbase", name: "Browserbase", tagline: "Complete AI employee vs browser infra", category: "Infrastructure" },
  { slug: "induced-ai", name: "Induced AI", tagline: "VM isolation + CAPTCHA solving included", category: "AI Agent" },
  { slug: "devin-ai", name: "Devin AI", tagline: "General-purpose agent vs code-only", category: "AI Agent" },
  { slug: "uipath", name: "UiPath", tagline: "AI vision vs brittle RPA scripts", category: "RPA" },
  { slug: "automation-anywhere", name: "Automation Anywhere", tagline: "Adaptive AI vs rigid automation", category: "RPA" },
  { slug: "virtual-assistant", name: "Human Virtual Assistant", tagline: "$20/mo vs $3,000/mo — works 24/7", category: "Human" },
]

// Card stagger (ms) — see globals.css `.public-card-enter`. Used as plain
// CSS instead of framer-motion variants because wrapping a <Link> in
// <motion.*> causes a mobile double-tap bug (motion's gesture system
// swallows the first pointerdown to disambiguate tap vs drag).
const CARD_STAGGER_MS = 50

// Landing glass-card recipe minus the mouse-tracking spotlight (which needs a
// client handler per card) — hover lift + sheen are pure CSS.
const CARD_CHROME =
  "group relative overflow-hidden rounded-2xl border border-foreground/10 bg-card/40 backdrop-blur-[2px] " +
  "transition-[border-color,box-shadow,transform] duration-500 " +
  "hover:border-foreground/20 hover:-translate-y-0.5 " +
  "hover:shadow-[0_1px_2px_rgba(0,0,0,0.04),0_18px_44px_-22px_rgba(0,0,0,0.18)] " +
  "dark:hover:shadow-[0_1px_2px_rgba(0,0,0,0.3),0_18px_44px_-22px_rgba(0,0,0,0.5)]"

export default function ComparePage() {
  const t = useTranslations("comparePage")

  return (
    <div className="relative min-h-screen overflow-x-clip bg-background text-foreground">
      <LandingHeader />

      <main className="relative">
        {/* ─── Hero ─────────────────────────────────────────────────────────
            Editorial gradient headline (the landing's "type from paper" sheen)
            over a quiet neutral wash. Keeps the existing SEO eyebrow. */}
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
              transition={{ duration: 0.8, delay: 0.05, ease: EASE }}
              className="mb-5 font-mono text-[11px] uppercase tracking-[0.24em] text-foreground/45"
            >
              {t("title")}
            </motion.p>
            <motion.h1
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.95, delay: 0.1, ease: EASE }}
              className={cn(
                "font-semibold tracking-[-0.045em] text-balance pb-1 sm:pb-2",
                "bg-clip-text text-transparent",
                "bg-gradient-to-b from-foreground to-foreground/85 dark:from-white dark:to-white/82",
                "text-[2.1rem] leading-[1.1] sm:text-5xl sm:leading-[1.08] lg:text-[3.25rem]",
              )}
            >
              {t("heroTitle")}
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.22, ease: EASE }}
              className="mx-auto mt-5 max-w-xl text-[15px] leading-[1.55] text-foreground/65 dark:text-white/65 sm:text-base"
            >
              {t("heroDescription")}
            </motion.p>
          </div>
        </section>

        <SectionDivider />

        {/* ─── Comparison grid ──────────────────────────────────────────────
            Every competitor link/data preserved. Glass-card chrome + top sheen
            hairline; CSS stagger entrance (no motion wrapper around <Link>). */}
        <section className="px-5 py-20 sm:px-10 sm:py-24 lg:py-28">
          <div className="mx-auto max-w-6xl">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {competitors.map((comp, i) => (
                <div
                  key={comp.slug}
                  className="public-card-enter"
                  style={{
                    ["--card-i" as string]: i,
                    ["--card-stagger-ms" as string]: `${CARD_STAGGER_MS}ms`,
                  }}
                >
                  <Link href={`/compare/${comp.slug}`} className={cn(CARD_CHROME, "flex h-full flex-col p-5 sm:p-6")}>
                    <span
                      aria-hidden
                      className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-foreground/15 to-transparent"
                    />
                    <div className="mb-4 flex items-center justify-between">
                      <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-foreground/40">
                        {comp.category}
                      </span>
                      <ArrowUpRight className="h-3.5 w-3.5 text-foreground/25 transition-all duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-foreground/60" />
                    </div>
                    <h3 className="mb-2 text-base font-semibold leading-snug tracking-tight text-foreground transition-colors duration-300 group-hover:text-foreground/80">
                      {t("vsLabel", { name: comp.name })}
                    </h3>
                    <p className="flex-1 text-sm leading-relaxed text-muted-foreground/70">
                      {comp.tagline}
                    </p>
                  </Link>
                </div>
              ))}
            </div>
          </div>
        </section>

        <SectionDivider />

        {/* ─── Final CTA ────────────────────────────────────────────────────
            Solid foreground pill (the landing hero's primary CTA chrome). */}
        <section className="px-5 py-20 sm:px-10 sm:py-28">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0, margin: "0px 0px -80px 0px" }}
            transition={{ duration: 0.6, ease: EASE }}
            className="mx-auto max-w-2xl text-center"
          >
            <h2 className="font-semibold tracking-tight text-foreground text-[28px] leading-[1.1] sm:text-4xl">
              {t("ctaTitle")}
            </h2>
            <div className="mt-8 flex flex-col items-center gap-4">
              <Link
                href="/auth"
                className={cn(
                  "group inline-flex items-center justify-center gap-2 rounded-full font-medium",
                  "bg-foreground text-background",
                  "shadow-[0_1px_0_0_rgba(255,255,255,0.08)_inset,0_6px_18px_-10px_rgba(0,0,0,0.22)]",
                  "dark:shadow-[0_1px_0_0_rgba(0,0,0,0.10)_inset,0_6px_18px_-10px_rgba(0,0,0,0.40)]",
                  "transition-[box-shadow,transform] duration-300 hover:scale-[1.012] active:scale-[0.985]",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                  "px-8 py-3 text-[14.5px]",
                )}
              >
                {t("ctaButton")}
                <ArrowRight className="h-3.5 w-3.5 transition-transform duration-300 ease-out group-hover:translate-x-0.5" />
              </Link>
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-foreground/35">
                {t("noCreditCard")}
              </p>
            </div>
          </motion.div>
        </section>
      </main>

      <LandingFooter />
    </div>
  )
}
