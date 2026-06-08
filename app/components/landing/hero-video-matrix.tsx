"use client"

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react"
import { motion, useReducedMotion } from "framer-motion"
import { ArrowRight, Video } from "lucide-react"
import Link from "next/link"
import NextImage from "next/image"
import { cn } from "@/lib/utils"
import { useTranslations } from "next-intl"

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

/* ─── Ambient background + spotlight ───
 * The dimmed media stage (poster + optional desktop video, behind a
 * readability veil) is now lit by a single composed spotlight: a fixed
 * top "stage light", a cursor-following focal glow, and an edge vignette
 * that frames the centre. The glow tracks the pointer via two CSS custom
 * properties (--mx / --my) updated in a rAF-throttled pointermove, so it
 * follows the cursor with no React re-render. All of it is one signature
 * effect — soft, low-opacity, theme-aware — not a light show. Reduced
 * motion and mobile keep the static stage light only. The poster still
 * resolves with a single defocus reveal (blur → 0), a lens settling. */
function HeroBackground({ isMobile }: { isMobile: boolean }) {
  const prefersReduced = useReducedMotion()
  const [videoReady, setVideoReady] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  // Cursor-following spotlight (desktop, motion allowed). A rAF-throttled
  // pointermove writes the focal point into --mx / --my as percentages of
  // the hero box; the glow layer reads them, so the light drifts toward the
  // cursor without re-rendering. The wrapper is pointer-events-none, so we
  // listen on window and translate against its bounding rect.
  useEffect(() => {
    if (isMobile || prefersReduced) return
    const el = rootRef.current
    if (!el) return
    let raf = 0
    let nx = 50
    let ny = 26
    const apply = () => {
      raf = 0
      el.style.setProperty("--mx", `${nx}%`)
      el.style.setProperty("--my", `${ny}%`)
    }
    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) return
      nx = ((e.clientX - r.left) / r.width) * 100
      ny = ((e.clientY - r.top) / r.height) * 100
      if (!raf) raf = requestAnimationFrame(apply)
    }
    window.addEventListener("pointermove", onMove, { passive: true })
    return () => {
      window.removeEventListener("pointermove", onMove)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [isMobile, prefersReduced])

  return (
    <div
      ref={rootRef}
      aria-hidden="true"
      style={{ "--mx": "50%", "--my": "26%" } as CSSProperties}
      className="absolute inset-0 z-0 pointer-events-none overflow-hidden"
    >
      <motion.div
        initial={prefersReduced ? { opacity: 0 } : { filter: "blur(20px)", opacity: 0, scale: 1.04 }}
        animate={prefersReduced ? { opacity: 1 } : { filter: "blur(0px)", opacity: 1, scale: 1 }}
        transition={{ duration: prefersReduced ? 0.6 : 1.3, ease: [0.16, 1, 0.3, 1], delay: 0.05 }}
        className="absolute inset-0"
      >
        <NextImage src="/hero-bg.jpg" alt="" fill priority sizes="100vw" className="object-cover" />
        {!isMobile && (
          <video
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
            poster="/hero-bg.jpg"
            onCanPlay={() => setVideoReady(true)}
            className={cn(
              "absolute inset-0 w-full h-full object-cover motion-reduce:hidden transition-opacity duration-700 ease-out",
              videoReady ? "opacity-100" : "opacity-0",
            )}
          >
            <source src="/hero-bg.mp4" type="video/mp4" />
          </video>
        )}
      </motion.div>

      {/* Readability veil — keeps type legible over the moving media. */}
      <div className="absolute inset-0 bg-background/65 dark:bg-background/75" />

      {/* Edge vignette — pulls the eye to the centre by easing the frame
          back toward the page colour. Works in both themes. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(125% 115% at 50% 28%, transparent 52%, color-mix(in oklab, var(--background) 46%, transparent) 100%)",
        }}
      />

      {/* Static stage light — a soft top-centre wash that lifts the scene
          without washing it out (soft-light keeps it from blowing highlights).
          This is the whole effect under reduced motion / on mobile. */}
      <div
        className="absolute inset-0 mix-blend-soft-light"
        style={{
          background:
            "radial-gradient(78% 56% at 50% -4%, rgba(255,255,255,0.55), rgba(255,255,255,0.12) 40%, transparent 72%)",
        }}
      />

      {/* Cursor-following focal glow — the signature. Desktop + motion only.
          Reads --mx / --my; soft-light blend so it brightens the media at the
          pointer rather than painting a flat white blob. */}
      {!isMobile && (
        <div
          className="absolute inset-0 motion-reduce:hidden mix-blend-soft-light"
          style={{
            background:
              "radial-gradient(420px 420px at var(--mx) var(--my), rgba(255,255,255,0.6), rgba(255,255,255,0.1) 44%, transparent 70%)",
          }}
        />
      )}

      {/* Soft handoff into the next section. */}
      <div
        className="absolute bottom-0 left-0 right-0 h-40"
        style={{ background: "linear-gradient(to bottom, transparent, var(--background) 88%)" }}
      />
    </div>
  )
}

export function HeroVideoMatrix({ isMobile }: { isMobile: boolean }) {
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

  return (
    <section className="relative w-full min-h-[100svh] flex items-center justify-center overflow-hidden">
      <HeroBackground isMobile={isMobile} />

      <div
        className={cn(
          "relative z-10 w-full text-center",
          isMobile ? "px-5 max-w-[460px]" : "px-10 max-w-[760px]",
        )}
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
      </div>
    </section>
  )
}
