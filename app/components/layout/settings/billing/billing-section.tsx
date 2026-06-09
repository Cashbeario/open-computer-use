"use client"

import React, { useEffect, useState, useMemo, useCallback, useRef } from "react"
import { useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import { useCredits } from "@/lib/hooks/use-credits"
import { useUser } from "@/lib/user-store/provider"
import { Coins } from "@phosphor-icons/react"
import { cn } from "@/lib/utils"
import {
  ArrowRight,
  Wallet,
  ArrowUpRight,
  ArrowDownRight,
  Infinity as InfinityIcon,
  User,
  Code,
  Plus,
  Loader2,
} from "lucide-react"
import { motion } from "framer-motion"
import { useTranslations } from "next-intl"
import { priceUSD } from "@/lib/pricing/format"
import { usePlatformMode } from "@/lib/platform-mode-store"
import { useApiWallet } from "@/lib/hooks/use-api-wallet"

// ─── Plan & Package Data ────────────────────────────────────────────────────
//
// We KEEP every plan definition in this array even when temporarily
// removed from sale — `activePlan` lookup (line ~1239 below) reads from
// this list to render the current plan card for existing subscribers
// on Lite / Plus / Pro.  Toggle `purchasable` on a plan to remove it
// from the upgrade grid without breaking existing subscribers.
//
// The single source of truth for which plans are live is
// lib/pricing/tiers.ts (PURCHASABLE_DB_TIERS) — keep this flag in sync.

const subscriptionPlans = [
  {
    id: "lite",
    name: "Lite",
    tier: "lite",
    price: priceUSD("lite"),
    monthlyCredits: 100,
    machines: 1,
    swarm: 2,
    description: "Light daily automation",
    features: [
      "1 VM (deleted after inactivity)",
      "2 agents in parallel",
      "Basic search",
      "Standard support (real humans)",
    ],
    popular: false,
    purchasable: false, // HIDDEN — kept for existing subscribers' billing UI
  },
  {
    id: "starter",
    name: "Starter",
    tier: "starter",
    price: priceUSD("starter"),
    monthlyCredits: 200,
    machines: 1,
    swarm: 3,
    description: "Automate tasks every day",
    features: [
      "1 always-on VM",
      "3 agents in parallel",
      "Advanced search & extraction",
      "Standard support (real humans)",
    ],
    popular: false,
    purchasable: true, // ✅ LIVE
  },
  {
    id: "professional",
    name: "Plus",
    tier: "professional",
    price: priceUSD("plus"),
    monthlyCredits: 600,
    machines: 2,
    swarm: 6,
    description: "Scale complex workflows",
    features: [
      "2 always-on VMs",
      "6 agents in parallel",
      "Advanced search & extraction",
      "Priority support, 24hr response",
    ],
    popular: true,
    purchasable: true, // ✅ LIVE — "Most Popular" volume tier
  },
  {
    id: "enterprise",
    name: "Pro",
    tier: "enterprise",
    price: priceUSD("pro"),
    monthlyCredits: 1500,
    machines: 3,
    swarm: 9,
    description: "Unlimited heavy automation",
    features: [
      "3 always-on VMs",
      "9 agents in parallel",
      "Advanced search & extraction",
      "Premium support, 12hr response",
    ],
    popular: false,
    purchasable: false, // HIDDEN — kept for existing subscribers' billing UI
  },
  {
    id: "unlimited",
    name: "Unlimited",
    tier: "unlimited",
    price: priceUSD("unlimited"),
    // Sentinel for "unlimited" — UI must render the literal string when
    // detecting tier === "unlimited" rather than this number.
    monthlyCredits: 999_999_999,
    machines: 2,
    // 5 concurrent agents — abuse-prevention cap; see lib/pricing/tiers.ts.
    swarm: 5,
    description: "No credit limits — ever",
    features: [
      "Unlimited credits, no caps",
      "2 always-on VMs",
      "5 concurrent agents",
      "Priority support, 24hr response",
    ],
    popular: false,
    featured: true,
    purchasable: true, // ✅ LIVE — flagship plan
  },
]

/** The subset of plans currently for sale.  Powers the "Choose Your Plan"
 * grid.  Indexed by the local `selectedPlan` state so changing this
 * array's length will not break the index. */
const purchasablePlans = subscriptionPlans.filter((p) => p.purchasable)

const additionalCreditPackages = [
  {
    id: "boost-small",
    name: "Boost",
    credits: 150,
    price: priceUSD("starter"),
    description: "Quick top-up",
  },
  {
    id: "boost-medium",
    name: "Power Boost",
    credits: 500,
    price: 49,
    description: "Most popular",
    savings: "23% off",
  },
  {
    id: "boost-large",
    name: "Ultra Boost",
    credits: 1200,
    price: 99,
    description: "Best value",
    savings: "35% off",
  },
]

// ─── Types ──────────────────────────────────────────────────────────────────

interface Transaction {
  id: string
  type: "purchase" | "usage" | "refund" | "bonus" | "subscription" | "subscription_grant" | "subscription_renewal" | "subscription_reactivation"
  amount: number
  balance_after: number
  created_at: string
  usage_description?: string
  price_paid?: number
}

interface UserSubscription {
  id: string
  status: string
  tier?: string
  current_period_end?: string
  cancel_at_period_end: boolean
  created_at?: string
}

type TimeRange = "7d" | "30d" | "90d" | "all"

// ─── Helpers ────────────────────────────────────────────────────────────────

function getTimeRangeDate(range: TimeRange): Date | null {
  if (range === "all") return null
  const now = new Date()
  const days = range === "7d" ? 7 : range === "30d" ? 30 : 90
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000)
}

function formatShortDate(dateString: string) {
  return new Date(dateString).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  })
}

function formatRelativeDate(dateString: string, t?: (key: string, values?: Record<string, unknown>) => string) {
  const now = new Date()
  const date = new Date(dateString)
  const diffMs = now.getTime() - date.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  const diffHr = Math.floor(diffMin / 60)
  const diffDay = Math.floor(diffHr / 24)

  if (t) {
    if (diffMin < 1) return t("timeAgo.justNow")
    if (diffMin < 60) return t("timeAgo.minutesAgo", { count: diffMin })
    if (diffHr < 24) return t("timeAgo.hoursAgo", { count: diffHr })
    if (diffDay < 7) return t("timeAgo.daysAgo", { count: diffDay })
  } else {
    if (diffMin < 1) return "Just now"
    if (diffMin < 60) return `${diffMin}m ago`
    if (diffHr < 24) return `${diffHr}h ago`
    if (diffDay < 7) return `${diffDay}d ago`
  }
  return formatShortDate(dateString)
}

// ─── Interactive Chart ──────────────────────────────────────────────────────

interface ChartDataPoint {
  date: string
  earned: number
  spent: number
  balance: number
}

function BillingViewSwitcher({
  value,
  onChange,
}: {
  value: "personal" | "developer"
  onChange: (v: "personal" | "developer") => void
}) {
  const tabs = [
    { id: "personal" as const, label: "Personal", icon: User },
    { id: "developer" as const, label: "Developer", icon: Code },
  ]
  return (
    <div className="inline-flex items-center gap-0.5 rounded-xl border border-border/50 bg-card p-1">
      {tabs.map((tab) => {
        const active = value === tab.id
        const Icon = tab.icon
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            aria-pressed={active}
            className={cn(
              "relative inline-flex items-center gap-1.5 h-8 px-3.5 rounded-lg text-[12.5px] font-medium transition-colors",
              active ? "text-foreground" : "text-muted-foreground/55 hover:text-foreground/80",
            )}
          >
            {active && (
              <motion.span
                layoutId="billing-view-active"
                className="absolute inset-0 rounded-lg bg-foreground/[0.07]"
                transition={{ type: "spring", stiffness: 400, damping: 32 }}
              />
            )}
            <Icon className="relative h-3.5 w-3.5" strokeWidth={active ? 2.1 : 1.8} />
            <span className="relative">{tab.label}</span>
          </button>
        )
      })}
    </div>
  )
}

// ─── Developer (API wallet) billing view ──────────────────────────────────
interface WalletTxn {
  id: string
  type: string
  amount_cents: number
  balance_after_cents: number
  credits: number | null
  endpoint: string | null
  usage_description: string | null
  created_at: string
}

const WALLET_TXN_LABEL: Record<string, string> = {
  topup: "Top-up",
  usage: "API usage",
  refund: "Refund",
  promo: "Promo credit",
  adjustment: "Adjustment",
  reversal: "Reversal",
}

function WalletTxnRow({ tx }: { tx: WalletTxn }) {
  const isCredit = tx.amount_cents >= 0
  const usd = Math.abs(tx.amount_cents) / 100
  const label =
    tx.type === "usage" && tx.endpoint
      ? tx.endpoint.replace(/^cua_api_/, "").replace(/_/g, " ")
      : WALLET_TXN_LABEL[tx.type] ?? tx.type
  return (
    <div className="flex items-center gap-3 px-5 py-3">
      <span
        className={cn(
          "h-7 w-7 rounded-full flex items-center justify-center shrink-0",
          isCredit
            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
            : "bg-foreground/[0.05] text-muted-foreground/60",
        )}
      >
        {isCredit ? <ArrowDownRight className="h-3.5 w-3.5" /> : <ArrowUpRight className="h-3.5 w-3.5" />}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[12.5px] font-medium truncate capitalize">{label}</div>
        <div className="text-[11px] text-muted-foreground/50">{formatRelativeDate(tx.created_at)}</div>
      </div>
      <div className="text-right shrink-0">
        <div
          className={cn(
            "text-[12.5px] font-semibold tabular-nums",
            isCredit ? "text-emerald-600 dark:text-emerald-400" : "text-foreground/80",
          )}
        >
          {isCredit ? "+" : "−"}${usd.toFixed(2)}
        </div>
        <div className="text-[10.5px] text-muted-foreground/40 tabular-nums">
          ${(tx.balance_after_cents / 100).toFixed(2)}
        </div>
      </div>
    </div>
  )
}

// Consumer-credit ledger row — the Personal-view twin of WalletTxnRow, so
// both billing views read identically.
const CREDIT_TXN_LABEL: Record<string, string> = {
  purchase: "Credit purchase",
  usage: "Usage",
  refund: "Refund",
  bonus: "Bonus",
  expired: "Expired",
  subscription_grant: "Plan credits",
  subscription_renewal: "Monthly credits",
  subscription_reactivation: "Plan credits",
}

function CreditTxnRow({ tx }: { tx: Transaction }) {
  const isCredit = tx.amount >= 0
  const label = CREDIT_TXN_LABEL[tx.type] ?? tx.type
  return (
    <div className="flex items-center gap-3 px-5 py-3">
      <span
        className={cn(
          "h-7 w-7 rounded-full flex items-center justify-center shrink-0",
          isCredit
            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
            : "bg-foreground/[0.05] text-muted-foreground/60",
        )}
      >
        {isCredit ? <ArrowDownRight className="h-3.5 w-3.5" /> : <ArrowUpRight className="h-3.5 w-3.5" />}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[12.5px] font-medium truncate">{label}</div>
        <div className="text-[11px] text-muted-foreground/50">{formatRelativeDate(tx.created_at)}</div>
      </div>
      <div className="text-right shrink-0">
        <div
          className={cn(
            "text-[12.5px] font-semibold tabular-nums",
            isCredit ? "text-emerald-600 dark:text-emerald-400" : "text-foreground/80",
          )}
        >
          {isCredit ? "+" : "−"}{Math.abs(tx.amount).toLocaleString()}
        </div>
        <div className="text-[10.5px] text-muted-foreground/40 tabular-nums">{tx.balance_after.toLocaleString()}</div>
      </div>
    </div>
  )
}

const WALLET_PRESETS = [10, 25, 50, 100]

function DeveloperBillingView() {
  const { wallet, loading } = useApiWallet(true)
  const [txns, setTxns] = useState<WalletTxn[]>([])
  const [loadingTxns, setLoadingTxns] = useState(true)
  const [preset, setPreset] = useState(25)
  const [custom, setCustom] = useState("")
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    let alive = true
    fetch("/api/developers/wallet/transactions?limit=50")
      .then((r) => (r.ok ? r.json() : { transactions: [] }))
      .then((d) => { if (alive) setTxns(d.transactions ?? []) })
      .catch(() => {})
      .finally(() => { if (alive) setLoadingTxns(false) })
    return () => { alive = false }
  }, [])

  const amountUsd = custom.trim() ? Number(custom) : preset
  const valid = Number.isFinite(amountUsd) && amountUsd >= 5 && amountUsd <= 5000

  const addFunds = useCallback(async () => {
    if (!valid || submitting) return
    setSubmitting(true)
    try {
      const res = await fetch("/api/developers/wallet/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountUsd }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data?.url) {
        window.location.href = data.url as string
        return
      }
      toast.error(data?.error ?? "Could not start checkout")
      setSubmitting(false)
    } catch {
      toast.error("Could not start checkout")
      setSubmitting(false)
    }
  }, [valid, submitting, amountUsd])

  const usd = wallet?.balanceUsd ?? 0
  const toppedUp = (wallet?.totalToppedUpCents ?? 0) / 100
  const spent = (wallet?.totalSpentCents ?? 0) / 100
  const low = !loading && usd < 5

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      className="space-y-5"
    >
      {/* ── Balance hero ── */}
      <div className="relative rounded-2xl border border-border/50 bg-card overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-foreground/[0.1] to-transparent" />
        <div className="p-6">
          <div className="text-[10.5px] font-medium uppercase tracking-[0.16em] text-muted-foreground/50 mb-2">
            API wallet
          </div>
          <div className="flex items-end justify-between gap-6 flex-wrap">
            <div className="min-w-0">
              <div className="text-[40px] leading-none font-medium tracking-tight tabular-nums">
                {loading ? <span className="text-muted-foreground/30">$0.00</span> : `$${usd.toFixed(2)}`}
              </div>
              <p className="text-[12.5px] text-muted-foreground/55 mt-2 max-w-sm">
                Prepaid balance for the developer API — independent of your plan or credits.
              </p>
            </div>
            <div className="flex items-center gap-5">
              <div>
                <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground/45">Added</div>
                <div className="text-[15px] font-medium tabular-nums mt-0.5">${toppedUp.toFixed(2)}</div>
              </div>
              <div className="h-8 w-px bg-border/50" />
              <div>
                <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground/45">Spent</div>
                <div className="text-[15px] font-medium tabular-nums mt-0.5">${spent.toFixed(2)}</div>
              </div>
            </div>
          </div>
          {low && (
            <div className="mt-4 inline-flex items-center gap-1.5 text-[12px] font-medium text-amber-600 dark:text-amber-400">
              <Wallet className="h-3.5 w-3.5" />
              {usd <= 0 ? "Wallet empty — live API requests are rejected until you add funds." : "Low balance."}
            </div>
          )}
        </div>
      </div>

      {/* ── Add funds ── */}
      <div className="rounded-2xl border border-border/50 bg-card p-5">
        <div className="flex items-center justify-between mb-3.5">
          <div className="text-[13px] font-semibold">Add funds</div>
          <div className="text-[11px] text-muted-foreground/50 tabular-nums">$5 – $5,000</div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {WALLET_PRESETS.map((v) => {
            const active = !custom.trim() && preset === v
            return (
              <button
                key={v}
                type="button"
                onClick={() => { setPreset(v); setCustom("") }}
                className={cn(
                  "h-9 px-4 rounded-lg border text-[13px] font-medium tabular-nums transition-colors",
                  active
                    ? "border-foreground/30 bg-foreground/[0.06] text-foreground"
                    : "border-border/60 text-muted-foreground/70 hover:text-foreground hover:border-foreground/25",
                )}
              >
                ${v}
              </button>
            )
          })}
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[13px] text-muted-foreground/50">$</span>
            <input
              type="number"
              inputMode="decimal"
              min={5}
              max={5000}
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addFunds()}
              placeholder="Custom"
              className="w-28 h-9 pl-7 pr-3 rounded-lg border border-border/60 bg-background text-[13px] tabular-nums placeholder:text-muted-foreground/40 focus:outline-none focus:border-foreground/25 transition-colors"
            />
          </div>
          <Button onClick={addFunds} disabled={!valid || submitting} className="h-9 gap-1.5 ml-auto text-[12.5px]">
            {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            {submitting ? "Redirecting…" : valid ? `Add $${amountUsd.toFixed(2)}` : "Add funds"}
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground/45 mt-3.5 leading-relaxed">
          Charged once via Stripe. No subscription required. Funds are spent only as you make API
          requests (1 credit = $0.01).
        </p>
      </div>

      {/* ── Wallet activity ── */}
      <div className="rounded-2xl border border-border/50 bg-card overflow-hidden">
        <div className="px-5 py-3 border-b border-border/40 flex items-center justify-between">
          <div className="text-[13px] font-semibold">Wallet activity</div>
          {!loadingTxns && txns.length > 0 && (
            <div className="text-[11px] text-muted-foreground/45 tabular-nums">{txns.length} entries</div>
          )}
        </div>
        {loadingTxns ? (
          <div className="px-5 py-10 text-center text-[12px] text-muted-foreground/40">Loading…</div>
        ) : txns.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <Wallet className="h-6 w-6 mx-auto text-muted-foreground/20 mb-2.5" strokeWidth={1.4} />
            <p className="text-[12.5px] text-muted-foreground/50">No wallet activity yet.</p>
            <p className="text-[11.5px] text-muted-foreground/40 mt-1">Add funds above to start using the API.</p>
          </div>
        ) : (
          <div className="divide-y divide-border/30">
            {txns.map((tx) => (
              <WalletTxnRow key={tx.id} tx={tx} />
            ))}
          </div>
        )}
      </div>
    </motion.div>
  )
}

export function BillingSection() {
  const t = useTranslations("billing")
  const searchParams = useSearchParams()
  const { user } = useUser()
  const { credits, loading: creditsLoading, refetch: refetchCredits } = useCredits()
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loadingTransactions, setLoadingTransactions] = useState(true)
  const [purchasingPackage, setPurchasingPackage] = useState<string | null>(null)
  const [subscription, setSubscription] = useState<UserSubscription | null>(null)
  const [, setLoadingSubscription] = useState(true)
  const [subscribingPlan, setSubscribingPlan] = useState<string | null>(null)
  // Default to the flagship "unlimited" pill if it's currently live,
  // otherwise the last available plan.  Indexes into `purchasablePlans`,
  // not `subscriptionPlans` — clamp to a safe range if the list shrinks.
  const [selectedPlan, setSelectedPlan] = useState(() => {
    const idx = purchasablePlans.findIndex((p) => p.id === "unlimited")
    return idx >= 0 ? idx : Math.max(0, purchasablePlans.length - 1)
  })

  // Fixed window for the live `stats` / `chartData` derivations used by the
  // balance hero (the old time-range / filter / chart controls were removed
  // with the dense consumer chart).
  const timeRange: TimeRange = "30d"
  const [showAllTransactions, setShowAllTransactions] = useState(false)

  // Personal ⇆ Developer billing view. Defaults to Developer (once) when the
  // user is in developer platform mode — e.g. opened from the sidebar wallet.
  const platformMode = usePlatformMode((s) => s.mode)
  const [billingView, setBillingView] = useState<"personal" | "developer">("personal")
  const didInitBillingView = useRef(false)
  useEffect(() => {
    if (didInitBillingView.current) return
    didInitBillingView.current = true
    if (platformMode === "developer") setBillingView("developer")
  }, [platformMode])

  // Fetch subscription status
  useEffect(() => {
    const fetchSubscription = async () => {
      if (!user) return
      try {
        const response = await fetch("/api/subscription/status")
        if (response.ok) {
          const data = await response.json()
          setSubscription(data.subscription)
        }
      } catch (error) {
        console.error("Error fetching subscription:", error)
      } finally {
        setLoadingSubscription(false)
      }
    }
    fetchSubscription()
  }, [user])

  // Check for success/cancel from Stripe
  useEffect(() => {
    const success = searchParams.get("payment_success")
    const canceled = searchParams.get("payment_canceled")
    const subscriptionSuccess = searchParams.get("subscription_success")

    if (success === "true") {
      toast.success(t("toasts.paymentSuccess"))
      refetchCredits()
      window.history.replaceState({}, "", window.location.pathname)
    } else if (subscriptionSuccess === "true") {
      toast.success(t("toasts.subscriptionActivated"))
      refetchCredits()
      window.location.reload()
    } else if (canceled === "true") {
      toast.error(t("toasts.paymentCanceled"))
      window.history.replaceState({}, "", window.location.pathname)
    }
  }, [searchParams, refetchCredits, t])

  // Fetch all transactions (up to 500 for chart)
  useEffect(() => {
    const fetchTransactions = async () => {
      if (!user) return
      try {
        const response = await fetch("/api/credits/history?limit=500")
        if (!response.ok) throw new Error("Failed to fetch transactions")
        const data = await response.json()
        setTransactions(data.transactions)
      } catch (error) {
        console.error("Error fetching transactions:", error)
      } finally {
        setLoadingTransactions(false)
      }
    }
    fetchTransactions()
  }, [user])

  // ─── Computed data ──────────────────────────────────────────────────────

  const chartData = useMemo<ChartDataPoint[]>(() => {
    const rangeDate = getTimeRangeDate(timeRange)
    const relevant = rangeDate
      ? transactions.filter((tx) => new Date(tx.created_at) >= rangeDate)
      : transactions

    if (relevant.length === 0) return []

    // Group by day
    const dayMap = new Map<string, { earned: number; spent: number; balance: number }>()
    // Sort ascending for balance tracking
    const sorted = [...relevant].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    )

    for (const tx of sorted) {
      const day = new Date(tx.created_at).toISOString().split("T")[0]
      const existing = dayMap.get(day) || { earned: 0, spent: 0, balance: 0 }
      if (tx.amount > 0) {
        existing.earned += tx.amount
      } else {
        existing.spent += Math.abs(tx.amount)
      }
      existing.balance = tx.balance_after
      dayMap.set(day, existing)
    }

    // Fill gaps for smoother chart
    const days = Array.from(dayMap.keys()).sort()
    if (days.length === 0) return []

    const result: ChartDataPoint[] = []
    const start = new Date(days[0])
    const end = new Date(days[days.length - 1])
    let lastBalance = dayMap.get(days[0])?.balance || 0

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const key = d.toISOString().split("T")[0]
      const entry = dayMap.get(key)
      if (entry) {
        lastBalance = entry.balance
        result.push({ date: key, ...entry })
      } else {
        result.push({ date: key, earned: 0, spent: 0, balance: lastBalance })
      }
    }

    // Normalize balance to 0 for unlimited subscribers — see comment at top.
    // Inlined here (rather than using `isUnlimitedActivePlan` from below)
    // because chartData runs before that derivation in source order.
    if (subscription?.tier === "unlimited") {
      return result.map((d) => ({ ...d, balance: 0 }))
    }

    return result
  }, [transactions, timeRange, subscription?.tier])

  const stats = useMemo(() => {
    const rangeDate = getTimeRangeDate(timeRange)
    const relevant = rangeDate
      ? transactions.filter((tx) => new Date(tx.created_at) >= rangeDate)
      : transactions

    const totalEarned = relevant.filter((tx) => tx.amount > 0).reduce((sum, tx) => sum + tx.amount, 0)
    const totalSpent = relevant.filter((tx) => tx.amount < 0).reduce((sum, tx) => sum + Math.abs(tx.amount), 0)
    const netChange = totalEarned - totalSpent
    const avgDailyUsage =
      relevant.length > 0
        ? totalSpent / Math.max(chartData.length, 1)
        : 0

    // Estimate days remaining at current rate
    const currentBalance = credits?.balance || 0
    const daysRemaining = avgDailyUsage > 0 ? Math.floor(currentBalance / avgDailyUsage) : null

    // Usage sessions count
    const usageSessions = relevant.filter((tx) => tx.type === "usage").length

    return { totalEarned, totalSpent, netChange, avgDailyUsage, daysRemaining, usageSessions }
  }, [transactions, timeRange, chartData, credits])

  // Subscription plan info
  const activePlan = subscription
    ? subscriptionPlans.find((p) => p.tier === subscription.tier)
    : null

  // Unlimited plan: usage % is meaningless (the sentinel monthlyCredits
  // would always read ~100% used).  Treat as 0 so the progress bar reads
  // empty (i.e. "nothing depleted") and the UI elsewhere shows "Unlimited".
  const isUnlimitedActivePlan = activePlan?.tier === "unlimited"

  // ─── Unlimited-plan computations ─────────────────────────────────────────
  //
  // Used to power the cool "VIP" placeholder UI for Unlimited subscribers
  // — see <UnlimitedHeroCard /> below.  Rate is the Ultra Boost rate
  // ($99/1,200 credits = $0.0825/credit) — the cheapest pay-as-you-go
  // option, so the savings number stays conservative even at heavy usage.
  const PAYG_CREDIT_RATE_USD = 0.0825
  const UNLIMITED_MONTHLY_PRICE_USD = priceUSD("unlimited")
  const wouldHavePaidPAYG = Math.round(stats.totalSpent * PAYG_CREDIT_RATE_USD)
  const monthlySavingsUSD = Math.max(0, wouldHavePaidPAYG - UNLIMITED_MONTHLY_PRICE_USD)

  const renewalDateStr = subscription?.current_period_end
    ? new Date(subscription.current_period_end).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      })
    : null

  // ─── Actions ────────────────────────────────────────────────────────────

  const handleSubscribe = async (planId: string, tier: string, price: number) => {
    if (!user) {
      toast.error(t("toasts.signInToSubscribe"))
      return
    }
    try {
      setSubscribingPlan(planId)
      const response = await fetch("/api/subscription/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId, tier, price }),
      })
      if (!response.ok) throw new Error("Failed to create subscription checkout")
      const { url } = await response.json()
      if (url) window.location.href = url
    } catch (error) {
      console.error("Error creating subscription checkout:", error)
      toast.error(t("toasts.subscriptionCheckoutFailed"))
    } finally {
      setSubscribingPlan(null)
    }
  }

  const handlePurchaseCredits = async (packageId: string, credits: number, price: number) => {
    if (!user) {
      toast.error(t("toasts.signInToPurchase"))
      return
    }
    if (!subscription || subscription.status !== "active") {
      toast.error(t("toasts.needSubscription"))
      return
    }
    try {
      setPurchasingPackage(packageId)
      const response = await fetch("/api/credits/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packageId, credits, price }),
      })
      if (!response.ok) throw new Error("Failed to create checkout session")
      const { url } = await response.json()
      if (url) window.location.href = url
    } catch (error) {
      console.error("Error creating checkout session:", error)
      toast.error(t("toasts.checkoutFailed"))
    } finally {
      setPurchasingPackage(null)
    }
  }

  const handleManageSubscription = async () => {
    try {
      const response = await fetch("/api/subscription/portal", { method: "POST" })
      if (!response.ok) throw new Error("Failed to create portal session")
      const { url } = await response.json()
      if (url) window.location.href = url
    } catch (error) {
      console.error("Error creating portal session:", error)
      toast.error(t("toasts.manageFailed"))
    }
  }

  // Index into the PURCHASABLE list, not the full one — hidden plans must
  // never be reachable through the pill-tab UI.  If the in-memory selected
  // index is out of range (because the purchasable count shrank), clamp.
  const plan = purchasablePlans[selectedPlan] ?? purchasablePlans[0]

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <BillingViewSwitcher value={billingView} onChange={setBillingView} />
      {billingView === "developer" ? (
        <DeveloperBillingView />
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          className="space-y-5"
        >
          {/* ── Balance hero ── */}
          <div className="relative rounded-2xl border border-border/50 bg-card overflow-hidden">
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-foreground/[0.1] to-transparent" />
            <div className="p-6">
              <div className="text-[10.5px] font-medium uppercase tracking-[0.16em] text-muted-foreground/50 mb-2">
                Credits
              </div>
              <div className="flex items-end justify-between gap-6 flex-wrap">
                <div className="min-w-0">
                  <div className="text-[40px] leading-none font-medium tracking-tight tabular-nums">
                    {creditsLoading ? (
                      <span className="text-muted-foreground/30">0</span>
                    ) : isUnlimitedActivePlan ? (
                      <span className="inline-flex items-center gap-2">
                        <InfinityIcon className="h-8 w-8" strokeWidth={2.2} />
                        Unlimited
                      </span>
                    ) : (
                      (credits?.balance ?? 0).toLocaleString()
                    )}
                  </div>
                  <p className="text-[12.5px] text-muted-foreground/55 mt-2 max-w-sm">
                    Credits power chat, agents, and automation across the consumer platform.
                  </p>
                </div>
                <div className="flex items-center gap-5">
                  {isUnlimitedActivePlan ? (
                    <div>
                      <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground/45">Saved vs PAYG</div>
                      <div className="text-[15px] font-medium tabular-nums mt-0.5 text-emerald-600 dark:text-emerald-400">${monthlySavingsUSD.toLocaleString()}</div>
                    </div>
                  ) : (
                    <div>
                      <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground/45">Earned</div>
                      <div className="text-[15px] font-medium tabular-nums mt-0.5">+{stats.totalEarned.toLocaleString()}</div>
                    </div>
                  )}
                  <div className="h-8 w-px bg-border/50" />
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground/45">Used</div>
                    <div className="text-[15px] font-medium tabular-nums mt-0.5">{stats.totalSpent.toLocaleString()}</div>
                  </div>
                </div>
              </div>
              {!isUnlimitedActivePlan && !creditsLoading && (credits?.balance ?? 0) < 50 && (
                <div className="mt-4 inline-flex items-center gap-1.5 text-[12px] font-medium text-amber-600 dark:text-amber-400">
                  <Wallet className="h-3.5 w-3.5" />
                  {(credits?.balance ?? 0) <= 0
                    ? "Out of credits — top up or upgrade to keep running."
                    : "Low balance."}
                </div>
              )}
            </div>
          </div>

          {/* ── Plan ── */}
          <div className="rounded-2xl border border-border/50 bg-card p-5">
            <div className="flex items-center justify-between mb-3.5">
              <div className="text-[13px] font-semibold">Plan</div>
              {activePlan && renewalDateStr && (
                <div className="text-[11px] text-muted-foreground/50">
                  {subscription?.cancel_at_period_end ? `Ends ${renewalDateStr}` : `Renews ${renewalDateStr}`}
                </div>
              )}
            </div>

            {activePlan ? (
              <>
                <div className="flex items-center justify-between gap-3 rounded-xl border border-border/50 bg-background/40 px-4 py-3">
                  <div className="min-w-0">
                    <div className="text-[13.5px] font-semibold">{activePlan.name}</div>
                    <div className="text-[11.5px] text-muted-foreground/55">
                      ${activePlan.price}/mo
                      {isUnlimitedActivePlan
                        ? " · Unlimited credits"
                        : ` · ${activePlan.monthlyCredits.toLocaleString()} credits/mo`}
                    </div>
                  </div>
                  <Button variant="outline" size="sm" className="h-8 text-[12px] shrink-0" onClick={handleManageSubscription}>
                    Manage
                  </Button>
                </div>

                {!isUnlimitedActivePlan && (
                  <div className="mt-4">
                    <div className="text-[10.5px] font-medium uppercase tracking-[0.12em] text-muted-foreground/45 mb-2">
                      Buy more credits
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {additionalCreditPackages.map((pkg) => (
                        <button
                          key={pkg.id}
                          type="button"
                          disabled={purchasingPackage === pkg.id}
                          onClick={() => handlePurchaseCredits(pkg.id, pkg.credits, pkg.price)}
                          className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg border border-border/60 text-[12.5px] font-medium hover:text-foreground hover:border-foreground/25 hover:bg-foreground/[0.03] transition-colors disabled:opacity-50"
                        >
                          {purchasingPackage === pkg.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <>
                              <span className="tabular-nums">{pkg.credits.toLocaleString()}</span>
                              <span className="text-muted-foreground/55">cr</span>
                              <span className="text-muted-foreground/40 tabular-nums">· ${pkg.price}</span>
                            </>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2 mb-3">
                  {purchasablePlans.map((pp, i) => {
                    const active = selectedPlan === i
                    return (
                      <button
                        key={pp.id}
                        type="button"
                        onClick={() => setSelectedPlan(i)}
                        className={cn(
                          "inline-flex items-center gap-1.5 h-9 px-4 rounded-lg border text-[13px] font-medium transition-colors",
                          active
                            ? "border-foreground/30 bg-foreground/[0.06] text-foreground"
                            : "border-border/60 text-muted-foreground/70 hover:text-foreground hover:border-foreground/25",
                        )}
                      >
                        {pp.name}
                        <span className="text-muted-foreground/45 tabular-nums">${pp.price}</span>
                      </button>
                    )
                  })}
                </div>
                {plan && (
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <p className="text-[11.5px] text-muted-foreground/55">
                      {plan.tier === "unlimited"
                        ? "Unlimited credits, no caps."
                        : `${plan.monthlyCredits.toLocaleString()} credits every month.`}
                    </p>
                    <Button
                      size="sm"
                      className="h-9 gap-1.5 text-[12.5px]"
                      disabled={subscribingPlan === plan.id}
                      onClick={() => handleSubscribe(plan.id, plan.tier, plan.price)}
                    >
                      {subscribingPlan === plan.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <ArrowRight className="h-3.5 w-3.5" />
                      )}
                      Subscribe · ${plan.price}/mo
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>

          {/* ── Activity ── */}
          <div className="rounded-2xl border border-border/50 bg-card overflow-hidden">
            <div className="px-5 py-3 border-b border-border/40 flex items-center justify-between">
              <div className="text-[13px] font-semibold">Activity</div>
              {!loadingTransactions && transactions.length > 0 && (
                <div className="text-[11px] text-muted-foreground/45 tabular-nums">{transactions.length} entries</div>
              )}
            </div>
            {loadingTransactions ? (
              <div className="px-5 py-10 text-center text-[12px] text-muted-foreground/40">Loading…</div>
            ) : transactions.length === 0 ? (
              <div className="px-5 py-12 text-center">
                <Coins className="h-6 w-6 mx-auto text-muted-foreground/20 mb-2.5" />
                <p className="text-[12.5px] text-muted-foreground/50">No activity yet.</p>
              </div>
            ) : (
              <>
                <div className="divide-y divide-border/30">
                  {(showAllTransactions ? transactions : transactions.slice(0, 8)).map((tx) => (
                    <CreditTxnRow key={tx.id} tx={tx} />
                  ))}
                </div>
                {transactions.length > 8 && (
                  <div className="border-t border-border/30 px-5 py-2.5 text-center">
                    <button
                      type="button"
                      onClick={() => setShowAllTransactions(!showAllTransactions)}
                      className="text-[11.5px] font-medium text-muted-foreground/60 hover:text-foreground transition-colors"
                    >
                      {showAllTransactions ? "Show less" : `Show all ${transactions.length}`}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </motion.div>
      )}
    </div>
  )
}
