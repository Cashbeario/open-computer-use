"use client"

import { motion } from "framer-motion"
import Image from "next/image"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { ArrowRight, Play } from "lucide-react"
import { cn } from "@/lib/utils"
import { LandingSectionHeader } from "../section-shell"

const EASE = [0.22, 1, 0.36, 1] as const

type DemoKey = "reddit" | "prospects" | "qa" | "email" | "job" | "hackernews"

type DemoSession = {
  key: DemoKey
  chatId: string
  videoId: string
}

// Order preserved from landing-page.tsx DEMO_SESSION_DATA. videoId mapping
// follows the brief's per-key thumbnail assignment.
const DEMO_SESSIONS: DemoSession[] = [
  { key: "reddit", chatId: "373c1f67-afec-4bd6-adda-3809ecdbdd75", videoId: "icxgLDephHE" },
  { key: "prospects", chatId: "425d3c49-3a06-41e5-9859-aa00c5b12f3d", videoId: "qTvmGfg3HVw" },
  { key: "qa", chatId: "7ee3e942-c5dd-4e49-93b6-353bb5273b7e", videoId: "Wbo2o74hVIo" },
  { key: "email", chatId: "60a0722b-fb98-43d6-a4e7-951d80a22363", videoId: "mH-csaCa508" },
  { key: "job", chatId: "4ac6f3d2-c273-4a07-bf98-b986d1cbfb88", videoId: "AnHJuRMLCnE" },
  { key: "hackernews", chatId: "d181de46-b41d-4b87-9648-0374b2b7ec1c", videoId: "A_OvNh51Npg" },
]

function thumbUrl(id: string) {
  // 1280x720 — crisp on retina at all card sizes. Falls back to YouTube's
  // generic placeholder only if a video lacks an HD thumb (rare for this set).
  return `https://img.youtube.com/vi/${id}/maxresdefault.jpg`
}

function DemoCard({ demo, isMobile }: { demo: DemoSession; isMobile: boolean }) {
  const t = useTranslations()

  return (
    <Link
      href={`/share/${demo.chatId}`}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "group block h-full overflow-hidden rounded-2xl border border-foreground/10 bg-card/40 transition-colors duration-300",
        !isMobile && "hover:border-foreground/20"
      )}
    >
      {/* Thumbnail — uniform 16:9 across every card */}
      <div className="relative w-full overflow-hidden aspect-video">
        <Image
          src={thumbUrl(demo.videoId)}
          alt={t(`demo.sessions.${demo.key}.title`)}
          fill
          unoptimized
          sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
          className="object-cover"
        />

        {/* Inset hairline border */}
        <div className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-foreground/10" />

        {/* Centered play affordance */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-foreground/90">
            <Play className="h-4 w-4 translate-x-[1px] fill-background text-background" />
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="flex flex-col gap-2 p-4 sm:p-5">
        <h3 className="font-semibold leading-snug tracking-tight text-foreground text-base">
          {t(`demo.sessions.${demo.key}.title`)}
        </h3>
        <p className="leading-relaxed text-muted-foreground text-xs">
          {t(`demo.sessions.${demo.key}.description`)}
        </p>
      </div>
    </Link>
  )
}

export function DemoSection({ isMobile }: { isMobile: boolean }) {
  const t = useTranslations()

  return (
    <section
      id="demo"
      className="relative py-20 sm:py-24 lg:py-32 px-8 sm:px-10 lg:px-12"
    >
      <div className="max-w-6xl w-full mx-auto">
        <LandingSectionHeader
          title={t("demo.title")}
          subtitle={t("demo.subtitle")}
          isMobile={isMobile}
        />

        {/* One calm container fade for the whole grid; no per-card stagger. */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0, margin: "0px 0px -80px 0px" }}
          transition={{ duration: 0.4, ease: EASE }}
          className={cn(
            "grid gap-4 sm:gap-5",
            isMobile ? "grid-cols-1" : "grid-cols-2 lg:grid-cols-3"
          )}
        >
          {DEMO_SESSIONS.map((demo) => (
            <DemoCard key={demo.chatId} demo={demo} isMobile={isMobile} />
          ))}
        </motion.div>

        {/* Footer */}
        <div className="mt-14 flex flex-col items-center gap-5">
          <div className="h-px w-24 bg-foreground/10" />
          <Link
            href="/discover"
            className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.22em] text-foreground/60 transition-colors hover:text-foreground"
          >
            View all 50+ sessions
            <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </div>
    </section>
  )
}
