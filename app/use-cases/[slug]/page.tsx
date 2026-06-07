"use client"

/**
 * Use-case detail page — rebuilt to share the landing page's design language.
 *
 * Same vocabulary as the landing / pricing surfaces: Geist Sans + Mono, strict
 * monochrome (no brand hue, no colored icons), hairline dividers, glass-card
 * chrome, the signature quint ease, and the "type from paper" gradient hero
 * sheen. The FAQ uses the landing accordion pattern (hairline rows, one open
 * at a time, a Plus rotating 45° to a ×).
 *
 * This is a CLIENT component (it reads the slug via useParams and toggles the
 * FAQ via useState), so it keeps framer-motion for the whileInView reveals,
 * mirroring app/pricing/page.tsx.
 *
 * All content from data.ts is preserved verbatim (hero stat, steps,
 * deliverables, example prompt, FAQs, related use cases) and every internal
 * link is kept. SEO / OpenGraph metadata lives in the sibling layout.tsx
 * (untouched).
 */

import { useState } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import { motion, AnimatePresence } from "framer-motion"
import { ArrowRight, ArrowLeft, Check, MessageSquare, Plus } from "lucide-react"
import { LandingHeader } from "@/app/components/landing/landing-header"
import { LandingFooter } from "@/app/components/landing/landing-footer"
import { SectionDivider } from "@/app/components/landing/guide-lines"
import { USE_CASES, getUseCaseBySlug } from "../data"
import { cn } from "@/lib/utils"

const EASE = [0.22, 1, 0.36, 1] as const

// ── Local atoms (landing design language) ──────────────────────────────────

function PrimaryButton({
  href,
  children,
  className,
}: {
  href: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <Link
      href={href}
      className={cn(
        "group inline-flex items-center justify-center gap-2 rounded-full font-medium",
        "bg-foreground text-background",
        "shadow-[0_1px_0_0_rgba(255,255,255,0.08)_inset,0_6px_18px_-10px_rgba(0,0,0,0.22)]",
        "dark:shadow-[0_1px_0_0_rgba(0,0,0,0.10)_inset,0_6px_18px_-10px_rgba(0,0,0,0.40)]",
        "transition-[box-shadow,transform] duration-300 hover:scale-[1.012] active:scale-[0.985]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        "px-7 py-3 text-[14.5px]",
        className,
      )}
    >
      {children}
    </Link>
  )
}

function OutlineButton({
  href,
  children,
  className,
}: {
  href: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <Link
      href={href}
      className={cn(
        "group inline-flex items-center justify-center gap-2 rounded-full font-medium",
        "border border-foreground/15 text-foreground dark:border-white/15 dark:text-white",
        "bg-foreground/[0.025] backdrop-blur-[2px] dark:bg-white/[0.03]",
        "hover:border-foreground/25 hover:bg-foreground/[0.05] dark:hover:border-white/25 dark:hover:bg-white/[0.06]",
        "transition-[background,border-color,transform] duration-300 active:scale-[0.985]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        "px-6 py-3 text-[14px]",
        className,
      )}
    >
      {children}
    </Link>
  )
}

function SectionHeading({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <h2
      className={cn(
        "font-semibold tracking-tight text-foreground",
        "text-[28px] leading-[1.1] sm:text-4xl",
        className,
      )}
    >
      {children}
    </h2>
  )
}

// Glass-card top-sheen hairline — shared by every card on the page.
function CardSheen() {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-foreground/15 to-transparent"
    />
  )
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function UseCasePage() {
  const params = useParams()
  const slug = params.slug as string
  const uc = getUseCaseBySlug(slug)
  const [openFaq, setOpenFaq] = useState<number | null>(null)

  if (!uc) {
    return (
      <div className="relative min-h-screen overflow-x-clip bg-background text-foreground">
        <LandingHeader />
        <main className="flex min-h-screen items-center justify-center px-5 sm:px-10">
          <div className="text-center">
            <h1
              className={cn(
                "mb-4 font-semibold tracking-[-0.03em] text-balance pb-1 sm:pb-2",
                "bg-clip-text text-transparent",
                "bg-gradient-to-b from-foreground to-foreground/85 dark:from-white dark:to-white/82",
                "text-[1.75rem] leading-[1.15] sm:text-4xl",
              )}
            >
              Use case not found
            </h1>
            <p className="mb-8 text-foreground/65 dark:text-white/65">
              The use case you are looking for does not exist.
            </p>
            <PrimaryButton href="/use-cases">
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to use cases
            </PrimaryButton>
          </div>
        </main>
        <LandingFooter />
      </div>
    )
  }

  const Icon = uc.icon
  const otherUseCases = USE_CASES.filter((u) => u.slug !== uc.slug).slice(0, 3)

  return (
    <div className="relative min-h-screen overflow-x-clip bg-background text-foreground">
      <LandingHeader />

      <main className="relative">
        {/* ─── Hero ──────────────────────────────────────────────────────
            Centered editorial headline with the "type from paper" sheen over
            a quiet neutral ambient wash. The SEO eyebrow (use-case label) is
            kept as a mono eyebrow. */}
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
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, ease: EASE }}
              className="mb-7 flex justify-center"
            >
              <Link
                href="/use-cases"
                className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.24em] text-foreground/45 transition-colors hover:text-foreground/70"
              >
                <ArrowLeft className="h-3 w-3" />
                All use cases
              </Link>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.75, delay: 0.04, ease: EASE }}
              className="mb-5 flex justify-center"
            >
              <span className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.24em] text-foreground/45">
                <Icon className="h-3 w-3 text-foreground/40" strokeWidth={1.75} />
                {uc.label}
              </span>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.95, delay: 0.08, ease: EASE }}
              className={cn(
                "font-semibold tracking-[-0.045em] text-balance pb-1 sm:pb-2",
                "bg-clip-text text-transparent",
                "bg-gradient-to-b from-foreground to-foreground/85 dark:from-white dark:to-white/82",
                "text-[2.1rem] leading-[1.1] sm:text-5xl sm:leading-[1.08] lg:text-[3.25rem]",
              )}
            >
              {uc.headline}
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.18, ease: EASE }}
              className="mx-auto mt-5 max-w-xl text-[15px] leading-[1.55] text-foreground/65 dark:text-white/65 sm:text-base"
            >
              {uc.description}
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.26, ease: EASE }}
              className="mt-10 flex flex-col items-center gap-2"
            >
              <span className="font-semibold tracking-tight tabular-nums text-foreground text-6xl leading-none sm:text-7xl">
                {uc.heroStat}
              </span>
              <span className="font-mono text-[11px] uppercase tracking-[0.24em] text-foreground/45">
                {uc.heroStatLabel}
              </span>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.34, ease: EASE }}
              className="mt-10 flex justify-center"
            >
              <PrimaryButton href="/auth">
                Try this now
                <ArrowRight className="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-0.5" />
              </PrimaryButton>
            </motion.div>
          </div>
        </section>

        <SectionDivider />

        {/* ─── How it works ── */}
        <section className="px-5 py-20 sm:px-10 sm:py-24 lg:py-28">
          <div className="mx-auto max-w-3xl">
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0, margin: "0px 0px -80px 0px" }}
              transition={{ duration: 0.6, ease: EASE }}
              className="mb-12 text-center sm:mb-14"
            >
              <SectionHeading>How it works</SectionHeading>
            </motion.div>

            <ol className="space-y-10 sm:space-y-12">
              {uc.steps.map((step, i) => (
                <motion.li
                  key={i}
                  initial={{ opacity: 0, y: 18 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0, margin: "0px 0px -80px 0px" }}
                  transition={{ duration: 0.55, ease: EASE, delay: i * 0.06 }}
                  className="flex gap-5 sm:gap-7"
                >
                  <div className="flex-shrink-0 pt-1">
                    <span className="font-mono text-xs uppercase tracking-[0.24em] tabular-nums text-foreground/40">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                  </div>
                  <div className="flex-1">
                    <h3 className="mb-1.5 text-base font-semibold tracking-tight text-foreground sm:text-lg">
                      {step.title}
                    </h3>
                    <p className="text-sm leading-relaxed text-muted-foreground/70 sm:text-[15px]">
                      {step.description}
                    </p>
                  </div>
                </motion.li>
              ))}
            </ol>
          </div>
        </section>

        <SectionDivider />

        {/* ─── What you get ── */}
        <section className="px-5 py-20 sm:px-10 sm:py-24 lg:py-28">
          <div className="mx-auto max-w-4xl">
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0, margin: "0px 0px -80px 0px" }}
              transition={{ duration: 0.6, ease: EASE }}
              className="mb-12 text-center sm:mb-14"
            >
              <SectionHeading>What you get</SectionHeading>
            </motion.div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {uc.deliverables.map((item, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0, margin: "0px 0px -80px 0px" }}
                  transition={{ duration: 0.5, ease: EASE, delay: (i % 2) * 0.06 }}
                  className={cn(
                    "group relative flex items-start gap-3 overflow-hidden rounded-2xl",
                    "border border-foreground/10 bg-card/40 p-4 backdrop-blur-[2px]",
                    "transition-[border-color,box-shadow,transform] duration-500",
                    "hover:-translate-y-0.5 hover:border-foreground/20",
                    "hover:shadow-[0_1px_2px_rgba(0,0,0,0.04),0_18px_44px_-22px_rgba(0,0,0,0.18)]",
                    "dark:hover:shadow-[0_1px_2px_rgba(0,0,0,0.3),0_18px_44px_-22px_rgba(0,0,0,0.5)]",
                  )}
                >
                  <CardSheen />
                  <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-foreground/40 transition-colors duration-300 group-hover:text-foreground/70" strokeWidth={2} />
                  <span className="text-sm leading-relaxed text-foreground/85">{item}</span>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        <SectionDivider />

        {/* ─── Try it yourself / example prompt ── */}
        <section className="px-5 py-20 sm:px-10 sm:py-24 lg:py-28">
          <div className="mx-auto max-w-3xl">
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0, margin: "0px 0px -80px 0px" }}
              transition={{ duration: 0.6, ease: EASE }}
              className="mb-10 text-center"
            >
              <SectionHeading>Try it yourself</SectionHeading>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0, margin: "0px 0px -80px 0px" }}
              transition={{ duration: 0.55, ease: EASE, delay: 0.06 }}
              className={cn(
                "group relative mb-8 overflow-hidden rounded-2xl",
                "border border-foreground/10 bg-card/40 p-6 backdrop-blur-[2px] sm:p-8",
                "transition-[border-color,box-shadow] duration-500 hover:border-foreground/20",
              )}
            >
              <CardSheen />
              <div className="mb-4 flex items-center gap-2">
                <MessageSquare className="h-3.5 w-3.5 text-foreground/40" strokeWidth={1.75} />
                <span className="font-mono text-[11px] uppercase tracking-[0.24em] text-foreground/45">
                  Example prompt
                </span>
              </div>
              <p className="text-balance text-base leading-relaxed text-foreground/90 sm:text-lg">
                {uc.examplePrompt}
              </p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0, margin: "0px 0px -80px 0px" }}
              transition={{ duration: 0.5, ease: EASE, delay: 0.12 }}
              className="flex justify-center sm:justify-start"
            >
              <PrimaryButton href="/auth">
                Run this on Coasty
                <ArrowRight className="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-0.5" />
              </PrimaryButton>
            </motion.div>
          </div>
        </section>

        <SectionDivider />

        {/* ─── Common questions ──────────────────────────────────────────
            Landing accordion pattern — hairline rows (not cards), one open at
            a time, Plus rotates 45° to a ×. */}
        <section className="px-5 py-20 sm:px-10 sm:py-24 lg:py-28">
          <div className="mx-auto max-w-2xl">
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0, margin: "0px 0px -80px 0px" }}
              transition={{ duration: 0.6, ease: EASE }}
              className="mb-10 text-center sm:mb-14"
            >
              <SectionHeading>Common questions</SectionHeading>
            </motion.div>

            <ul className="border-t border-foreground/10" role="list">
              {uc.faqs.map((faq, i) => {
                const active = openFaq === i
                return (
                  <motion.li
                    key={i}
                    initial={{ opacity: 0, y: 8 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, amount: 0, margin: "0px 0px -80px 0px" }}
                    transition={{ duration: 0.5, ease: EASE, delay: i * 0.05 }}
                    className="border-b border-foreground/10"
                  >
                    <button
                      type="button"
                      onClick={() => setOpenFaq(active ? null : i)}
                      aria-expanded={active}
                      aria-controls={`usecase-faq-${i}`}
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
                        {faq.q}
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
                          id={`usecase-faq-${i}`}
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
                            {faq.a}
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

        {/* ─── Bottom CTA ── */}
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
              Ready to get started?
            </h2>

            <div className="mt-6 flex flex-col items-center gap-1.5">
              <span className="font-semibold tracking-tight tabular-nums text-foreground text-5xl leading-none sm:text-6xl">
                {uc.heroStat}
              </span>
              <span className="font-mono text-[11px] uppercase tracking-[0.24em] text-foreground/45">
                {uc.heroStatLabel}
              </span>
            </div>

            <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
              <PrimaryButton href="/auth">
                Get started free
                <ArrowRight className="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-0.5" />
              </PrimaryButton>
              <OutlineButton href="/use-cases">Explore more</OutlineButton>
            </div>
          </motion.div>
        </section>

        <SectionDivider />

        {/* ─── Explore more use cases ── */}
        <section className="px-5 py-20 sm:px-10 sm:py-24 lg:py-28">
          <div className="mx-auto max-w-5xl">
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0, margin: "0px 0px -80px 0px" }}
              transition={{ duration: 0.6, ease: EASE }}
              className="mb-12 text-center sm:mb-14"
            >
              <SectionHeading>Explore more use cases</SectionHeading>
            </motion.div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3">
              {otherUseCases.map((other, i) => {
                const OtherIcon = other.icon
                return (
                  <motion.div
                    key={other.slug}
                    initial={{ opacity: 0, y: 18 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, amount: 0, margin: "0px 0px -80px 0px" }}
                    transition={{ duration: 0.55, ease: EASE, delay: i * 0.06 }}
                  >
                    <Link
                      href={`/use-cases/${other.slug}`}
                      className={cn(
                        "group relative block h-full overflow-hidden rounded-2xl p-6",
                        "border border-foreground/10 bg-card/40 backdrop-blur-[2px]",
                        "transition-[border-color,box-shadow,transform] duration-500",
                        "hover:-translate-y-0.5 hover:border-foreground/20",
                        "hover:shadow-[0_1px_2px_rgba(0,0,0,0.04),0_18px_44px_-22px_rgba(0,0,0,0.18)]",
                        "dark:hover:shadow-[0_1px_2px_rgba(0,0,0,0.3),0_18px_44px_-22px_rgba(0,0,0,0.5)]",
                      )}
                    >
                      <CardSheen />
                      <div className="relative">
                        <OtherIcon
                          aria-hidden
                          className="absolute -right-1 -top-1 size-16 text-foreground/[0.04] transition-all duration-500 group-hover:scale-110 group-hover:text-foreground/[0.07] dark:text-foreground/[0.05]"
                          strokeWidth={1}
                        />
                        <div className="relative mb-3 flex items-center gap-2">
                          <OtherIcon className="size-3.5 text-foreground/40" strokeWidth={1.75} />
                          <span className="font-mono text-[11px] uppercase tracking-[0.24em] text-foreground/45">
                            {other.label}
                          </span>
                        </div>
                      </div>

                      <h3 className="mb-2 text-balance text-base font-semibold tracking-tight text-foreground">
                        {other.headline}
                      </h3>
                      <p className="line-clamp-2 text-[13px] leading-relaxed text-muted-foreground/70">
                        {other.outcome}
                      </p>
                      <div className="mt-5 flex items-center gap-1.5 text-[12px] font-medium text-foreground/55 transition-colors duration-300 group-hover:text-foreground">
                        <span>Learn more</span>
                        <ArrowRight className="size-3 transition-transform duration-300 group-hover:translate-x-0.5" />
                      </div>
                    </Link>
                  </motion.div>
                )
              })}
            </div>
          </div>
        </section>
      </main>

      <LandingFooter />
    </div>
  )
}
