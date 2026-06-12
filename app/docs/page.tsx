"use client"

/**
 * /docs — the public API reference. Reuses the same <DeveloperDocs/> component
 * as the in-app developer dashboard (one source of truth for the docs), wrapped
 * in the public landing chrome (LandingHeader + LandingFooter). A prominent link
 * surfaces the LLM-friendly plain-text version at /docs/llms.txt.
 */

import { FileText } from "lucide-react"

import { LandingHeader } from "@/app/components/landing/landing-header"
import { LandingFooter } from "@/app/components/landing/landing-footer"
import { DeveloperDocs } from "@/app/components/developers/developer-docs"

export default function DocsPage() {
  return (
    <div className="relative min-h-screen bg-background text-foreground">
      <LandingHeader />

      <main className="px-4 pb-24 pt-24 sm:px-6 sm:pt-28 lg:px-8">
        <div className="mx-auto max-w-7xl">
          {/* Hero */}
          <div className="mb-8 flex flex-col gap-4 border-b border-foreground/[0.06] pb-6 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/50">
                Coasty API
              </div>
              <h1 className="mt-1.5 text-3xl font-bold tracking-tight sm:text-4xl">API reference</h1>
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
                Build agents that see and act. The full Computer Use API: stateless prediction,
                stateful sessions, autonomous task runs, and multi-step workflows.
              </p>
            </div>
            <a
              href="/docs/llms.txt"
              title="View the full reference as plain text for LLMs"
              className="group inline-flex shrink-0 items-center gap-1.5 self-start rounded-lg border border-foreground/[0.1] bg-foreground/[0.015] px-2.5 py-1 text-[11.5px] font-medium text-foreground/60 transition-colors hover:bg-foreground/[0.04] hover:text-foreground sm:self-auto"
            >
              <FileText className="h-3 w-3 text-foreground/45 transition-colors group-hover:text-foreground/70" />
              llms.txt
            </a>
          </div>

          {/* The docs (shared with the in-app developer dashboard). The sticky
              offset clears the fixed landing header on this public page; the
              max-height keeps the whole nav on screen so it scrolls internally. */}
          <DeveloperDocs sidebarStickyClassName="top-24" sidebarMaxHeight="calc(100dvh - 8rem)" />
        </div>
      </main>

      <LandingFooter />
    </div>
  )
}
