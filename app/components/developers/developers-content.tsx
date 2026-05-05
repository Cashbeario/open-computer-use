"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  Plus, Copy, Check, Trash2, Key, Code2, MoreHorizontal, BarChart3,
  Shield, Terminal, BookOpen, Braces, Send, MousePointerClick, Zap,
  Search, Download, RefreshCw, ChevronDown, ChevronRight, X, FileJson, FileText, ArrowUpDown,
} from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { PageLoader } from "@/components/common/page-loader"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { fetchClient } from "@/lib/fetch"
import { APITab } from "@/app/guide/tabs/api"

/* ─── Constants ─── */

const EASE = [0.22, 1, 0.36, 1] as const

/* ─── Types ─── */

interface APIKey {
  id: string
  name: string
  tier: string
  scopes: string[]
  created_at: string
  last_used_at: string | null
  key_prefix: string
}

interface Stats {
  keyCount: number
  totalRequests: number
  totalCredits: number
  requests24h: number
  requests7d: number
  credits7d: number
  avgCreditsPerRequest: number
  peakHour: number | null
  balance: number
  tier: string
}

interface DailyPoint {
  date: string
  requests: number
  credits: number
}

interface RecentRequest {
  endpoint: string
  credits: number
  time: string
  request_id?: string | null
}

/* ─── Helpers ─── */

function timeAgo(date: string | null) {
  if (!date) return "Never"
  const diff = Date.now() - new Date(date).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return "Just now"
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  return new Date(date).toLocaleDateString()
}

/* ─── Cinematic Create-Key Intro — 3-scene loop ─── */

function ForgeScene() {
  const target = "sk-coasty-live-9fA2b7dC"
  const pool = "abcdefghijklmnopqrstuvwxyz0123456789"
  const [text, setText] = useState(target.replace(/[^_]/g, "•"))
  useEffect(() => {
    let frame = 0
    const id = setInterval(() => {
      frame++
      const steps = 16
      if (frame > steps) return
      const progress = frame / steps
      const revealed = Math.floor(progress * target.length)
      let next = target.slice(0, revealed)
      for (let i = revealed; i < target.length; i++) {
        const c = target[i]
        next += c === "_" ? "_" : pool[Math.floor(Math.random() * pool.length)]
      }
      setText(next)
    }, 55)
    return () => clearInterval(id)
  }, [])

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.32, ease: EASE }}
      className="flex items-center gap-3"
    >
      <div className="relative h-10 w-10 flex items-center justify-center rounded-xl border border-border/50 bg-foreground/[0.04]">
        <Key className="h-4 w-4 text-foreground/65" strokeWidth={1.8} />
        <motion.span
          className="absolute inset-0 rounded-xl border border-foreground/20"
          animate={{ opacity: [0, 0.8, 0], scale: [1, 1.22, 1.4] }}
          transition={{ duration: 1.35, repeat: Infinity, ease: "easeOut" }}
        />
      </div>
      <div>
        <div className="text-[9px] font-mono text-muted-foreground/50 uppercase tracking-[0.18em] mb-1">
          generating
        </div>
        <div className="font-mono text-[13px] font-semibold text-foreground/85 tabular-nums leading-none flex items-center">
          <span>{text}</span>
          <motion.span
            animate={{ opacity: [1, 0, 1] }}
            transition={{ duration: 0.65, repeat: Infinity }}
            className="inline-block ml-0.5 w-[5px] h-[11px] bg-foreground/60"
          />
        </div>
      </div>
    </motion.div>
  )
}

function TransmitScene() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.32, ease: EASE }}
      className="flex items-center gap-3 w-full max-w-[320px] px-4"
    >
      <div className="flex flex-col items-center gap-1.5 shrink-0">
        <div className="h-9 w-9 flex items-center justify-center rounded-lg border border-border/50 bg-foreground/[0.04]">
          <Terminal className="h-4 w-4 text-foreground/65" strokeWidth={1.8} />
        </div>
        <span className="text-[8.5px] font-mono text-muted-foreground/45 uppercase tracking-wider">
          client
        </span>
      </div>

      <div className="relative flex-1 h-9 flex items-center">
        <div className="w-full h-px bg-border/50" />
        {[0.05, 0.4].map((d, k) => (
          <motion.span
            key={k}
            initial={{ x: "-8%", opacity: 0 }}
            animate={{ x: ["-8%", "108%"], opacity: [0, 1, 1, 0] }}
            transition={{ duration: 1.1, delay: d, times: [0, 0.15, 0.85, 1], ease: "easeInOut" }}
            className="absolute h-[3px] w-6 rounded-full bg-foreground/70 shadow-[0_0_12px_rgba(255,255,255,0.4)]"
          />
        ))}
        <div className="absolute inset-x-0 -bottom-1 text-center text-[9px] font-mono text-muted-foreground/50">
          POST /v1/cua/predict
        </div>
      </div>

      <div className="flex flex-col items-center gap-1.5 shrink-0">
        <motion.div
          initial={{ scale: 1 }}
          animate={{ scale: [1, 1.18, 1] }}
          transition={{ duration: 0.45, delay: 0.95, ease: EASE }}
          className="relative h-9 w-9 flex items-center justify-center rounded-lg border border-emerald-500/40 bg-emerald-500/[0.08]"
        >
          <motion.span
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3, delay: 1.0, ease: EASE }}
          >
            <Check className="h-4 w-4 text-emerald-500" strokeWidth={2.2} />
          </motion.span>
          <motion.span
            className="absolute inset-0 rounded-lg border border-emerald-500/40"
            initial={{ opacity: 0, scale: 1 }}
            animate={{ opacity: [0, 0.7, 0], scale: [1, 1.6, 2] }}
            transition={{ duration: 0.9, delay: 1.0, ease: "easeOut" }}
          />
        </motion.div>
        <span className="text-[8.5px] font-mono font-semibold text-emerald-600 dark:text-emerald-400">
          200 OK
        </span>
      </div>
    </motion.div>
  )
}

function SecureScene() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.32, ease: EASE }}
      className="flex items-center gap-4"
    >
      <div className="relative h-12 w-12 flex items-center justify-center">
        {[0, 0.3, 0.6].map((d, k) => (
          <motion.span
            key={k}
            className="absolute inset-0 rounded-full border border-emerald-500/30"
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: [0.7, 1.7], opacity: [0.7, 0] }}
            transition={{ duration: 1.3, delay: d, repeat: Infinity, ease: "easeOut" }}
          />
        ))}
        <div className="relative h-9 w-9 flex items-center justify-center rounded-full bg-gradient-to-b from-emerald-500/20 to-emerald-500/5 border border-emerald-500/50">
          <Shield className="h-4 w-4 text-emerald-500" strokeWidth={1.9} />
        </div>
      </div>
      <div>
        <div className="text-[9px] font-mono text-muted-foreground/50 uppercase tracking-[0.18em] mb-1">
          secured
        </div>
        <div className="text-[13px] font-semibold text-foreground/85 leading-tight">
          Keyed, signed, delivered
        </div>
      </div>
    </motion.div>
  )
}

function CreateKeyIntro() {
  const scenes = ["FORGE", "TRANSMIT", "SECURE"] as const
  const [idx, setIdx] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setIdx((p) => (p + 1) % scenes.length), 1700)
    return () => clearInterval(id)
  }, [])

  const [tc, setTc] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTc((t) => (t + 1) % 1000), 33)
    return () => clearInterval(id)
  }, [])
  const frames = String(tc % 24).padStart(2, "0")
  const secs = String(Math.floor(tc / 24) % 60).padStart(2, "0")

  return (
    <div className="relative mb-3 overflow-hidden rounded-xl border border-border/40 bg-gradient-to-b from-muted/25 via-background/40 to-background/80 h-[128px]">
      {/* letterbox hairlines */}
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-foreground/20 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-foreground/10 to-transparent" />

      {/* ambient light sweep */}
      <motion.div
        aria-hidden
        className="absolute inset-y-0 w-[180px] bg-gradient-to-r from-transparent via-foreground/[0.05] to-transparent pointer-events-none"
        animate={{ x: ["-180px", "calc(100% + 180px)"] }}
        transition={{ duration: 3.6, repeat: Infinity, ease: "linear" }}
      />

      {/* grid watermark */}
      <div
        aria-hidden
        className="absolute inset-0 opacity-[0.035] pointer-events-none"
        style={{
          backgroundImage:
            "linear-gradient(currentColor 1px, transparent 1px), linear-gradient(90deg, currentColor 1px, transparent 1px)",
          backgroundSize: "22px 22px",
          maskImage: "radial-gradient(ellipse at center, black 40%, transparent 85%)",
        }}
      />

      {/* Top-left scene slate */}
      <div className="absolute top-2 left-3 flex items-center gap-1.5 text-[9px] font-mono text-muted-foreground/55 uppercase tracking-[0.18em] pointer-events-none">
        <span className="tabular-nums">{idx + 1}/3</span>
        <span className="text-muted-foreground/30">·</span>
        <AnimatePresence mode="wait">
          <motion.span
            key={scenes[idx]}
            initial={{ opacity: 0, y: 3 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -3 }}
            transition={{ duration: 0.2 }}
          >
            {scenes[idx]}
          </motion.span>
        </AnimatePresence>
      </div>

      {/* Top-right REC + timecode */}
      <div className="absolute top-2 right-3 flex items-center gap-2 text-[9px] font-mono text-muted-foreground/55 uppercase tracking-[0.18em] pointer-events-none">
        <span className="flex items-center gap-1">
          <motion.span
            animate={{ opacity: [1, 0.25, 1] }}
            transition={{ duration: 1.4, repeat: Infinity }}
            className="h-1.5 w-1.5 rounded-full bg-red-500"
          />
          REC
        </span>
        <span className="text-muted-foreground/30">·</span>
        <span className="tabular-nums text-muted-foreground/45">00:{secs}:{frames}</span>
      </div>

      {/* Bottom progress ticks */}
      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-1 pointer-events-none">
        {scenes.map((_, k) => (
          <span
            key={k}
            className={cn(
              "h-[3px] rounded-full transition-all duration-300",
              k === idx ? "w-6 bg-foreground/60" : "w-1.5 bg-foreground/20"
            )}
          />
        ))}
      </div>

      {/* Scene body */}
      <div className="absolute inset-0 flex items-center justify-center pt-2 pb-4">
        <AnimatePresence mode="wait">
          {idx === 0 && <ForgeScene key="forge" />}
          {idx === 1 && <TransmitScene key="transmit" />}
          {idx === 2 && <SecureScene key="secure" />}
        </AnimatePresence>
      </div>
    </div>
  )
}

/* ─── Activity Chart — always looks good, any data level ─── */

function ActivityChart({ daily }: { daily: DailyPoint[] }) {
  const [hovered, setHovered] = useState<number | null>(null)
  const hasData = daily.some(d => d.requests > 0)
  const totalReqs = daily.reduce((s, d) => s + d.requests, 0)
  const totalCreds = daily.reduce((s, d) => s + d.credits, 0)

  // SVG dimensions with padding so dots/curves never clip
  const W = 400
  const H = 80
  const TOP = 8   // room for dots + bezier overshoot at top
  const BOT = 4   // small bottom margin above the baseline

  const chartH = H - TOP - BOT
  const maxVal = Math.max(...daily.map(d => d.requests), 1)

  // Scale each day into SVG coordinates
  const scaled = daily.map((d, i) => {
    const x = daily.length > 1 ? (i / (daily.length - 1)) * W : W / 2
    // Active points get at least 18% of chart height so even 1 request is visible
    const norm = d.requests > 0
      ? Math.max(d.requests / maxVal, 0.18)
      : 0.02
    const sy = H - BOT - norm * chartH
    return { x, sy, data: d }
  })

  // Smooth cubic bezier — clamp control points inside the viewBox
  function smoothPath(pts: typeof scaled): string {
    if (pts.length < 2) return pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.sy}`).join(" ")
    const clampY = (v: number) => Math.max(TOP - 2, Math.min(H - BOT + 2, v))
    let d = `M ${pts[0].x} ${pts[0].sy}`
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(i - 1, 0)]
      const p1 = pts[i]
      const p2 = pts[i + 1]
      const p3 = pts[Math.min(i + 2, pts.length - 1)]
      const t = 0.25
      const cp1y = clampY(p1.sy + (p2.sy - p0.sy) * t)
      const cp2y = clampY(p2.sy - (p3.sy - p1.sy) * t)
      d += ` C ${p1.x + (p2.x - p0.x) * t} ${cp1y}, ${p2.x - (p3.x - p1.x) * t} ${cp2y}, ${p2.x} ${p2.sy}`
    }
    return d
  }

  const linePath = smoothPath(scaled)
  const areaPath = `${linePath} L ${W} ${H} L 0 ${H} Z`

  return (
    <div className="relative rounded-xl border border-border/30 bg-card/50 backdrop-blur-sm overflow-hidden">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-foreground/[0.08] to-transparent" />
      <div className="px-5 pt-4 pb-3">
        {/* Header */}
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-baseline gap-3">
            <span className="text-[11px] font-medium text-muted-foreground/50 uppercase tracking-wider">Activity</span>
            {hasData && (
              <span className="text-[10px] text-muted-foreground/30 tabular-nums">
                {totalReqs} request{totalReqs !== 1 ? "s" : ""} &middot; {totalCreds} credits
              </span>
            )}
          </div>
          <span className="text-[10px] text-muted-foreground/35">14 days</span>
        </div>

        {/* SVG chart */}
        <div className="relative h-24 mt-2">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="none"
            className="w-full h-full text-foreground"
          >
            <defs>
              <linearGradient id="act-area-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="currentColor" stopOpacity={hasData ? 0.1 : 0.04} />
                <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
              </linearGradient>
              <linearGradient id="act-line-grad" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="currentColor" stopOpacity="0.06" />
                <stop offset="20%" stopColor="currentColor" stopOpacity={hasData ? 0.25 : 0.08} />
                <stop offset="80%" stopColor="currentColor" stopOpacity={hasData ? 0.25 : 0.08} />
                <stop offset="100%" stopColor="currentColor" stopOpacity="0.06" />
              </linearGradient>
            </defs>

            {/* Area fill */}
            <path d={areaPath} fill="url(#act-area-fill)" />

            {/* Smooth line */}
            <path d={linePath} fill="none" stroke="url(#act-line-grad)" strokeWidth="1.5" />

            {/* Data markers on active days */}
            {hasData && scaled.map((p, i) => (
              p.data.requests > 0 && (
                <circle
                  key={i}
                  cx={p.x}
                  cy={p.sy}
                  r={hovered === i ? 3 : 1.5}
                  fill={hovered === i ? "currentColor" : "none"}
                  fillOpacity={hovered === i ? 0.35 : 0}
                  stroke="currentColor"
                  strokeWidth={hovered === i ? 1.5 : 1}
                  strokeOpacity={hovered === i ? 0.4 : 0.15}
                  className="transition-all duration-200"
                />
              )
            ))}
          </svg>

          {/* Hover zones */}
          <div className="absolute inset-0 flex">
            {daily.map((d, i) => (
              <div
                key={d.date}
                className="flex-1 relative"
                onMouseEnter={() => setHovered(i)}
                onMouseLeave={() => setHovered(null)}
              >
                {hovered === i && d.requests > 0 && (
                  <div className="absolute -top-1 left-1/2 -translate-x-1/2 px-2.5 py-1 rounded-lg bg-foreground text-background text-[9px] font-medium whitespace-nowrap z-10 pointer-events-none shadow-lg">
                    <span className="tabular-nums">{d.requests}</span> req &middot; <span className="tabular-nums">{d.credits}</span> cr
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Empty state message */}
          {!hasData && (
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-[11px] text-muted-foreground/25 font-medium">
                Your API activity will appear here
              </span>
            </div>
          )}
        </div>

        {/* Date labels */}
        <div className="flex justify-between mt-1.5">
          <span className="text-[9px] text-muted-foreground/25 tabular-nums">{daily[0]?.date.slice(5)}</span>
          <span className="text-[9px] text-muted-foreground/25 tabular-nums">Today</span>
        </div>
      </div>
    </div>
  )
}

/* ─── Stat Card — big underflowing icon ─── */

function StatCard({ label, value, subtext, icon: Icon, detail, sparkData }: {
  label: string
  value: string
  subtext?: string
  icon: typeof Key
  detail?: string
  sparkData?: number[]
}) {
  return (
    <div className="relative rounded-xl border border-border/40 bg-card/30 p-4 flex flex-col min-h-[120px] overflow-hidden">
      {/* Big icon — underflowing in bottom-right */}
      <Icon
        className="absolute -bottom-3 -right-3 h-20 w-20 text-foreground/[0.04] pointer-events-none"
        strokeWidth={1}
      />

      <span className="text-[11px] font-medium text-muted-foreground/50 uppercase tracking-wider mb-auto relative z-[1]">
        {label}
      </span>
      <div className="relative z-[1]">
        <div className="flex items-baseline gap-1.5">
          <span className="text-[22px] font-bold tracking-tight text-foreground leading-none">
            {value}
          </span>
          {subtext && (
            <span className="text-[11px] text-muted-foreground/50 leading-none">{subtext}</span>
          )}
        </div>
        <div className="h-4 mt-1.5 flex items-center gap-2">
          {detail && (
            <span className="text-[10px] leading-none text-muted-foreground/40">{detail}</span>
          )}
          {sparkData && sparkData.length > 0 && (
            <div className="flex items-end gap-[1px] h-2.5 ml-auto">
              {sparkData.map((v, i) => {
                const max = Math.max(...sparkData, 1)
                return (
                  <div
                    key={i}
                    className={cn(
                      "w-[3px] rounded-[1px]",
                      v > 0 ? "bg-foreground/20" : "bg-foreground/[0.04]"
                    )}
                    style={{ height: `${Math.max((v / max) * 100, v > 0 ? 15 : 5)}%` }}
                  />
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/* ─── Created Key Snippet (shown in the key-created dialog) ─── */

const SNIPPET_LANGS = [
  { id: "python", label: "Python" },
  { id: "javascript", label: "Node" },
  { id: "curl", label: "cURL" },
  { id: "go", label: "Go" },
  { id: "ruby", label: "Ruby" },
  { id: "php", label: "PHP" },
] as const

type SnippetLangId = (typeof SNIPPET_LANGS)[number]["id"]

/**
 * API keys are `sk-coasty-live-` (15 chars) + 48 hex chars = 63 chars total
 * (legacy `cua_sk_` keys are 55 chars). Either way that pushes a single-line
 * assignment past the dialog's ~66 char visible width. For the on-screen
 * version we abbreviate; the clipboard version gets the real key.
 */
function abbreviateKey(key: string): string {
  if (key.length <= 24) return key
  // Show enough leading chars to disambiguate live vs test vs legacy prefix.
  return `${key.slice(0, 18)}...${key.slice(-5)}`
}

function getSnippetCode(lang: SnippetLangId, key: string, forCopy: boolean): string {
  const k = forCopy ? key : abbreviateKey(key)

  switch (lang) {
    case "python":
      return `import requests, base64

KEY = "${k}"
img = base64.b64encode(
    open("screen.png", "rb").read()
).decode()

r = requests.post(
    "https://coasty.ai/v1/predict",
    headers={"X-API-Key": KEY},
    json={
        "screenshot": img,
        "instruction": "Click the login button",
    },
)
for a in r.json()["actions"]:
    print(a["action_type"], a["params"])`

    case "javascript":
      // Node 18+: global fetch, ESM module for top-level await.
      return `import fs from "node:fs"

const KEY = "${k}"
const img = fs
  .readFileSync("screen.png")
  .toString("base64")

const res = await fetch(
  "https://coasty.ai/v1/predict",
  {
    method: "POST",
    headers: {
      "X-API-Key": KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      screenshot: img,
      instruction: "Click the login button",
    }),
  },
)
const { actions } = await res.json()`

    case "curl":
      // Heredoc + `tr -d '\\n'` is portable across macOS/Linux
      // (GNU \`base64 -w0\` is Linux-only).
      return `KEY="${k}"

curl -X POST \\
  https://coasty.ai/v1/predict \\
  -H "X-API-Key: $KEY" \\
  -H "Content-Type: application/json" \\
  -d @- <<EOF
{
  "screenshot": "$(base64 < screen.png | tr -d '\\n')",
  "instruction": "Click the login button"
}
EOF`

    case "go":
      return `package main

import (
  "bytes"
  "encoding/base64"
  "encoding/json"
  "net/http"
  "os"
)

const KEY = "${k}"

func main() {
  f, _ := os.ReadFile("screen.png")
  img := base64.StdEncoding.EncodeToString(f)

  body, _ := json.Marshal(map[string]any{
    "screenshot":  img,
    "instruction": "Click the login button",
  })

  req, _ := http.NewRequest("POST",
    "https://coasty.ai/v1/predict",
    bytes.NewReader(body))
  req.Header.Set("X-API-Key", KEY)
  req.Header.Set(
    "Content-Type", "application/json")

  http.DefaultClient.Do(req)
}`

    case "ruby":
      return `require "base64"
require "json"
require "net/http"

KEY = "${k}"
img = Base64.strict_encode64(
  File.read("screen.png")
)

uri = URI(
  "https://coasty.ai/v1/predict"
)
req = Net::HTTP::Post.new(uri)
req["X-API-Key"] = KEY
req["Content-Type"] = "application/json"
req.body = {
  screenshot: img,
  instruction: "Click the login button"
}.to_json

res = Net::HTTP.start(
  uri.hostname, uri.port, use_ssl: true
) { |h| h.request(req) }`

    case "php":
      return `<?php
$KEY = "${k}";
$img = base64_encode(
  file_get_contents("screen.png")
);

$ch = curl_init(
  "https://coasty.ai/v1/predict"
);
curl_setopt_array($ch, [
  CURLOPT_RETURNTRANSFER => true,
  CURLOPT_POST => true,
  CURLOPT_HTTPHEADER => [
    "X-API-Key: $KEY",
    "Content-Type: application/json",
  ],
  CURLOPT_POSTFIELDS => json_encode([
    "screenshot" => $img,
    "instruction" => "Click the login button",
  ]),
]);

$res = curl_exec($ch);`
  }
}

function CreatedKeySnippet({ apiKey, onCopy }: { apiKey: string; onCopy: (text: string) => Promise<void> }) {
  const [snippetLang, setSnippetLang] = useState<SnippetLangId>("python")
  const [copiedSnippet, setCopiedSnippet] = useState(false)
  const displayCode = getSnippetCode(snippetLang, apiKey, false)
  const copyCode = getSnippetCode(snippetLang, apiKey, true)

  const handleCopySnippet = () => {
    onCopy(copyCode)
      .then(() => {
        setCopiedSnippet(true)
        toast.success("Snippet copied")
        setTimeout(() => setCopiedSnippet(false), 1800)
      })
      .catch(() => toast.error("Copy failed"))
  }

  return (
    <div className="border-t border-border/20 bg-foreground/[0.015]">
      <div className="px-4 sm:px-6 pt-3 sm:pt-4 pb-3">
        <div className="flex items-center justify-between mb-2.5">
          <p className="text-[10px] sm:text-[11px] font-semibold text-foreground/50 uppercase tracking-wider">Quick start</p>
          <button
            onClick={handleCopySnippet}
            aria-label={copiedSnippet ? "Snippet copied" : "Copy snippet"}
            className={cn(
              "group relative inline-flex items-center gap-1 h-6 px-1.5 -mr-1 rounded-md text-[10px] font-medium transition-colors",
              copiedSnippet
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-muted-foreground/45 hover:text-foreground/70"
            )}
          >
            <AnimatePresence mode="wait" initial={false}>
              {copiedSnippet ? (
                <motion.span
                  key="copied"
                  initial={{ opacity: 0, y: 4, scale: 0.92 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -4, scale: 0.92 }}
                  transition={{ duration: 0.18, ease: EASE }}
                  className="flex items-center gap-1"
                >
                  <motion.span
                    initial={{ scale: 0.4, rotate: -30 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ type: "spring", stiffness: 500, damping: 20 }}
                    className="flex"
                  >
                    <Check className="h-3 w-3" strokeWidth={2.6} />
                  </motion.span>
                  Copied
                </motion.span>
              ) : (
                <motion.span
                  key="copy"
                  initial={{ opacity: 0, y: -4, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 4, scale: 0.96 }}
                  transition={{ duration: 0.18, ease: EASE }}
                  className="flex items-center gap-1"
                >
                  <Copy className="h-3 w-3 opacity-70 group-hover:opacity-100 transition-opacity" />
                  Copy
                </motion.span>
              )}
            </AnimatePresence>
            {copiedSnippet && (
              <motion.span
                aria-hidden
                initial={{ opacity: 0.35, scale: 0.8 }}
                animate={{ opacity: 0, scale: 1.6 }}
                transition={{ duration: 0.55, ease: EASE }}
                className="absolute inset-0 rounded-md border border-emerald-500/50 pointer-events-none"
              />
            )}
          </button>
        </div>

        {/* Language tabs */}
        <div className="flex items-center gap-0.5 sm:gap-1 mb-2.5 overflow-x-auto scrollbar-invisible">
          {SNIPPET_LANGS.map(l => (
            <button
              key={l.id}
              onClick={() => setSnippetLang(l.id)}
              className={cn(
                "px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg text-[10px] sm:text-[11px] font-medium transition-all duration-150 shrink-0",
                snippetLang === l.id
                  ? "bg-background shadow-sm text-foreground border border-border/30"
                  : "text-muted-foreground/40 hover:text-muted-foreground/70 hover:bg-foreground/[0.03]"
              )}
            >
              {l.label}
            </button>
          ))}
        </div>

        {/* Code */}
        <div className="rounded-lg border border-foreground/[0.06] bg-foreground/[0.02] overflow-hidden">
          <pre className="px-3 sm:px-3.5 py-2.5 sm:py-3 text-[10px] sm:text-[11px] leading-relaxed font-mono text-foreground/60 overflow-x-auto scrollbar-invisible">
            <code>{displayCode}</code>
          </pre>
        </div>
      </div>
    </div>
  )
}

/* ─── Aurora Thumbnail (same pattern as machine-card-thumbnail.tsx) ─── */

const PALETTES = [
  { a: "#6366f1", b: "#a78bfa", c: "#818cf8" },
  { a: "#3b82f6", b: "#8b5cf6", c: "#60a5fa" },
  { a: "#06b6d4", b: "#6366f1", c: "#22d3ee" },
  { a: "#8b5cf6", b: "#ec4899", c: "#c084fc" },
  { a: "#f43f5e", b: "#f97316", c: "#fb7185" },
  { a: "#10b981", b: "#06b6d4", c: "#34d399" },
  { a: "#f59e0b", b: "#ef4444", c: "#fbbf24" },
  { a: "#ec4899", b: "#8b5cf6", c: "#f9a8d4" },
  { a: "#14b8a6", b: "#3b82f6", c: "#2dd4bf" },
  { a: "#a855f7", b: "#f43f5e", c: "#d946ef" },
]

function useKeyVisuals(keyId: string) {
  return useMemo(() => {
    let hash = 0
    for (let i = 0; i < keyId.length; i++) {
      hash = keyId.charCodeAt(i) + ((hash << 5) - hash)
    }
    const r = (seed: number) => {
      const x = Math.sin(seed * 9301 + 49297) * 49297
      return x - Math.floor(x)
    }
    return {
      palette: PALETTES[Math.abs(hash) % PALETTES.length],
      blobPos: {
        x1: 15 + r(hash + 1) * 30,
        y1: 20 + r(hash + 2) * 30,
        x2: 55 + r(hash + 3) * 30,
        y2: 30 + r(hash + 4) * 40,
      },
      uid: keyId.slice(0, 8),
    }
  }, [keyId])
}

/* ─── API Key Card ─── */

function copyToClipboard(text: string): Promise<void> {
  // Try modern API first, fall back to execCommand for HTTP/localhost
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text).catch(() => execCopy(text))
  }
  return execCopy(text)
}

function execCopy(text: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const el = document.createElement("textarea")
    el.value = text
    el.style.position = "fixed"
    el.style.left = "-9999px"
    document.body.appendChild(el)
    el.select()
    try {
      const ok = document.execCommand("copy")
      if (ok) resolve(); else reject()
    } catch { reject() }
    finally { document.body.removeChild(el) }
  })
}

function APIKeyCard({ apiKey, index, fullKey, onRevoke }: { apiKey: APIKey; index: number; fullKey?: string; onRevoke: (id: string) => void }) {
  const [copied, setCopied] = useState(false)
  const { palette, blobPos, uid } = useKeyVisuals(apiKey.id)
  const hasFullKey = !!fullKey

  const copyKey = useCallback(() => {
    const text = hasFullKey ? fullKey! : apiKey.key_prefix
    copyToClipboard(text).then(() => {
      setCopied(true)
      toast.success(hasFullKey ? "API key copied" : "Key prefix copied — full key is only shown at creation")
      setTimeout(() => setCopied(false), 2000)
    }).catch(() => {
      toast.error("Copy failed — try selecting the text manually")
    })
  }, [fullKey, apiKey.key_prefix, hasFullKey])

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.4, delay: 0.05 + index * 0.04, ease: EASE }}
      className={cn(
        "group relative h-full flex flex-col rounded-2xl overflow-hidden",
        "bg-card border border-border/40",
        "transition-all duration-300 ease-out",
        "hover:border-border/80 hover:shadow-lg hover:shadow-black/[0.04] dark:hover:shadow-black/[0.12]",
      )}
    >
      {/* ── Aurora header (machine-card-thumbnail pattern) ── */}
      <div className="relative h-24 w-full overflow-hidden shrink-0">
        <style dangerouslySetInnerHTML={{ __html: `
          @keyframes ak-drift-${uid} {
            0%, 100% { transform: translate(0, 0) scale(1); }
            33% { transform: translate(8px, -6px) scale(1.05); }
            66% { transform: translate(-6px, 8px) scale(0.97); }
          }
          @keyframes ak-drift2-${uid} {
            0%, 100% { transform: translate(0, 0) scale(1); }
            50% { transform: translate(-10px, 6px) scale(1.04); }
          }
          @keyframes ak-shimmer-${uid} {
            0% { transform: translateX(-100%); }
            100% { transform: translateX(200%); }
          }
        ` }} />

        {/* Base gradient */}
        <div
          className="absolute inset-0"
          style={{ background: `linear-gradient(135deg, ${palette.a}15 0%, transparent 50%, ${palette.b}10 100%)` }}
        />

        {/* Blob 1 */}
        <div
          className="absolute will-change-transform rounded-full"
          style={{
            width: "70%", height: "140%",
            left: `${blobPos.x1}%`, top: `${blobPos.y1 - 40}%`,
            background: `radial-gradient(ellipse at center, ${palette.a}30, transparent 70%)`,
            filter: "blur(24px)",
            animation: `ak-drift-${uid} 10s ease-in-out infinite`,
          }}
        />

        {/* Blob 2 */}
        <div
          className="absolute will-change-transform rounded-full"
          style={{
            width: "60%", height: "120%",
            left: `${blobPos.x2}%`, top: `${blobPos.y2 - 30}%`,
            background: `radial-gradient(ellipse at center, ${palette.b}25, transparent 70%)`,
            filter: "blur(20px)",
            animation: `ak-drift2-${uid} 8s ease-in-out infinite`,
          }}
        />

        {/* Shimmer sweep */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: `linear-gradient(105deg, transparent 40%, ${palette.c}08 50%, transparent 60%)`,
            animation: `ak-shimmer-${uid} 6s ease-in-out infinite`,
          }}
        />

        {/* Bottom fade into card body */}
        <div className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-card to-transparent" />
      </div>

      {/* ── Card body ── */}
      <div className="flex flex-col flex-1 px-5 pb-4 pt-0.5 relative">
        {/* Name row */}
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="h-2 w-2 rounded-full shrink-0 bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.4)]" />
            <h3 className="text-[15px] font-semibold truncate text-foreground tracking-[-0.01em]">
              {apiKey.name}
            </h3>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 rounded-lg text-muted-foreground/30 hover:text-foreground sm:opacity-0 sm:group-hover:opacity-100 transition-all shrink-0"
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem onClick={copyKey} className="gap-2">
                <Copy className="h-3.5 w-3.5" />
                {hasFullKey ? "Copy key" : "Copy prefix"}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onRevoke(apiKey.id)} className="gap-2 text-destructive focus:text-destructive">
                <Trash2 className="h-3.5 w-3.5" />
                Revoke
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Key (copyable — full key if just created, prefix otherwise) */}
        <button
          onClick={copyKey}
          className={cn(
            "flex items-center gap-2.5 text-left w-full rounded-xl border px-3 py-2 mb-3 group/key transition-colors",
            hasFullKey
              ? "border-emerald-500/20 bg-emerald-500/[0.03] hover:border-emerald-500/30"
              : "border-border/30 hover:border-border/50"
          )}
        >
          <Key className={cn("h-3.5 w-3.5 shrink-0", hasFullKey ? "text-emerald-500/40" : "text-muted-foreground/25")} />
          <span className="text-[11px] font-mono text-muted-foreground/50 truncate flex-1">
            {apiKey.key_prefix}{"••••••••••••"}
          </span>
          {copied && (
            <Check className="h-3 w-3 text-emerald-500 shrink-0" />
          )}
        </button>

        {/* Status meta line */}
        <div className="flex items-center gap-1.5 text-[11px] mb-3">
          <span className="font-medium text-emerald-600 dark:text-emerald-400">Active</span>
          <span className="text-muted-foreground/20">&middot;</span>
          <span className="text-muted-foreground/40">{apiKey.scopes.length} scopes</span>
          {apiKey.last_used_at && (
            <>
              <span className="text-muted-foreground/20">&middot;</span>
              <span className="tabular-nums text-muted-foreground/40">{timeAgo(apiKey.last_used_at)}</span>
            </>
          )}
        </div>

        {/* Scopes */}
        <div className="flex flex-wrap gap-1.5 mt-auto">
          {apiKey.scopes.map(scope => (
            <span key={scope} className="inline-flex items-center rounded-md border border-border/30 bg-background/60 px-2 py-0.5 text-[10px] font-medium text-muted-foreground/50">
              {scope}
            </span>
          ))}
        </div>
      </div>

      {/* ── Footer ── */}
      <div className="border-t border-border/30 px-5 py-3 flex items-center gap-1.5">
        <Shield className="h-3.5 w-3.5 text-muted-foreground/30 shrink-0" />
        <span className="text-[11px] text-muted-foreground/40">Created {timeAgo(apiKey.created_at)}</span>
      </div>
    </motion.div>
  )
}

/* ─── Code Block ─── */

/* ─── Traces Panel — filters, export, expandable rows ─── */

type TimeRange = "1h" | "24h" | "7d" | "14d" | "30d" | "all"
type SortKey = "newest" | "oldest" | "credits-desc" | "credits-asc"

const TIME_RANGES: { id: TimeRange; label: string; ms: number | null }[] = [
  { id: "1h",  label: "1h",  ms: 60 * 60 * 1000 },
  { id: "24h", label: "24h", ms: 24 * 60 * 60 * 1000 },
  { id: "7d",  label: "7d",  ms: 7 * 24 * 60 * 60 * 1000 },
  { id: "14d", label: "14d", ms: 14 * 24 * 60 * 60 * 1000 },
  { id: "30d", label: "30d", ms: 30 * 24 * 60 * 60 * 1000 },
  { id: "all", label: "All", ms: null },
]

const SORT_LABELS: Record<SortKey, string> = {
  "newest":       "Newest first",
  "oldest":       "Oldest first",
  "credits-desc": "Credits (high → low)",
  "credits-asc":  "Credits (low → high)",
}

function endpointBadgeClass(ep: string) {
  if (ep.startsWith("session")) return "bg-blue-500/10 text-blue-600 dark:text-blue-400"
  if (ep === "ground") return "bg-amber-500/10 text-amber-600 dark:text-amber-400"
  if (ep === "ocr") return "bg-purple-500/10 text-purple-600 dark:text-purple-400"
  if (ep === "parse") return "bg-slate-500/10 text-slate-600 dark:text-slate-400"
  return "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
}

function endpointShort(ep: string) {
  if (ep === "predict") return "PRED"
  if (ep === "session_predict") return "S/PRED"
  if (ep === "session_create") return "S/NEW"
  if (ep === "session_reset") return "S/RST"
  if (ep === "session_delete") return "S/DEL"
  return ep.slice(0, 5).toUpperCase()
}

function downloadFile(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

function rowsToCSV(rows: RecentRequest[]): string {
  const header = ["request_id", "endpoint", "credits", "time"]
  const escape = (v: unknown) => {
    const s = v == null ? "" : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const lines = [header.join(",")]
  for (const r of rows) {
    lines.push([escape(r.request_id ?? ""), escape(r.endpoint), escape(r.credits), escape(r.time)].join(","))
  }
  return lines.join("\n")
}

function TracesPanel({ recent, onRefresh }: { recent: RecentRequest[]; onRefresh: () => Promise<void> | void }) {
  const [search, setSearch] = useState("")
  const [selectedEndpoints, setSelectedEndpoints] = useState<Set<string>>(new Set())
  const [timeRange, setTimeRange] = useState<TimeRange>("24h")
  const [sortKey, setSortKey] = useState<SortKey>("newest")
  const [autoRefresh, setAutoRefresh] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [visibleCount, setVisibleCount] = useState(25)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  // Reset visible count when filters change
  useEffect(() => { setVisibleCount(25) }, [search, selectedEndpoints, timeRange, sortKey])

  // Auto-refresh every 30s
  useEffect(() => {
    if (!autoRefresh) return
    const id = setInterval(() => {
      Promise.resolve(onRefresh()).catch(() => {})
    }, 30000)
    return () => clearInterval(id)
  }, [autoRefresh, onRefresh])

  const allEndpoints = useMemo(() => {
    const set = new Set<string>()
    for (const r of recent) set.add(r.endpoint)
    return Array.from(set).sort()
  }, [recent])

  const filtered = useMemo(() => {
    const now = Date.now()
    const range = TIME_RANGES.find(r => r.id === timeRange)
    const cutoff = range?.ms ? now - range.ms : null
    const q = search.trim().toLowerCase()

    let rows = recent.filter(r => {
      if (cutoff !== null && new Date(r.time).getTime() < cutoff) return false
      if (selectedEndpoints.size > 0 && !selectedEndpoints.has(r.endpoint)) return false
      if (q) {
        const hay = `${r.endpoint} ${r.request_id ?? ""}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })

    rows = [...rows].sort((a, b) => {
      switch (sortKey) {
        case "oldest":       return new Date(a.time).getTime() - new Date(b.time).getTime()
        case "credits-desc": return b.credits - a.credits
        case "credits-asc":  return a.credits - b.credits
        case "newest":
        default:             return new Date(b.time).getTime() - new Date(a.time).getTime()
      }
    })
    return rows
  }, [recent, search, selectedEndpoints, timeRange, sortKey])

  const visible = filtered.slice(0, visibleCount)
  const hasFilters = search.length > 0 || selectedEndpoints.size > 0 || timeRange !== "24h"

  const clearFilters = () => {
    setSearch("")
    setSelectedEndpoints(new Set())
    setTimeRange("24h")
  }

  const toggleEndpoint = (ep: string) => {
    setSelectedEndpoints(prev => {
      const next = new Set(prev)
      if (next.has(ep)) next.delete(ep); else next.add(ep)
      return next
    })
  }

  const handleRefresh = async () => {
    setRefreshing(true)
    try { await onRefresh() } finally { setRefreshing(false) }
  }

  const exportCSV = () => {
    if (filtered.length === 0) return
    downloadFile(`traces-${new Date().toISOString().slice(0, 10)}.csv`, rowsToCSV(filtered), "text/csv;charset=utf-8")
    toast.success(`Exported ${filtered.length} row${filtered.length === 1 ? "" : "s"}`)
  }

  const exportJSON = () => {
    if (filtered.length === 0) return
    downloadFile(
      `traces-${new Date().toISOString().slice(0, 10)}.json`,
      JSON.stringify(filtered, null, 2),
      "application/json",
    )
    toast.success(`Exported ${filtered.length} row${filtered.length === 1 ? "" : "s"}`)
  }

  const copyJSON = () => {
    if (filtered.length === 0) return
    navigator.clipboard?.writeText(JSON.stringify(filtered, null, 2))
      .then(() => toast.success("Copied JSON"))
      .catch(() => toast.error("Copy failed"))
  }

  const copyValue = (v: string, k: string) => {
    navigator.clipboard?.writeText(v)
      .then(() => {
        setCopiedKey(k)
        setTimeout(() => setCopiedKey(prev => (prev === k ? null : prev)), 1400)
      })
      .catch(() => {})
  }

  return (
    <div className="relative rounded-xl border border-border/30 bg-card/50 backdrop-blur-sm overflow-hidden">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-foreground/[0.08] to-transparent" />

      {/* Header */}
      <div className="px-5 pt-3.5 pb-3 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-baseline gap-3">
          <span className="text-[11px] font-medium text-muted-foreground/50 uppercase tracking-wider">Traces</span>
          <span className="text-[10px] text-muted-foreground/35 tabular-nums">
            {filtered.length === recent.length
              ? `${recent.length}`
              : `${filtered.length} of ${recent.length}`}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setAutoRefresh(v => !v)}
            title={autoRefresh ? "Auto-refresh on (30s)" : "Auto-refresh off"}
            className={cn(
              "inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md text-[10.5px] font-medium border transition-all",
              autoRefresh
                ? "border-emerald-500/25 bg-emerald-500/[0.06] text-emerald-600 dark:text-emerald-400"
                : "border-border/40 bg-background/40 text-muted-foreground/55 hover:text-foreground hover:border-border/70",
            )}
          >
            <span className={cn(
              "h-1.5 w-1.5 rounded-full",
              autoRefresh ? "bg-emerald-500 animate-pulse" : "bg-muted-foreground/30",
            )} />
            Live
          </button>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            title="Refresh now"
            className="inline-flex items-center justify-center h-7 w-7 rounded-md border border-border/40 bg-background/40 text-muted-foreground/60 hover:text-foreground hover:border-border/70 disabled:opacity-50 transition-all"
          >
            <RefreshCw className={cn("h-3 w-3", refreshing && "animate-spin")} />
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                disabled={filtered.length === 0}
                title="Export"
                className="inline-flex items-center gap-1 h-7 px-2.5 rounded-md text-[10.5px] font-medium border border-border/40 bg-background/40 text-muted-foreground/60 hover:text-foreground hover:border-border/70 disabled:opacity-40 transition-all"
              >
                <Download className="h-3 w-3" />
                Export
                <ChevronDown className="h-3 w-3 opacity-60" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem onClick={exportCSV} className="text-[12px]">
                <FileText className="h-3.5 w-3.5 mr-2" />CSV
              </DropdownMenuItem>
              <DropdownMenuItem onClick={exportJSON} className="text-[12px]">
                <FileJson className="h-3.5 w-3.5 mr-2" />JSON
              </DropdownMenuItem>
              <DropdownMenuItem onClick={copyJSON} className="text-[12px]">
                <Copy className="h-3.5 w-3.5 mr-2" />Copy JSON
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Toolbar */}
      <div className="px-5 pb-3 flex items-center gap-2 flex-wrap border-b border-border/15">
        {/* Search */}
        <div className="relative flex-1 min-w-[180px] max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground/40" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search endpoint or request_id"
            className={cn(
              "w-full h-7 pl-7 pr-7 rounded-md text-[11.5px] bg-background/40 border border-border/40",
              "placeholder:text-muted-foreground/35 text-foreground/85",
              "focus:outline-none focus:border-border/80 focus:bg-background/70 transition-colors",
            )}
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground/40 hover:text-foreground transition-colors"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>

        {/* Time-range segmented */}
        <div className="inline-flex items-center rounded-md border border-border/40 bg-background/40 p-0.5">
          {TIME_RANGES.map(r => (
            <button
              key={r.id}
              onClick={() => setTimeRange(r.id)}
              className={cn(
                "h-6 px-2 rounded text-[10.5px] font-medium tabular-nums transition-colors",
                timeRange === r.id
                  ? "bg-foreground/[0.08] text-foreground"
                  : "text-muted-foreground/50 hover:text-foreground/85",
              )}
            >
              {r.label}
            </button>
          ))}
        </div>

        {/* Endpoint filter */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className={cn(
                "inline-flex items-center gap-1 h-7 px-2.5 rounded-md text-[10.5px] font-medium border bg-background/40 transition-all",
                selectedEndpoints.size > 0
                  ? "border-foreground/30 text-foreground"
                  : "border-border/40 text-muted-foreground/60 hover:text-foreground hover:border-border/70",
              )}
            >
              Endpoints
              {selectedEndpoints.size > 0 && (
                <span className="ml-0.5 h-4 min-w-4 px-1 rounded-full bg-foreground text-background text-[9px] font-bold tabular-nums inline-flex items-center justify-center">
                  {selectedEndpoints.size}
                </span>
              )}
              <ChevronDown className="h-3 w-3 opacity-60" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-52">
            {allEndpoints.length === 0 ? (
              <div className="px-2 py-1.5 text-[11px] text-muted-foreground/40">No endpoints yet</div>
            ) : (
              <>
                {allEndpoints.map(ep => {
                  const checked = selectedEndpoints.has(ep)
                  return (
                    <DropdownMenuItem
                      key={ep}
                      onSelect={(e) => { e.preventDefault(); toggleEndpoint(ep) }}
                      className="text-[11.5px] flex items-center gap-2"
                    >
                      <span className={cn(
                        "flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm border transition-colors",
                        checked ? "bg-foreground border-foreground" : "border-border/60",
                      )}>
                        {checked && <Check className="h-2.5 w-2.5 text-background" />}
                      </span>
                      <code className="flex-1 truncate font-mono text-[11px]">{ep}</code>
                    </DropdownMenuItem>
                  )
                })}
                {selectedEndpoints.size > 0 && (
                  <DropdownMenuItem
                    onSelect={(e) => { e.preventDefault(); setSelectedEndpoints(new Set()) }}
                    className="text-[11px] text-muted-foreground/60 border-t border-border/20 mt-1 pt-1.5"
                  >
                    <X className="h-3 w-3 mr-2" />Clear selection
                  </DropdownMenuItem>
                )}
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Sort */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="inline-flex items-center gap-1 h-7 px-2.5 rounded-md text-[10.5px] font-medium border border-border/40 bg-background/40 text-muted-foreground/60 hover:text-foreground hover:border-border/70 transition-all">
              <ArrowUpDown className="h-3 w-3" />
              {SORT_LABELS[sortKey]}
              <ChevronDown className="h-3 w-3 opacity-60" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            {(Object.keys(SORT_LABELS) as SortKey[]).map(k => (
              <DropdownMenuItem
                key={k}
                onSelect={() => setSortKey(k)}
                className="text-[11.5px] flex items-center gap-2"
              >
                <span className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  sortKey === k ? "bg-foreground" : "bg-transparent border border-border/60",
                )} />
                {SORT_LABELS[k]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {hasFilters && (
          <button
            onClick={clearFilters}
            className="inline-flex items-center gap-1 h-7 px-2 rounded-md text-[10.5px] text-muted-foreground/55 hover:text-foreground transition-colors"
          >
            <X className="h-3 w-3" />Clear
          </button>
        )}
      </div>

      {/* Body */}
      {recent.length === 0 ? (
        <div className="px-5 pb-6 pt-6 flex flex-col items-center text-center">
          <BarChart3 className="h-8 w-8 text-muted-foreground/15 mb-3" strokeWidth={1} />
          <p className="text-[11px] text-muted-foreground/30">
            API requests will appear here as you make calls
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="px-5 pb-6 pt-6 flex flex-col items-center text-center">
          <Search className="h-7 w-7 text-muted-foreground/15 mb-3" strokeWidth={1} />
          <p className="text-[11px] text-muted-foreground/40">No traces match these filters</p>
          <button
            onClick={clearFilters}
            className="mt-2 text-[10.5px] font-medium text-foreground/70 hover:text-foreground underline-offset-2 hover:underline"
          >
            Clear filters
          </button>
        </div>
      ) : (
        <>
          <div className="divide-y divide-border/10">
            {visible.map((r, i) => {
              const key = r.request_id || `${r.time}-${i}`
              const isOpen = expanded === key
              return (
                <div key={key} className="group/row">
                  <button
                    onClick={() => setExpanded(isOpen ? null : key)}
                    className="w-full flex items-center gap-3 px-5 py-2.5 text-left transition-colors hover:bg-foreground/[0.015]"
                  >
                    <ChevronRight
                      className={cn(
                        "h-3 w-3 text-muted-foreground/30 shrink-0 transition-transform",
                        isOpen && "rotate-90 text-muted-foreground/60",
                      )}
                    />
                    <span className={cn(
                      "shrink-0 w-12 text-center text-[10px] font-bold tracking-wider py-0.5 rounded",
                      endpointBadgeClass(r.endpoint),
                    )}>
                      {endpointShort(r.endpoint)}
                    </span>
                    <span className="text-[11px] text-muted-foreground/60 flex-1 truncate font-mono">
                      {r.request_id ?? r.endpoint.replace(/_/g, " ")}
                    </span>
                    <span className="text-[10px] text-muted-foreground/40 tabular-nums">{r.credits} cr</span>
                    <span className="text-[10px] text-muted-foreground/30 tabular-nums w-14 text-right">
                      {timeAgo(r.time)}
                    </span>
                  </button>

                  <AnimatePresence initial={false}>
                    {isOpen && (
                      <motion.div
                        key="detail"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.22, ease: EASE }}
                        className="overflow-hidden bg-foreground/[0.012]"
                      >
                        <div className="px-12 py-3 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
                          <DetailRow
                            label="Endpoint"
                            value={r.endpoint}
                            onCopy={() => copyValue(r.endpoint, `${key}-ep`)}
                            copied={copiedKey === `${key}-ep`}
                            mono
                          />
                          <DetailRow
                            label="Credits"
                            value={`${r.credits}`}
                            onCopy={() => copyValue(String(r.credits), `${key}-cr`)}
                            copied={copiedKey === `${key}-cr`}
                          />
                          <DetailRow
                            label="Request ID"
                            value={r.request_id ?? "—"}
                            onCopy={r.request_id ? () => copyValue(r.request_id!, `${key}-id`) : undefined}
                            copied={copiedKey === `${key}-id`}
                            mono
                          />
                          <DetailRow
                            label="Timestamp"
                            value={new Date(r.time).toLocaleString()}
                            secondary={r.time}
                            onCopy={() => copyValue(r.time, `${key}-t`)}
                            copied={copiedKey === `${key}-t`}
                          />
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )
            })}
          </div>

          {visibleCount < filtered.length && (
            <div className="border-t border-border/15 px-5 py-2.5 flex items-center justify-center">
              <button
                onClick={() => setVisibleCount(c => c + 25)}
                className="text-[11px] font-medium text-muted-foreground/65 hover:text-foreground transition-colors"
              >
                Load 25 more &nbsp;·&nbsp; <span className="text-muted-foreground/35 tabular-nums">{filtered.length - visibleCount} remaining</span>
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function DetailRow({ label, value, secondary, onCopy, copied, mono }: {
  label: string
  value: string
  secondary?: string
  onCopy?: () => void
  copied?: boolean
  mono?: boolean
}) {
  return (
    <div className="flex items-start gap-3 group/detail">
      <span className="text-[9.5px] font-semibold text-muted-foreground/40 uppercase tracking-[0.14em] w-16 shrink-0 pt-0.5">
        {label}
      </span>
      <div className="flex-1 min-w-0">
        <div className={cn(
          "text-[11.5px] text-foreground/80 break-all",
          mono && "font-mono text-[11px]",
        )}>
          {value}
        </div>
        {secondary && (
          <div className="text-[10px] text-muted-foreground/35 font-mono truncate mt-0.5">{secondary}</div>
        )}
      </div>
      {onCopy && (
        <button
          onClick={onCopy}
          className="opacity-0 group-hover/detail:opacity-100 text-muted-foreground/40 hover:text-foreground transition-all shrink-0"
          title="Copy"
        >
          {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
        </button>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   MAIN CONTENT
   ═══════════════════════════════════════════════════════════════════ */

export function DevelopersContent() {
  const [keys, setKeys] = useState<APIKey[]>([])
  const [stats, setStats] = useState<Stats>({
    keyCount: 0, totalRequests: 0, totalCredits: 0,
    requests24h: 0, requests7d: 0, credits7d: 0,
    avgCreditsPerRequest: 0, peakHour: null, balance: 0, tier: "",
  })
  const [daily, setDaily] = useState<DailyPoint[]>([])
  const [recent, setRecent] = useState<RecentRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [newKeyName, setNewKeyName] = useState("")
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [createdKey, setCreatedKey] = useState<string | null>(null)
  const [copiedKey, setCopiedKey] = useState(false)
  const [revokeId, setRevokeId] = useState<string | null>(null)
  const [rawKeys, setRawKeys] = useState<Record<string, string>>({})
  const [activeTab, setActiveTab] = useState<"keys" | "traces" | "docs" | "endpoints">("keys")

  const fetchKeys = useCallback(async () => {
    try {
      const res = await fetchClient("/api/developers")
      if (res.ok) {
        const data = await res.json()
        setKeys(data.keys ?? [])
        setStats(prev => data.stats ?? prev)
        setDaily(data.daily ?? [])
        setRecent(data.recent ?? [])
      }
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchKeys() }, [fetchKeys])

  const createKey = async () => {
    if (!newKeyName.trim()) return
    setCreating(true)
    try {
      const res = await fetchClient("/api/developers", {
        method: "POST",
        body: JSON.stringify({ name: newKeyName.trim() }),
      })
      if (res.ok) {
        const data = await res.json()
        setCreatedKey(data.key)
        setRawKeys(prev => ({ ...prev, [data.key_id]: data.key }))
        setShowCreateDialog(false)
        setNewKeyName("")
        fetchKeys()
        toast.success("API key created")
      } else {
        toast.error("Failed to create key")
      }
    } catch {
      toast.error("Failed to create key")
    } finally {
      setCreating(false)
    }
  }

  const revokeKey = async (id: string) => {
    try {
      const res = await fetchClient(`/api/developers/${id}`, { method: "DELETE" })
      if (res.ok) {
        setKeys(prev => prev.filter(k => k.id !== id))
        setRevokeId(null)
        toast.success("API key revoked")
      }
    } catch {
      toast.error("Failed to revoke key")
    }
  }

  return (
    <PageLoader isLoading={loading} title="Developer API" description="Loading your API dashboard.">
    <div className="h-full overflow-y-auto overflow-x-hidden scrollbar-invisible relative bg-transparent">

      {/* Ambient background */}
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute -top-1/4 -right-1/4 h-[600px] w-[600px] rounded-full bg-foreground/[0.02] dark:bg-foreground/[0.04] blur-3xl" />
        <div className="absolute -bottom-1/4 -left-1/4 h-[500px] w-[500px] rounded-full bg-foreground/[0.02] dark:bg-foreground/[0.04] blur-3xl" />
      </div>

      <div className="container mx-auto p-4 sm:p-6 lg:p-8 max-w-7xl space-y-6 relative">

        {/* ── Header ── */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: EASE }}
          className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4"
        >
          <div>
            <h1 className="text-2xl sm:text-3xl font-medium tracking-tight">Developer API</h1>
            <div className="flex items-center gap-3 mt-1.5">
              <p className="text-muted-foreground text-sm">
                Integrate computer-use intelligence into your apps
              </p>
              <Link
                href="/guide?tab=api"
                className="hidden sm:inline-flex items-center gap-1.5 rounded-lg border border-border/60 bg-foreground/[0.05] px-2.5 py-1 text-xs font-medium text-foreground/70 hover:text-foreground hover:border-border hover:bg-foreground/[0.08] transition-all"
              >
                <BookOpen className="h-3.5 w-3.5" />
                Docs
              </Link>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowCreateDialog(true)}
              className="inline-flex h-9 items-center justify-center rounded-xl px-5 text-sm font-medium gap-2 transition-all bg-foreground text-background hover:bg-foreground/90"
            >
              <Plus className="h-4 w-4" />
              Create Key
            </button>
          </div>
        </motion.div>

        {/* ── Stat Cards ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            <StatCard
              key="balance"
              label="Balance"
              value={stats.balance.toLocaleString()}
              subtext="credits"
              icon={Zap}
              detail={stats.tier ? `${stats.tier} plan` : "Shared balance"}
            />,
            <StatCard
              key="requests"
              label="Requests"
              value={stats.totalRequests.toLocaleString()}
              subtext="last 30d"
              icon={Terminal}
              detail={stats.requests24h > 0 ? `${stats.requests24h} today` : undefined}
              sparkData={daily.slice(-7).map(d => d.requests)}
            />,
            <StatCard
              key="credits"
              label="Credits Used"
              value={stats.totalCredits.toLocaleString()}
              subtext="last 30d"
              icon={BarChart3}
              detail={stats.avgCreditsPerRequest > 0 ? `${stats.avgCreditsPerRequest} cr/req avg` : undefined}
              sparkData={daily.slice(-7).map(d => d.credits)}
            />,
            <StatCard
              key="keys"
              label="API Keys"
              value={stats.keyCount.toLocaleString()}
              subtext="active"
              icon={Key}
              detail={stats.peakHour !== null && stats.totalRequests >= 5 ? `Peak at ${String(stats.peakHour).padStart(2, "0")}:00` : undefined}
            />,
          ].map((card, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.05 + i * 0.06, ease: EASE }}>
              {card}
            </motion.div>
          ))}
        </div>

        {/* ── Tab Navigation ── */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.12, ease: EASE }}
          className="flex items-center gap-1 p-1 rounded-xl bg-foreground/[0.03] border border-border/20 w-fit"
        >
          {([
            { id: "keys" as const, label: "API Keys", icon: Key },
            { id: "traces" as const, label: "Traces", icon: BarChart3 },
            { id: "docs" as const, label: "Docs", icon: Code2 },
          ]).map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all duration-200",
                activeTab === tab.id
                  ? "bg-background shadow-sm text-foreground border border-border/30"
                  : "text-muted-foreground/60 hover:text-foreground/80"
              )}
            >
              <tab.icon className="h-3.5 w-3.5" />
              {tab.label}
            </button>
          ))}
        </motion.div>

        {/* ── Tab Content ── */}
        <AnimatePresence mode="wait">

          {/* ════ Keys Tab ════ */}
          {activeTab === "keys" && (
            <motion.div
              key="keys"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.3, ease: EASE }}
            >
              {keys.length === 0 ? (
                /* ── Empty State ── */
                <div className="relative rounded-2xl border border-border/30 bg-card/50 backdrop-blur-sm overflow-hidden">
                  <div className="pointer-events-none absolute inset-0">
                    <div className="absolute -top-12 right-1/4 h-56 w-56 rounded-full bg-foreground/[0.02] blur-3xl" />
                    <div className="absolute -bottom-12 left-1/4 h-48 w-48 rounded-full bg-foreground/[0.02] blur-3xl" />
                    <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-foreground/[0.08] to-transparent" />
                  </div>

                  <div className="relative flex flex-col items-center py-14 px-6 text-center">
                    <div className="flex items-center gap-2.5 mb-8">
                      {[Key, Shield, Code2, Terminal, Send, Braces].map((Icon, i) => (
                        <motion.div
                          key={i}
                          initial={{ opacity: 0, scale: 0.8 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ duration: 0.3, delay: 0.15 + i * 0.04, ease: EASE }}
                          className="flex h-10 w-10 items-center justify-center rounded-xl border border-border/40 bg-background/60 text-muted-foreground/70"
                        >
                          <Icon className="h-[18px] w-[18px]" />
                        </motion.div>
                      ))}
                    </div>

                    <h3 className="text-xl font-bold mb-2">Build with Computer Use</h3>
                    <p className="text-sm text-muted-foreground max-w-sm mb-10">
                      Send a screenshot, get structured mouse and keyboard actions back. Create an API key to start integrating.
                    </p>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-10 text-left w-full max-w-lg">
                      {[
                        { icon: MousePointerClick, title: "Screenshot to Actions", desc: "Send any screenshot and get click, type, scroll actions with exact coordinates." },
                        { icon: Shield, title: "Session Memory", desc: "Stateful sessions keep trajectory history across multi-step tasks." },
                        { icon: Zap, title: "Multiple Engines", desc: "Choose V3 for speed or V1 for accuracy. Pay per request from your shared credit balance." },
                      ].map(({ icon: Icon, title, desc }, i) => (
                        <motion.div
                          key={title}
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.4, delay: 0.2 + i * 0.06, ease: EASE }}
                          className="relative flex flex-col gap-2 rounded-xl p-4 overflow-hidden border border-border/30 bg-card/50 backdrop-blur-sm"
                        >
                          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-foreground/[0.08] to-transparent" />
                          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-muted/60">
                            <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                          </div>
                          <p className="text-xs font-semibold text-foreground/80">{title}</p>
                          <p className="text-[11px] text-muted-foreground leading-relaxed">{desc}</p>
                        </motion.div>
                      ))}
                    </div>

                    <button
                      onClick={() => setShowCreateDialog(true)}
                      className="inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold transition-all text-background bg-foreground hover:bg-foreground/90 hover:scale-[1.02] active:scale-[0.98]"
                    >
                      <Plus className="h-4 w-4" />
                      Create your first API key
                    </button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <AnimatePresence>
                    {keys.map((k, i) => (
                      <APIKeyCard key={k.id} apiKey={k} index={i} fullKey={rawKeys[k.id]} onRevoke={(id) => setRevokeId(id)} />
                    ))}
                  </AnimatePresence>
                </div>
              )}
            </motion.div>
          )}

          {/* ════ Traces Tab ════ */}
          {activeTab === "traces" && (
            <motion.div
              key="traces"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.3, ease: EASE }}
              className="space-y-5"
            >
              {/* Activity chart */}
              <ActivityChart daily={daily} />

              {/* Traces — filters, export, expandable rows */}
              <TracesPanel recent={recent} onRefresh={fetchKeys} />
            </motion.div>
          )}

          {/* ════ Docs Tab (shared APITab from guide) ════ */}
          {activeTab === "docs" && (
            <motion.div
              key="docs"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.3, ease: EASE }}
            >
              <APITab inApp />
            </motion.div>
          )}


        </AnimatePresence>
      </div>

      {/* ── Create Dialog ── */}
      <AlertDialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <AlertDialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-sm sm:text-base">Create API Key</AlertDialogTitle>
            <AlertDialogDescription className="text-xs sm:text-sm">
              Give your key a name to identify it later. The secret key will only be shown once.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {showCreateDialog && <CreateKeyIntro />}
          <div className="py-2 sm:py-3">
            <input
              autoFocus
              type="text"
              placeholder="e.g. Production, My RPA Bot, Testing"
              value={newKeyName}
              onChange={e => setNewKeyName(e.target.value)}
              onKeyDown={e => e.key === "Enter" && createKey()}
              className={cn(
                "w-full h-9 sm:h-10 px-3 rounded-xl border border-border/40 bg-background/60 backdrop-blur-sm text-xs sm:text-sm",
                "placeholder:text-muted-foreground/50",
                "focus:outline-none focus:ring-1 focus:ring-ring focus:border-border/60",
                "transition-all duration-200"
              )}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel className="text-xs sm:text-sm">Cancel</AlertDialogCancel>
            <Button className="text-xs sm:text-sm" onClick={createKey} disabled={creating || !newKeyName.trim()}>
              {creating ? "Creating..." : "Create"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Created Key (shown once) ── */}
      <AlertDialog open={!!createdKey} onOpenChange={() => setCreatedKey(null)}>
        <AlertDialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-lg gap-0 p-0 overflow-hidden max-h-[90vh] overflow-y-auto">
          {/* Header */}
          <div className="px-4 sm:px-6 pt-5 sm:pt-6 pb-3 sm:pb-4">
            <AlertDialogTitle className="flex items-center gap-2 text-sm sm:text-base">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500/10">
                <Check className="h-3.5 w-3.5 text-emerald-500" />
              </div>
              Your API key is ready
            </AlertDialogTitle>
            <AlertDialogDescription className="mt-1.5 text-xs sm:text-[13px]">
              Save this key somewhere safe. It won&apos;t be shown again.
            </AlertDialogDescription>
          </div>

          {/* Key + Copy */}
          <div className="px-4 sm:px-6 pb-3 sm:pb-4 space-y-2">
            <input
              readOnly
              value={createdKey ?? ""}
              onFocus={e => e.target.select()}
              className={cn(
                "w-full px-2.5 sm:px-3 py-2 sm:py-2.5 rounded-lg font-mono text-[10px] sm:text-xs",
                "bg-muted/40 border border-border/30 text-foreground/80",
                "focus:outline-none focus:ring-1 focus:ring-ring cursor-text",
              )}
            />
            <Button
              className="w-full gap-2 text-xs sm:text-sm"
              onClick={() => {
                if (!createdKey) return
                copyToClipboard(createdKey).then(() => {
                  setCopiedKey(true)
                  toast.success("Copied to clipboard")
                  setTimeout(() => setCopiedKey(false), 2000)
                }).catch(() => {
                  const input = document.querySelector<HTMLInputElement>("input[readonly]")
                  if (input) { input.focus(); input.select() }
                  toast.info("Press Ctrl+C to copy")
                })
              }}
            >
              {copiedKey ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copiedKey ? "Copied" : "Copy API Key"}
            </Button>
          </div>

          {/* Quick start snippet with language selector */}
          <CreatedKeySnippet apiKey={createdKey ?? ""} onCopy={copyToClipboard} />

          {/* Footer */}
          <div className="border-t border-border/20 px-4 sm:px-6 py-3 flex items-center justify-between gap-2">
            <AlertDialogCancel className="text-xs h-8">Close</AlertDialogCancel>
            <AlertDialogAction
              className="gap-1.5 text-xs h-8"
              onClick={() => {
                setCreatedKey(null)
                setActiveTab("docs")
              }}
            >
              <Code2 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">View Full</span> Docs
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Revoke Confirm ── */}
      <AlertDialog open={!!revokeId} onOpenChange={(o) => !o && setRevokeId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke API Key</AlertDialogTitle>
            <AlertDialogDescription>
              This key will immediately stop working. Any applications using it will fail. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => revokeId && revokeKey(revokeId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Revoke
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
    </PageLoader>
  )
}
