"use client"

/**
 * DeveloperHomeSummary — the developer-mode chat homepage.
 *
 * When the user is in "developer" platform mode, the chat empty-state (greeting
 * + input) is replaced by this clean, minimal summary: the API wallet balance as
 * the single signature element, a hairline stat strip, and quick links into the
 * developer sections. It reuses the same data hook + USD helpers as the full
 * developer dashboard so the numbers always agree.
 */

import { motion } from "framer-motion"
import Link from "next/link"
import { BarChart3, BookOpen, KeyRound, Plus, ScrollText } from "lucide-react"

import { cn } from "@/lib/utils"
import { useUser } from "@/lib/user-store/provider"
import {
  formatNum,
  formatUsd,
  useDeveloperData,
} from "@/app/components/developers/developers-shared"
import { BuildWithAIBar } from "@/app/components/developers/copy-for-ai"

const QUICK_LINKS = [
  { href: "/developers/keys",  icon: KeyRound,   label: "API keys" },
  { href: "/developers/usage", icon: BarChart3,  label: "Usage" },
  { href: "/developers/logs",  icon: ScrollText, label: "Logs" },
  { href: "/developers/docs",  icon: BookOpen,   label: "Docs" },
] as const

const EASE = [0.25, 0.46, 0.45, 0.94] as const

export function DeveloperHomeSummary() {
  const { user } = useUser()
  const { stats, loading } = useDeveloperData()

  const balanceCents = stats.walletBalanceCents ?? stats.balance ?? 0
  const tier = (stats.tier || "").trim()
  const firstName = (user?.display_name || "").trim().split(/\s+/)[0]

  const metrics = [
    { label: "Requests · 7d", value: formatNum(stats.requests7d) },
    { label: "Active keys",   value: formatNum(stats.keyCount) },
    { label: "Today",         value: formatNum(stats.requests24h) },
  ]

  return (
    <motion.div
      key="developer-summary"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, y: -20, transition: { duration: 0.3, ease: EASE } }}
      transition={{ duration: 0.4, ease: EASE }}
      className="mx-auto w-full max-w-[46rem] px-4 pb-12 sm:pb-10"
    >
      {/* Greeting — quiet, sets context without competing with the balance. */}
      <motion.p
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05, duration: 0.45, ease: EASE }}
        className="mb-7 text-center text-sm text-muted-foreground"
      >
        {firstName ? `Welcome back, ${firstName}.` : "Developer."}{" "}
        <span className="text-muted-foreground/60">Here is your API at a glance.</span>
      </motion.p>

      {/* Signature element — the API wallet balance. */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.5, ease: EASE }}
        className="text-center"
      >
        <div className="mb-2.5 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground/55">
          API wallet balance
        </div>
        {loading ? (
          <div className="mx-auto h-14 w-44 animate-pulse rounded-xl bg-foreground/[0.06]" />
        ) : (
          <div className="text-5xl font-semibold tracking-tight tabular-nums text-foreground sm:text-6xl">
            {formatUsd(balanceCents)}
          </div>
        )}
        <div className="mt-3.5 flex items-center justify-center gap-2 text-[12.5px] text-muted-foreground">
          {tier && (
            <>
              <span className="capitalize">{tier} tier</span>
              <span className="text-foreground/20">·</span>
            </>
          )}
          <Link
            href="/developers/usage"
            className="inline-flex items-center gap-1 text-foreground/70 transition-colors hover:text-foreground"
          >
            <Plus className="h-3 w-3" />
            Add funds
          </Link>
        </div>
      </motion.div>

      {/* Hairline stat strip. */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.18, duration: 0.5, ease: EASE }}
        className="mt-10 flex items-stretch justify-center text-center"
      >
        {metrics.map((m, i) => (
          <div key={m.label} className={cn("px-6 sm:px-8", i > 0 && "border-l border-foreground/[0.08]")}>
            <div className="text-xl font-semibold tabular-nums text-foreground/90">{m.value}</div>
            <div className="mt-1 text-[10.5px] font-medium uppercase tracking-wide text-muted-foreground/55">
              {m.label}
            </div>
          </div>
        ))}
      </motion.div>

      {/* Quick links into the developer sections. */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.26, duration: 0.5, ease: EASE }}
        className="mx-auto mt-10 grid max-w-[34rem] grid-cols-2 gap-2 sm:grid-cols-4"
      >
        {QUICK_LINKS.map(({ href, icon: Icon, label }) => (
          <Link
            key={href}
            href={href}
            className="group flex items-center justify-center gap-2 rounded-xl border border-foreground/[0.06] bg-foreground/[0.015] px-3 py-3 transition-colors hover:border-foreground/[0.12] hover:bg-foreground/[0.03] dark:bg-foreground/[0.02]"
          >
            <Icon className="h-4 w-4 text-muted-foreground/65 transition-colors group-hover:text-foreground/80" />
            <span className="text-[12.5px] font-medium text-foreground/70 transition-colors group-hover:text-foreground">
              {label}
            </span>
          </Link>
        ))}
      </motion.div>

      {/* Build-with-AI: copy the full API prompt into an AI coding tool. */}
      <BuildWithAIBar className="mt-8 text-left" />
    </motion.div>
  )
}
