"use client"

/**
 * LegalPage — shared, sleek chrome for /terms and /privacy.
 *
 * Editorial two-column layout: a minimal hero, a sticky numbered table of
 * contents (desktop) with scrollspy, and flowing, scannable content (no
 * accordions). Mono section indices are the single signature element; hairline
 * dividers and generous spacing do the rest. Mobile drops the sidebar and
 * stacks the content with a horizontal "jump to" chip rail.
 *
 * Content is structured data (LegalSection[]) so both pages stay consistent and
 * easy to edit. No em dashes in body copy by house style.
 */

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { motion } from "framer-motion"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { LandingHeader } from "@/app/components/landing/landing-header"
import { LandingFooter } from "@/app/components/landing/landing-footer"

export type LegalBlock =
  | { kind: "p"; text: string }
  | { kind: "list"; items: string[] }
  | { kind: "sub"; title: string; text?: string; items?: string[] }
  | { kind: "callout"; text: string }

export type LegalSection = {
  id: string
  title: string
  blocks: LegalBlock[]
}

export type LegalPageProps = {
  kicker: string
  title: string
  subtitle: string
  updatedLabel: string
  updatedDate: string
  version: string
  sections: LegalSection[]
  /** Optional closing statement (the Terms uses this for the agreement note). */
  closing?: { title: string; text: string }
  ctaLabel: string
}

function useScrollSpy(ids: string[]) {
  const [active, setActive] = useState(ids[0] ?? "")
  const key = ids.join("|")
  useEffect(() => {
    if (typeof window === "undefined") return
    const visible = new Set<string>()
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) visible.add(e.target.id)
          else visible.delete(e.target.id)
        }
        // Highlight the first (topmost) section currently in the band.
        const first = ids.find((id) => visible.has(id))
        if (first) setActive(first)
      },
      { rootMargin: "-15% 0px -75% 0px", threshold: 0 }
    )
    ids.forEach((id) => {
      const el = document.getElementById(id)
      if (el) observer.observe(el)
    })
    return () => observer.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return active
}

function Block({ block }: { block: LegalBlock }) {
  switch (block.kind) {
    case "p":
      return (
        <p className="text-[15px] leading-relaxed text-muted-foreground">
          {block.text}
        </p>
      )
    case "list":
      return (
        <ul className="space-y-2.5">
          {block.items.map((item, i) => (
            <li key={i} className="flex gap-3 text-[15px] leading-relaxed text-muted-foreground">
              <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-foreground/30" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      )
    case "sub":
      return (
        <div className="rounded-xl border border-border/40 bg-card/20 p-4 sm:p-5">
          <h3 className="text-sm font-medium tracking-tight text-foreground/90">
            {block.title}
          </h3>
          {block.text && (
            <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground">
              {block.text}
            </p>
          )}
          {block.items && (
            <ul className="mt-3 space-y-2">
              {block.items.map((item, i) => (
                <li key={i} className="flex gap-2.5 text-[14px] leading-relaxed text-muted-foreground">
                  <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-foreground/25" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )
    case "callout":
      return (
        <div className="rounded-xl border border-foreground/15 bg-foreground/[0.03] px-4 py-3.5">
          <p className="text-[14px] leading-relaxed text-foreground/80">{block.text}</p>
        </div>
      )
  }
}

export function LegalPage({
  kicker,
  title,
  subtitle,
  updatedLabel,
  updatedDate,
  version,
  sections,
  closing,
  ctaLabel,
}: LegalPageProps) {
  const ids = useMemo(() => sections.map((s) => s.id), [sections])
  const active = useScrollSpy(ids)
  const railRef = useRef<HTMLDivElement>(null)

  function handleJump(e: React.MouseEvent, id: string) {
    e.preventDefault()
    const el = document.getElementById(id)
    if (!el) return
    el.scrollIntoView({ behavior: "smooth", block: "start" })
    history.replaceState(null, "", `#${id}`)
  }

  return (
    <div className="relative min-h-screen bg-background">
      <LandingHeader />

      <main className="relative pt-16 sm:pt-20">
        {/* Hero — calm, ambient glow, mono meta. No eyebrow chrome. */}
        <section className="relative overflow-hidden px-6 sm:px-10">
          <div
            aria-hidden
            className="pointer-events-none absolute left-1/2 -top-28 h-64 w-[40rem] max-w-[90vw] -translate-x-1/2 rounded-full bg-primary/10 blur-3xl"
          />
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="relative mx-auto max-w-5xl pt-14 pb-10 sm:pt-20 sm:pb-14"
          >
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground/60">
              {kicker}
            </p>
            <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl md:text-6xl">
              {title}
            </h1>
            <p className="mt-4 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
              {subtitle}
            </p>
            <p className="mt-6 font-mono text-[11px] tracking-wide text-muted-foreground/50">
              v{version} · {updatedLabel} {updatedDate}
            </p>
          </motion.div>
        </section>

        {/* Mobile section rail */}
        <div className="lg:hidden sticky top-16 z-30 border-y border-border/40 bg-background/85 backdrop-blur">
          <div
            ref={railRef}
            className="flex gap-2 overflow-x-auto px-6 py-2.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {sections.map((s, i) => (
              <a
                key={s.id}
                href={`#${s.id}`}
                onClick={(e) => handleJump(e, s.id)}
                className={cn(
                  "shrink-0 rounded-full border px-3 py-1 text-[12px] transition-colors",
                  active === s.id
                    ? "border-foreground/30 bg-foreground/[0.06] text-foreground"
                    : "border-border/50 text-muted-foreground/70"
                )}
              >
                <span className="font-mono text-[10px] text-muted-foreground/50">
                  {String(i + 1).padStart(2, "0")}
                </span>{" "}
                {s.title}
              </a>
            ))}
          </div>
        </div>

        {/* Body */}
        <section className="px-6 pb-24 sm:px-10">
          <div className="mx-auto grid max-w-5xl gap-x-14 lg:grid-cols-[200px_minmax(0,1fr)]">
            {/* Sticky TOC (desktop) */}
            <aside className="hidden lg:block">
              <nav className="sticky top-24 space-y-1 border-l border-border/40 pl-4">
                {sections.map((s, i) => (
                  <a
                    key={s.id}
                    href={`#${s.id}`}
                    onClick={(e) => handleJump(e, s.id)}
                    className={cn(
                      "group flex items-baseline gap-2.5 rounded-md py-1.5 pr-2 text-[13px] leading-snug transition-colors",
                      active === s.id
                        ? "text-foreground"
                        : "text-muted-foreground/55 hover:text-muted-foreground"
                    )}
                  >
                    <span
                      className={cn(
                        "font-mono text-[10px] tabular-nums transition-colors",
                        active === s.id ? "text-primary" : "text-muted-foreground/35"
                      )}
                    >
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span>{s.title}</span>
                  </a>
                ))}
              </nav>
            </aside>

            {/* Content */}
            <div className="min-w-0 pt-10 lg:pt-2">
              <div className="space-y-14">
                {sections.map((s, i) => (
                  <motion.section
                    key={s.id}
                    id={s.id}
                    initial={{ opacity: 0, y: 10 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, amount: 0.15 }}
                    transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                    className="scroll-mt-28"
                  >
                    <div className="flex items-baseline gap-3">
                      <span className="font-mono text-xs text-muted-foreground/40">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <h2 className="text-xl font-medium tracking-tight sm:text-2xl">
                        {s.title}
                      </h2>
                    </div>
                    <div className="mt-4 space-y-4 lg:pl-8">
                      {s.blocks.map((b, bi) => (
                        <Block key={bi} block={b} />
                      ))}
                    </div>
                    {i < sections.length - 1 && (
                      <div className="mt-14 h-px w-full bg-border/40 lg:ml-8 lg:w-[calc(100%-2rem)]" />
                    )}
                  </motion.section>
                ))}
              </div>

              {/* Closing statement */}
              {closing && (
                <div className="mt-14 rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/[0.06] to-transparent p-6 sm:p-7">
                  <h3 className="text-base font-medium tracking-tight">
                    {closing.title}
                  </h3>
                  <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                    {closing.text}
                  </p>
                </div>
              )}

              {/* Actions */}
              <div className="mt-12 flex flex-col gap-3 sm:flex-row">
                <Button variant="outline" asChild>
                  <Link href="/">
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back to home
                  </Link>
                </Button>
                <Button asChild>
                  <Link href="/auth">{ctaLabel}</Link>
                </Button>
              </div>
            </div>
          </div>
        </section>

        <LandingFooter />
      </main>
    </div>
  )
}
