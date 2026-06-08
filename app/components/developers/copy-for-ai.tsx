"use client"

/**
 * CopyForAI + BuildWithAIBar.
 *
 * BuildWithAIBar is the framed "Building with an AI assistant?" callout shown
 * across the docs, the developer pages, and the developer-mode chat homepage. Its
 * action opens the Coding Agent Quickstart popup, which crafts a prompt tailored
 * to the developer's setup.
 *
 * CopyForAI is the lightweight split-button primitive (copy the generic API
 * prompt + deep-link into ChatGPT / Claude). The prompt lives in
 * lib/coasty-ai-prompt so it can be reused + anti-drift tested.
 */

import { useCallback, useState } from "react"
import { motion } from "framer-motion"
import { Check, ChevronDown, Copy, Terminal } from "lucide-react"
import { toast } from "sonner"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import { AI_PROMPT, CHATGPT_BASE, CLAUDE_BASE } from "@/lib/coasty-ai-prompt"
import { ClaudeMark, CursorMark, LogoBadge, OpenAIMark } from "@/app/components/developers/brand-logos"
import { CodingAgentQuickstart } from "@/app/components/developers/coding-agent-quickstart"

// Re-export so existing importers (and tests) keep resolving AI_PROMPT here.
export { AI_PROMPT }

/* ─── Clipboard ───────────────────────────────────────────────────────────── */

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // fall through to the legacy path
  }
  try {
    const ta = document.createElement("textarea")
    ta.value = text
    ta.style.position = "fixed"
    ta.style.opacity = "0"
    document.body.appendChild(ta)
    ta.focus()
    ta.select()
    const ok = document.execCommand("copy")
    document.body.removeChild(ta)
    return ok
  } catch {
    return false
  }
}

/* ─── CopyForAI (lightweight split button) ────────────────────────────────── */

export function CopyForAI({ className }: { className?: string }) {
  const [copied, setCopied] = useState(false)

  const doCopy = useCallback(async () => {
    const ok = await copyText(AI_PROMPT)
    if (ok) {
      setCopied(true)
      toast.success("Prompt copied. Paste it into Cursor, Claude Code, or any AI assistant.")
      setTimeout(() => setCopied(false), 2000)
    } else {
      toast.error("Could not copy. Select the prompt manually from the docs.")
    }
  }, [])

  const openIn = useCallback((base: string) => {
    const url = base + encodeURIComponent(AI_PROMPT)
    window.open(url, "_blank", "noopener,noreferrer")
  }, [])

  return (
    <div className={cn("inline-flex items-stretch", className)}>
      <button
        type="button"
        onClick={doCopy}
        aria-label="Copy the Coasty API prompt for an AI assistant"
        className="group inline-flex items-center gap-2 rounded-l-full border border-foreground/[0.12] bg-foreground/[0.02] py-1.5 pl-2 pr-3 text-[13px] font-medium text-foreground/85 transition-colors hover:bg-foreground/[0.05] hover:text-foreground"
      >
        <span className="flex -space-x-1.5">
          <LogoBadge><OpenAIMark className="h-3 w-3 text-foreground/80" /></LogoBadge>
          <LogoBadge><ClaudeMark className="h-3.5 w-3.5" /></LogoBadge>
          <LogoBadge><CursorMark className="h-3 w-3 text-foreground/80" /></LogoBadge>
        </span>
        <span>{copied ? "Copied for AI" : "Copy for AI"}</span>
        {copied ? (
          <Check className="h-3.5 w-3.5 text-emerald-500" strokeWidth={2.5} />
        ) : (
          <Copy className="h-3.5 w-3.5 text-foreground/55 transition-colors group-hover:text-foreground/80" />
        )}
      </button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="More ways to use this prompt"
            className="inline-flex items-center justify-center rounded-r-full border border-l-0 border-foreground/[0.12] bg-foreground/[0.02] px-1.5 text-foreground/60 transition-colors hover:bg-foreground/[0.05] hover:text-foreground"
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuItem onClick={doCopy} className="gap-2.5">
            <Copy className="h-4 w-4 text-muted-foreground" />
            <span>Copy prompt</span>
            <span className="ml-auto text-[10px] text-muted-foreground/60">Cursor · Claude Code</span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => openIn(CHATGPT_BASE)} className="gap-2.5">
            <OpenAIMark className="h-4 w-4 text-foreground/80" />
            <span>Open in ChatGPT</span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => openIn(CLAUDE_BASE)} className="gap-2.5">
            <ClaudeMark className="h-4 w-4" />
            <span>Open in Claude</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

/* ─── Explainer bar ───────────────────────────────────────────────────────── */

const BAR_EASE = [0.25, 0.46, 0.45, 0.94] as const

/**
 * BuildWithAIBar — the framed callout whose action opens the Coding Agent
 * Quickstart. Reused across the docs, the developer pages, and the
 * developer-mode chat homepage so building with AI is one click away.
 */
export function BuildWithAIBar({ className }: { className?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: BAR_EASE }}
      className={cn(
        "flex flex-col gap-3 rounded-2xl border border-foreground/[0.07] bg-foreground/[0.015] px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between",
        className,
      )}
    >
      <div className="flex min-w-0 items-start gap-3">
        <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-foreground/[0.04] ring-1 ring-foreground/[0.06]">
          <Terminal className="h-3.5 w-3.5 text-foreground/60" strokeWidth={2} />
        </span>
        <div className="min-w-0">
          <div className="text-[13px] font-medium text-foreground/85">Building with an AI assistant?</div>
          <div className="mt-0.5 text-[12px] leading-snug text-muted-foreground">
            Generate a ready-made prompt tailored to Cursor, Claude Code, ChatGPT, or any LLM.
          </div>
        </div>
      </div>
      <CodingAgentQuickstart triggerClassName="shrink-0 self-start sm:self-auto" />
    </motion.div>
  )
}
