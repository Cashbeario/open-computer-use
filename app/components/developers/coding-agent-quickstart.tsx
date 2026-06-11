"use client"

/**
 * CodingAgentQuickstart — a popup wizard that captures what the developer codes
 * with, the integration they want generated, and what they are building, then
 * produces a heavily-crafted prompt tailored to those answers. Choices persist
 * (useCodingAgentConfig) so later surfaces can tailor recommendations.
 *
 * Renders its own trigger ("Create with AI"); drop it anywhere (the bar, a page).
 */

import { useMemo, useState, type ComponentType, type ReactElement, type ReactNode } from "react"
import { Check, Copy, MoreHorizontal } from "lucide-react"
import { toast } from "sonner"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { useCodingAgentConfig } from "@/lib/coding-agent-store"
import {
  BUILD_TARGET_OPTIONS,
  CHATGPT_BASE,
  CLAUDE_BASE,
  CODING_AGENT_OPTIONS,
  EXECUTION_TARGET_OPTIONS,
  INTEGRATION_OPTIONS,
  buildCraftedPrompt,
} from "@/lib/coasty-ai-prompt"
import {
  ClaudeMark,
  CursorMark,
  CurlMark,
  GitHubMark,
  GoMark,
  JavaScriptMark,
  McpMark,
  OpenAIMark,
  PythonMark,
  WindsurfMark,
} from "@/app/components/developers/brand-logos"

type Mark = ComponentType<{ className?: string }>

const AGENT_LOGOS: Record<string, Mark> = {
  cursor: CursorMark,
  "claude-code": ClaudeMark,
  codex: OpenAIMark,
  copilot: GitHubMark,
  windsurf: WindsurfMark,
}

const INTEGRATION_LOGOS: Record<string, Mark> = {
  python: PythonMark,
  javascript: JavaScriptMark,
  curl: CurlMark,
  go: GoMark,
  mcp: McpMark,
}

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    /* fall through */
  }
  try {
    const ta = document.createElement("textarea")
    ta.value = text
    ta.style.position = "fixed"
    ta.style.opacity = "0"
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand("copy")
    document.body.removeChild(ta)
    return ok
  } catch {
    return false
  }
}

/* ── Selectable chip ──────────────────────────────────────────────────────── */

function OptionChip({
  selected, onSelect, logo: Logo, label,
}: {
  selected: boolean
  onSelect: () => void
  logo?: Mark
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "group flex items-center gap-2 rounded-xl border px-3 py-2 text-[13px] font-medium transition-colors",
        selected
          ? "border-foreground/25 bg-foreground/[0.06] text-foreground"
          : "border-foreground/[0.08] bg-foreground/[0.015] text-foreground/70 hover:border-foreground/15 hover:bg-foreground/[0.04] hover:text-foreground",
      )}
    >
      {Logo ? (
        <span className="grid h-[18px] w-[18px] shrink-0 place-items-center">
          <Logo className="h-[15px] w-[15px]" />
        </span>
      ) : (
        <span
          className={cn(
            "h-1.5 w-1.5 shrink-0 rounded-full transition-colors",
            selected ? "bg-foreground/70" : "bg-foreground/20 group-hover:bg-foreground/40",
          )}
        />
      )}
      <span className="whitespace-nowrap">{label}</span>
    </button>
  )
}

function Question({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-2 text-[12px] font-medium text-foreground/80">{title}</div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  )
}

function OtherInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="mt-2 w-full rounded-lg border border-foreground/[0.1] bg-background px-2.5 py-1.5 text-[12.5px] text-foreground outline-none placeholder:text-muted-foreground/50 focus:border-foreground/25"
    />
  )
}

/* ── Trigger ──────────────────────────────────────────────────────────────── */

function TriggerButton({ className }: { className?: string }) {
  return (
    <button
      type="button"
      className={cn(
        "group inline-flex items-center gap-2 rounded-full border border-foreground/[0.12] bg-foreground/[0.02] py-1.5 pl-2 pr-3.5 text-[13px] font-medium text-foreground/85 transition-colors hover:bg-foreground/[0.05] hover:text-foreground",
        className,
      )}
    >
      <span className="flex -space-x-1.5">
        {[OpenAIMark, ClaudeMark, CursorMark].map((Logo, i) => (
          <span
            key={i}
            className="grid h-[18px] w-[18px] place-items-center rounded-full bg-background ring-1 ring-foreground/10 dark:ring-foreground/15"
          >
            <Logo className="h-3 w-3 text-foreground/80" />
          </span>
        ))}
      </span>
      <span>Create with AI</span>
    </button>
  )
}

/* ── Quickstart ───────────────────────────────────────────────────────────── */

export function CodingAgentQuickstart({
  triggerClassName,
  trigger,
}: {
  triggerClassName?: string
  // Optional custom trigger element (e.g. the landing hero's CTA pill).
  // Must be a single element — DialogTrigger clones it via asChild.
  trigger?: ReactElement
}) {
  const cfg = useCodingAgentConfig()
  const [copied, setCopied] = useState(false)

  const prompt = useMemo(
    () =>
      buildCraftedPrompt({
        codingAgent: cfg.codingAgent,
        customAgent: cfg.customAgent,
        integration: cfg.integration,
        customIntegration: cfg.customIntegration,
        building: cfg.building,
        customBuilding: cfg.customBuilding,
        executionTarget: cfg.executionTarget,
      }),
    [cfg.codingAgent, cfg.customAgent, cfg.integration, cfg.customIntegration, cfg.building, cfg.customBuilding, cfg.executionTarget],
  )

  const onCopy = async () => {
    const ok = await copyText(prompt)
    cfg.markConfigured()
    if (ok) {
      setCopied(true)
      toast.success("Prompt copied. Paste it into your coding agent and start building.")
      setTimeout(() => setCopied(false), 2000)
    } else {
      toast.error("Could not copy. Select the prompt manually below.")
    }
  }

  const openIn = (base: string) => {
    cfg.markConfigured()
    window.open(base + encodeURIComponent(prompt), "_blank", "noopener,noreferrer")
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        {trigger ?? (
          <span className={triggerClassName}>
            <TriggerButton />
          </span>
        )}
      </DialogTrigger>
      <DialogContent className="flex max-h-[88vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
        <DialogHeader className="shrink-0 space-y-1 border-b border-foreground/[0.06] px-5 py-4 pr-12 text-left">
          <div className="text-[10.5px] font-medium uppercase tracking-[0.16em] text-muted-foreground/50">
            Coding Agent Quickstart
          </div>
          <DialogTitle className="text-lg font-semibold">Create with AI</DialogTitle>
          <DialogDescription className="text-[12.5px]">
            Answer a few quick questions and we will craft the perfect prompt for your AI coding agent.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5">
          <Question title="What are you coding with?">
            {CODING_AGENT_OPTIONS.map((o) => (
              <OptionChip
                key={o.id}
                selected={cfg.codingAgent === o.id}
                onSelect={() => cfg.setCodingAgent(o.id)}
                logo={AGENT_LOGOS[o.id]}
                label={o.label}
              />
            ))}
          </Question>
          {cfg.codingAgent === "other" && (
            <OtherInput value={cfg.customAgent} onChange={cfg.setCustomAgent} placeholder="Which tool? e.g. Cline, Aider, Zed" />
          )}

          <Question title="What integration should the prompt generate?">
            {INTEGRATION_OPTIONS.map((o) => (
              <OptionChip
                key={o.id}
                selected={cfg.integration === o.id}
                onSelect={() => cfg.setIntegration(o.id)}
                logo={o.id === "other" ? MoreHorizontal : INTEGRATION_LOGOS[o.id]}
                label={o.label}
              />
            ))}
          </Question>
          {cfg.integration === "other" && (
            <OtherInput value={cfg.customIntegration} onChange={cfg.setCustomIntegration} placeholder="Which language or SDK?" />
          )}

          <Question title="What are you building?">
            {BUILD_TARGET_OPTIONS.map((o) => (
              <OptionChip
                key={o.id}
                selected={cfg.building === o.id}
                onSelect={() => cfg.setBuilding(o.id)}
                label={o.label}
              />
            ))}
          </Question>
          {cfg.building === "other" && (
            <OtherInput value={cfg.customBuilding} onChange={cfg.setCustomBuilding} placeholder="Describe what you want to build" />
          )}

          <Question title="Where should it run?">
            {EXECUTION_TARGET_OPTIONS.map((o) => (
              <OptionChip
                key={o.id}
                selected={cfg.executionTarget === o.id}
                onSelect={() => cfg.setExecutionTarget(o.id)}
                label={o.label}
              />
            ))}
          </Question>
          {cfg.executionTarget !== "cloud-vm" && (
            <p className="-mt-2 text-[11px] leading-relaxed text-muted-foreground/55">
              Default: the prompt builds the local agent loop — screenshot your screen → /v1 predict →
              execute the actions with pyautogui or Playwright. No VM is provisioned. Pick the cloud VM
              only when you want Coasty to run the machine for you.
            </p>
          )}

          {/* Tailored prompt preview. */}
          <div>
            <div className="mb-2 flex items-center justify-between gap-3">
              <div className="text-[12px] font-medium text-foreground/80">Your prompt</div>
              <div className="shrink-0 text-[10.5px] text-muted-foreground/55">Tailored to your answers</div>
            </div>
            <pre className="max-h-40 overflow-y-auto overflow-x-hidden whitespace-pre-wrap break-words rounded-xl border border-foreground/[0.08] bg-foreground/[0.02] p-3 text-[11px] leading-relaxed text-foreground/70 sm:max-h-52">
              {prompt}
            </pre>
          </div>
        </div>

        {/* Actions — pinned below the scroll area so they stay reachable. */}
        <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-foreground/[0.06] px-5 py-3.5 sm:flex-row sm:items-center sm:justify-end">
          <button
            type="button"
            onClick={() => openIn(CHATGPT_BASE)}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-foreground/[0.1] px-3.5 py-2 text-[12.5px] font-medium text-foreground/75 transition-colors hover:bg-foreground/[0.04] hover:text-foreground"
          >
            <OpenAIMark className="h-4 w-4 text-foreground/80" />
            Open in ChatGPT
          </button>
          <button
            type="button"
            onClick={() => openIn(CLAUDE_BASE)}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-foreground/[0.1] px-3.5 py-2 text-[12.5px] font-medium text-foreground/75 transition-colors hover:bg-foreground/[0.04] hover:text-foreground"
          >
            <ClaudeMark className="h-4 w-4" />
            Open in Claude
          </button>
          <button
            type="button"
            onClick={onCopy}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-foreground px-4 py-2 text-[12.5px] font-semibold text-background shadow-sm transition-colors hover:bg-foreground/90"
          >
            {copied ? <Check className="h-4 w-4" strokeWidth={2.5} /> : <Copy className="h-4 w-4" />}
            {copied ? "Copied" : "Copy prompt"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
