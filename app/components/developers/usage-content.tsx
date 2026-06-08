"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { BuildWithAIBar } from "@/app/components/developers/copy-for-ai"
import { useRouter, useSearchParams } from "next/navigation"
import { motion } from "framer-motion"
import Link from "next/link"
import { BookOpen, Plus, Wallet, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { fetchClient } from "@/lib/fetch"
import { Button } from "@/components/ui/button"
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
} from "@/components/ui/alert-dialog"
import {
  EASE,
  formatNum,
  creditsToUsd,
  creditsToUsdCents,
  formatUsd,
  StatTile,
  ActivityChart,
  EndpointBreakdownPanel,
  useDeveloperData,
  DevPageShell,
  DevHeader,
} from "@/app/components/developers/developers-shared"

/* ===================================================================
   Usage page — the developer API wallet (a dollar-denominated prepaid
   balance, independent of any consumer subscription), plus request and
   credit analytics. Developers top up in dollars via Stripe; live API
   requests draw the wallet down.
   =================================================================== */

const PRESET_USD = [10, 25, 50, 100]
const MIN_USD = 5
const MAX_USD = 5000

function AddFundsDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [preset, setPreset] = useState<number>(25)
  const [custom, setCustom] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const amountUsd = custom.trim() ? Number(custom) : preset
  const valid =
    Number.isFinite(amountUsd) && amountUsd >= MIN_USD && amountUsd <= MAX_USD

  // Reset when closed.
  useEffect(() => {
    if (!open) {
      setPreset(25)
      setCustom("")
      setSubmitting(false)
    }
  }, [open])

  const submit = async () => {
    if (!valid || submitting) return
    setSubmitting(true)
    try {
      const res = await fetchClient("/api/developers/wallet/checkout", {
        method: "POST",
        body: JSON.stringify({ amountUsd }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data?.url) {
        window.location.href = data.url as string
        return // keep the spinner while the browser navigates to Stripe
      }
      toast.error(data?.error ?? "Could not start checkout")
      setSubmitting(false)
    } catch {
      toast.error("Could not start checkout")
      setSubmitting(false)
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-md p-0 gap-0 overflow-hidden">
        <div className="px-5 sm:px-6 pt-5 pb-3 border-b border-foreground/[0.05]">
          <AlertDialogTitle className="text-[15px] font-medium tracking-[-0.005em]">
            Add funds
          </AlertDialogTitle>
          <AlertDialogDescription className="text-[12.5px] text-muted-foreground/55 mt-1">
            Top up your API wallet. Funds are charged only as you make API requests.
          </AlertDialogDescription>
        </div>

        <div className="px-5 sm:px-6 py-4 space-y-4">
          <div className="grid grid-cols-4 gap-1.5">
            {PRESET_USD.map((v) => {
              const active = !custom.trim() && preset === v
              return (
                <button
                  key={v}
                  type="button"
                  onClick={() => {
                    setPreset(v)
                    setCustom("")
                  }}
                  className={cn(
                    "h-10 rounded-lg border text-[13px] font-medium tabular-nums transition-colors",
                    active
                      ? "border-foreground/30 bg-foreground/[0.06] text-foreground"
                      : "border-foreground/[0.08] text-muted-foreground/70 hover:text-foreground hover:border-foreground/20",
                  )}
                >
                  ${v}
                </button>
              )
            })}
          </div>

          <div>
            <label className="text-[10.5px] font-medium uppercase tracking-[0.16em] text-muted-foreground/50 mb-1.5 block">
              Custom amount
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[13px] text-muted-foreground/50">$</span>
              <input
                type="number"
                inputMode="decimal"
                min={MIN_USD}
                max={MAX_USD}
                step="1"
                placeholder="50"
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submit()}
                className="w-full h-9 pl-7 pr-3 rounded-lg border border-foreground/[0.08] bg-background/60 text-[13px] tabular-nums placeholder:text-muted-foreground/40 focus:outline-none focus:border-foreground/20 focus:bg-background transition-colors"
              />
            </div>
            <p className="text-[10.5px] text-muted-foreground/45 mt-1.5">
              Between ${MIN_USD} and ${MAX_USD.toLocaleString()}.
            </p>
          </div>
        </div>

        <div className="border-t border-foreground/[0.05] px-5 sm:px-6 py-3 flex items-center justify-between gap-2 bg-foreground/[0.012]">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="text-[12.5px] h-8 px-3 rounded-lg text-muted-foreground/70 hover:text-foreground transition-colors"
          >
            Cancel
          </button>
          <Button className="text-[12.5px] h-8 gap-1.5" onClick={submit} disabled={!valid || submitting}>
            {submitting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Plus className="h-3.5 w-3.5" />
            )}
            {submitting ? "Redirecting…" : valid ? `Add $${amountUsd.toFixed(2)}` : "Add funds"}
          </Button>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  )
}

export function UsageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { stats, byEndpoint, daily, loading, refetch } = useDeveloperData()
  const [showAddFunds, setShowAddFunds] = useState(false)

  const sparkRequests = daily.slice(-7).map((d) => d.requests)
  const sparkCredits = daily.slice(-7).map((d) => d.credits)

  const walletUsd = (stats.walletBalanceUsd ?? (stats.balance ?? 0) / 100) || 0
  const spentUsd = (stats.walletSpentCents ?? 0) / 100

  // Handle the return from Stripe checkout (runs once).
  const handledRef = useRef(false)
  useEffect(() => {
    if (handledRef.current) return
    if (searchParams.get("topup_success") === "true") {
      handledRef.current = true
      toast.success("Funds added to your API wallet")
      refetch()
      router.replace("/developers/usage")
    } else if (searchParams.get("topup_canceled") === "true") {
      handledRef.current = true
      router.replace("/developers/usage")
    }
  }, [searchParams, refetch, router])

  const openAddFunds = useCallback(() => setShowAddFunds(true), [])

  return (
    <DevPageShell loading={loading}>
      <DevHeader
        title="Usage"
        description="Your dollar API wallet, plus requests, spend, and endpoint activity."
        actions={
          <>
            <Link
              href="/developers/docs"
              className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-xl border border-foreground/[0.08] text-[12.5px] font-medium text-muted-foreground/70 hover:text-foreground hover:border-foreground/20 hover:bg-foreground/[0.03] transition-all"
            >
              <BookOpen className="h-3.5 w-3.5" />
              Docs
            </Link>
            <button
              onClick={openAddFunds}
              className="inline-flex h-9 items-center justify-center rounded-xl px-4 text-[12.5px] font-medium gap-1.5 transition-all bg-foreground text-background hover:bg-foreground/90 shadow-sm"
            >
              <Plus className="h-3.5 w-3.5" />
              Add funds
            </button>
          </>
        }
      />

      <BuildWithAIBar />

      {/* ── Stats row: dollar wallet + analytics ── */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.05, ease: EASE }}
        className="grid grid-cols-2 lg:grid-cols-4 gap-3"
      >
        <StatTile
          label="Wallet"
          value={`$${walletUsd.toFixed(2)}`}
          hint={spentUsd > 0 ? `$${spentUsd.toFixed(2)} spent all-time` : "Prepaid API balance"}
          accent="emerald"
        />
        <StatTile
          label="Requests"
          value={formatNum(stats.totalRequests)}
          suffix="last 30d"
          hint={stats.requests24h > 0 ? `${formatNum(stats.requests24h)} today` : "No requests today"}
          sparkData={sparkRequests}
        />
        <StatTile
          label="Total spend"
          value={formatUsd(creditsToUsdCents(stats.totalCredits))}
          suffix="last 30d"
          hint={stats.avgCreditsPerRequest > 0 ? `${creditsToUsd(stats.avgCreditsPerRequest)}/req avg` : undefined}
          sparkData={sparkCredits}
        />
        <StatTile
          label="Active keys"
          value={String(stats.keyCount)}
          hint={stats.peakHour !== null && stats.totalRequests >= 5
            ? `Peak at ${String(stats.peakHour).padStart(2, "0")}:00`
            : undefined}
        />
      </motion.div>

      {/* ── Low-balance nudge ── */}
      {!loading && walletUsd < 5 && (
        <motion.button
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.08, ease: EASE }}
          onClick={openAddFunds}
          className="w-full text-left flex items-center gap-3 rounded-2xl border border-amber-500/25 bg-amber-500/[0.06] px-4 py-3 hover:bg-amber-500/[0.1] transition-colors"
        >
          <Wallet className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="text-[12.5px] font-medium text-foreground/85">
              {walletUsd <= 0 ? "Your API wallet is empty" : "Your API wallet is running low"}
            </div>
            <div className="text-[11.5px] text-muted-foreground/60">
              Live API requests will be rejected with a 402 until you add funds.
            </div>
          </div>
          <span className="shrink-0 text-[12px] font-medium text-amber-700 dark:text-amber-300">Add funds</span>
        </motion.button>
      )}

      {/* ── Activity + endpoint breakdown ── */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.1, ease: EASE }}
        className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-5"
      >
        <ActivityChart daily={daily} />
        <EndpointBreakdownPanel byEndpoint={byEndpoint} />
      </motion.div>

      <AddFundsDialog open={showAddFunds} onOpenChange={setShowAddFunds} />
    </DevPageShell>
  )
}
