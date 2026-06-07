"use client"

/**
 * Results / demos gallery — rebuilt to share the landing page's design
 * language. Same vocabulary as the landing: Geist Sans + Mono, strict
 * monochrome (no brand hue, no colored icons), hairline dividers, glass-card
 * chrome, the signature quint ease, and the landing demo-card treatment.
 *
 * Every result/demo entry, video, session transcript, and link is preserved
 * verbatim from the previous version — this is a restyle, not a content edit.
 *
 * Note on motion + clickable cards: framer-motion gesture props
 * (whileTap/whileHover/drag) intercept the first pointerdown on touch to
 * disambiguate tap vs drag, which swallows a child Link/onClick on the first
 * tap. The entrance `motion.div` wrappers below use ONLY initial/whileInView/
 * transition (no gesture props), so the underlying clicks pass through — the
 * same pattern the canonical landing demo section uses.
 */

import { useState, useCallback, useEffect } from "react"
import Link from "next/link"
import Image from "next/image"
import { motion } from "framer-motion"
import { cn } from "@/lib/utils"
import { LandingHeader } from "@/app/components/landing/landing-header"
import { LandingFooter } from "@/app/components/landing/landing-footer"
import { LandingSectionHeader } from "@/app/components/landing/section-shell"
import { SectionDivider } from "@/app/components/landing/guide-lines"
import { ArrowRight, ArrowUpRight, Play } from "lucide-react"

const EASE = [0.22, 1, 0.36, 1] as const

const videos = [
  { label: "Marketing", task: "Market your product on Reddit autonomously", videoId: "icxgLDephHE" },
  { label: "Go-to-Market", task: "Find prospects and send them a personalized email", videoId: "qTvmGfg3HVw" },
  { label: "QA Testing", task: "Test every checkout flow and report bugs", videoId: "Wbo2o74hVIo" },
  { label: "Job Application", task: "Find roles, tailor your resume, and apply", videoId: "mH-csaCa508" },
  { label: "Form Filling", task: "Fill out the YC S26 application for you", videoId: "AnHJuRMLCnE" },
  { label: "Social Media", task: "Post on Hacker News and engage with comments", videoId: "A_OvNh51Npg" },
]

const sessions = [
  {
    title: "Coasty on Reddit",
    chatId: "373c1f67-afec-4bd6-adda-3809ecdbdd75",
    description: "Autonomously run a marketing campaign, researching competitors, analyzing trends, and building a strategy.",
    tag: "Marketing",
  },
  {
    title: "Finding Prospective Customers",
    chatId: "425d3c49-3a06-41e5-9859-aa00c5b12f3d",
    description: "Find and research prospective customers, gathering key details to craft personalized outreach.",
    tag: "Go-to-Market",
  },
  {
    title: "QA Testing Itself",
    chatId: "7ee3e942-c5dd-4e49-93b6-353bb5273b7e",
    description: "Run quality assurance on its own product, navigating flows, catching bugs, and reporting issues.",
    tag: "QA Testing",
  },
  {
    title: "Sending an Email",
    chatId: "60a0722b-fb98-43d6-a4e7-951d80a22363",
    description: "Draft and deliver an email entirely on its own, from composing to hitting send.",
    tag: "Communication",
  },
  {
    title: "Applying to a Job",
    chatId: "4ac6f3d2-c273-4a07-bf98-b986d1cbfb88",
    description: "Find a matching role, tailor your resume, and submit the application autonomously.",
    tag: "Job Application",
  },
  {
    title: "Posting on Hacker News",
    chatId: "d181de46-b41d-4b87-9648-0374b2b7ec1c",
    description: "Create and publish a blog post on Hacker News, writing the content and submitting it.",
    tag: "Social Media",
  },
]

function thumbUrl(id: string) {
  // 1280x720 — crisp on retina at all card sizes.
  return `https://img.youtube.com/vi/${id}/maxresdefault.jpg`
}

function VideoCard({
  videoId,
  label,
  task,
  featured = false,
}: {
  videoId: string
  label: string
  task: string
  featured?: boolean
}) {
  const [playing, setPlaying] = useState(false)
  const handlePlay = useCallback(() => setPlaying(true), [])

  return (
    <div
      className={cn(
        // Glass-card recipe — monochrome chrome, hairline border, hover lift.
        "group relative flex h-full flex-col overflow-hidden rounded-2xl border border-foreground/10 bg-card/40 backdrop-blur-[2px]",
        "transition-[border-color,box-shadow,transform] duration-500",
        "hover:border-foreground/20 hover:-translate-y-0.5",
        "hover:shadow-[0_1px_2px_rgba(0,0,0,0.04),0_18px_44px_-22px_rgba(0,0,0,0.18)]",
        "dark:hover:shadow-[0_1px_2px_rgba(0,0,0,0.3),0_18px_44px_-22px_rgba(0,0,0,0.5)]",
      )}
    >
      {/* Top sheen hairline */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-6 top-0 z-10 h-px bg-gradient-to-r from-transparent via-foreground/15 to-transparent"
      />

      {/* Browser chrome — featured only */}
      {featured && (
        <div className="flex items-center border-b border-foreground/10 bg-foreground/[0.02] px-4 py-2.5 dark:bg-white/[0.02]">
          <div className="flex items-center gap-[6px]">
            <div className="h-[10px] w-[10px] rounded-full bg-foreground/[0.10] dark:bg-white/[0.10]" />
            <div className="h-[10px] w-[10px] rounded-full bg-foreground/[0.10] dark:bg-white/[0.10]" />
            <div className="h-[10px] w-[10px] rounded-full bg-foreground/[0.10] dark:bg-white/[0.10]" />
          </div>
          <div className="flex flex-1 justify-center">
            <div className="flex max-w-[300px] items-center justify-center gap-1.5 rounded-md bg-foreground/[0.04] px-4 py-[3px] dark:bg-white/[0.04]">
              <svg width="10" height="10" viewBox="0 0 16 16" fill="none" className="shrink-0 text-foreground/30">
                <path d="M11.5 7V5a3.5 3.5 0 10-7 0v2M4 7h8a2 2 0 012 2v4a2 2 0 01-2 2H4a2 2 0 01-2-2V9a2 2 0 012-2z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="truncate select-none font-mono text-[11px] tracking-[0.04em] text-foreground/40">
                coasty.ai/{label.toLowerCase().replace(/[\s-]+/g, "-")}
              </span>
            </div>
          </div>
          <div className="w-[54px]" />
        </div>
      )}

      {/* Video area — uniform 16:9 */}
      <div className="relative aspect-video w-full overflow-hidden bg-neutral-950">
        {playing ? (
          <div className="absolute inset-0">
            <iframe
              className="h-full w-full"
              src={`https://www.youtube-nocookie.com/embed/${videoId}?rel=0&modestbranding=1&showinfo=0&autoplay=1`}
              title={`Coasty ${label} Demo`}
              allowFullScreen
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              style={{ border: "none" }}
            />
          </div>
        ) : (
          <button
            type="button"
            onClick={handlePlay}
            aria-label={`Play ${label} demo`}
            className="absolute inset-0 block cursor-pointer"
          >
            <Image
              src={thumbUrl(videoId)}
              alt={`${label} demo`}
              fill
              unoptimized
              className="object-cover transition-transform duration-[700ms] ease-out group-hover:scale-[1.025]"
              sizes={featured ? "(max-width: 768px) 100vw, 960px" : "(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"}
            />

            {/* Inset hairline border over the thumbnail */}
            <span className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-foreground/10" />

            {/* Edge vignette */}
            <span
              className="pointer-events-none absolute inset-0 transition-opacity duration-500"
              style={{
                background: "radial-gradient(ellipse at center, transparent 35%, rgba(0,0,0,0.40) 100%)",
              }}
            />

            {/* Play button — monochrome glass, with a pulsing ring */}
            <span className="absolute inset-0 flex items-center justify-center">
              <span className="relative inline-flex items-center justify-center">
                <span
                  className={cn(
                    "absolute rounded-full border border-foreground/40",
                    featured ? "h-[72px] w-[72px]" : "h-12 w-12",
                  )}
                  style={{ animation: "results-play-ring 1.8s ease-out infinite" }}
                />
                <span
                  className={cn(
                    "relative inline-flex items-center justify-center rounded-full bg-foreground/90 shadow-lg shadow-black/20 transition-transform duration-300 group-hover:scale-[1.04]",
                    featured ? "h-[72px] w-[72px]" : "h-12 w-12",
                  )}
                >
                  <Play
                    className={cn(
                      "translate-x-[1px] fill-background text-background",
                      featured ? "h-6 w-6" : "h-4 w-4",
                    )}
                  />
                </span>
              </span>
            </span>

            {/* Label badge — bottom left */}
            <span className={cn("absolute bottom-0 left-0", featured ? "p-4" : "p-2.5")}>
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border border-white/[0.12] bg-black/30 font-mono uppercase tracking-[0.14em] text-white/80 backdrop-blur-sm",
                  featured ? "px-2.5 py-1 text-[10px]" : "px-2 py-0.5 text-[9px]",
                )}
              >
                <span className="h-1 w-1 rounded-full bg-white/50" />
                {label}
              </span>
            </span>

            {/* Watch text — bottom right, featured only */}
            {featured && (
              <span className="absolute bottom-0 right-0 p-4">
                <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-white/45 transition-colors duration-300 group-hover:text-white/70">
                  Watch demo &rarr;
                </span>
              </span>
            )}
          </button>
        )}
      </div>

      {/* Caption */}
      <div className={cn("flex items-center justify-between", featured ? "px-5 py-4 sm:px-6 sm:py-5" : "px-4 py-3.5")}>
        <div className="min-w-0">
          {!featured && (
            <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-foreground/40">
              {label}
            </span>
          )}
          <p
            className={cn(
              "leading-snug text-foreground",
              featured ? "font-medium" : "mt-1 line-clamp-2 text-sm text-foreground/80",
            )}
          >
            {task}
          </p>
        </div>
        {featured && (
          <span className="ml-4 hidden shrink-0 font-mono text-[10px] uppercase tracking-[0.16em] text-foreground/40 sm:block">
            Featured
          </span>
        )}
      </div>
    </div>
  )
}

export default function ResultsPage() {
  const [isMobile, setIsMobile] = useState(false)
  const [featured, ...rest] = videos

  // Mirror the landing's mobile gate (<768px) for consistent entrance pacing.
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener("resize", check)
    return () => window.removeEventListener("resize", check)
  }, [])

  return (
    <div className="relative min-h-screen overflow-x-clip bg-background text-foreground">
      <LandingHeader />

      {/* Pulsing play-button ring — same motif as the landing demo cards. */}
      <style jsx global>{`
        @keyframes results-play-ring {
          0% {
            transform: scale(0.85);
            opacity: 0.7;
          }
          100% {
            transform: scale(1.55);
            opacity: 0;
          }
        }
      `}</style>

      <main className="relative">
        {/* ─── Hero ─────────────────────────────────────────────────────── */}
        <section className="relative overflow-hidden px-5 pt-32 pb-12 sm:px-10 sm:pt-40 sm:pb-16">
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
              transition={{ duration: 0.7, ease: EASE }}
              className="mb-5 font-mono text-[11px] uppercase tracking-[0.24em] text-foreground/45"
            >
              Demos
            </motion.p>
            <motion.h1
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.95, delay: 0.05, ease: EASE }}
              className={cn(
                "font-semibold tracking-[-0.045em] text-balance pb-1 sm:pb-2",
                "bg-clip-text text-transparent",
                "bg-gradient-to-b from-foreground to-foreground/85 dark:from-white dark:to-white/82",
                "text-[2.1rem] leading-[1.1] sm:text-5xl sm:leading-[1.08] lg:text-[3.25rem]",
              )}
            >
              Watch it work. Unscripted.
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.18, ease: EASE }}
              className="mx-auto mt-5 max-w-xl text-[15px] leading-[1.55] text-foreground/65 dark:text-white/65 sm:text-base"
            >
              Every session below is unscripted. Coasty was given a task and completed it autonomously. Browse, click, type, think.
            </motion.p>
          </div>
        </section>

        <SectionDivider />

        {/* ─── Featured demo ────────────────────────────────────────────── */}
        <section className="px-5 pt-16 sm:px-10 sm:pt-20">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0, margin: "0px 0px -80px 0px" }}
            transition={{ duration: 0.6, ease: EASE }}
            className="mx-auto max-w-5xl"
          >
            <VideoCard
              videoId={featured.videoId}
              label={featured.label}
              task={featured.task}
              featured
            />
          </motion.div>
        </section>

        {/* ─── Demo grid ────────────────────────────────────────────────── */}
        <section className="px-5 pt-5 pb-20 sm:px-10 sm:pb-24 lg:pb-28">
          <div className="mx-auto max-w-5xl">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3">
              {rest.map((v, i) => (
                <motion.div
                  key={v.videoId + v.label}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0, margin: "0px 0px -80px 0px" }}
                  transition={{ duration: 0.55, ease: EASE, delay: isMobile ? 0 : i * 0.06 }}
                >
                  <VideoCard videoId={v.videoId} label={v.label} task={v.task} />
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        <SectionDivider />

        {/* ─── Sessions / transcripts ───────────────────────────────────── */}
        <section className="px-5 py-20 sm:px-10 sm:py-24 lg:py-28">
          <div className="mx-auto max-w-5xl">
            <motion.p
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0, margin: "0px 0px -80px 0px" }}
              transition={{ duration: 0.6, ease: EASE }}
              className="mb-4 text-center font-mono text-[11px] uppercase tracking-[0.24em] text-foreground/45"
            >
              Agent Transcripts
            </motion.p>
            <LandingSectionHeader
              title="Full session logs"
              subtitle="Read every step the agent took. Every click, every decision, every result. Nothing hidden."
              isMobile={isMobile}
            />

            <ul className="border-t border-foreground/10" role="list">
              {sessions.map((s, i) => (
                <motion.li
                  key={s.chatId}
                  initial={{ opacity: 0, y: 12 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0, margin: "0px 0px -80px 0px" }}
                  transition={{ duration: 0.5, ease: EASE, delay: isMobile ? 0 : i * 0.06 }}
                  className="border-b border-foreground/10"
                >
                  <Link
                    href={`/share/${s.chatId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group flex items-start gap-4 py-5 transition-colors duration-300 sm:items-center sm:gap-6 sm:py-6"
                  >
                    {/* Number */}
                    <span className="w-8 shrink-0 pt-0.5 text-right font-mono text-2xl tabular-nums leading-none text-foreground/15 sm:w-10 sm:pt-0 sm:text-3xl">
                      {String(i + 1).padStart(2, "0")}
                    </span>

                    {/* Content */}
                    <div className="min-w-0 flex-1">
                      <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-foreground/40">
                        {s.tag}
                      </span>
                      <h3 className="mt-1 font-semibold tracking-tight text-foreground transition-colors duration-200 group-hover:text-foreground/70">
                        {s.title}
                      </h3>
                      <p className="mt-0.5 hidden text-sm leading-relaxed text-muted-foreground/70 sm:block">
                        {s.description}
                      </p>
                    </div>

                    {/* Arrow */}
                    <ArrowUpRight className="mt-1 h-4 w-4 shrink-0 text-foreground/20 transition-all duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-foreground/70 sm:mt-0" />
                  </Link>
                </motion.li>
              ))}
            </ul>
          </div>
        </section>

        <SectionDivider />

        {/* ─── Final CTA ────────────────────────────────────────────────── */}
        <section className="px-5 py-20 sm:px-10 sm:py-28">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0, margin: "0px 0px -80px 0px" }}
            transition={{ duration: 0.6, ease: EASE }}
            className="mx-auto max-w-2xl text-center"
          >
            <h2
              className={cn(
                "font-semibold tracking-[-0.03em] text-balance pb-1 sm:pb-2",
                "bg-clip-text text-transparent",
                "bg-gradient-to-b from-foreground to-foreground/85 dark:from-white dark:to-white/82",
                "text-[1.75rem] leading-[1.15] sm:text-4xl",
              )}
            >
              Seen enough?
            </h2>
            <p className="mx-auto mt-4 max-w-md text-[15px] leading-[1.55] text-foreground/65 dark:text-white/65 sm:text-base">
              Give Coasty a task and watch it run. No setup, no scripting.
            </p>
            <div className="mt-8 flex flex-col items-center gap-4">
              <Link
                href="/auth"
                className={cn(
                  "group inline-flex items-center justify-center gap-2 rounded-full font-medium",
                  "bg-foreground text-background",
                  "shadow-[0_1px_0_0_rgba(255,255,255,0.08)_inset,0_6px_18px_-10px_rgba(0,0,0,0.22)]",
                  "dark:shadow-[0_1px_0_0_rgba(0,0,0,0.10)_inset,0_6px_18px_-10px_rgba(0,0,0,0.40)]",
                  "transition-[box-shadow,transform] duration-300 hover:scale-[1.012] active:scale-[0.985]",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                  "px-7 py-3 text-[14.5px]",
                )}
              >
                Try Coasty Free
                <ArrowRight className="h-3.5 w-3.5 transition-transform duration-300 ease-out group-hover:translate-x-0.5" />
              </Link>
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-foreground/40">
                No credit card required
              </p>
            </div>
          </motion.div>
        </section>
      </main>

      <LandingFooter />
    </div>
  )
}
