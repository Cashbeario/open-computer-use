"use client"

import { motion } from "framer-motion"
import { Github, ArrowUpRight, BookOpen, Boxes } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import {
  EASE,
  DevPageShell,
  DevHeader,
} from "@/app/components/developers/developers-shared"
import { BuildWithAIBar } from "@/app/components/developers/copy-for-ai"

/* ===================================================================
   Cookbook page — curated open-source repositories for building on the
   Coasty API. Clone a repo, mint a key, and ship. Surfaced in the
   sidebar (Build group) only in the "developer" platform mode.
   =================================================================== */

type Repo = {
  org: string
  name: string
  href: string
  title: string
  description: string
  icon: LucideIcon
  topics: string[]
}

const REPOS: Repo[] = [
  {
    org: "coasty-ai",
    name: "computer-use-cookbook",
    href: "https://github.com/coasty-ai/computer-use-cookbook",
    title: "Computer Use Cookbook",
    description:
      "Runnable, copy-paste examples for every part of the Coasty API: predict, sessions, task runs, workflows, and driving machines. Start here.",
    icon: BookOpen,
    topics: ["Examples", "Python", "Node", "cURL"],
  },
  {
    org: "coasty-ai",
    name: "open-cowork",
    href: "https://github.com/coasty-ai/open-cowork",
    title: "Open Cowork",
    description:
      "The open-source Coasty project for computer-use agents that work alongside you. Build on it, fork it, or contribute.",
    icon: Boxes,
    topics: ["Open source", "Agents", "Reference app"],
  },
]

function RepoCard({ repo, index }: { repo: Repo; index: number }) {
  const Icon = repo.icon
  return (
    <motion.a
      href={repo.href}
      target="_blank"
      rel="noopener noreferrer"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.05 + index * 0.06, ease: EASE }}
      className="group relative flex flex-col rounded-2xl border border-foreground/[0.07] bg-foreground/[0.015] p-5 sm:p-6 transition-colors hover:border-foreground/15 hover:bg-foreground/[0.03]"
    >
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-foreground/[0.08] to-transparent" />

      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-foreground/[0.08] bg-foreground/[0.03] text-foreground/70">
          <Icon className="h-[18px] w-[18px]" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-[11px] font-mono text-muted-foreground/55">
            <Github className="h-3 w-3 shrink-0" />
            <span className="truncate">{repo.org}/{repo.name}</span>
          </div>
          <h3 className="mt-1 text-[15px] font-semibold tracking-tight text-foreground">{repo.title}</h3>
        </div>
        <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground/40 transition-all duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-foreground/70" />
      </div>

      <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground/70">{repo.description}</p>

      <div className="mt-4 flex flex-wrap gap-1.5">
        {repo.topics.map((topic) => (
          <span
            key={topic}
            className="rounded-full border border-foreground/[0.08] bg-foreground/[0.02] px-2 py-0.5 text-[10.5px] font-medium text-muted-foreground/60"
          >
            {topic}
          </span>
        ))}
      </div>

      <div className="mt-5 inline-flex items-center gap-1.5 text-[12px] font-medium text-foreground/65 transition-colors group-hover:text-foreground">
        <Github className="h-3.5 w-3.5" />
        View on GitHub
      </div>
    </motion.a>
  )
}

export function CookbookContent() {
  return (
    <DevPageShell>
      <DevHeader
        title="Cookbook"
        description="Open-source examples and projects to build on the Coasty API. Clone a repo, mint a key, and ship."
      />

      <BuildWithAIBar />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {REPOS.map((repo, i) => (
          <RepoCard key={repo.name} repo={repo} index={i} />
        ))}
      </div>
    </DevPageShell>
  )
}
