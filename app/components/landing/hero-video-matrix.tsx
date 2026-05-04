"use client"

import { useEffect, useRef, useState, useMemo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { ArrowRight, Video, ChevronDown } from "lucide-react"
import Link from "next/link"
import NextImage from "next/image"
import { cn } from "@/lib/utils"
import { useTranslations } from "next-intl"

/* ─── stat helpers (count-up + value parsing) ───
 * Numbers in the resource-saved row count up on first viewport entry.
 * `parseStat` splits "$3,200" / "30 hrs" / "10×" / "0" into prefix/num/suffix
 * so we can animate the integer part while preserving formatting (commas,
 * units, multiplier glyph). */

function parseStat(raw: string): { prefix: string; num: number; suffix: string } {
  const m = raw.match(/^(\D*?)([\d,]+)(.*)$/)
  if (!m) return { prefix: "", num: 0, suffix: raw }
  return {
    prefix: m[1],
    num: parseInt(m[2].replace(/,/g, ""), 10),
    suffix: m[3],
  }
}

function useCountUp(target: number, durationMs: number, start: boolean): number {
  const [val, setVal] = useState(0)
  useEffect(() => {
    if (!start) return
    if (target === 0) { setVal(0); return }
    const t0 = performance.now()
    let raf = 0
    const tick = (now: number) => {
      const t = Math.min(1, (now - t0) / durationMs)
      // ease-out cubic for a confident settle
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
  delay,
  isMobile,
}: {
  rawValue: string
  label: string
  sublabel: string
  delay: number
  isMobile: boolean
}) {
  const { prefix, num, suffix } = useMemo(() => parseStat(rawValue), [rawValue])
  const [inView, setInView] = useState(false)
  const animated = useCountUp(num, 1800, inView)
  const display = num === 0
    ? `${prefix}0${suffix}`
    : `${prefix}${animated.toLocaleString()}${suffix}`

  // Three-tier hierarchy with a deliberate family break:
  //   • Number  — semibold sans, vertical gradient sheen.
  //   • Label   — mono caps, wide tracking. The "headline" of the metric.
  //   • Compare — sans, sentence case, quiet. Reads as a caption /
  //               footnote that explains what the number is benchmarked
  //               against. Sans→mono→sans creates clear visual rhythm
  //               without italics or extra ornament.
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      whileInView={{ opacity: 1, y: 0 }}
      onViewportEnter={() => setInView(true)}
      viewport={{ once: true, amount: 0.45 }}
      transition={{ duration: 0.7, delay, ease: [0.22, 1, 0.36, 1] }}
      className="flex flex-col items-center text-center"
    >
      <div
        className={cn(
          "font-semibold tabular-nums tracking-[-0.05em] leading-none",
          "bg-clip-text text-transparent",
          "bg-gradient-to-b from-foreground to-foreground/85",
          "dark:from-white dark:to-white/80",
          isMobile ? "text-[1.55rem]" : "text-[1.85rem] lg:text-[2rem]",
        )}
      >
        {display}
      </div>
      <div
        className={cn(
          "font-mono uppercase leading-tight text-foreground/55 dark:text-white/55",
          isMobile
            ? "mt-3 text-[8.5px] tracking-[0.22em]"
            : "mt-3 text-[9px] tracking-[0.24em]",
        )}
      >
        {label}
      </div>
      <div
        className={cn(
          "font-light leading-[1.35] text-foreground/35 dark:text-white/35 normal-case",
          isMobile
            ? "mt-1.5 max-w-[130px] text-[10px]"
            : "mt-2 max-w-[150px] text-[11px]",
        )}
      >
        {sublabel}
      </div>
    </motion.div>
  )
}

// Demo video IDs cycled across the grid
const VIDEO_IDS = [
  "icxgLDephHE", "qTvmGfg3HVw", "Wbo2o74hVIo",
  "mH-csaCa508", "AnHJuRMLCnE", "A_OvNh51Npg",
]

const HEADLINE_KEYS = [
  "computerAgent", "competitorIntel", "qaTesting",
  "dataExtraction", "leadGeneration", "emailOutreach",
] as const

// Per-row column offsets prevent adjacent duplicate thumbnails
const ROW_OFFSETS = [0, 3, 1, 5, 2, 4, 1]

export function HeroVideoMatrix({ isMobile }: { isMobile: boolean }) {
  const cols = isMobile ? 9 : 11
  const rows = isMobile ? 7 : 7
  const gap = isMobile ? 3 : 6

  const containerRef = useRef<HTMLDivElement>(null)
  const stickyRef = useRef<HTMLDivElement>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  const vignetteRef = useRef<HTMLDivElement>(null)
  const bottomFadeRef = useRef<HTMLDivElement>(null)
  const scrollIndRef = useRef<HTMLDivElement>(null)
  const bgLayerRef = useRef<HTMLDivElement>(null)

  const centerCol = Math.floor(cols / 2)
  const centerRow = Math.floor(rows / 2)

  const t = useTranslations("hero")
  const tc = useTranslations("common")
  // Resource-saved stats — money / time / output / effort. Lives under
  // `hero.resourceStats` in messages so it's hero-scoped (the generic
  // `stats` namespace below the hero used different keys).
  const RESOURCE_STAT_KEYS = ["money", "time", "speed", "effort"] as const
  const [headlineIndex, setHeadlineIndex] = useState(0)
  const HEADLINES = HEADLINE_KEYS.map((key) => t(`useCases.${key}.headline`))

  // Auto-rotate headlines. Slower cadence (4.5s) than a typical marquee
  // so each line gets a confident dwell — premium pacing reads as
  // intentional, not jittery.
  useEffect(() => {
    const interval = setInterval(() => {
      setHeadlineIndex((prev) => (prev + 1) % HEADLINES.length)
    }, 4500)
    return () => clearInterval(interval)
  }, [HEADLINES.length])

  // Preload/decode thumbnails on mount — Safari defers lazy decode inside
  // transformed parents and dumps the work mid-scroll, causing visible stutter.
  useEffect(() => {
    VIDEO_IDS.forEach((id) => {
      const img = new window.Image()
      img.decoding = "async"
      img.src = `https://img.youtube.com/vi/${id}/hqdefault.jpg`
    })
  }, [])

  // Pre-compute tile layout
  const tiles = useMemo(() => {
    return Array.from({ length: cols * rows }, (_, i) => {
      const col = i % cols
      const row = Math.floor(i / cols)
      const videoIdx =
        (col + ROW_OFFSETS[row % ROW_OFFSETS.length]) % VIDEO_IDS.length
      return {
        videoId: VIDEO_IDS[videoIdx],
        isCenter: col === centerCol && row === centerRow,
      }
    })
  }, [cols, rows, centerCol, centerRow])

  // ─── Scroll-driven animation via continuous rAF loop ───
  // We run a rAF loop instead of `scroll` events because Safari coalesces
  // scroll events during momentum scroll and can even stop updating
  // window.scrollY mid-gesture — which causes visible jumps.
  //
  // Performance note: we READ `window.scrollY` (cached by the browser, no
  // layout) and subtract a CACHED container offset. Previously this loop
  // called getBoundingClientRect() every frame, which forced a layout
  // recalc after each style write — a classic 60fps→30fps thrash on older
  // hardware. We recompute the cache only on resize.
  //
  // An IntersectionObserver pauses the loop while the hero is offscreen.
  useEffect(() => {
    const container = containerRef.current
    const grid = gridRef.current
    const overlay = overlayRef.current
    const vignette = vignetteRef.current
    const bottomFade = bottomFadeRef.current
    const scrollInd = scrollIndRef.current
    const bgLayer = bgLayerRef.current
    if (!container || !grid) return

    // Cache external DOM lookups once — avoids getElementById per frame
    const header = document.getElementById("landing-header-wrap")
    const beamsEl = document.getElementById("beams-bg")
    const crossfade = document.getElementById("hero-crossfade")

    // Cached geometry — recomputed only on resize / ResizeObserver fire.
    // Measured via getBoundingClientRect ONCE, outside the rAF loop.
    let containerTop = 0
    let scrollable = 0
    const measure = () => {
      const r = container.getBoundingClientRect()
      containerTop = r.top + window.scrollY
      scrollable = container.offsetHeight - window.innerHeight
    }
    measure()

    const maxScale = cols
    let rafId = 0
    let isActive = true
    let lastP = -1
    const EPS = 0.0005

    // Track discrete states to avoid redundant DOM writes that thrash layers
    let gridHidden = false
    let overlayHidden = false
    let headerDisabled = false

    const update = () => {
      if (!isActive) {
        rafId = 0
        return
      }
      rafId = requestAnimationFrame(update)

      if (scrollable <= 0) return

      // window.scrollY is cached by the browser — reading it does not force
      // layout, unlike getBoundingClientRect() after style writes.
      const scrolled = Math.max(0, window.scrollY - containerTop)
      const p = Math.min(1, scrolled / scrollable) // linear 0 → 1

      // Skip DOM writes when progress is unchanged — Safari still invalidates
      // composited layers on no-op writes, which contributes to flicker.
      if (Math.abs(p - lastP) < EPS) return
      lastP = p

      // ── Phase 1: Zoom-out (first 65% of scroll) ──
      const zoomP = Math.min(1, p / 0.65)
      const zoomEased = 1 - Math.pow(1 - zoomP, 3) // cubic ease-out
      const minScale = 1.5
      const currentScale = +(maxScale - zoomEased * (maxScale - minScale)).toFixed(3)

      // ── Phase 2: Dissolve (last 35%) ──
      // Use the full remaining scroll range (0.65→1.0) so the grid dissolve
      // ends exactly when the next section enters — no blank gap.
      const dissolveP = Math.min(1, Math.max(0, (p - 0.65) / 0.35))
      const dissolveEased = Math.min(1, dissolveP * dissolveP * 1.1)

      const gridOpacity = 1 - dissolveEased
      grid.style.transform = `translate3d(0,0,0) scale3d(${currentScale}, ${currentScale}, 1)`
      grid.style.setProperty("--tile-opacity", String(Math.min(1, p * 3.3)))
      grid.style.opacity = String(gridOpacity)
      const shouldHideGrid = gridOpacity < 0.005
      if (shouldHideGrid !== gridHidden) {
        grid.style.visibility = shouldHideGrid ? "hidden" : "visible"
        gridHidden = shouldHideGrid
      }

      if (overlay) {
        const s = +(currentScale / maxScale).toFixed(3)
        const overlayOpacity = 1 - dissolveEased
        overlay.style.transform = `translate3d(0,0,0) scale3d(${s},${s},1)`
        overlay.style.opacity = String(overlayOpacity)
        const shouldHideOverlay = overlayOpacity < 0.005
        if (shouldHideOverlay !== overlayHidden) {
          overlay.style.visibility = shouldHideOverlay ? "hidden" : "visible"
          overlayHidden = shouldHideOverlay
        }
      }

      if (scrollInd) {
        scrollInd.style.opacity = String(Math.max(0, 1 - p * 8))
      }

      if (vignette) {
        const vignetteIn = Math.min(1, p * 4)
        const vignetteOut = Math.max(0, 1 - zoomEased * 1.4)
        vignette.style.opacity = String(vignetteIn * vignetteOut)
      }

      if (bottomFade) {
        const base = Math.max(0, Math.min(1, zoomEased * 2 - 0.5))
        bottomFade.style.opacity = String(base * (1 - dissolveEased))
      }

      const uiFadeOut = Math.min(1, p * 10)
      const uiFadeIn = dissolveP * dissolveP
      const uiOpacity = String(Math.max(0, Math.min(1, 1 - uiFadeOut + uiFadeOut * uiFadeIn)))

      if (header) {
        header.style.opacity = uiOpacity
        const shouldDisable = parseFloat(uiOpacity) < 0.5
        if (shouldDisable !== headerDisabled) {
          header.style.pointerEvents = shouldDisable ? "none" : ""
          headerDisabled = shouldDisable
        }
      }

      const beamsFadeOut = Math.min(1, p * 4)
      const beamsFadeIn = dissolveP
      const beamsOpacity = String(Math.max(0, Math.min(1, 1 - beamsFadeOut + beamsFadeOut * beamsFadeIn)))
      if (beamsEl) {
        beamsEl.style.opacity = beamsOpacity
      }

      // Separate composited background layer — avoids repainting the sticky
      // element itself (which on Safari causes the sticky+transform jitter bug).
      // Fades in early (p 0.01→0.05) and holds during zoom/dissolve, then
      // fades OUT near the end (p 0.93→1.0) so the hero becomes transparent
      // and the beams + content below show through — no black gap.
      if (bgLayer) {
        const bgIn = Math.min(1, Math.max(0, (p - 0.01) * 25))
        const bgOut = Math.min(1, Math.max(0, (1 - p) / 0.07))
        bgLayer.style.opacity = String(Math.min(bgIn, bgOut))
      }

      // Cross-fade: content section fades IN as the hero grid fades OUT.
      // Uses the second half of the dissolve so the grid is already mostly
      // gone before content appears — avoids a messy double-exposure.
      if (crossfade) {
        const contentOpacity = Math.max(0, Math.min(1, dissolveEased * 2 - 1))
        crossfade.style.opacity = String(contentOpacity)
        crossfade.style.pointerEvents = contentOpacity > 0.3 ? "" : "none"
      }
    }

    // Mobile-safety net — the gradual rAF-driven fade can be interrupted
    // by Safari's momentum-scroll rAF throttling: if the user flicks past
    // the entire 250vh hero in one inertial gesture, the IntersectionObserver
    // fires "non-intersecting" before any rAF frame has a chance to set
    // crossfade opacity to 1, leaving the rest of the page stuck invisible.
    // This helper forces the final post-hero visible state on the persistent
    // outside-the-hero elements that the rAF loop drives. We deliberately
    // DON'T touch hero-internal layers (overlay/grid/vignette/bottomFade/
    // bgLayer) — the main content's z-1 + marginTop:-100vh covers the hero
    // when scrolled past, and the rAF's discrete-state cache (overlayHidden,
    // gridHidden) would go stale if we wrote to those directly here.
    const forcePostHeroState = () => {
      if (crossfade) {
        if (crossfade.style.opacity !== "1") crossfade.style.opacity = "1"
        if (crossfade.style.pointerEvents !== "") crossfade.style.pointerEvents = ""
      }
      if (header) {
        header.style.opacity = "1"
        header.style.pointerEvents = ""
      }
      if (beamsEl) beamsEl.style.opacity = "1"
    }

    const isPastHero = () => scrollable > 0 && window.scrollY > containerTop + scrollable

    const io = new IntersectionObserver(
      (entries) => {
        const nowActive = entries[0]?.isIntersecting ?? true
        if (nowActive && !isActive) {
          isActive = true
          lastP = -1
          if (!rafId) rafId = requestAnimationFrame(update)
        } else if (!nowActive && isActive) {
          isActive = false
          // Lock the post-hero state explicitly — the rAF loop won't run
          // again until the user scrolls back into the hero.
          if (isPastHero()) forcePostHeroState()
        }
      },
      { rootMargin: "200px 0px" }
    )
    io.observe(container)

    // Re-measure on viewport changes. ResizeObserver covers content-driven
    // size changes (font-load reflows, image decodes); the resize event
    // covers viewport-driven changes that ResizeObserver misses.
    const ro = new ResizeObserver(measure)
    ro.observe(container)
    const onResize = () => measure()
    window.addEventListener("resize", onResize, { passive: true })

    // ── iOS visibility safety: crossfade is scroll-driven, not rAF-driven ──
    // The visual hero choreography (zoom, dissolve, vignette, etc.) runs on
    // rAF for smoothness. But on iOS Safari, rAF is throttled — sometimes
    // paused entirely — during momentum scroll, which left the entire page
    // BELOW the hero stuck at opacity 0 / pointer-events:none for users who
    // scrolled in one big flick. The IntersectionObserver+isPastHero safety
    // net only covered the "fully past hero" case; users who landed in the
    // dissolve zone (65–100% of hero) saw an invisible page.
    //
    // Scroll events on iOS are coalesced during momentum but always fire
    // again once momentum ends — and they fire reliably during slow user
    // scrolls. So we compute crossfade opacity directly from scrollY here
    // on every scroll event (and once on mount), independent of rAF. If
    // rAF runs, great — both paths converge to the same opacity. If rAF
    // is throttled, scroll events alone keep the page visible.
    const computeCrossfadeOpacity = () => {
      if (scrollable <= 0) return 1
      const scrolled = Math.max(0, window.scrollY - containerTop)
      const p = Math.min(1, scrolled / scrollable)
      // Same dissolve curve as the rAF path so visuals match exactly.
      const dissolveP = Math.min(1, Math.max(0, (p - 0.65) / 0.35))
      const dissolveEased = Math.min(1, dissolveP * dissolveP * 1.1)
      return Math.max(0, Math.min(1, dissolveEased * 2 - 1))
    }
    const syncCrossfade = () => {
      if (!crossfade) return
      // Past-hero short-circuit covers the "user scrolled fully past in one
      // gesture" case — same as forcePostHeroState's intent but cheaper.
      if (isPastHero()) {
        if (crossfade.style.opacity !== "1") crossfade.style.opacity = "1"
        if (crossfade.style.pointerEvents !== "") crossfade.style.pointerEvents = ""
        return
      }
      const target = computeCrossfadeOpacity()
      // Only write when materially different — Safari invalidates composited
      // layers on no-op writes, which contributes to flicker.
      const current = parseFloat(crossfade.style.opacity || "0")
      if (Math.abs(target - current) > 0.005) {
        crossfade.style.opacity = String(target)
      }
      const wantsPointer = target > 0.3
      const hasPointer = crossfade.style.pointerEvents !== "none"
      if (wantsPointer !== hasPointer) {
        crossfade.style.pointerEvents = wantsPointer ? "" : "none"
      }
    }

    const onScroll = () => {
      // Full safety net (header / beams / crossfade) when past hero,
      // progressive crossfade sync otherwise. Both are O(1) and idempotent.
      if (isPastHero() && crossfade && crossfade.style.opacity !== "1") {
        forcePostHeroState()
      } else {
        syncCrossfade()
      }
    }
    window.addEventListener("scroll", onScroll, { passive: true })

    // Initial sync — covers (a) deep links / back-button restore past the
    // hero, and (b) the case where rAF takes a frame or two to start and
    // the user has already scrolled into the dissolve zone before then.
    if (isPastHero()) {
      forcePostHeroState()
    } else {
      syncCrossfade()
    }

    // Hard fail-safe: if the user has scrolled at all but the crossfade is
    // still effectively invisible after 1.5s, force it visible. This catches
    // the worst-case iOS scenario where rAF is paused, scroll events were
    // coalesced into nothing, AND IntersectionObserver hasn't fired. Better
    // to drop the cinematic intro than to ship an invisible page.
    const failSafeTimer = window.setTimeout(() => {
      if (!crossfade) return
      const past50 = scrollable > 0 && window.scrollY > containerTop + scrollable * 0.5
      const stillHidden = parseFloat(crossfade.style.opacity || "0") < 0.5
      if (past50 && stillHidden) {
        crossfade.style.opacity = "1"
        crossfade.style.pointerEvents = ""
      }
    }, 1500)

    rafId = requestAnimationFrame(update)

    return () => {
      isActive = false
      if (rafId) cancelAnimationFrame(rafId)
      window.clearTimeout(failSafeTimer)
      io.disconnect()
      ro.disconnect()
      window.removeEventListener("resize", onResize)
      window.removeEventListener("scroll", onScroll)
      // Use cached refs — no getElementById in cleanup
      if (header) { header.style.opacity = "1"; header.style.pointerEvents = "" }
      if (beamsEl) beamsEl.style.opacity = "1"
      if (crossfade) { crossfade.style.opacity = "1"; crossfade.style.pointerEvents = "" }
    }
  }, [cols])

  return (
    <section
      id="hero"
      ref={containerRef}
      style={{ height: "250vh" }}
      className="relative"
    >
      <div
        ref={stickyRef}
        className="sticky top-0 h-screen overflow-hidden flex items-center justify-center"
        style={{
          // Promote the sticky element to its own compositor layer.
          // Works around a WebKit bug where child transforms cause the sticky
          // element to jitter by a few pixels during scroll.
          willChange: "transform",
          transform: "translateZ(0)",
        }}
      >
        {/* ─── Background fader (separate layer — avoids repainting sticky) ─── */}
        <div
          ref={bgLayerRef}
          className="absolute inset-0 bg-background pointer-events-none"
          style={{ opacity: 0.001, zIndex: 0, willChange: "opacity", transform: "translateZ(0)" }}
          aria-hidden="true"
        />
        {/* ─── Video tile grid ─── */}
        <div
          ref={gridRef}
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${cols}, 1fr)`,
            gap,
            // Ensure center tile fills viewport on ALL aspect ratios:
            // - 110vw covers width (with buffer for inter-tile gaps)
            // - 200vh * 9/16 = 112.5vh covers height on tall screens (MacBooks, iPads, phones)
            width: "max(110vw, 200vh)",
            transform: `scale3d(${cols}, ${cols}, 1)`,
            transformOrigin: "center center",
            willChange: "transform, opacity",
          }}
        >
          {tiles.map((tile, i) => (
            <div
              key={i}
              className={cn(
                "relative overflow-hidden aspect-video rounded-[2px]",
                tile.isCenter ? "bg-transparent" : "bg-neutral-900"
              )}
              style={
                tile.isCenter
                  ? undefined
                  : ({
                      opacity: "var(--tile-opacity, 0)",
                    } as React.CSSProperties)
              }
            >
              {!tile.isCenter && (
                <>
                  <NextImage
                    src={`https://img.youtube.com/vi/${tile.videoId}/hqdefault.jpg`}
                    alt=""
                    fill
                    // Tiles are tiny once the grid zooms out — pin sizes to
                    // ~12vw so Next/Image picks the smallest variant. Six
                    // unique URLs across 77 tiles → only 6 actual fetches.
                    sizes="(max-width: 768px) 12vw, 10vw"
                    draggable={false}
                    unoptimized
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-black/15 dark:bg-black/25" />
                </>
              )}
            </div>
          ))}
        </div>

        {/* ─── Vignette: page bg bleeds in from edges ─── */}
        {/* Uses a radial-gradient background instead of mask-image because
            Safari re-rasterizes masks on every opacity change, causing flicker. */}
        <div
          ref={vignetteRef}
          className="absolute inset-0 pointer-events-none z-[5]"
          style={{
            background:
              "radial-gradient(ellipse 55% 45% at 50% 50%, transparent 20%, var(--background) 75%)",
            willChange: "opacity",
            transform: "translateZ(0)",
          }}
        />

        {/* ─── Bottom gradient for transition to content ─── */}
        <div
          ref={bottomFadeRef}
          className="absolute bottom-0 left-0 right-0 h-40 pointer-events-none z-[6] bg-gradient-to-t from-background via-background/60 to-transparent"
          style={{ opacity: 0.001, willChange: "opacity", transform: "translateZ(0)" }}
        />

        {/* ─── Hero text — separate overlay, scales in sync with grid ─── */}
        <div
          ref={overlayRef}
          className={cn(
            "absolute inset-0 z-10 flex flex-col items-center justify-center pointer-events-none pt-20 pb-16"
          )}
          style={{
            transform: "translateZ(0)",
            willChange: "transform, opacity",
            transformOrigin: "center center",
          }}
        >
          <div
            className={cn(
              "pointer-events-auto text-center w-full",
              // Tighter editorial measure on desktop — keeps the headline
              // from sprawling and pulls the stats card into the same
              // optical column as the type.
              isMobile ? "px-5 max-w-[440px]" : "px-10 max-w-[820px]"
            )}
          >
            {/* Headline — tightened tracking + leading + text-balance for
                a more confident editorial wrap. Sized 0.25rem smaller per
                breakpoint than before so it reads as composed, not loud. */}
            <h1
              className={cn(
                "font-semibold tracking-[-0.045em] text-foreground text-balance",
                isMobile
                  ? "text-[1.65rem] leading-[1.08]"
                  : "text-[2.25rem] md:text-[2.75rem] lg:text-[3.25rem] leading-[1.04]"
              )}
            >
              {t("headline")}
            </h1>

            {/* Rotating subheadline — signature ease curve for a
                "confident settle" arrival; 0.6s duration breathes longer
                than the previous 0.5s. Tracking matched to the headline
                for typographic continuity. */}
            <div
              className={cn(
                "relative overflow-hidden",
                isMobile ? "mt-1 pb-1" : "mt-2.5 pb-2"
              )}
            >
              <span
                className={cn(
                  "invisible block font-medium tracking-[-0.035em]",
                  isMobile
                    ? "text-[1.2rem] leading-[1.28]"
                    : "text-[1.6rem] md:text-[1.85rem] lg:text-[2.05rem] leading-[1.28]"
                )}
                aria-hidden="true"
              >
                {HEADLINES.reduce(
                  (a, b) => (b.length > a.length ? b : a),
                  ""
                )}
              </span>
              <AnimatePresence mode="wait">
                <motion.span
                  key={headlineIndex}
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                  className={cn(
                    "absolute inset-x-0 top-0 font-medium tracking-[-0.035em] text-foreground/45 dark:text-white/50",
                    isMobile
                      ? "text-[1.2rem] leading-[1.28]"
                      : "text-[1.6rem] md:text-[1.85rem] lg:text-[2.05rem] leading-[1.28]"
                  )}
                >
                  {HEADLINES[headlineIndex]}
                </motion.span>
              </AnimatePresence>
            </div>

            {/* Description — tighter leading (1.55 vs relaxed 1.625), narrower
                measure on desktop for a true editorial line length. */}
            <p
              className={cn(
                "mx-auto text-foreground/55 dark:text-white/60",
                isMobile
                  ? "mt-3 text-[12.5px] leading-[1.5] max-w-[320px]"
                  : "mt-4 text-[15px] sm:text-[16px] leading-[1.55] max-w-[440px]"
              )}
            >
              {t("useCases.computerAgent.outcome")}
            </p>

            {/* ─── Resources saved — money / time / output / effort.
                A glass spec-strip mirroring the landing-header chrome
                vocabulary: low-opacity tinted panel, hairline border,
                backdrop blur, single signature top hairline. Tapered
                vertical hairlines between columns give the row the
                feel of an editorial spec sheet. A photographic light
                cone projects from the panel's bottom edge down through
                the rest of the hero — restrained ambient warmth, the
                glass plate's "shadow" cast as light. */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.4 }}
              transition={{ duration: 0.65, delay: 0.25, ease: [0.22, 1, 0.36, 1] }}
              className={cn(
                "relative mx-auto",
                isMobile ? "mt-7 max-w-[340px]" : "mt-9 max-w-[620px]",
              )}
              aria-label="Resources saved per workflow"
            >
              {/* ─── Light cone ───
                  A true cone of light projected downward from the
                  panel's TOP edge. Two masks compose to shape it:
                    • Outer mask (vertical linear-gradient) — opaque
                      at top (panel edge), dissolving to transparent
                      before the section's bottom.
                    • Inner mask (conic-gradient at top-center) — a
                      ~96° opaque angular sector (132°–228°) with
                      feathered 36° soft edges on each side. The
                      cone's apex is the origin point (a single
                      pixel) and its sides expand naturally with
                      distance — at full container height the cone
                      reaches past the page edges, so the visible
                      base lands exactly on the guide rails.
                  z-[-1] escapes to the overlay's stacking context
                  (overlay has z-10 + position:absolute = stacking
                  context) where it paints in the negative-z step —
                  before all static / auto-z descendants. So the
                  cone sits behind the CTAs and the panel while
                  still scaling and fading with the overlay's
                  scroll-driven transform. */}
              <div
                aria-hidden="true"
                className="pointer-events-none absolute top-0 left-1/2 z-[-1]"
                style={{
                  width: "100vw",
                  height: isMobile ? "min(78vh, 700px)" : "min(92vh, 1000px)",
                  transform: "translate3d(-50%, 0, 0)",
                  willChange: "opacity",
                  // Vertical fade — RADIAL gradient instead of linear.
                  //
                  // Why radial: linear-gradient masks with multiple stops
                  // produce visible horizontal "kinks" at every stop
                  // boundary because GPUs sample mask alpha at lower
                  // precision than colour channels. Even monotonic stops
                  // become visible faint horizontal lines. The previous
                  // 9-stop curve was bleeding banding artefacts.
                  //
                  // A radial gradient interpolates concentrically from a
                  // single point, so there are no horizontal sample lines
                  // at all — alpha varies smoothly with euclidean distance.
                  // We use a very-wide ellipse (250% × 70%) centred 42%
                  // down: the 250% width pushes horizontal influence well
                  // beyond the cone's own conic feather (so the radial
                  // acts as a vertical-only fade); the elliptical falloff
                  // produces a natural gaussian-like bell.
                  //
                  // Net effect: invisible at the panel edge → fades in
                  // smoothly through the upper body → peaks just above
                  // mid-cone → fades out cleanly to transparent at the
                  // bottom. No bands, no horizontal lines, no apex rule.
                  maskImage:
                    "radial-gradient(ellipse 250% 70% at 50% 42%, rgba(0,0,0,1) 0%, rgba(0,0,0,0.88) 30%, rgba(0,0,0,0.5) 60%, rgba(0,0,0,0.15) 88%, transparent 100%)",
                  WebkitMaskImage:
                    "radial-gradient(ellipse 250% 70% at 50% 42%, rgba(0,0,0,1) 0%, rgba(0,0,0,0.88) 30%, rgba(0,0,0,0.5) 60%, rgba(0,0,0,0.15) 88%, transparent 100%)",
                }}
              >
                <div
                  className="absolute inset-0"
                  style={{
                    // Conic mask — defines the cone shape.
                    //
                    // Reduced to ONE stop per feather edge so each side is
                    // a single transparent → opaque ramp. Multi-stop conic
                    // gradients exhibit the same banding the linear vertical
                    // mask did (visible inflection lines radiating from the
                    // apex). With only two stops bracketing the feather, the
                    // browser interpolates the alpha as one continuous ramp
                    // — no inflection, no visible angular bands.
                    //
                    // Geometry: opaque core at 150°-210° (60° flood centred
                    // straight-down), with 60° of linear feather on each
                    // side (90°→150° left, 210°→270° right). Total cone
                    // angular extent including feathers = 180°.
                    maskImage:
                      "conic-gradient(from 0deg at 50% 0%, transparent 90deg, rgba(0,0,0,1) 150deg, rgba(0,0,0,1) 210deg, transparent 270deg)",
                    WebkitMaskImage:
                      "conic-gradient(from 0deg at 50% 0%, transparent 90deg, rgba(0,0,0,1) 150deg, rgba(0,0,0,1) 210deg, transparent 270deg)",
                  }}
                >
                  <NextImage
                    src="/chris-stenger-fvJwchRL6xw-unsplash.jpg"
                    alt=""
                    fill
                    sizes="100vw"
                    priority
                    draggable={false}
                    className="object-cover object-top select-none opacity-[0.62] dark:opacity-[0.78] saturate-[1.32] dark:saturate-[1.28] contrast-[1.05]"
                  />
                  {/* Background-tone wash — kept minimal (4 stops) for
                      the same banding reason. The radial mask above
                      already does most of the cone-to-page integration;
                      this wash just nudges the bottom toward the page
                      background colour so the cone's tail dissolves
                      cleanly. color-mix(oklch) keeps mid-tones perceptually
                      even instead of muddying through grey. */}
                  <div
                    aria-hidden="true"
                    className="absolute inset-0"
                    style={{
                      background:
                        "linear-gradient(to bottom, transparent 0%, transparent 55%, color-mix(in oklch, var(--background) 35%, transparent) 80%, var(--background) 100%)",
                    }}
                  />
                </div>
              </div>

              {/* No panel chrome, no top rule — the cone of light
                  behind defines the moment, and the tapered cell
                  dividers carry all the structure the row needs.
                  Apple / Linear "no chrome" at its most literal. */}
              <div className="relative">
                <div
                  className={cn(
                    "relative grid",
                    // Mobile: 2x2 of glass pills with breathing-room gap.
                    // Desktop: 4-up no-chrome row, dividers carry the rhythm.
                    isMobile ? "grid-cols-2 gap-2.5" : "grid-cols-4",
                  )}
                >
                  {RESOURCE_STAT_KEYS.map((key, i) => {
                    // Tapered vertical divider — desktop ONLY. On mobile each
                    // cell gets the outlined-glass-pill treatment instead, so
                    // dividers between pills would be redundant chrome.
                    const hasLeftDivider = !isMobile && i > 0
                    return (
                      <div
                        key={key}
                        className={cn(
                          "relative",
                          // Mobile — outlined glass pill (same vocabulary as
                          // the book-a-demo CTA). A hairline ring at /20, a
                          // barely-tinted plate at /[0.03], and a 2px backdrop
                          // blur lift each stat off the cone behind it. Reads
                          // on any background — bright cone, dim tail, or the
                          // page bg as the hero un-sticks.
                          isMobile &&
                            "rounded-2xl border border-foreground/20 dark:border-white/20 bg-foreground/[0.03] dark:bg-white/[0.04] backdrop-blur-[2px]",
                          // Padding — denser on mobile inside each pill;
                          // generous breathing room desktop where space
                          // alone separates cells.
                          isMobile ? "px-3 py-5" : "px-4 py-8",
                          // Desktop divider — eased to a whisper: deep insets,
                          // low opacity so it reads as a hint of structure
                          // rather than a rule.
                          hasLeftDivider &&
                            "before:content-[''] before:absolute before:left-0 before:top-7 before:bottom-7 before:w-px before:bg-gradient-to-b before:from-transparent before:via-foreground/[0.09] dark:before:via-white/[0.11] before:to-transparent",
                        )}
                      >
                        <StatCell
                          isMobile={isMobile}
                          delay={0.4 + i * 0.07}
                          rawValue={t(`resourceStats.${key}.value`)}
                          label={t(`resourceStats.${key}.label`)}
                          sublabel={t(`resourceStats.${key}.sublabel`)}
                        />
                      </div>
                    )
                  })}
                </div>
              </div>
            </motion.div>

            {/* CTAs — primary keeps the solid foreground fill but adds a
                soft inset highlight + quiet shadow for depth, and dials
                the hover scale back to 1.015 (premium restraint over
                the previous 1.02). Secondary drops the x-translate
                gimmick — colour shift alone reads more confident. */}
            <div
              className={cn(
                "flex items-center justify-center",
                isMobile ? "mt-6 gap-3 flex-col" : "mt-7 gap-6"
              )}
            >
              <Link
                href="/auth"
                className={cn(
                  "inline-flex items-center gap-2 rounded-full font-medium cursor-pointer",
                  "bg-foreground text-background",
                  "shadow-[0_1px_0_0_rgba(255,255,255,0.10)_inset,0_8px_24px_-10px_rgba(0,0,0,0.30)]",
                  "dark:shadow-[0_1px_0_0_rgba(0,0,0,0.10)_inset,0_8px_24px_-10px_rgba(0,0,0,0.50)]",
                  "transition-[box-shadow,transform] duration-300",
                  "hover:scale-[1.015] active:scale-[0.985]",
                  isMobile
                    ? "px-6 py-3 text-sm"
                    : "px-7 py-3 text-[14.5px]"
                )}
              >
                {tc("tryCoastyFree")}
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
              <a
                href="https://cal.com/coasty/15min"
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  "inline-flex items-center gap-2 rounded-full font-medium cursor-pointer",
                  // Outlined glass pill — mirrors the primary's shape and
                  // size for visual rhythm but trades the solid fill for a
                  // hairline ring + barely-tinted glass plate. Reads on
                  // any background colour (white, dark, tinted) because:
                  //   • Border is foreground-tinted, so it darkens on light
                  //     backgrounds and lightens on dark ones.
                  //   • Background is foreground/[0.03] — invisible on
                  //     plain white but adds a soft glass plate over
                  //     coloured backgrounds, lifting the button off them.
                  //   • Text is at full foreground opacity so contrast is
                  //     guaranteed in both modes.
                  "border border-foreground/20 dark:border-white/20",
                  "text-foreground dark:text-white",
                  "bg-foreground/[0.03] dark:bg-white/[0.04]",
                  "backdrop-blur-[2px]",
                  "hover:bg-foreground/[0.07] hover:border-foreground/35",
                  "dark:hover:bg-white/[0.08] dark:hover:border-white/35",
                  "transition-[background,border-color,transform] duration-300",
                  "active:scale-[0.985]",
                  isMobile
                    ? "px-6 py-3 text-sm"
                    : "px-7 py-3 text-[14.5px]"
                )}
              >
                <Video className="h-3.5 w-3.5" />
                {tc("bookDemo")}
              </a>
            </div>
          </div>
        </div>

        {/* ─── Scroll indicator (independent, does not scale) ───
            Quieter than the previous treatment — mono caps with the same
            0.22em tracking the rest of the editorial system uses, a
            tighter 4px bounce, and a smaller chevron so the eye reads
            the cue without being pulled away from the headline. */}
        <div
          ref={scrollIndRef}
          className={cn(
            "absolute left-1/2 -translate-x-1/2 z-20 flex flex-col items-center gap-2 text-foreground/30 dark:text-white/30",
            isMobile ? "bottom-6" : "bottom-10"
          )}
        >
          <span
            className={cn(
              "font-mono text-[9px] uppercase",
              // Mirror the StatCell label scale so every editorial mono
              // strip on the hero shares the same tracking rhythm.
              isMobile ? "tracking-[0.18em]" : "tracking-[0.22em]"
            )}
          >
            Scroll
          </span>
          <motion.div
            animate={{ y: [0, 4, 0] }}
            transition={{
              duration: 2.2,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          >
            <ChevronDown className="h-3.5 w-3.5" strokeWidth={1.6} />
          </motion.div>
        </div>
      </div>
    </section>
  )
}
