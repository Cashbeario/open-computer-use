"use client"

import { useEffect, useMemo, useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { ArrowRight, Check, Copy, Video } from "lucide-react"
import Link from "next/link"
import { cn } from "@/lib/utils"
import { useTranslations } from "next-intl"
import { CodingAgentQuickstart } from "@/app/components/developers/coding-agent-quickstart"
import { ClaudeMark, CursorMark, OpenAIMark } from "@/app/components/developers/brand-logos"
import { StanfordLogo, ColumbiaLogo, PurdueLogo, AdobeLogo } from "./institution-logos"

/* Which audience the landing page is speaking to. "product" is the default
 * consumer story; "developers" swaps the hero and the sections below for the
 * public API story; "data" swaps them for the synthetic training-data story.
 * The toggle only renders when the page passes an onViewChange handler and
 * more than one view is enabled (see the feature flags in landing-page). */
export type LandingView = "product" | "developers" | "data"

const VIEW_LABELS: Record<LandingView, string> = {
  product: "Product",
  developers: "Developers",
  data: "Data",
}

/* ─── stat count-up + value parsing ───
 * The four resource-saved numbers count up once, on first paint. parseStat
 * splits "$3,200" / "30 hrs" / "10×" / "0" into prefix/num/suffix so only the
 * integer animates while the formatting (commas, units, glyph) is preserved. */
function parseStat(raw: string): { prefix: string; num: number; suffix: string } {
  const m = raw.match(/^(\D*?)([\d,]+)(.*)$/)
  if (!m) return { prefix: "", num: 0, suffix: raw }
  return { prefix: m[1], num: parseInt(m[2].replace(/,/g, ""), 10), suffix: m[3] }
}

function useCountUp(target: number, durationMs: number, start: boolean): number {
  const [val, setVal] = useState(0)
  useEffect(() => {
    if (!start) return
    if (target === 0) { setVal(0); return }
    if (durationMs <= 0) { setVal(target); return } // reduced motion → snap
    const t0 = performance.now()
    let raf = 0
    const tick = (now: number) => {
      const t = Math.min(1, (now - t0) / durationMs)
      const eased = 1 - Math.pow(1 - t, 3)
      setVal(Math.round(target * eased))
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, durationMs, start])
  return val
}

function StatCell({
  rawValue,
  label,
  sublabel,
  isMobile,
  start,
  reduced,
}: {
  rawValue: string
  label: string
  sublabel: string
  isMobile: boolean
  start: boolean
  reduced: boolean
}) {
  const { prefix, num, suffix } = useMemo(() => parseStat(rawValue), [rawValue])
  const animated = useCountUp(num, reduced ? 0 : 1100, start)
  const display = num === 0 ? `${prefix}0${suffix}` : `${prefix}${animated.toLocaleString()}${suffix}`

  return (
    <div className="flex flex-col items-center text-center">
      <div
        className={cn(
          "font-semibold tabular-nums tracking-[-0.04em] leading-none text-foreground",
          isMobile ? "text-[1.5rem]" : "text-[1.85rem] lg:text-[2rem]",
        )}
      >
        {display}
      </div>
      <div
        className={cn(
          "font-mono uppercase leading-tight text-muted-foreground/70",
          isMobile ? "mt-2 text-[8px] tracking-[0.16em]" : "mt-2.5 text-[9px] tracking-[0.2em]",
        )}
      >
        {label}
      </div>
      <div
        className={cn(
          "font-light leading-[1.35] text-muted-foreground/45 normal-case",
          isMobile ? "mt-1 max-w-[130px] text-[9px]" : "mt-1.5 max-w-[150px] text-[11px]",
        )}
      >
        {sublabel}
      </div>
    </div>
  )
}

const RESOURCE_STAT_KEYS = ["money", "time", "speed", "effort"] as const

/* ─── Audience toggle ───
 * A segmented pill that swaps the whole landing story. Options are the
 * enabled views passed in by the page (2 or 3 of them). The active thumb
 * slides between options via a shared layoutId. Plain buttons with
 * aria-pressed; CSS-only hover (no whileHover — iOS double-tap trap). */
function AudienceToggle({
  view,
  views,
  onChange,
  reduced,
}: {
  view: LandingView
  views: readonly LandingView[]
  onChange: (v: LandingView) => void
  reduced: boolean
}) {
  return (
    <div className="inline-flex items-center rounded-full border border-foreground/[0.1] bg-background/60 p-1 backdrop-blur-[2px]">
      {views.map((v) => {
        const active = view === v
        return (
          <button
            key={v}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(v)}
            className={cn(
              "relative rounded-full px-4 py-1.5 text-[12.5px] font-medium transition-colors duration-200",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/40",
              active ? "text-background" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {active && (
              <motion.span
                layoutId="audience-thumb"
                className="absolute inset-0 rounded-full bg-foreground"
                transition={reduced ? { duration: 0 } : { type: "spring", stiffness: 500, damping: 40 }}
              />
            )}
            <span className="relative z-10">{VIEW_LABELS[v]}</span>
          </button>
        )
      })}
    </div>
  )
}

/* ─── Developer hero code block ───
 * The dev hero's signature element (it replaces the stats strip): one real,
 * copyable call. The example mirrors the docs verbatim — POST /v1/predict
 * with a screenshot and an instruction. */
const DEV_CURL = `curl https://coasty.ai/v1/predict \\
  -H "X-API-Key: sk-coasty-live-..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "screenshot": "<base64-png>",
    "instruction": "Click the Sign In button"
  }'`

function DevHeroCode({ isMobile }: { isMobile: boolean }) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(DEV_CURL)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      /* clipboard unavailable — quietly do nothing */
    }
  }

  return (
    <div className={cn("mx-auto text-left", isMobile ? "max-w-[420px]" : "max-w-[560px]")}>
      <div className="overflow-hidden rounded-2xl border border-foreground/[0.08] bg-background/60 backdrop-blur-[2px]">
        <div className="flex items-center justify-between border-b border-foreground/[0.06] px-4 py-2.5">
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/60">
            POST /v1/predict
          </span>
          <button
            type="button"
            onClick={copy}
            aria-label="Copy example request"
            className="-my-1.5 -mr-2 inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground/50 hover:text-foreground transition-colors"
          >
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          </button>
        </div>
        <pre
          className={cn(
            "overflow-x-auto px-4 py-4 font-mono leading-[1.75] text-muted-foreground",
            isMobile ? "text-[10.5px]" : "text-[12px]",
          )}
        >
          <code>{DEV_CURL}</code>
        </pre>
      </div>
    </div>
  )
}

/* ─── Data hero record block ───
 * The data hero's signature element (the analog of DevHeroCode): one step of
 * a real trajectory record, showing in a glance what the data is — long
 * horizon (step 46), multimodal (screenshot + UI tree), grounded (exact
 * coordinates), and verified (programmatic outcome check). */
const DATA_RECORD = `{
  "task": "Reconcile 47 invoices across ERP and email",
  "step": 46,
  "observation": {
    "screenshot": "step-046.png",
    "ui_tree": "step-046.json"
  },
  "action": { "type": "click", "x": 642, "y": 388 },
  "outcome": { "verified": true, "method": "programmatic" }
}`

/* Institutions using the data pipeline — official vector marks (see
 * institution-logos.tsx for sources), tinted monochrome by the strip via
 * currentColor. Heights are tuned per mark so the wordmarks carry equal
 * visual weight despite very different aspect ratios. */
const DATA_INSTITUTIONS = [
  { name: "Stanford University", Logo: StanfordLogo, className: "h-[17px]" },
  { name: "Columbia University", Logo: ColumbiaLogo, className: "h-[14px]" },
  { name: "Purdue University", Logo: PurdueLogo, className: "h-[21px]" },
  { name: "Adobe", Logo: AdobeLogo, className: "h-[15px]" },
] as const

function DataHeroRecord({ isMobile }: { isMobile: boolean }) {
  return (
    <div className={cn("mx-auto text-left", isMobile ? "max-w-[420px]" : "max-w-[560px]")}>
      <div className="overflow-hidden rounded-2xl border border-foreground/[0.08] bg-background/60 backdrop-blur-[2px]">
        <div className="flex items-center justify-between border-b border-foreground/[0.06] px-4 py-2.5">
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/60">
            trajectory step 46 / 112
          </span>
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/40">
            jsonl
          </span>
        </div>
        <pre
          className={cn(
            "overflow-x-auto px-4 py-4 font-mono leading-[1.75] text-muted-foreground",
            isMobile ? "text-[10.5px]" : "text-[12px]",
          )}
        >
          <code>{DATA_RECORD}</code>
        </pre>
      </div>
    </div>
  )
}

export function HeroVideoMatrix({
  isMobile,
  view = "product",
  views = ["product"],
  onViewChange,
}: {
  isMobile: boolean
  view?: LandingView
  views?: readonly LandingView[]
  onViewChange?: (v: LandingView) => void
}) {
  const t = useTranslations("hero")
  const tc = useTranslations("common")
  const prefersReduced = useReducedMotion()

  const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1]
  // One opacity-only entrance (a "photograph developing" feel, no y-translate
  // ladder). prefersReduced is the single gate.
  const settle = (delay: number, duration: number) => ({
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    transition: {
      duration: prefersReduced ? 0.4 : duration,
      delay: prefersReduced ? delay * 0.3 : delay,
      ease: EASE,
    },
  })

  // Arm the stat count-up after the stats row has faded in.
  const [statsStarted, setStatsStarted] = useState(false)
  useEffect(() => {
    if (prefersReduced) return
    const id = setTimeout(() => setStatsStarted(true), 1700)
    return () => clearTimeout(id)
  }, [prefersReduced])

  // Full-viewport hero, content vertically centred. The symmetric vertical
  // padding keeps it dead-centre on roomy screens while guaranteeing the block
  // clears the fixed header (and never clips) on short or mobile viewports, so
  // the composition reads clean at any dimension.
  return (
    <section className="relative w-full min-h-[100svh] flex items-center justify-center overflow-hidden py-28">
      <div
        className={cn(
          "relative z-10 w-full text-center",
          isMobile ? "px-5 max-w-[460px]" : "px-10 max-w-[760px]",
        )}
      >
        {/* Audience toggle — sits above the crossfade so it never remounts
            (the sliding thumb needs a stable layoutId across switches). Hidden
            when the current view isn't among its options (e.g. the deep-link
            only data view), so it never renders with nothing selected. */}
        {onViewChange && views.length > 1 && views.includes(view) && (
          <motion.div {...settle(0, 0.7)} className={cn("flex justify-center", isMobile ? "mb-7" : "mb-9")}>
            <AudienceToggle view={view} views={views} onChange={onViewChange} reduced={!!prefersReduced} />
          </motion.div>
        )}

        <AnimatePresence mode="wait" initial={false}>
          {view === "data" ? (
            <motion.div
              key="data"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.22, ease: EASE }}
            >
              <motion.h1
                {...settle(0.06, isMobile ? 0.8 : 1.0)}
                className={cn(
                  "font-semibold tracking-[-0.05em] text-balance text-foreground pb-1 sm:pb-2",
                  isMobile
                    ? "text-[2rem] leading-[1.06]"
                    : "text-[2.75rem] md:text-[3.25rem] lg:text-[3.75rem] leading-[1.04]",
                )}
              >
                The Best <span className="whitespace-nowrap">Long-Horizon</span>{" "}
                <span className="whitespace-nowrap">Multimodal Data</span>
              </motion.h1>

              <motion.p
                {...settle(0.32, 0.85)}
                className={cn(
                  "mx-auto text-muted-foreground",
                  isMobile ? "mt-3 text-[13.5px] leading-[1.5] max-w-[340px]" : "mt-5 text-[16px] leading-[1.55] max-w-[520px]",
                )}
              >
                Synthetic trajectories that run for hundreds of steps across real
                applications, with every modality aligned. Built to your spec, verified
                before delivery, and shipped in under 30 days.
              </motion.p>

              <motion.div
                {...settle(0.46, 0.85)}
                className={cn("flex items-center justify-center", isMobile ? "mt-7" : "mt-9")}
              >
                <a
                  href="https://cal.com/coasty/coasty-data-call"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(
                    "group/cta inline-flex items-center justify-center gap-2 rounded-full font-medium",
                    "bg-foreground text-background transition-transform duration-200 hover:opacity-90 active:scale-[0.98]",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                    isMobile ? "w-full max-w-[280px] px-6 py-3 text-sm" : "px-7 py-3 text-[14.5px]",
                  )}
                >
                  Book a data call
                  <ArrowRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover/cta:translate-x-0.5" />
                </a>
              </motion.div>

              {/* Institutions strip — directly under the call CTA. */}
              <motion.div {...settle(0.58, 0.9)} className={isMobile ? "mt-8" : "mt-9"}>
                <p className="font-mono text-[9.5px] uppercase tracking-[0.2em] text-muted-foreground/45">
                  Built and used by teams at
                </p>
                <div className="mt-4 flex flex-wrap items-center justify-center gap-x-9 gap-y-3.5 text-muted-foreground/60">
                  {DATA_INSTITUTIONS.map(({ name, Logo, className }) => (
                    <Logo key={name} className={cn("w-auto", className)} />
                  ))}
                </div>
              </motion.div>

              <motion.div {...settle(0.72, 0.9)} className={isMobile ? "mt-10" : "mt-12"}>
                <DataHeroRecord isMobile={isMobile} />
              </motion.div>
            </motion.div>
          ) : view === "developers" ? (
            <motion.div
              key="developers"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.22, ease: EASE }}
            >
              <motion.h1
                {...settle(0.06, isMobile ? 0.8 : 1.0)}
                className={cn(
                  "font-semibold tracking-[-0.05em] text-balance text-foreground pb-1 sm:pb-2",
                  isMobile
                    ? "text-[2rem] leading-[1.06]"
                    : "text-[2.75rem] md:text-[3.25rem] lg:text-[3.75rem] leading-[1.04]",
                )}
              >
                The Best <span className="block whitespace-nowrap">Computer Use API</span>
              </motion.h1>

              <motion.p
                {...settle(0.32, 0.85)}
                className={cn(
                  "mx-auto text-muted-foreground",
                  isMobile ? "mt-3 text-[13.5px] leading-[1.5] max-w-[320px]" : "mt-5 text-[16px] leading-[1.55] max-w-[500px]",
                )}
              >
                Send a screenshot, get the next action back as structured JSON, and run
                it on your machines or ours. Pay only for what you use.
              </motion.p>

              <motion.div
                {...settle(0.46, 0.85)}
                className={cn("flex items-center justify-center", isMobile ? "mt-7 gap-3 flex-col" : "mt-9 gap-3")}
              >
                <Link
                  href="/auth"
                  className={cn(
                    "group/cta inline-flex items-center justify-center gap-2 rounded-full font-medium",
                    "bg-foreground text-background transition-transform duration-200 hover:opacity-90 active:scale-[0.98]",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                    isMobile ? "w-full max-w-[280px] px-6 py-3 text-sm" : "px-7 py-3 text-[14.5px]",
                  )}
                >
                  Get your API key
                  <ArrowRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover/cta:translate-x-0.5" />
                </Link>
                {/* The coding-agent quickstart popup (crafted-prompt wizard),
                    triggered by a pill styled exactly like the product hero's
                    secondary CTA, with the recognizable AI-logo cluster. */}
                <CodingAgentQuickstart
                  trigger={
                    <button
                      type="button"
                      className={cn(
                        "inline-flex items-center justify-center gap-2 rounded-full font-medium",
                        "border border-foreground/15 text-foreground bg-background/40 backdrop-blur-[2px]",
                        "transition-colors duration-200 hover:border-foreground/30 hover:bg-foreground/[0.03]",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                        isMobile ? "w-full max-w-[280px] px-6 py-3 text-sm" : "px-7 py-3 text-[14.5px]",
                      )}
                    >
                      <span className="flex -space-x-1.5">
                        {[OpenAIMark, ClaudeMark, CursorMark].map((Logo, i) => (
                          <span
                            key={i}
                            className="grid h-[18px] w-[18px] place-items-center rounded-full bg-background ring-1 ring-foreground/10 dark:ring-foreground/15"
                          >
                            <Logo className="h-3 w-3 text-foreground/80" />
                          </span>
                        ))}
                      </span>
                      Create with AI
                    </button>
                  }
                />
              </motion.div>

              <motion.div {...settle(0.6, 0.9)} className={isMobile ? "mt-10" : "mt-12"}>
                <DevHeroCode isMobile={isMobile} />
              </motion.div>
            </motion.div>
          ) : (
            <motion.div
              key="product"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.22, ease: EASE }}
            >
              {/* "Computer Use Agent" is wrapped in a nowrap span so the phrase
                  stays locked on a single line and never breaks mid-term. */}
              <motion.h1
                {...settle(0.06, isMobile ? 0.8 : 1.0)}
                className={cn(
                  "font-semibold tracking-[-0.05em] text-balance text-foreground pb-1 sm:pb-2",
                  isMobile
                    ? "text-[2rem] leading-[1.06]"
                    : "text-[2.75rem] md:text-[3.25rem] lg:text-[3.75rem] leading-[1.04]",
                )}
              >
                The Best <span className="whitespace-nowrap">Computer Use Agent</span>
              </motion.h1>

              <motion.p
                {...settle(0.32, 0.85)}
                className={cn(
                  "mx-auto text-muted-foreground",
                  isMobile ? "mt-3 text-[13.5px] leading-[1.5] max-w-[320px]" : "mt-5 text-[16px] leading-[1.55] max-w-[480px]",
                )}
              >
                {t("useCases.computerAgent.outcome")}
              </motion.p>

              {/* CTAs */}
              <motion.div
                {...settle(0.46, 0.85)}
                className={cn("flex items-center justify-center", isMobile ? "mt-7 gap-3 flex-col" : "mt-9 gap-3")}
              >
                <Link
                  href="/auth"
                  className={cn(
                    "group/cta inline-flex items-center justify-center gap-2 rounded-full font-medium",
                    "bg-foreground text-background transition-transform duration-200 hover:opacity-90 active:scale-[0.98]",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                    isMobile ? "w-full max-w-[280px] px-6 py-3 text-sm" : "px-7 py-3 text-[14.5px]",
                  )}
                >
                  {tc("tryCoastyFree")}
                  <ArrowRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover/cta:translate-x-0.5" />
                </Link>
                <a
                  href="https://cal.com/coasty/15min"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(
                    "inline-flex items-center justify-center gap-2 rounded-full font-medium",
                    "border border-foreground/15 text-foreground bg-background/40 backdrop-blur-[2px]",
                    "transition-colors duration-200 hover:border-foreground/30 hover:bg-foreground/[0.03]",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                    isMobile ? "w-full max-w-[280px] px-6 py-3 text-sm" : "px-7 py-3 text-[14.5px]",
                  )}
                >
                  <Video className="h-3.5 w-3.5" />
                  {tc("bookDemo")}
                </a>
              </motion.div>

              {/* Resources saved — a restrained 4-up strip; the numbers stand on
                  their own against the page, no panel chrome or divider gradients. */}
              <motion.div
                {...settle(0.6, 0.9)}
                onAnimationComplete={() => { if (!prefersReduced) setStatsStarted(true) }}
                aria-label="Resources saved per workflow"
                className={cn("mx-auto grid grid-cols-2 sm:grid-cols-4", isMobile ? "mt-10 max-w-[320px] gap-y-7" : "mt-14 max-w-[600px] gap-x-6")}
              >
                {RESOURCE_STAT_KEYS.map((key) => (
                  <StatCell
                    key={key}
                    isMobile={isMobile}
                    start={statsStarted || !!prefersReduced}
                    reduced={!!prefersReduced}
                    rawValue={t(`resourceStats.${key}.value`)}
                    label={t(`resourceStats.${key}.label`)}
                    sublabel={t(`resourceStats.${key}.sublabel`)}
                  />
                ))}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </section>
  )
}
