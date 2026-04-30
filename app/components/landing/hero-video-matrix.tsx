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

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      whileInView={{ opacity: 1, y: 0 }}
      onViewportEnter={() => setInView(true)}
      viewport={{ once: true, amount: 0.45 }}
      transition={{ duration: 0.7, delay, ease: [0.22, 1, 0.36, 1] }}
      className="group relative flex flex-col items-center text-center"
    >
      {/* Number — confident weight at the same tonal register as the
          headline. Tabular numerals stop count-up jitter. */}
      <div
        className={cn(
          "font-semibold tabular-nums tracking-[-0.05em] leading-none",
          "text-foreground/95 dark:text-white/95",
          isMobile ? "text-[1.45rem]" : "text-[1.7rem] lg:text-[1.85rem]",
        )}
      >
        {display}
      </div>

      {/* Label — mono caps eyebrow. Wide tracking + low opacity is the
          codebase's editorial signature for metadata strips. */}
      <div
        className={cn(
          "font-mono uppercase leading-tight text-foreground/55 dark:text-white/55",
          isMobile
            ? "mt-2 text-[8.5px] tracking-[0.18em]"
            : "mt-2.5 text-[9px] tracking-[0.22em]",
        )}
      >
        {label}
      </div>

      {/* Sublabel — half-step quieter than the label so the hierarchy
          reads instantly. Same family for typographic continuity. */}
      {!isMobile && (
        <div className="mt-1 font-mono text-[8px] uppercase tracking-[0.16em] leading-tight text-foreground/35 dark:text-white/35">
          {sublabel}
        </div>
      )}
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
    const guides = document.getElementById("guide-lines-wrap")
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
      if (guides) {
        guides.style.opacity = uiOpacity
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
      if (guides) guides.style.opacity = "1"
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

    // Backup scroll listener — fires after Safari momentum scroll ends, even
    // when rAF was throttled during the gesture. Only does work when state
    // is wrong, so it costs nothing in the steady state.
    const onScroll = () => {
      if (isPastHero() && crossfade && crossfade.style.opacity !== "1") {
        forcePostHeroState()
      }
    }
    window.addEventListener("scroll", onScroll, { passive: true })

    // Initial state: if the page loaded with a saved scroll position past
    // the hero (back-button restore, refresh mid-page, deep link), force
    // the visible state immediately so the user sees content right away.
    if (isPastHero()) forcePostHeroState()

    rafId = requestAnimationFrame(update)

    return () => {
      isActive = false
      if (rafId) cancelAnimationFrame(rafId)
      io.disconnect()
      ro.disconnect()
      window.removeEventListener("resize", onResize)
      window.removeEventListener("scroll", onScroll)
      // Use cached refs — no getElementById in cleanup
      if (header) { header.style.opacity = "1"; header.style.pointerEvents = "" }
      if (guides) guides.style.opacity = "1"
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
                isMobile ? "mt-7 max-w-[320px]" : "mt-8 max-w-[560px]",
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
                  // Vertical fade — full opacity for longer so the
                  // cone holds visibility deep into the section
                  // before dissolving into the page background.
                  maskImage:
                    "linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,0.75) 40%, rgba(0,0,0,0.25) 80%, transparent 100%)",
                  WebkitMaskImage:
                    "linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,0.75) 40%, rgba(0,0,0,0.25) 80%, transparent 100%)",
                }}
              >
                <div
                  className="absolute inset-0"
                  style={{
                    // Conic mask — defines the cone shape.
                    // 0deg = up; clockwise. Opaque core at 145°-215°
                    // (a 70° flood of light around straight-down),
                    // feathered out to 110° and 250° (35° each soft
                    // edge). 140° total cone width — generous spread
                    // that reaches the page edges quickly.
                    maskImage:
                      "conic-gradient(from 0deg at 50% 0%, transparent 0deg, transparent 110deg, rgba(0,0,0,1) 145deg, rgba(0,0,0,1) 215deg, transparent 250deg, transparent 360deg)",
                    WebkitMaskImage:
                      "conic-gradient(from 0deg at 50% 0%, transparent 0deg, transparent 110deg, rgba(0,0,0,1) 145deg, rgba(0,0,0,1) 215deg, transparent 250deg, transparent 360deg)",
                  }}
                >
                  <NextImage
                    src="/lucas-calloch-P-yzuyWFEIk-unsplash.jpg"
                    alt=""
                    fill
                    sizes="100vw"
                    priority
                    draggable={false}
                    className="object-cover object-top select-none opacity-[0.45] dark:opacity-[0.58] saturate-[1.25]"
                  />
                  {/* Background-tone wash — eased back so the cone
                      keeps warmth through its body. Only the tail
                      and the top edge dissolve to background. */}
                  <div
                    aria-hidden="true"
                    className="absolute inset-0 bg-gradient-to-b from-background/5 via-background/20 to-background"
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
                    isMobile ? "grid-cols-2" : "grid-cols-4",
                  )}
                >
                  {RESOURCE_STAT_KEYS.map((key, i) => {
                    // Vertical divider on every cell except the first
                    // column. Rendered as a tapered gradient pseudo-
                    // element so it dissolves into the cone of light
                    // rather than meeting hard edges.
                    const hasLeftDivider = isMobile ? i % 2 === 1 : i > 0
                    // On mobile (2x2), bottom row also gets a tapered
                    // horizontal divider above it.
                    const hasTopDivider = isMobile && i >= 2
                    return (
                      <div
                        key={key}
                        className={cn(
                          "relative",
                          isMobile ? "px-2 py-4" : "px-3 py-6",
                          hasLeftDivider &&
                            "before:content-[''] before:absolute before:left-0 before:top-4 before:bottom-4 before:w-px before:bg-gradient-to-b before:from-transparent before:via-foreground/[0.14] dark:before:via-white/[0.16] before:to-transparent",
                          hasTopDivider &&
                            "after:content-[''] after:absolute after:top-0 after:left-4 after:right-4 after:h-px after:bg-gradient-to-r after:from-transparent after:via-foreground/[0.14] dark:after:via-white/[0.16] after:to-transparent",
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
                  "inline-flex items-center gap-1.5 font-medium cursor-pointer",
                  // Sits at the same /55 middle tier as the description
                  // so the eye groups them as one editorial pair.
                  "text-foreground/55 hover:text-foreground/85 dark:text-white/60 dark:hover:text-white/90 transition-all duration-300",
                  "active:scale-[0.985]",
                  isMobile ? "text-sm" : "text-[14.5px]"
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
