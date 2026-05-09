"use client"

/**
 * CostSection — the contrast moment, framed as Exhibit A vs Exhibit B.
 *
 * Two columns separated by an editorial vertical rail with diamond crossmarks
 * (the language echoes SectionDivider in guide-lines.tsx). On viewport entry,
 * row pairs cascade in from opposite directions — the contrast lands as the
 * eye reads pairs. Hovering any row in either column highlights both
 * corresponding rows, coordinating the visual evidence across the divide.
 *
 * Mobile collapses to a stack, with the divider becoming horizontal between
 * the two cards. All animations are skipped on mobile (instant reveal).
 */

import { motion } from "framer-motion"
import { useEffect, useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { useTheme } from "next-themes"
import { useTranslations } from "next-intl"
import { Users, Check, X, ArrowRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { LandingSectionTopGlow, LandingSectionHeader } from "../section-shell"

const ROW_KEYS = ["timePerTask", "availability", "setupTime", "errorRate", "scaling", "auditTrail"] as const
type RowKey = (typeof ROW_KEYS)[number]

const EASE = [0.22, 1, 0.36, 1] as const

export function CostSection({ isMobile }: { isMobile: boolean }) {
  const t = useTranslations()
  const tc = useTranslations("common")
  const { resolvedTheme } = useTheme()

  // Defer theme-dependent rendering until after hydration. Server renders
  // with `resolvedTheme === undefined`, so the logo branch picks /logo_dark
  // on the server but may flip to /logo_light once `next-themes` resolves
  // on the client — that mismatch is what triggered the hydration error.
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  // Component-level hover coordination — hovering a row in either column
  // highlights the matching row (same key) in BOTH columns simultaneously.
  const [hoveredRow, setHoveredRow] = useState<RowKey | null>(null)

  return (
    <section
      id="cost"
      className="relative py-20 sm:py-24 lg:py-32 px-8 sm:px-10 lg:px-12"
    >
      <LandingSectionTopGlow />
      <div className="max-w-6xl w-full mx-auto">
        <LandingSectionHeader
          index={5}
          total={6}
          eyebrow="Cost"
          title={t("comparison.title")}
          subtitle={t("comparison.subtitle")}
          isMobile={isMobile}
        />

        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0, margin: "0px 0px -80px 0px" }}
          variants={{
            hidden: { opacity: 0 },
            visible: {
              opacity: 1,
              transition: { staggerChildren: 0.04, delayChildren: 0.05 },
            },
          }}
          className="w-full"
        >
          <div
            className={cn(
              "relative",
              isMobile
                ? "flex flex-col gap-0"
                : "grid grid-cols-[1fr_auto_1fr] gap-0 items-stretch",
              // Narrow mode: 720px container makes the 2-col
              // comparison feel cramped (~360px / col with rows of
              // label-and-value pairs). Collapse the grid to a
              // single column so the manual / Coasty columns stack
              // vertically — the centre divider element flows
              // between them, reading as a horizontal separator
              // rather than a vertical one.
              !isMobile && "group-data-[narrow]/feat:[grid-template-columns:1fr] group-data-[narrow]/feat:max-w-xl group-data-[narrow]/feat:mx-auto",
            )}
          >
            {/* ── LEFT COLUMN — Hiring / Manual ─────────────────────── */}
            <ComparisonColumn
              side="left"
              isMobile={isMobile}
              hoveredRow={hoveredRow}
              setHoveredRow={setHoveredRow}
              eyebrow="01 · OLD WAY"
              eyebrowAlign="left"
              header={
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-foreground/10 bg-transparent">
                    <Users className="h-[18px] w-[18px] text-foreground/40" strokeWidth={1.5} />
                  </div>
                  <div>
                    <h3 className={cn(
                      "font-medium text-foreground/60",
                      isMobile ? "text-sm" : "text-base"
                    )}>
                      {t("comparison.manual.title")}
                    </h3>
                    <p className="text-xs text-foreground/35 mt-0.5">
                      {t("comparison.manual.subtitle")}
                    </p>
                  </div>
                </div>
              }
              cardClassName="rounded-2xl border border-foreground/10 bg-card/40 backdrop-blur-[2px]"
              rowSeparator="border-foreground/[0.06]"
              renderRow={(key) => (
                <>
                  <span
                    className={cn(
                      "transition-colors duration-300",
                      isMobile ? "text-xs" : "text-sm",
                      hoveredRow === key ? "text-foreground/75" : "text-foreground/55"
                    )}
                  >
                    {t(`comparison.rows.${key}`)}
                  </span>
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "tabular-nums transition-colors duration-300",
                        isMobile ? "text-xs" : "text-sm",
                        hoveredRow === key ? "text-foreground/70" : "text-foreground/40"
                      )}
                    >
                      {t(`comparison.manualValues.${key}`)}
                    </span>
                    <X className="h-3 w-3 text-foreground/25" strokeWidth={1.75} />
                  </div>
                </>
              )}
            />

            {/* ── CENTER DIVIDER — editorial rail with diamonds ─────── */}
            <CenterDivider isMobile={isMobile} />

            {/* ── RIGHT COLUMN — Coasty ─────────────────────────────── */}
            <ComparisonColumn
              side="right"
              isMobile={isMobile}
              hoveredRow={hoveredRow}
              setHoveredRow={setHoveredRow}
              eyebrow="02 · COASTY"
              eyebrowAlign="right"
              header={
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-foreground/15 bg-foreground/[0.02]">
                      {mounted && (
                        <Image
                          src={resolvedTheme === "dark" ? "/logo_light.svg" : "/logo_dark.svg"}
                          alt="Coasty"
                          width={22}
                          height={22}
                          className="h-[22px] w-[22px] object-contain"
                        />
                      )}
                    </div>
                    <div>
                      <h3 className={cn(
                        "font-medium text-foreground",
                        isMobile ? "text-sm" : "text-base"
                      )}>
                        {t("comparison.coasty.title")}
                      </h3>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {t("comparison.coasty.subtitle")}
                      </p>
                    </div>
                  </div>
                  <span
                    className="rounded-full border border-foreground/20 bg-background px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-foreground/65"
                  >
                    {tc("recommended")}
                  </span>
                </div>
              }
              cardClassName={cn(
                "relative rounded-2xl border border-foreground/15 overflow-hidden",
                "bg-card/40 backdrop-blur-[2px]"
              )}
              rowSeparator="border-foreground/[0.08]"
              renderRow={(key) => (
                <>
                  <span
                    className={cn(
                      "transition-colors duration-300",
                      isMobile ? "text-xs" : "text-sm",
                      hoveredRow === key ? "text-foreground" : "text-foreground/65"
                    )}
                  >
                    {t(`comparison.rows.${key}`)}
                  </span>
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "font-medium tabular-nums text-foreground transition-colors duration-300",
                        isMobile ? "text-xs" : "text-sm"
                      )}
                    >
                      {t(`comparison.coastyValues.${key}`)}
                    </span>
                    <Check className="h-3.5 w-3.5 text-foreground" strokeWidth={2} />
                  </div>
                </>
              )}
              decoration={
                /* Top edge highlight hairline — gradient via foreground/20. */
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-foreground/20 to-transparent"
                />
              }
            />
          </div>

          {/* ── BOTTOM CTA BAR ───────────────────────────────────────── */}
          <BottomCTA isMobile={isMobile} t={t} />
        </motion.div>
      </div>
    </section>
  )
}

// ── ComparisonColumn ────────────────────────────────────────────────────

function ComparisonColumn({
  side,
  isMobile,
  hoveredRow,
  setHoveredRow,
  eyebrow,
  eyebrowAlign,
  header,
  cardClassName,
  rowSeparator,
  renderRow,
  decoration,
}: {
  side: "left" | "right"
  isMobile: boolean
  hoveredRow: RowKey | null
  setHoveredRow: (k: RowKey | null) => void
  eyebrow: string
  eyebrowAlign: "left" | "right"
  header: React.ReactNode
  cardClassName: string
  rowSeparator: string
  renderRow: (key: RowKey) => React.ReactNode
  decoration?: React.ReactNode
}) {
  // The horizontal entry direction is symmetric across the divider — left
  // column slides in from -16, right from +16.
  const xFrom = side === "left" ? -16 : 16

  return (
    <div className="relative">
      {/* Eyebrow rail — above the card, with a hairline rule alongside. */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0, margin: "0px 0px -80px 0px" }}
        transition={{ duration: 0.5, ease: EASE }}
        className={cn(
          "flex items-center gap-2.5 mb-3 sm:mb-4",
          eyebrowAlign === "right" ? "justify-end" : "justify-start"
        )}
      >
        {eyebrowAlign === "right" && (
          <span aria-hidden className="h-px flex-1 max-w-[80px] bg-foreground/10" />
        )}
        <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-foreground/45">
          {eyebrow}
        </span>
        {eyebrowAlign === "left" && (
          <span aria-hidden className="h-px flex-1 max-w-[80px] bg-foreground/10" />
        )}
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0, margin: "0px 0px -80px 0px" }}
        transition={{ duration: 0.55, ease: EASE }}
        className={cn(cardClassName, "h-full flex flex-col")}
      >
        {decoration}

        <div className={cn(
          "relative border-b border-foreground/[0.08]",
          isMobile ? "px-5 pt-5 pb-4" : "px-7 pt-7 pb-5"
        )}>
          {header}
        </div>

        <div className={cn(
          "relative flex-1",
          isMobile ? "px-5 py-3" : "px-7 py-4"
        )}>
          {ROW_KEYS.map((key, i) => {
            const isHovered = hoveredRow === key
            return (
              <motion.div
                key={key}
                initial={{ opacity: 0, x: xFrom }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, amount: 0, margin: "0px 0px -80px 0px" }}
                transition={{
                  duration: 0.5,
                  ease: EASE,
                  delay: 0.25 + i * 0.12,
                }}
                onMouseEnter={isMobile ? undefined : () => setHoveredRow(key)}
                onMouseLeave={isMobile ? undefined : () => setHoveredRow(null)}
                className={cn(
                  "flex items-center justify-between py-3 px-2 -mx-2 rounded-md transition-all duration-300",
                  "border-b last:border-0",
                  rowSeparator,
                  isHovered && !isMobile && "bg-foreground/[0.03]"
                )}
              >
                {renderRow(key)}
              </motion.div>
            )
          })}
        </div>
      </motion.div>
    </div>
  )
}

// ── CenterDivider ───────────────────────────────────────────────────────

/**
 * The editorial signature — a vertical hairline rail with three diamond
 * crossmarks (top, middle, bottom). The middle diamond is filled with a
 * subtle gradient (the "balance point"); above it sits a tiny VS eyebrow.
 *
 * On mobile this becomes a horizontal rail with diamonds on left/center/right.
 */
function CenterDivider({ isMobile }: { isMobile: boolean }) {
  if (isMobile) {
    return (
      <div className="relative h-12 w-full flex items-center justify-center my-2" aria-hidden>
        {/* Horizontal hairline */}
        <div className="absolute inset-x-8 top-1/2 -translate-y-1/2 h-px bg-foreground/15" />
        {/* Left diamond */}
        <motion.div
          initial={{ opacity: 0, scale: 0 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true, amount: 0.6 }}
          transition={{ duration: 0.4, ease: EASE, delay: 0.15 }}
          className="absolute left-8 top-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 rotate-45 border border-foreground/30 bg-background"
        />
        {/* Right diamond */}
        <motion.div
          initial={{ opacity: 0, scale: 0 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true, amount: 0.6 }}
          transition={{ duration: 0.4, ease: EASE, delay: 0.15 }}
          className="absolute right-8 top-1/2 translate-x-1/2 -translate-y-1/2 w-2 h-2 rotate-45 border border-foreground/30 bg-background"
        />
        {/* Center diamond + VS label */}
        <motion.div
          initial={{ opacity: 0, scale: 0 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true, amount: 0.6 }}
          transition={{ duration: 0.45, ease: EASE, delay: 0.05 }}
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-1.5"
        >
          <span className="font-mono text-[9px] uppercase tracking-[0.32em] text-foreground/30 leading-none">
            VS
          </span>
          <div className="w-2 h-2 rotate-45 border border-foreground/30 bg-gradient-to-b from-foreground/20 to-foreground/40" />
        </motion.div>
      </div>
    )
  }

  return (
    <div className="relative w-12 lg:w-16 mx-2 self-stretch flex flex-col items-center" aria-hidden>
      {/* Vertical hairline — runs the full height. */}
      <motion.div
        initial={{ scaleY: 0 }}
        whileInView={{ scaleY: 1 }}
        viewport={{ once: true, amount: 0.3 }}
        transition={{ duration: 0.7, ease: EASE, delay: 0.1 }}
        style={{ originY: 0.5 }}
        className="absolute top-12 bottom-12 w-px bg-foreground/15"
      />
      {/* Top diamond */}
      <motion.div
        initial={{ opacity: 0, scale: 0 }}
        whileInView={{ opacity: 1, scale: 1 }}
        viewport={{ once: true, amount: 0.3 }}
        transition={{ duration: 0.4, ease: EASE, delay: 0.25 }}
        className="absolute top-12 -translate-y-1/2 w-2 h-2 rotate-45 border border-foreground/30 bg-background"
      />
      {/* Middle diamond + VS label sits above */}
      <motion.div
        initial={{ opacity: 0, scale: 0 }}
        whileInView={{ opacity: 1, scale: 1 }}
        viewport={{ once: true, amount: 0.3 }}
        transition={{ duration: 0.5, ease: EASE, delay: 0.15 }}
        className="absolute top-1/2 -translate-y-1/2 flex flex-col items-center gap-2"
      >
        <span className="font-mono text-[9px] uppercase tracking-[0.32em] text-foreground/30 leading-none">
          VS
        </span>
        <div className="w-2 h-2 rotate-45 border border-foreground/35 bg-gradient-to-b from-foreground/20 to-foreground/40" />
      </motion.div>
      {/* Bottom diamond */}
      <motion.div
        initial={{ opacity: 0, scale: 0 }}
        whileInView={{ opacity: 1, scale: 1 }}
        viewport={{ once: true, amount: 0.3 }}
        transition={{ duration: 0.4, ease: EASE, delay: 0.25 }}
        className="absolute bottom-12 translate-y-1/2 w-2 h-2 rotate-45 border border-foreground/30 bg-background"
      />
    </div>
  )
}

// ── BottomCTA ───────────────────────────────────────────────────────────

function BottomCTA({
  isMobile,
  t,
}: {
  isMobile: boolean
  t: ReturnType<typeof useTranslations>
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0, margin: "0px 0px -80px 0px" }}
      transition={{ duration: 0.55, ease: EASE, delay: 0.4 }}
      className="relative max-w-3xl mx-auto mt-12 sm:mt-16"
    >
      <div
        className={cn(
          "relative rounded-2xl border border-foreground/15 overflow-hidden",
          "bg-card/40 backdrop-blur-[2px]",
          isMobile ? "p-6" : "p-8 sm:p-10"
        )}
      >
        {/* Top hairline sheen */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-foreground/20 to-transparent"
        />
        {/* Subtle radial gradient backdrop — center, transparent edges */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(closest-side at 50% 50%, rgba(127,127,127,0.04), transparent 70%)",
          }}
        />

        <div
          className={cn(
            "relative flex items-stretch",
            isMobile ? "flex-col gap-5" : "flex-row gap-6 sm:gap-8"
          )}
        >
          {/* Text block */}
          <div className={cn("flex-1", !isMobile && "self-center")}>
            <p className={cn(
              "text-foreground/70",
              isMobile ? "text-sm" : "text-base"
            )}>
              {t("comparison.bottomBar.automateTasksThat")}{" "}
              <span className="font-semibold text-foreground">
                {t("comparison.bottomBar.hoursManually")}
              </span>
            </p>
          </div>

          {/* Vertical hairline (desktop only) */}
          {!isMobile && (
            <div aria-hidden className="w-px bg-foreground/10 self-stretch" />
          )}

          {/* Price block */}
          <div className={cn(
            "flex flex-col",
            isMobile ? "items-start" : "items-start justify-center"
          )}>
            <span className="eyebrow font-mono text-[10px] uppercase tracking-[0.22em] text-foreground/45">
              {t("comparison.bottomBar.startingAt")}
            </span>
            <span className="display-serif text-3xl text-foreground leading-none mt-1">
              $0<span className="text-foreground/45 text-xl">/mo</span>
            </span>
          </div>

          {/* Vertical hairline (desktop only) */}
          {!isMobile && (
            <div aria-hidden className="w-px bg-foreground/10 self-stretch" />
          )}

          {/* Primary CTA */}
          <div className={cn("flex", isMobile ? "" : "items-center")}>
            <Link
              href="/auth"
              className={cn(
                "group inline-flex items-center justify-center gap-2",
                "rounded-full border border-foreground bg-foreground text-background",
                "font-medium transition-all duration-300",
                "hover:bg-background hover:text-foreground",
                isMobile ? "px-5 py-2.5 text-sm w-full" : "px-6 py-3 text-sm whitespace-nowrap"
              )}
            >
              <span>Try Coasty Free</span>
              <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5" strokeWidth={1.75} />
            </Link>
          </div>
        </div>
      </div>
    </motion.div>
  )
}
