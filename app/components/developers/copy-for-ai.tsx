"use client"

/**
 * CopyForAI — a "Copy for AI" control for the developer docs.
 *
 * Copies a ready-made, self-contained prompt (the whole Coasty API in brief) to
 * the clipboard so a developer can paste it straight into Cursor, Claude Code,
 * or any LLM and start building. A split dropdown also deep-links the prompt
 * into ChatGPT / Claude (which support a prefilled `?q=` query) and links the
 * full machine-readable reference (/llms-full.txt).
 *
 * The prompt is a single exported constant (AI_PROMPT) so it can be anti-drift
 * tested and reused. Keep it in sync with the docs (base URL, endpoints, USD
 * pricing).
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

/* ─── The prompt ──────────────────────────────────────────────────────────── */

export const AI_PROMPT = `# Coasty Computer Use API — integration brief for an AI coding assistant

You are helping me build on the Coasty Computer Use API: a REST API that lets code see a screen and act on it (click, type, scroll), run autonomous agent tasks on a machine, and orchestrate multi-step workflows.

- Base URL: https://coasty.ai/v1
- Auth: send the secret key in the \`X-API-Key: <key>\` header (or \`Authorization: Bearer <key>\`). Read it from a COASTY_API_KEY environment variable; never hardcode it.
- Full machine-readable reference: https://coasty.ai/llms-full.txt
- Human docs: https://coasty.ai/developers/docs  ·  API keys: https://coasty.ai/developers/keys

## Core endpoints (stateless / session)
- POST /v1/predict — body {screenshot (base64), instruction, cua_version} -> {actions:[{action_type, params}], status}. Loop: capture screenshot -> predict -> execute actions -> repeat until status is "done".
- POST /v1/sessions then POST /v1/sessions/{id}/predict — stateful multi-step with trajectory memory.
- POST /v1/ground — {screenshot, element} -> {x, y}. POST /v1/ocr — read on-screen text. POST /v1/parse — pyautogui code -> structured actions (free).

## Task Runs — the server drives an agent task to completion
- POST /v1/runs — {machine_id, task, cua_version ("v3" default; "v4" = autonomous + pass/fail verifier), instructions?, system_prompt?, max_steps?, deadline_seconds?, on_awaiting_human ("pause"|"fail"|"cancel"), webhook_url?} -> a run (status "queued"). The server runs the screenshot->act loop, verifies success, and bills per step.
- GET /v1/runs  ·  GET /v1/runs/{id}  ·  POST /v1/runs/{id}/cancel  ·  POST /v1/runs/{id}/resume (after a human takeover)
- GET /v1/runs/{id}/events — Server-Sent Events; reconnect with Last-Event-ID. States: queued -> running -> (awaiting_human <-> running) -> succeeded | failed | cancelled | timed_out.
- Webhooks are HMAC-signed: header "Coasty-Signature: t=<unix>,v1=<hex>", signed payload "<t>." + raw_body, key = the webhook_secret returned once at create.

## Workflows — versioned JSON DSL composed of runs
- POST /v1/workflows {name, slug, definition, inputs_schema?}  ·  POST /v1/workflows/{id}/runs  ·  POST /v1/workflows/runs (ad-hoc inline definition)  ·  GET/POST /v1/workflows/runs/{id} + /events + /cancel + /resume {approved}.
- DSL step types: task, assert, if, loop, parallel, human_approval, retry, succeed, fail. Conditions are structured objects: {op: "eq"|"ne"|"lt"|"gt"|"lte"|"gte"|"contains"|"truthy"|"falsy"|"exists"|"and"|"or"|"not", ...}. Variables: {{inputs.x}}, {{vars.y}}, {{stepId.field}} (a task binds {status, passed, result, run_id}). Hard guards: budget_cents, max_iterations, deadline_seconds.

## Pricing (USD, prepaid dollar wallet)
predict $0.45  ·  session create $0.90  ·  session step $0.36  ·  ground/ocr $0.27  ·  parse free  ·  runs and workflow task steps $0.45 per agent step (v3/v4). Top up at https://coasty.ai/developers/usage.

## Errors
JSON envelope {error:{code, message, request_id}}. 401 invalid key  ·  402 INSUFFICIENT_CREDITS  ·  403 INSUFFICIENT_SCOPE  ·  429 rate limit / TOO_MANY_RUNS.

---
Now help me build: <describe what you want to build>. Use minimal, correct code, read COASTY_API_KEY from the environment, and ask me for a machine_id when a run or workflow needs one.`

const CHATGPT_BASE = "https://chatgpt.com/?q="
const CLAUDE_BASE = "https://claude.ai/new?q="

/* ─── Brand marks ─────────────────────────────────────────────────────────── */

function OpenAIMark({ className }: { className?: string }) {
  // Official OpenAI mark, rendered in currentColor.
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.1419.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z" />
    </svg>
  )
}

// Claude (Anthropic) sunburst — radiating spokes in Anthropic terracotta.
const CLAUDE_SPOKES = Array.from({ length: 8 }, (_, i) => {
  const a = (i * Math.PI) / 4
  return {
    x1: 12 + Math.cos(a) * 3.1,
    y1: 12 + Math.sin(a) * 3.1,
    x2: 12 + Math.cos(a) * 9.4,
    y2: 12 + Math.sin(a) * 9.4,
  }
})

function ClaudeMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <g stroke="#D97757" strokeWidth="2.1" strokeLinecap="round">
        {CLAUDE_SPOKES.map((s, i) => (
          <line key={i} x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} />
        ))}
      </g>
    </svg>
  )
}

function CursorMark({ className }: { className?: string }) {
  // Cursor's geometric cube mark.
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round">
        <path d="M12 2.5 20.5 7.25v9.5L12 21.5 3.5 16.75v-9.5z" />
        <path d="M12 12v9.5M12 12l8.5-4.75M12 12 3.5 7.25" />
      </g>
    </svg>
  )
}

function LogoBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="grid h-[18px] w-[18px] place-items-center rounded-full bg-background ring-1 ring-foreground/10 dark:ring-foreground/15">
      {children}
    </span>
  )
}

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

/* ─── Component ───────────────────────────────────────────────────────────── */

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
    // Prefilled query. The clipboard path is the reliable fallback for tools
    // (Cursor, Claude Code) that cannot be deep-linked.
    const url = base + encodeURIComponent(AI_PROMPT)
    window.open(url, "_blank", "noopener,noreferrer")
  }, [])

  return (
    <div className={cn("inline-flex items-stretch", className)}>
      {/* Primary: copy the prompt. */}
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

      {/* Split: more targets. */}
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
 * BuildWithAIBar — the framed "Building with an AI assistant?" callout that
 * houses the CopyForAI control. Reused across the docs, the developer pages,
 * and the developer-mode chat homepage so the prompt is one click away
 * everywhere a developer lands.
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
            Copy a ready-made prompt with the full API into Cursor, Claude Code, ChatGPT, or any LLM.
          </div>
        </div>
      </div>
      <CopyForAI className="shrink-0 self-start sm:self-auto" />
    </motion.div>
  )
}
