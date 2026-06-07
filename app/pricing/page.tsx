"use client"

/**
 * Pricing page — rebuilt to share the landing page's design language.
 *
 * Same vocabulary as the landing: Geist Sans + Mono, monochrome (no brand
 * hue), hairline dividers, glass-card chrome, the signature quint ease, and
 * count-up prices. The plan grid REUSES the canonical landing
 * `PricingSection` (so the cards never drift between surfaces); the page
 * supplies its own editorial hero, enterprise callout, FAQ accordion, and CTA.
 *
 * Removed from the previous version: the rainbow CTA button, the colored
 * (blue/amber/green) feature icons, the `primary-rgb` glow, the segmented
 * plan-tab + animated feature explorer, and `font-bold` headings — all
 * off-brand vs. the landing.
 *
 * Copy comes from the existing `pricingPage` i18n namespace, so every locale
 * stays intact. SEO / JSON-LD lives in the sibling layout.tsx (untouched).
 */

import { useEffect, useState } from "react"
import Link from "next/link"
import { motion, AnimatePresence } from "framer-motion"
import { useTranslations } from "next-intl"
import { ArrowRight, Plus, Check } from "lucide-react"
import { cn } from "@/lib/utils"
import { LandingHeader } from "@/app/components/landing/landing-header"
import { LandingFooter } from "@/app/components/landing/landing-footer"
import { PricingSection } from "@/app/components/landing/sections/pricing"
import { SectionDivider } from "@/app/components/landing/guide-lines"
import { LandingSectionHeader } from "@/app/components/landing/section-shell"

const EASE = [0.22, 1, 0.36, 1] as const

const FAQ_KEYS = ["credits", "persistent", "swarm", "cancel", "security"] as const

export default function PricingPage() {
  const t = useTranslations("pricingPage")
  const [isMobile, setIsMobile] = useState(false)
  const [activeFaq, setActiveFaq] = useState<number | null>(null)

  // Mirror the landing's mobile gate (<768px) so the reused PricingSection
  // and the local sections branch their layouts consistently.
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener("resize", check)
    return () => window.removeEventListener("resize", check)
  }, [])

  return (
    <div className="relative isolate min-h-screen overflow-x-clip bg-background text-foreground">
      <LandingHeader />

      <main className="relative">
        {/* ─── Hero ──────────────────────────────────────────────────────
            Editorial gradient headline (the same "type from paper" sheen as
            the landing hero) over a quiet neutral wash. No eyebrow / trust
            strip — the headline + subhead lead on their own. */}
        <section className="relative overflow-hidden px-5 pt-32 pb-8 sm:px-10 sm:pt-40 sm:pb-12">
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
              {t("hero.title1")} {t("hero.title2")}
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.18, ease: EASE }}
              className="mx-auto mt-5 max-w-md text-[15px] leading-[1.55] text-foreground/65 dark:text-white/65 sm:text-base"
            >
              {t("hero.subtitle")}
            </motion.p>
          </div>
        </section>

        <SectionDivider />

        {/* ─── Plans ──────────────────────────────────────────────────────
            Canonical landing cards (Starter / Plus / Unlimited) — count-up
            prices, Unlimited smoke, monochrome chrome. Header + self-
            referential comparison link suppressed for the standalone page. */}
        <PricingSection isMobile={isMobile} showHeader={false} hideComparisonLink />

        {/* ─── Enterprise ─────────────────────────────────────────────────
            One quiet glass row — same card recipe + top sheen hairline as
            the landing sections. */}
        <section className="px-5 pb-4 sm:px-10">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0, margin: "0px 0px -80px 0px" }}
            transition={{ duration: 0.55, ease: EASE }}
            className="relative mx-auto max-w-5xl overflow-hidden rounded-2xl border border-foreground/10 bg-card/40 p-6 backdrop-blur-[2px] sm:p-8"
          >
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-foreground/15 to-transparent"
            />
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-lg font-semibold tracking-tight text-foreground sm:text-xl">
                  {t("enterprise.title")}
                </h3>
                <p className="mt-1.5 max-w-md text-sm leading-relaxed text-muted-foreground/70">
                  {t("enterprise.description")}
                </p>
              </div>
              <Link
                href="mailto:founders@coasty.ai"
                className={cn(
                  "group inline-flex shrink-0 items-center justify-center gap-2 rounded-full font-medium",
                  "border border-foreground/15 text-foreground dark:border-white/15 dark:text-white",
                  "bg-foreground/[0.025] backdrop-blur-[2px] dark:bg-white/[0.03]",
                  "hover:border-foreground/25 hover:bg-foreground/[0.05] dark:hover:border-white/25 dark:hover:bg-white/[0.06]",
                  "transition-[background,border-color,transform] duration-300 active:scale-[0.985]",
                  "px-6 py-2.5 text-sm",
                )}
              >
                {t("enterprise.cta")}
                <ArrowRight className="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-0.5" />
              </Link>
            </div>
          </motion.div>
        </section>

        <SectionDivider />

        {/* ─── FAQ ────────────────────────────────────────────────────────
            Landing accordion pattern — hairline rows (not cards), one open
            at a time, Plus rotates 45° to a ×. */}
        <section className="px-5 py-20 sm:px-10 sm:py-24 lg:py-28">
          <div className="mx-auto max-w-2xl">
            <LandingSectionHeader title={t("questions")} isMobile={isMobile} />
            <ul className="border-t border-foreground/10" role="list">
              {FAQ_KEYS.map((key, i) => {
                const active = activeFaq === i
                return (
                  <motion.li
                    key={key}
                    initial={{ opacity: 0, y: 8 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, amount: 0, margin: "0px 0px -80px 0px" }}
                    transition={{ duration: 0.5, ease: EASE, delay: i * 0.05 }}
                    className="border-b border-foreground/10"
                  >
                    <button
                      type="button"
                      onClick={() => setActiveFaq(active ? null : i)}
                      aria-expanded={active}
                      aria-controls={`pricing-faq-${i}`}
                      className="group flex w-full items-center gap-4 rounded-sm py-5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20 focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:py-6"
                    >
                      <span
                        className={cn(
                          "flex-1 text-base transition-colors duration-300 sm:text-lg",
                          active
                            ? "font-medium text-foreground"
                            : "text-foreground/85 group-hover:text-foreground",
                        )}
                      >
                        {t(`faqs.${key}.q`)}
                      </span>
                      <motion.span
                        animate={{ rotate: active ? 45 : 0 }}
                        transition={{ duration: 0.3, ease: EASE }}
                        className={cn(
                          "inline-flex h-6 w-6 shrink-0 items-center justify-center transition-colors duration-300",
                          active ? "text-foreground" : "text-foreground/45 group-hover:text-foreground/80",
                        )}
                        aria-hidden
                      >
                        <Plus className="h-4 w-4" strokeWidth={1.5} />
                      </motion.span>
                    </button>

                    <AnimatePresence initial={false}>
                      {active && (
                        <motion.div
                          key="content"
                          id={`pricing-faq-${i}`}
                          role="region"
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{
                            height: { duration: 0.35, ease: EASE },
                            opacity: { duration: 0.25, ease: EASE },
                          }}
                          className="overflow-hidden"
                        >
                          <p className="pb-6 pr-10 text-[15px] leading-relaxed text-muted-foreground/70 sm:text-base">
                            {t(`faqs.${key}.a`)}
                          </p>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.li>
                )
              })}
            </ul>
          </div>
        </section>

        <SectionDivider />

        {/* ─── Final CTA ──────────────────────────────────────────────────
            Solid foreground pill (the landing hero's primary CTA chrome) +
            two quiet trust checks. No rainbow. */}
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
              {t("footer.title")}
            </h2>
            <p className="mx-auto mt-4 max-w-md text-[15px] leading-[1.55] text-foreground/65 dark:text-white/65 sm:text-base">
              {t("footer.subtitle")}
            </p>
            <div className="mt-8 flex flex-col items-center gap-5">
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
                {t("plans.free.cta")}
                <ArrowRight className="h-3.5 w-3.5 transition-transform duration-300 ease-out group-hover:translate-x-0.5" />
              </Link>
              <div className="flex items-center gap-5 text-xs text-foreground/50">
                <span className="inline-flex items-center gap-1.5">
                  <Check className="h-3 w-3 text-foreground/45" strokeWidth={2.4} />
                  {t("footer.noCreditCard")}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Check className="h-3 w-3 text-foreground/45" strokeWidth={2.4} />
                  {t("footer.cancelAnytime")}
                </span>
              </div>
            </div>
          </motion.div>
        </section>
      </main>

      <LandingFooter />
    </div>
  )
}
