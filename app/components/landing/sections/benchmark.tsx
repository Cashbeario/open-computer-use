"use client"

import { motion } from "framer-motion"
import { useEffect, useState } from "react"
import Image from "next/image"
import { useTheme } from "next-themes"
import { useTranslations } from "next-intl"
import { cn } from "@/lib/utils"
import { LandingSectionHeader } from "../section-shell"

type Entry = {
  name: string
  org: string
  score: number
  highlight?: boolean
}

const LEADERBOARD: Entry[] = [
  { name: "Coasty", org: "Ours", score: 82.0, highlight: true },
  { name: "Agent S3", org: "Simular · Opus 4.5 + GPT-5", score: 72.6 },
  { name: "Agent S3", org: "Simular · GPT-5", score: 69.9 },
  { name: "UiPath Screen Agent", org: "UiPath · Opus 4.5", score: 67.1 },
  { name: "Agent S3", org: "Simular · Opus 4.5", score: 66.0 },
  { name: "Kimi K2.5", org: "Moonshot AI", score: 63.3 },
  { name: "Claude Sonnet 4.5", org: "Anthropic", score: 62.9 },
  { name: "Seed-1.8", org: "ByteDance", score: 61.9 },
  { name: "Claude Sonnet 4.5", org: "Anthropic · 50 steps", score: 58.1 },
]

// Scale bar widths against an axis ceiling slightly above the leader so the
// leader bar doesn't pin to the right edge.
const AXIS_MAX = 90

function ScoreValue({
  score,
  className,
}: {
  score: number
  className?: string
}) {
  return (
    <span className={cn("font-mono tabular-nums", className)}>
      {score.toFixed(1)}
      <span className="opacity-50">%</span>
    </span>
  )
}

function BenchmarkRow({
  entry,
  rank,
  isMobile,
}: {
  entry: Entry
  rank: number
  isMobile: boolean
}) {
  const { resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  const widthPct = (entry.score / AXIS_MAX) * 100
  const rankLabel = String(rank).padStart(2, "0")

  // ── MOBILE LAYOUT ────────────────────────────────────────────────────
  if (isMobile) {
    return (
      <div className={cn("flex flex-col gap-1.5", entry.highlight && "py-1")}>
        <div className="flex items-baseline justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-mono text-[10px] tabular-nums text-foreground/30">
              {rankLabel}
            </span>
            {entry.highlight && mounted && (
              <Image
                src={resolvedTheme === "dark" ? "/logo_light.svg" : "/logo_dark.svg"}
                alt="Coasty"
                width={14}
                height={14}
                className="h-3.5 w-3.5 shrink-0"
              />
            )}
            <span className={cn(
              "text-sm font-medium truncate",
              entry.highlight ? "text-foreground" : "text-foreground/85"
            )}>
              {entry.name}
            </span>
          </div>
          <ScoreValue
            score={entry.score}
            className={cn(
              "text-sm shrink-0",
              entry.highlight ? "text-foreground font-semibold" : "text-foreground/75"
            )}
          />
        </div>
        <div className="font-mono text-[10px] text-foreground/35 truncate">
          {entry.org}
        </div>
        <div className={cn(
          "relative w-full overflow-hidden rounded-[2px] bg-foreground/[0.04] dark:bg-foreground/[0.06]",
          entry.highlight ? "h-2.5" : "h-1.5"
        )}>
          <div
            className={cn(
              "absolute inset-y-0 left-0 rounded-[2px]",
              entry.highlight
                ? "bg-foreground/[0.92] dark:bg-foreground/[0.95]"
                : "bg-foreground/30 dark:bg-foreground/35"
            )}
            style={{ width: `${widthPct}%` }}
          />
        </div>
      </div>
    )
  }

  // ── DESKTOP LAYOUT ───────────────────────────────────────────────────
  const barHeight = entry.highlight ? 36 : 24

  return (
    <div
      className={cn(
        "grid items-center gap-4",
        // [rank] [name+org] [bar]
        "grid-cols-[36px_minmax(180px,220px)_minmax(0,1fr)]",
        "group-data-[narrow]/feat:grid-cols-[28px_minmax(140px,180px)_minmax(0,1fr)] group-data-[narrow]/feat:gap-3",
        entry.highlight ? "py-2" : "py-1"
      )}
    >
      {/* Rank */}
      <div className="font-mono text-[10px] text-foreground/30 tabular-nums">
        {rankLabel}
      </div>

      {/* Name + org */}
      <div className="min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          {entry.highlight && mounted && (
            <Image
              src={resolvedTheme === "dark" ? "/logo_light.svg" : "/logo_dark.svg"}
              alt="Coasty"
              width={14}
              height={14}
              className="h-3.5 w-3.5 shrink-0"
            />
          )}
          <span className={cn(
            "truncate",
            entry.highlight
              ? "text-[15px] font-medium text-foreground"
              : "text-[14px] font-medium text-foreground/90"
          )}>
            {entry.name}
          </span>
        </div>
        <div className="font-mono text-[10px] text-foreground/40 truncate mt-0.5">
          {entry.org}
        </div>
      </div>

      {/* Bar */}
      <div className="relative w-full" style={{ height: barHeight }}>
        <div className="absolute inset-0 rounded-[3px] bg-foreground/[0.035] dark:bg-foreground/[0.05]" />
        <div
          className={cn(
            "absolute inset-y-0 left-0 rounded-[3px]",
            entry.highlight
              ? "bg-foreground/[0.92] dark:bg-foreground/[0.95]"
              : "bg-foreground/30 dark:bg-foreground/35"
          )}
          style={{ width: `${widthPct}%` }}
        />

        {/* Value at end of bar */}
        <div
          className="absolute inset-y-0 left-0 flex items-center justify-end pr-2.5 pointer-events-none"
          style={{ width: `${widthPct}%` }}
        >
          <ScoreValue
            score={entry.score}
            className={cn(
              entry.highlight
                ? "text-[14px] font-semibold text-background"
                : "text-[13px] font-medium text-foreground/90"
            )}
          />
        </div>
      </div>
    </div>
  )
}

export function BenchmarkSection({ isMobile }: { isMobile: boolean }) {
  const t = useTranslations()

  return (
    <section
      id="benchmark"
      className="relative py-20 sm:py-24 lg:py-32 px-8 sm:px-10 lg:px-12"
    >
      <div className="max-w-5xl w-full mx-auto">
        <LandingSectionHeader
          title={t("benchmark.title")}
          subtitle={t("benchmark.subtitle")}
          isMobile={isMobile}
        />

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0, margin: "0px 0px -80px 0px" }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          className={cn(
            "relative w-full mx-auto",
            "rounded-2xl border border-foreground/10",
            "p-6 sm:p-10"
          )}
        >
          <div className={cn(isMobile ? "space-y-4" : "space-y-0.5")}>
            {LEADERBOARD.map((entry, i) => (
              <BenchmarkRow
                key={`${entry.name}-${i}`}
                entry={entry}
                rank={i + 1}
                isMobile={isMobile}
              />
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  )
}
