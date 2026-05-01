"use client"

/**
 * FAQSection — editorial Q&A surface.
 *
 * A premium magazine-style FAQ: a two-column desktop layout where the left
 * column reads like the opening of a back-of-the-book section (eyebrow,
 * serif title, support card) and the right column is a hairline-ruled list
 * of questions. Only one question expands at a time. Mobile collapses to
 * a single stacked column with instant reveals.
 *
 * The list rows are intentionally not cards — they're separated by a
 * single hairline rule, so the eye reads them as a continuous editorial
 * sequence. Active rows get a thin left vertical accent and a serif
 * numeral in the gutter; the answer reveals via a height + fade
 * staggered behind the height.
 */

import { motion, AnimatePresence } from "framer-motion"
import { useState } from "react"
import { Plus, ArrowUpRight, ArrowRight } from "lucide-react"
import { cn } from "@/lib/utils"
import Link from "next/link"
import { useTranslations } from "next-intl"

const FAQ_KEYS = ["whatIsCoasty", "howDifferent", "whatTasks", "whatAreCredits", "localComputer", "dataSafe"] as const
type FaqKey = (typeof FAQ_KEYS)[number]

// One-word editorial categories per row — mirrors the eyebrow language used
// in the rest of the landing page.
const CATEGORY_BY_KEY: Record<FaqKey, string> = {
  whatIsCoasty: "OVERVIEW",
  howDifferent: "DIFFERENCE",
  whatTasks: "CAPABILITY",
  whatAreCredits: "BILLING",
  localComputer: "DEPLOYMENT",
  dataSafe: "PRIVACY",
}

const EASE = [0.22, 1, 0.36, 1] as const

export function FAQSection({ isMobile }: { isMobile: boolean }) {
  const t = useTranslations()
  const [activeIndex, setActiveIndex] = useState<number | null>(null)

  const handleToggle = (index: number) => {
    setActiveIndex((current) => (current === index ? null : index))
  }

  const totalCount = FAQ_KEYS.length
  const formatNumeral = (i: number) => String(i + 1).padStart(2, "0")

  return (
    <section
      id="faq"
      className="relative py-20 sm:py-24 lg:py-32 px-8 sm:px-10"
    >
      <div className="max-w-6xl w-full mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 sm:gap-12 lg:gap-16">
          {/* LEFT COLUMN — editorial header */}
          <motion.div
            initial={{ opacity: 0, x: -16 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, amount: 0, margin: "0px 0px -80px 0px" }}
            transition={{ duration: 0.6, ease: EASE }}
            className="lg:col-span-5 lg:sticky lg:top-24 lg:self-start"
          >
            {/* Eyebrow + hairline */}
            <div className="flex items-center gap-3">
              <span className="eyebrow text-[11px] tracking-[0.2em] text-foreground/60">
                08 &middot; FAQ
              </span>
              <span className="h-px flex-1 bg-foreground/15" aria-hidden />
            </div>

            {/* Title */}
            <h2
              className={cn(
                "display-serif mt-6 text-foreground leading-[1.05] tracking-tight",
                isMobile ? "text-4xl" : "text-4xl sm:text-5xl",
              )}
            >
              {t("faq.title")}
            </h2>

            {/* Subtitle */}
            <p
              className={cn(
                "mt-5 max-w-md text-muted-foreground/80",
                isMobile ? "text-sm leading-relaxed" : "text-base leading-relaxed",
              )}
            >
              {t("faq.subtitle")}
            </p>

            {/* Decorative editorial mark — small rotated square, echoing the
                SectionDivider language used elsewhere on the page. */}
            <div className="mt-10 flex items-center gap-3" aria-hidden>
              <span className="h-1.5 w-1.5 rotate-45 bg-foreground/30" />
              <span className="h-px w-12 bg-foreground/15" />
              <span className="eyebrow text-[10px] tracking-[0.25em] text-foreground/40">
                {formatNumeral(totalCount - 1)} OF {formatNumeral(totalCount - 1)}
              </span>
            </div>

            {/* Support card */}
            <div className="mt-10 rounded-2xl border border-foreground/10 bg-card/40 backdrop-blur-[2px] p-5">
              <span className="eyebrow text-[10px] tracking-[0.25em] text-foreground/55">
                STILL HAVE QUESTIONS?
              </span>
              <p className="display-serif mt-3 text-xl leading-snug text-foreground">
                Talk to a founder, no sales pitch.
              </p>
              <p className="mt-2 text-sm text-muted-foreground/75 leading-relaxed">
                Real answers, no scripted demos. We&apos;ll help you figure out if Coasty fits.
              </p>
              <Link
                href="https://cal.com/coasty/15min"
                target="_blank"
                rel="noopener noreferrer"
                className="group mt-5 inline-flex items-center gap-2 text-sm font-medium text-foreground transition-colors hover:text-foreground/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20 focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-sm"
              >
                <span className="relative">
                  Book a 15-min call
                  <span className="absolute -bottom-0.5 left-0 h-px w-full origin-left scale-x-100 bg-foreground/40 transition-transform duration-300 group-hover:scale-x-0" />
                </span>
                <ArrowUpRight className="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </Link>
            </div>

            {/* Bottom strip — count + docs link */}
            <div className="mt-8 flex items-center justify-between border-t border-foreground/10 pt-5">
              <span className="eyebrow text-[10px] tracking-[0.25em] text-foreground/40">
                {formatNumeral(totalCount - 1)} ENTRIES
              </span>
              <Link
                href="/guide"
                className="group inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-[0.18em] text-foreground/60 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20 focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-sm"
              >
                <span>View all docs</span>
                <ArrowRight className="h-3 w-3 transition-transform duration-300 group-hover:translate-x-0.5" />
              </Link>
            </div>
          </motion.div>

          {/* RIGHT COLUMN — FAQ list */}
          <div className="lg:col-span-7">
            {/* Top hairline */}
            <div className="h-px w-full bg-foreground/12" aria-hidden />

            <ul className="divide-y divide-foreground/8" role="list">
              {FAQ_KEYS.map((faqKey, index) => {
                const isActive = activeIndex === index
                const numeral = formatNumeral(index)
                const category = CATEGORY_BY_KEY[faqKey]

                return (
                  <motion.li
                    key={faqKey}
                    initial={{ opacity: 0, y: 8 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, amount: 0, margin: "0px 0px -80px 0px" }}
                    transition={{ duration: 0.5, ease: EASE, delay: index * 0.06 }}
                    className="relative"
                  >
                    {/* Left vertical accent — only when active */}
                    <AnimatePresence>
                      {isActive && (
                        <motion.span
                          aria-hidden
                          initial={{ scaleY: 0, opacity: 0 }}
                          animate={{ scaleY: 1, opacity: 1 }}
                          exit={{ scaleY: 0, opacity: 0 }}
                          transition={{ duration: 0.3, ease: EASE }}
                          style={{ originY: 0 }}
                          className="pointer-events-none absolute left-0 top-0 h-full w-px bg-foreground/40"
                        />
                      )}
                    </AnimatePresence>

                    <button
                      type="button"
                      onClick={() => handleToggle(index)}
                      aria-expanded={isActive}
                      aria-controls={`faq-panel-${index}`}
                      id={`faq-trigger-${index}`}
                      className="group flex w-full items-start gap-5 py-6 sm:py-7 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20 focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-sm pl-4 sm:pl-6 pr-2"
                    >
                      {/* Numeral — serif, large, muted */}
                      <span
                        className={cn(
                          "display-serif text-xl shrink-0 leading-none pt-0.5 transition-colors duration-300",
                          isActive ? "text-foreground/70" : "text-foreground/30 group-hover:text-foreground/50",
                        )}
                        aria-hidden
                      >
                        {numeral}
                      </span>

                      {/* Question + category */}
                      <div className="flex-1 min-w-0">
                        <span
                          className={cn(
                            "eyebrow block text-[10px] tracking-[0.22em] transition-colors duration-300",
                            isActive ? "text-foreground/55" : "text-foreground/35 group-hover:text-foreground/45",
                          )}
                        >
                          {category}
                        </span>
                        <span
                          className={cn(
                            "mt-1.5 block transition-all duration-300",
                            isMobile ? "text-base" : "text-base sm:text-lg",
                            isActive
                              ? "font-medium text-foreground"
                              : "font-normal text-foreground/85 group-hover:text-foreground",
                          )}
                        >
                          {t(`faq.items.${faqKey}.question`)}
                        </span>
                      </div>

                      {/* Plus / X icon — rotates 45deg when active to become an X */}
                      <motion.span
                        animate={{ rotate: isActive ? 45 : 0 }}
                        transition={{ duration: 0.35, ease: EASE }}
                        className={cn(
                          "shrink-0 mt-1 inline-flex h-7 w-7 items-center justify-center rounded-full border transition-colors duration-300",
                          isActive
                            ? "border-foreground/40 text-foreground"
                            : "border-foreground/15 text-foreground/50 group-hover:border-foreground/30 group-hover:text-foreground/80",
                        )}
                        aria-hidden
                      >
                        <Plus className="h-3.5 w-3.5" strokeWidth={1.5} />
                      </motion.span>
                    </button>

                    {/* Answer panel */}
                    <AnimatePresence initial={false}>
                      {isActive && (
                        <motion.div
                          key="content"
                          id={`faq-panel-${index}`}
                          role="region"
                          aria-labelledby={`faq-trigger-${index}`}
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{
                            height: { duration: 0.4, ease: EASE },
                            opacity: { duration: 0.25, ease: EASE },
                          }}
                          className="overflow-hidden"
                        >
                          <motion.div
                            initial={{ y: -8, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            exit={{ y: -4, opacity: 0 }}
                            transition={{ duration: 0.35, ease: EASE, delay: 0.08 }}
                            className="pl-4 sm:pl-6 pr-2 pb-7"
                          >
                            {/* Answer text — left-padded to align with question */}
                            <div className="flex gap-5">
                              {/* Phantom numeral spacer to keep alignment */}
                              <span className="display-serif text-xl shrink-0 leading-none invisible" aria-hidden>
                                {numeral}
                              </span>
                              <div className="flex-1 min-w-0 max-w-prose">
                                <p
                                  className={cn(
                                    "text-muted-foreground/65 leading-relaxed",
                                    isMobile ? "text-sm" : "text-[15px] sm:text-base",
                                  )}
                                >
                                  {t(`faq.items.${faqKey}.answer`)}
                                </p>

                                {/* Hairline separator + reading footer */}
                                <div className="mt-5 flex items-center gap-3">
                                  <span className="h-px w-8 bg-foreground/20" aria-hidden />
                                  <span className="eyebrow text-[10px] tracking-[0.25em] text-foreground/40">
                                    {category} &middot; {numeral} / {formatNumeral(totalCount - 1)}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </motion.div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.li>
                )
              })}
            </ul>

            {/* Bottom hairline */}
            <div className="h-px w-full bg-foreground/12" aria-hidden />
          </div>
        </div>
      </div>
    </section>
  )
}
