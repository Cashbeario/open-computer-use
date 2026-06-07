"use client"

/**
 * Download page — restyled into the landing page's design language.
 *
 * Same vocabulary as the landing / pricing: Geist Sans + Mono, strict
 * monochrome (no brand hue, no RainbowButton, no colored icons), hairline
 * dividers, glass-card chrome, the signature quint ease, and the gradient
 * "type from paper" hero headline (with the required descender pb fix).
 *
 * Nothing functional changed: platform + Mac-arch detection, the full-screen
 * splash, the post-download popup, every download button/link, the per-arch
 * Mac handling, system requirements, the features pills, the open-source row,
 * and every i18n key are preserved verbatim. This is a visual restyle only.
 */

import { WindowsIcon, AppleIcon } from "@/components/icons/platform-icons"
import {
  ArrowRight,
  ArrowUpRight,
  Download,
  Monitor,
  Globe,
  Terminal,
  FolderOpen,
  RefreshCw,
  Check,
  Loader2,
  ShieldAlert,
  Smartphone,
  Github,
  Code2,
  X,
} from "lucide-react"
import Link from "next/link"
import { useState, useEffect, useCallback } from "react"
import { trackDesktopAppDownloaded } from "@/lib/posthog/analytics"
import { cn } from "@/lib/utils"

import { LandingHeader } from "@/app/components/landing/landing-header"
import { LandingFooter } from "@/app/components/landing/landing-footer"
import { SectionDivider } from "@/app/components/landing/guide-lines"
import Image from "next/image"
import { motion, AnimatePresence } from "framer-motion"
import { useTranslations } from "next-intl"

const EASE = [0.22, 1, 0.36, 1] as const

// ─── Shared landing-language chrome ──────────────────────────────────────────

const GLASS_CARD =
  "group relative overflow-hidden rounded-2xl border border-foreground/10 bg-card/40 backdrop-blur-[2px] " +
  "transition-[border-color,box-shadow,transform] duration-500 " +
  "hover:border-foreground/20 hover:-translate-y-0.5 " +
  "hover:shadow-[0_1px_2px_rgba(0,0,0,0.04),0_18px_44px_-22px_rgba(0,0,0,0.18)] " +
  "dark:hover:shadow-[0_1px_2px_rgba(0,0,0,0.3),0_18px_44px_-22px_rgba(0,0,0,0.5)]"

const PRIMARY_PILL =
  "group inline-flex items-center justify-center gap-2 rounded-full font-medium bg-foreground text-background " +
  "shadow-[0_1px_0_0_rgba(255,255,255,0.08)_inset,0_6px_18px_-10px_rgba(0,0,0,0.22)] " +
  "dark:shadow-[0_1px_0_0_rgba(0,0,0,0.10)_inset,0_6px_18px_-10px_rgba(0,0,0,0.40)] " +
  "transition-[box-shadow,transform] duration-300 hover:scale-[1.012] active:scale-[0.985] " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background"

const OUTLINE_PILL =
  "group inline-flex items-center justify-center gap-2 rounded-full font-medium " +
  "border border-foreground/15 dark:border-white/15 text-foreground dark:text-white " +
  "bg-foreground/[0.025] dark:bg-white/[0.03] backdrop-blur-[2px] " +
  "hover:bg-foreground/[0.05] hover:border-foreground/25 dark:hover:bg-white/[0.06] dark:hover:border-white/25 " +
  "transition-[background,border-color,transform] duration-300 active:scale-[0.985] " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background"

// Top sheen hairline used on glass cards.
function TopSheen({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-foreground/15 to-transparent",
        className,
      )}
    />
  )
}

type Platform = "windows" | "mac"
type MacArch = "arm64" | "x64" | "unknown"

interface PlatformInfo {
  version: string
  filename: string
  sha512: string
  size: number
  releaseDate: string
  downloadUrl: string
}

interface DownloadData {
  windows: PlatformInfo | null
  mac: PlatformInfo | null
  macArm64: PlatformInfo | null
  macX64: PlatformInfo | null
}

const platformMeta: Record<
  Platform,
  {
    label: string
    icon: typeof WindowsIcon
    extension: string
    requirements: string[]
  }
> = {
  windows: {
    label: "Windows",
    icon: WindowsIcon,
    extension: ".exe",
    requirements: ["Windows 10 or later", "64-bit (x86_64)", "4 GB RAM minimum"],
  },
  mac: {
    label: "macOS",
    icon: AppleIcon,
    extension: ".dmg",
    requirements: [
      "macOS 11 (Big Sur) or later",
      "Apple Silicon (M1/M2/M3/M4) or Intel",
      "4 GB RAM minimum",
    ],
  },
}

const macArchMeta: Record<Exclude<MacArch, "unknown">, { label: string; sublabel: string }> = {
  arm64: { label: "Apple Silicon", sublabel: "M1, M2, M3, M4" },
  x64: { label: "Intel", sublabel: "2019 and earlier" },
}

function detectPlatform(): Platform {
  if (typeof navigator === "undefined") return "windows"
  const ua = navigator.userAgent.toLowerCase()
  if (ua.includes("mac")) return "mac"
  return "windows"
}

/**
 * Detect whether the user is on Apple Silicon vs Intel. Three signals,
 * tried in order:
 *
 *  1. ``navigator.userAgentData.getHighEntropyValues(['architecture'])``
 *     — Chromium-based browsers (Chrome / Edge / Brave / Arc). Returns
 *     ``arm`` for Apple Silicon and ``x86`` for Intel. The most reliable
 *     source where it's available.
 *
 *  2. WebGL ``UNMASKED_RENDERER_WEBGL`` fingerprint — Safari fallback.
 *     "Apple M1/M2/M3/M4" or "Apple GPU" maps to arm64; "Intel" / "AMD" /
 *     "Radeon" maps to x64. Some Safari versions restrict this string for
 *     privacy, in which case the call returns empty and we fall through.
 *
 *  3. Return ``unknown`` so the UI can present both options as equals
 *     rather than guess wrong. We never silently default to one arch —
 *     downloading the wrong .dmg is a worse UX than asking the user.
 */
async function detectMacArch(): Promise<MacArch> {
  if (typeof navigator === "undefined") return "unknown"

  const uad = (navigator as unknown as {
    userAgentData?: {
      getHighEntropyValues?: (hints: string[]) => Promise<{ architecture?: string }>
    }
  }).userAgentData
  if (uad?.getHighEntropyValues) {
    try {
      const v = await uad.getHighEntropyValues(["architecture"])
      if (v.architecture === "arm") return "arm64"
      if (v.architecture === "x86") return "x64"
    } catch {
      /* fall through */
    }
  }

  try {
    const canvas = document.createElement("canvas")
    const gl = (canvas.getContext("webgl") ??
      canvas.getContext("experimental-webgl")) as WebGLRenderingContext | null
    if (gl) {
      const ext = gl.getExtension("WEBGL_debug_renderer_info") as { UNMASKED_RENDERER_WEBGL: number } | null
      if (ext) {
        const raw = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)
        const renderer = String(raw ?? "").toLowerCase()
        if (/apple\s*(m\d|gpu)/.test(renderer)) return "arm64"
        if (/intel|radeon|amd/.test(renderer)) return "x64"
      }
    }
  } catch {
    /* fall through */
  }

  return "unknown"
}

function formatSize(bytes: number): string {
  if (!bytes) return ""
  const mb = bytes / (1024 * 1024)
  return `${mb.toFixed(1)} MB`
}

export default function DownloadPage() {
  const t = useTranslations("downloadPage")
  const [detectedPlatform, setDetectedPlatform] = useState<Platform>("windows")
  const [detectedMacArch, setDetectedMacArch] = useState<MacArch>("unknown")
  const [downloadData, setDownloadData] = useState<DownloadData | null>(null)
  const [loading, setLoading] = useState(true)
  const [showSplash, setShowSplash] = useState(true)
  const [postDownloadOpen, setPostDownloadOpen] = useState(false)

  const closeSplash = useCallback(() => setShowSplash(false), [])

  const GITHUB_RELEASES_URL = "https://github.com/coasty-ai/open-computer-use/releases/"
  const GITHUB_REPO_URL = "https://github.com/coasty-ai/open-computer-use"

  const handleDownloadClick = useCallback((platform: Platform) => {
    trackDesktopAppDownloaded(platform)
    setShowSplash(false)
    // Let the browser kick off the download before drawing attention away.
    window.setTimeout(() => setPostDownloadOpen(true), 700)
  }, [])

  useEffect(() => {
    const platform = detectPlatform()
    setDetectedPlatform(platform)
    if (platform === "mac") {
      // Fire-and-forget; the UI shows both arches until detection resolves.
      detectMacArch().then(setDetectedMacArch).catch(() => setDetectedMacArch("unknown"))
    }
  }, [])

  useEffect(() => {
    fetch(`/api/download?_=${Date.now()}`, { cache: "no-store" })
      .then((res) => {
        if (!res.ok) throw new Error(`API returned ${res.status}`)
        return res.json()
      })
      .then((data: DownloadData) => {
        setDownloadData(data)
      })
      .catch((err) => {
        console.error("Failed to fetch download data:", err)
      })
      .finally(() => setLoading(false))
  }, [])

  const version = downloadData?.windows?.version || downloadData?.mac?.version

  const allPlatforms: Platform[] = ["windows", "mac"]

  const features = [
    { icon: Globe, label: t("features.browser") },
    { icon: Monitor, label: t("features.desktop") },
    { icon: Terminal, label: t("features.terminal") },
    { icon: FolderOpen, label: t("features.files") },
    { icon: RefreshCw, label: t("features.updates") },
    { icon: Smartphone, label: t("features.remote") },
  ]

  /**
   * Pick the right .dmg for the user's Mac. Returns the detected arch as
   * primary + the other arch as secondary so the UI can offer a "wrong
   * chip? switch" affordance. When detection failed AND the manifest only
   * has one arch, secondary is null and the UI hides the switch.
   *
   * Backward compat: pre-per-arch releases only publish a single .dmg, so
   * `macArm64` / `macX64` are null and we fall through to the legacy `mac`
   * slot (which the API populates with the first DMG).
   */
  function pickMacDownload(arch: MacArch): {
    primary: PlatformInfo | null
    primaryArch: "arm64" | "x64"
    secondary: PlatformInfo | null
    secondaryArch: "arm64" | "x64"
    archDetected: boolean
  } {
    const arm64 = downloadData?.macArm64 ?? null
    const x64 = downloadData?.macX64 ?? null

    if (arch === "arm64" && arm64) {
      return { primary: arm64, primaryArch: "arm64", secondary: x64, secondaryArch: "x64", archDetected: true }
    }
    if (arch === "x64" && x64) {
      return { primary: x64, primaryArch: "x64", secondary: arm64, secondaryArch: "arm64", archDetected: true }
    }
    // Detection unknown OR detected arch not available — prefer arm64 as the
    // primary (vast majority of Macs sold since late 2020 are Apple Silicon).
    if (arm64) {
      return { primary: arm64, primaryArch: "arm64", secondary: x64, secondaryArch: "x64", archDetected: false }
    }
    if (x64) {
      return { primary: x64, primaryArch: "x64", secondary: arm64, secondaryArch: "arm64", archDetected: false }
    }
    // No per-arch DMGs at all — fall back to the legacy single-DMG slot.
    return {
      primary: downloadData?.mac ?? null,
      primaryArch: "arm64",
      secondary: null,
      secondaryArch: "x64",
      archDetected: false,
    }
  }

  /**
   * Monochrome download button (landing pill vocabulary). The recommended
   * platform uses the solid foreground pill; everything else uses the quiet
   * outline pill. Loading / unavailable states reuse the outline pill chrome.
   */
  function getDownloadButton(platform: Platform, variant: "hero" | "card") {
    const meta = platformMeta[platform]
    const data = downloadData?.[platform]
    const isRecommended = platform === detectedPlatform

    if (loading) {
      return variant === "hero" ? (
        <span className={cn(PRIMARY_PILL, "w-full px-7 py-3 text-[14.5px] opacity-70 sm:w-auto")} aria-busy>
          <Loader2 className="h-4 w-4 animate-spin" />
          {t("loading")}
        </span>
      ) : (
        <span className={cn(OUTLINE_PILL, "w-full px-5 py-2.5 text-[13px] opacity-70")} aria-busy>
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          {t("loading")}
        </span>
      )
    }

    if (data) {
      return variant === "hero" ? (
        <a
          href={data.downloadUrl}
          onClick={() => handleDownloadClick(platform)}
          className={cn(PRIMARY_PILL, "w-full px-7 py-3 text-[14.5px] sm:w-auto")}
        >
          <Download className="h-4 w-4" />
          {t("downloadFor", { platform: meta.label })}
        </a>
      ) : (
        <a
          href={data.downloadUrl}
          onClick={() => handleDownloadClick(platform)}
          className={cn(
            isRecommended ? PRIMARY_PILL : OUTLINE_PILL,
            "w-full px-5 py-2.5 text-[13px]",
          )}
        >
          <Download className="h-3.5 w-3.5" />
          {t("download")}
        </a>
      )
    }

    // Fallback — no data but loading finished
    return variant === "hero" ? (
      <span className={cn(PRIMARY_PILL, "w-full px-7 py-3 text-[14.5px] opacity-50 sm:w-auto")} aria-disabled>
        {t("unavailable")}
      </span>
    ) : (
      <span className={cn(OUTLINE_PILL, "w-full px-5 py-2.5 text-[13px] opacity-50")} aria-disabled>
        {t("unavailable")}
      </span>
    )
  }

  const macPick = pickMacDownload(detectedMacArch)
  const splashPlatform: PlatformInfo | null =
    detectedPlatform === "mac" ? macPick.primary : (downloadData?.windows ?? null)
  const splashPrimaryLabel =
    detectedPlatform === "mac"
      ? `macOS · ${macArchMeta[macPick.primaryArch].label}`
      : platformMeta[detectedPlatform].label

  return (
    <div className="relative min-h-screen overflow-x-clip bg-background text-foreground">
      {/* ─── Full-screen splash popup ─── */}
      <AnimatePresence>
        {showSplash && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35, ease: "easeOut" }}
            className="fixed inset-0 z-[60] overflow-hidden bg-background"
          >
            {/* Neutral ambient wash — a single quiet radial, no chroma. */}
            <div aria-hidden className="pointer-events-none absolute inset-0 z-[1]">
              <div
                className="absolute left-1/2 top-1/2 h-[140%] w-[140%] -translate-x-1/2 -translate-y-1/2"
                style={{
                  background:
                    "radial-gradient(ellipse at center, color-mix(in oklab, var(--foreground) 6%, transparent), transparent 70%)",
                }}
              />
            </div>

            {/* Close button */}
            <button
              type="button"
              onClick={closeSplash}
              className="fixed right-4 top-4 z-20 flex h-8 w-8 items-center justify-center rounded-full border border-foreground/10 bg-foreground/[0.04] text-foreground/50 backdrop-blur-sm transition-all duration-200 hover:border-foreground/20 hover:bg-foreground/[0.08] hover:text-foreground/80 sm:right-6 sm:top-6 sm:h-10 sm:w-10"
            >
              <X className="h-4 w-4 sm:h-5 sm:w-5" strokeWidth={1.5} />
            </button>

            {/* Content — always fits viewport, no scrolling */}
            <div className="relative z-10 flex h-full flex-col items-center justify-center px-5 py-14 sm:px-10 sm:py-10">
              <div className="flex w-full max-w-3xl flex-col items-center gap-5 sm:gap-6">
                {/* Demo screenshot — constrained to never overflow */}
                <motion.div
                  initial={{ opacity: 0, y: 24, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ duration: 0.6, delay: 0.15, ease: EASE }}
                  className="w-full"
                >
                  <div className="relative mx-auto max-h-[50vh] overflow-hidden rounded-lg border border-foreground/10 shadow-2xl shadow-black/30 sm:max-h-[55vh] sm:rounded-xl md:rounded-2xl">
                    <Image
                      src="/demo-screenshot.png"
                      alt="Coasty desktop app demo"
                      width={1456}
                      height={816}
                      className="h-full w-full object-cover object-top"
                      priority
                    />
                    {/* Subtle top-edge sheen */}
                    <TopSheen />
                  </div>
                </motion.div>

                {/* Text + Download */}
                <motion.div
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.35, ease: EASE }}
                  className="flex flex-col items-center gap-3 text-center sm:gap-4"
                >
                  <div>
                    <h2 className="text-lg font-semibold tracking-tight text-foreground sm:text-2xl md:text-3xl">
                      {t("heroTitle")}
                    </h2>
                    <p className="mx-auto mt-1 max-w-md text-[11px] leading-relaxed text-foreground/60 sm:mt-2 sm:text-sm md:text-base">
                      {t("heroDescription")}
                    </p>
                  </div>

                  <div className="flex w-full flex-col items-center gap-2 sm:w-auto sm:gap-3">
                    <div className="flex w-full flex-col items-center gap-2 sm:w-auto sm:flex-row sm:gap-3">
                      {splashPlatform ? (
                        <a
                          href={splashPlatform.downloadUrl}
                          onClick={() => handleDownloadClick(detectedPlatform)}
                          className={cn(PRIMARY_PILL, "w-full px-5 py-2.5 text-[13px] sm:w-auto sm:px-6 sm:text-sm")}
                        >
                          <Download className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                          {detectedPlatform === "mac"
                            ? `Download for ${splashPrimaryLabel}`
                            : t("downloadFor", { platform: splashPrimaryLabel })}
                        </a>
                      ) : loading ? (
                        <div className={cn(OUTLINE_PILL, "w-full px-5 py-2.5 text-[13px] opacity-70 sm:w-auto sm:px-6 sm:text-sm")}>
                          <Loader2 className="h-3.5 w-3.5 animate-spin sm:h-4 sm:w-4" />
                          {t("loading")}
                        </div>
                      ) : null}

                      <button
                        type="button"
                        onClick={closeSplash}
                        className="py-0.5 text-[11px] text-foreground/40 transition-colors duration-200 hover:text-foreground/70 sm:text-sm"
                      >
                        {t("browserCta")}
                      </button>
                    </div>

                    {/* Mac arch switch — visible whenever we have a "the other
                        chip" build to offer. When auto-detect succeeded, we
                        phrase it as "wrong chip?" (the primary is the user's
                        likely match). When detection failed we phrase it
                        neutrally so neither arch feels demoted. */}
                    {detectedPlatform === "mac" && macPick.secondary && (
                      <a
                        href={macPick.secondary.downloadUrl}
                        onClick={() => handleDownloadClick("mac")}
                        className="text-[10.5px] text-foreground/40 underline underline-offset-2 transition-colors hover:text-foreground/70 sm:text-xs"
                      >
                        {macPick.archDetected
                          ? `Using ${macArchMeta[macPick.secondaryArch].label}? Get the ${macArchMeta[macPick.secondaryArch].label} build`
                          : `Other Mac? Switch to ${macArchMeta[macPick.secondaryArch].label}`}
                      </a>
                    )}
                  </div>
                </motion.div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── Post-download popup ─── */}
      <AnimatePresence>
        {postDownloadOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[55] flex items-center justify-center overflow-y-auto bg-black/50 px-4 py-6 backdrop-blur-md"
            onClick={() => setPostDownloadOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, y: 14, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.98 }}
              transition={{ duration: 0.32, ease: EASE }}
              onClick={(e) => e.stopPropagation()}
              className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-foreground/10 bg-background shadow-2xl"
              role="dialog"
              aria-modal="true"
              aria-labelledby="post-download-title"
            >
              {/* Close */}
              <button
                type="button"
                onClick={() => setPostDownloadOpen(false)}
                className="absolute right-3 top-3 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-background/80 text-muted-foreground/80 backdrop-blur-sm transition-colors hover:bg-foreground/[0.06] hover:text-foreground"
                aria-label="Close"
              >
                <X className="h-3.5 w-3.5" strokeWidth={1.75} />
              </button>

              {/* Hero — demo screenshot */}
              <div className="relative aspect-[16/9] w-full overflow-hidden bg-muted/40">
                <Image
                  src="/demo-screenshot.png"
                  alt="Coasty desktop app"
                  width={1456}
                  height={816}
                  className="h-full w-full object-cover object-top"
                />
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-background via-background/30 to-transparent" />
                {/* Status pill — the one allowed chroma: a live emerald dot. */}
                <div className="absolute left-4 top-4">
                  <div className="inline-flex items-center gap-1.5 rounded-full border border-foreground/10 bg-background/80 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-foreground/70 backdrop-blur-md">
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500/60" />
                      <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    </span>
                    Download started
                  </div>
                </div>
              </div>

              {/* Body */}
              <div className="px-6 pb-6 pt-5 sm:px-7">
                <div className="inline-flex items-center gap-2.5 font-mono text-[10px] uppercase tracking-[0.22em] text-foreground/45">
                  <span className="h-px w-6 bg-foreground/15" aria-hidden />
                  Having trouble?
                </div>

                <h3
                  id="post-download-title"
                  className="mt-3 text-xl font-semibold leading-tight tracking-tight text-foreground sm:text-[22px]"
                >
                  Grab it from GitHub instead.
                </h3>

                <p className="mt-2.5 text-sm leading-relaxed text-muted-foreground">
                  Coasty Desktop is fully open source. If your installer didn{"'"}t download or you{"'"}d
                  rather audit before you run, every release is published on GitHub.
                </p>

                {/* Meta row */}
                <div className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-foreground/10 bg-foreground/[0.06] text-[11px]">
                  <div className="flex items-center gap-2 bg-card/60 px-3 py-2.5">
                    <Github className="h-3.5 w-3.5 text-foreground/45" />
                    <div className="flex flex-col leading-tight">
                      <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-foreground/45">
                        Repo
                      </span>
                      <span className="truncate font-mono text-foreground/90">coasty-ai/open-computer-use</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 bg-card/60 px-3 py-2.5">
                    <Code2 className="h-3.5 w-3.5 text-foreground/45" />
                    <div className="flex flex-col leading-tight">
                      <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-foreground/45">
                        License
                      </span>
                      <span className="text-foreground/90">Open source</span>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <button
                    type="button"
                    className="inline-flex items-center justify-center rounded-full px-4 py-2 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground"
                    onClick={() => setPostDownloadOpen(false)}
                  >
                    Got it
                  </button>
                  <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
                    <a
                      href={GITHUB_REPO_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={cn(OUTLINE_PILL, "px-5 py-2 text-[13px]")}
                    >
                      <Code2 className="h-3.5 w-3.5" />
                      View source
                    </a>
                    <a
                      href={GITHUB_RELEASES_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={cn(PRIMARY_PILL, "px-5 py-2 text-[13px]")}
                    >
                      <Github className="h-3.5 w-3.5" />
                      GitHub Releases
                      <ArrowUpRight className="h-3 w-3 opacity-70" />
                    </a>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <LandingHeader />

      <main className="relative">
        {/* ─── Hero ────────────────────────────────────────────────────────
            Gradient "type from paper" headline over a quiet neutral wash. The
            mono eyebrow carries the download keyword; the version chip sits
            below the subhead as a quiet mono pill. */}
        <section className="relative overflow-hidden px-5 pt-32 pb-8 sm:px-10 sm:pt-40 sm:pb-12">
          <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
            <div
              className="absolute left-1/2 top-0 h-[460px] w-[760px] max-w-[120vw] -translate-x-1/2"
              style={{
                background:
                  "radial-gradient(ellipse at center, color-mix(in oklab, var(--foreground) 5%, transparent), transparent 70%)",
              }}
            />
          </div>

          <div className="relative mx-auto max-w-3xl text-center">
            <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.02, ease: EASE }}
              className="font-mono text-[11px] uppercase tracking-[0.24em] text-foreground/45"
            >
              {t("title")}
            </motion.p>
            <motion.h1
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.95, delay: 0.08, ease: EASE }}
              className={cn(
                "mt-4 font-semibold tracking-[-0.045em] text-balance pb-1 sm:pb-2",
                "bg-clip-text text-transparent",
                "bg-gradient-to-b from-foreground to-foreground/85 dark:from-white dark:to-white/82",
                "text-[2.1rem] leading-[1.1] sm:text-5xl sm:leading-[1.08] lg:text-[3.25rem]",
              )}
            >
              {t("heroTitle")}
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.18, ease: EASE }}
              className="mx-auto mt-5 max-w-xl text-[15px] leading-[1.55] text-foreground/65 dark:text-white/65 sm:text-base"
            >
              {t("heroDescription")}
            </motion.p>
            {version && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7, delay: 0.26, ease: EASE }}
                className="mt-6 flex justify-center"
              >
                <span className="inline-flex items-center rounded-full border border-foreground/10 bg-foreground/[0.03] px-3 py-1 font-mono text-[11px] uppercase tracking-[0.18em] text-foreground/55">
                  v{version}
                </span>
              </motion.div>
            )}
          </div>
        </section>

        {/* ─── See it in action ─── */}
        <section className="px-5 pb-16 sm:px-10 sm:pb-24">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0, margin: "0px 0px -80px 0px" }}
            transition={{ duration: 0.6, ease: EASE }}
            className="mx-auto max-w-3xl"
          >
            <h2 className="text-center text-[22px] font-semibold tracking-tight text-foreground sm:text-2xl">
              {t("seeInAction")}
            </h2>
            <p className="mx-auto mt-3 max-w-md text-center text-sm text-muted-foreground">
              {t("overlayDescription")}
            </p>
            <div className="relative mt-8 overflow-hidden rounded-2xl border border-foreground/10 bg-card/40 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_24px_60px_-30px_rgba(0,0,0,0.25)] backdrop-blur-[2px] dark:shadow-[0_1px_2px_rgba(0,0,0,0.3),0_24px_60px_-30px_rgba(0,0,0,0.55)]">
              <TopSheen />
              <Image
                src="/demo-screenshot.png"
                alt="Coasty desktop app running on Windows and macOS"
                width={1456}
                height={816}
                className="h-auto w-full"
                priority
              />
            </div>
          </motion.div>
        </section>

        <SectionDivider />

        {/* ─── Recommended download ─── */}
        <section className="px-5 py-20 sm:px-10 sm:py-24">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0, margin: "0px 0px -80px 0px" }}
            transition={{ duration: 0.55, ease: EASE }}
            className="mx-auto max-w-lg"
          >
            {(() => {
              const meta = platformMeta[detectedPlatform]
              const Icon = meta.icon
              const isMac = detectedPlatform === "mac"
              // Mac: use the arch-aware primary (and offer a switch). Windows:
              // the existing single-file path.
              const heroPrimary: PlatformInfo | null = isMac
                ? macPick.primary
                : (downloadData?.windows ?? null)
              const heroTitle = isMac
                ? `Coasty for macOS · ${macArchMeta[macPick.primaryArch].label}`
                : t("coastyFor", { platform: meta.label })
              return (
                <div className={cn(GLASS_CARD, "p-6 sm:p-8")}>
                  <TopSheen className="inset-x-10" />
                  <div className="absolute left-1/2 top-4 -translate-x-1/2">
                    <span className="inline-flex items-center rounded-full border border-foreground/10 bg-foreground/[0.04] px-3 py-1 font-mono text-[10px] uppercase tracking-[0.2em] text-foreground/55">
                      {t("recommended")}
                    </span>
                  </div>
                  <div className="flex flex-col items-center gap-4 pt-6 text-center">
                    <div className="rounded-xl border border-foreground/10 bg-foreground/[0.04] p-3">
                      <Icon className="h-8 w-8 text-foreground/70" />
                    </div>
                    <div>
                      <h2 className="text-xl font-semibold tracking-tight text-foreground">{heroTitle}</h2>
                      {heroPrimary && (
                        <p className="mt-1 text-sm text-muted-foreground">
                          {t("installerLabel", { extension: meta.extension })}
                          {heroPrimary.size ? ` · ${formatSize(heroPrimary.size)}` : ""}
                          {isMac && (
                            <span className="text-muted-foreground/70">
                              {` · for ${macArchMeta[macPick.primaryArch].sublabel}`}
                            </span>
                          )}
                        </p>
                      )}
                    </div>
                    {isMac && heroPrimary ? (
                      <a
                        href={heroPrimary.downloadUrl}
                        onClick={() => handleDownloadClick("mac")}
                        className={cn(PRIMARY_PILL, "w-full px-7 py-3 text-[14.5px] sm:w-auto")}
                      >
                        <Download className="h-4 w-4" />
                        {`Download for ${macArchMeta[macPick.primaryArch].label}`}
                      </a>
                    ) : (
                      getDownloadButton(detectedPlatform, "hero")
                    )}

                    {/* Inline arch-switch link for the recommended hero — same
                        copy logic as the splash: phrasing depends on whether
                        we successfully auto-detected the user's chip. */}
                    {isMac && macPick.secondary && (
                      <a
                        href={macPick.secondary.downloadUrl}
                        onClick={() => handleDownloadClick("mac")}
                        className="text-xs text-muted-foreground underline underline-offset-2 transition-colors hover:text-foreground"
                      >
                        {macPick.archDetected
                          ? `Using ${macArchMeta[macPick.secondaryArch].label}? Get the ${macArchMeta[macPick.secondaryArch].label} build`
                          : `Other Mac? Switch to ${macArchMeta[macPick.secondaryArch].label}`}
                      </a>
                    )}
                  </div>
                </div>
              )
            })()}

            {/* Installation notice */}
            <div className={cn(GLASS_CARD, "mt-6 hover:translate-y-0")}>
              <div className="flex items-center gap-2 border-b border-foreground/10 bg-foreground/[0.02] px-4 py-3">
                <ShieldAlert className="h-4 w-4 text-foreground/45" />
                <p className="text-sm font-medium text-foreground">{t("beforeInstall")}</p>
              </div>
              <div className="space-y-3 px-4 py-3.5">
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {t("beforeInstallDescription")}
                </p>
                <div className="space-y-2.5">
                  <div className="flex gap-2.5">
                    <WindowsIcon className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-foreground/45" />
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      Windows SmartScreen will say{" "}
                      <span className="font-medium text-foreground">
                        {'"'}{t("windowsSteps.step1")}{'"'}
                      </span>
                      . Click{" "}
                      <span className="font-medium text-foreground">{t("windowsSteps.step2")}</span>
                      {" "}then{" "}
                      <span className="font-medium text-foreground">{t("windowsSteps.step3")}</span>.
                    </p>
                  </div>
                  <div className="flex gap-2.5">
                    <AppleIcon className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-foreground/45" />
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      macOS Gatekeeper will say{" "}
                      <span className="font-medium text-foreground">
                        {'"'}{t("macSteps.step1")}{'"'}
                      </span>
                      . Open{" "}
                      <span className="font-medium text-foreground">
                        {t("macSteps.step2")}
                      </span>
                      {" "}and click{" "}
                      <span className="font-medium text-foreground">{t("macSteps.step3")}</span>.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </section>

        <SectionDivider />

        {/* ─── All platforms ─── */}
        <section className="px-5 py-20 sm:px-10 sm:py-24">
          <div className="mx-auto max-w-3xl">
            <motion.h3
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0, margin: "0px 0px -80px 0px" }}
              transition={{ duration: 0.5, ease: EASE }}
              className="mb-8 text-center font-mono text-[11px] uppercase tracking-[0.24em] text-foreground/45"
            >
              {t("allPlatforms")}
            </motion.h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {allPlatforms.map((platform, i) => {
                const meta = platformMeta[platform]
                const Icon = meta.icon
                const isRecommended = platform === detectedPlatform
                const isMac = platform === "mac"
                // For Mac, show both arches as separate buttons inside the
                // single card so users don't have to guess which file to grab.
                // For Windows, keep the existing one-button card.
                const archArm = downloadData?.macArm64 ?? null
                const archX64 = downloadData?.macX64 ?? null
                const macHasBothArches = isMac && (archArm || archX64)
                return (
                  <motion.div
                    key={platform}
                    initial={{ opacity: 0, y: 16 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, amount: 0, margin: "0px 0px -80px 0px" }}
                    transition={{ duration: 0.5, ease: EASE, delay: i * 0.06 }}
                    className={cn(GLASS_CARD, "p-5")}
                  >
                    <TopSheen />
                    <div className="flex flex-col items-center gap-3 text-center">
                      <Icon className="h-6 w-6 text-foreground/55 transition-colors duration-300 group-hover:text-foreground/80" />
                      <div>
                        <p className="font-medium text-foreground">{meta.label}</p>
                        <p className="text-xs text-muted-foreground">
                          {meta.extension}
                          {!isMac && downloadData?.[platform]?.size
                            ? ` · ${formatSize(downloadData![platform]!.size)}`
                            : ""}
                        </p>
                      </div>
                      {macHasBothArches ? (
                        <div className="flex w-full flex-col gap-2">
                          {/* Apple Silicon — listed first because most new
                              Macs sold since late 2020 are M-series. */}
                          {archArm ? (
                            <a
                              href={archArm.downloadUrl}
                              onClick={() => handleDownloadClick("mac")}
                              className={cn(
                                isRecommended && (detectedMacArch === "arm64" || detectedMacArch === "unknown")
                                  ? PRIMARY_PILL
                                  : OUTLINE_PILL,
                                "w-full px-5 py-2.5 text-[13px]",
                              )}
                            >
                              <Download className="h-3.5 w-3.5" />
                              {macArchMeta.arm64.label}
                              {archArm.size ? (
                                <span className="text-[10px] opacity-60">{formatSize(archArm.size)}</span>
                              ) : null}
                            </a>
                          ) : null}
                          {archX64 ? (
                            <a
                              href={archX64.downloadUrl}
                              onClick={() => handleDownloadClick("mac")}
                              className={cn(
                                isRecommended && detectedMacArch === "x64" ? PRIMARY_PILL : OUTLINE_PILL,
                                "w-full px-5 py-2.5 text-[13px]",
                              )}
                            >
                              <Download className="h-3.5 w-3.5" />
                              {macArchMeta.x64.label}
                              {archX64.size ? (
                                <span className="text-[10px] opacity-60">{formatSize(archX64.size)}</span>
                              ) : null}
                            </a>
                          ) : null}
                          <p className="text-[10px] leading-snug text-muted-foreground/70">
                            Not sure? Click  → About This Mac to see your chip.
                          </p>
                        </div>
                      ) : (
                        getDownloadButton(platform, "card")
                      )}
                    </div>
                  </motion.div>
                )
              })}
            </div>
          </div>
        </section>

        <SectionDivider />

        {/* ─── System requirements ─── */}
        <section className="px-5 py-20 sm:px-10 sm:py-24">
          <div className="mx-auto max-w-3xl">
            <motion.h3
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0, margin: "0px 0px -80px 0px" }}
              transition={{ duration: 0.5, ease: EASE }}
              className="mb-10 text-center text-[28px] font-semibold leading-[1.1] tracking-tight text-foreground sm:mb-14 sm:text-4xl"
            >
              {t("systemRequirements.title")}
            </motion.h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {allPlatforms.map((platform, i) => {
                const meta = platformMeta[platform]
                const Icon = meta.icon
                return (
                  <motion.div
                    key={platform}
                    initial={{ opacity: 0, y: 16 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, amount: 0, margin: "0px 0px -80px 0px" }}
                    transition={{ duration: 0.5, ease: EASE, delay: i * 0.06 }}
                    className={cn(GLASS_CARD, "p-5")}
                  >
                    <TopSheen />
                    <div className="mb-3 flex items-center gap-2">
                      <Icon className="h-4 w-4 text-foreground/55" />
                      <p className="text-sm font-medium text-foreground">{meta.label}</p>
                    </div>
                    <ul className="space-y-1.5">
                      {meta.requirements.map((req) => (
                        <li key={req} className="flex items-start gap-2 text-xs text-muted-foreground">
                          <Check className="mt-0.5 h-3 w-3 flex-shrink-0 text-foreground/45" strokeWidth={2.2} />
                          {req}
                        </li>
                      ))}
                    </ul>
                  </motion.div>
                )
              })}
            </div>
          </div>
        </section>

        <SectionDivider />

        {/* ─── What's included ─── */}
        <section className="px-5 py-20 sm:px-10 sm:py-24">
          <div className="mx-auto max-w-xl">
            <motion.h3
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0, margin: "0px 0px -80px 0px" }}
              transition={{ duration: 0.5, ease: EASE }}
              className="mb-10 text-center text-[28px] font-semibold leading-[1.1] tracking-tight text-foreground sm:text-4xl"
            >
              {t("whatsIncluded")}
            </motion.h3>
            <div className="flex flex-wrap justify-center gap-3">
              {features.map((f, i) => (
                <motion.div
                  key={f.label}
                  initial={{ opacity: 0, y: 12 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0, margin: "0px 0px -80px 0px" }}
                  transition={{ duration: 0.45, ease: EASE, delay: i * 0.05 }}
                  className="group inline-flex items-center gap-2 rounded-full border border-foreground/10 bg-card/40 px-4 py-2 backdrop-blur-[2px] transition-colors duration-300 hover:border-foreground/20"
                >
                  <f.icon className="h-4 w-4 text-foreground/45 transition-colors duration-300 group-hover:text-foreground/70" />
                  <span className="text-sm text-foreground/85">{f.label}</span>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        <SectionDivider />

        {/* ─── Open source ─── */}
        <section className="px-5 py-20 sm:px-10 sm:py-24">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0, margin: "0px 0px -80px 0px" }}
            transition={{ duration: 0.6, ease: EASE }}
            className="mx-auto flex max-w-2xl flex-col items-center text-center"
          >
            <div className="inline-flex items-center gap-2.5 font-mono text-[11px] uppercase tracking-[0.24em] text-foreground/45">
              <span className="h-px w-7 bg-foreground/15" aria-hidden />
              Open Source
              <span className="h-px w-7 bg-foreground/15" aria-hidden />
            </div>
            <h3 className="mt-4 text-[28px] font-semibold leading-[1.1] tracking-tight text-foreground sm:text-4xl">
              Inspect every line.
            </h3>
            <p className="mt-4 max-w-md text-[15px] leading-[1.55] text-foreground/65 dark:text-white/65 sm:text-base">
              The desktop app is open source. Browse the code, file an issue, or grab installers
              directly from GitHub if the auto-download doesn{"'"}t work for you.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <a
                href={GITHUB_RELEASES_URL}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(OUTLINE_PILL, "px-6 py-2.5 text-[14px]")}
              >
                <Github className="h-3.5 w-3.5" />
                GitHub Releases
                <ArrowUpRight className="h-3 w-3 opacity-60" />
              </a>
              <a
                href={GITHUB_REPO_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="group inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-[14px] font-medium text-muted-foreground transition-colors duration-300 hover:text-foreground"
              >
                <Code2 className="h-3.5 w-3.5" />
                View Source
              </a>
            </div>
          </motion.div>
        </section>

        <SectionDivider />

        {/* ─── Final CTA ─── */}
        <section className="px-5 py-20 sm:px-10 sm:py-28">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0, margin: "0px 0px -80px 0px" }}
            transition={{ duration: 0.6, ease: EASE }}
            className="mx-auto max-w-2xl text-center"
          >
            <p className="mx-auto mb-6 max-w-md text-[15px] leading-[1.55] text-foreground/65 dark:text-white/65 sm:text-base">
              {t("browserCtaDescription")}
            </p>
            <Link href="/auth" className={cn(OUTLINE_PILL, "px-7 py-3 text-[14px]")}>
              {t("browserCta")}
              <ArrowRight className="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-0.5" />
            </Link>
          </motion.div>
        </section>
      </main>

      <LandingFooter />
    </div>
  )
}
