"use client"

import { Markdown } from "@/components/prompt-kit/markdown"
import { cn } from "@/lib/utils"
import {
  CheckCircle,
  XCircle,
  CaretRight,
  Eye,
  Terminal,
  MagnifyingGlass,
  Timer,
  Copy,
  Check,
  Plug,
} from "@phosphor-icons/react"
import { AnimatePresence, motion } from "framer-motion"
import { memo, useEffect, useMemo, useState } from "react"
import { createPortal } from "react-dom"
import type { Components } from "react-markdown"
import { AwaitingHumanBanner } from "./awaiting-human-banner"
import { LinkMarkdown } from "./link-markdown"

// ── Refined Markdown for CUA sections ──
//
// The shared <Markdown> component renders inline `<code>` as a `<span>` with
// `bg-primary-foreground` — a high-contrast token that paints as black-on-white
// in dark mode, which looks harsh inside the cua timeline. We override the
// `code` mapper here so inline code becomes a subtle rounded chip (mono font,
// 0.88em so it visually balances with surrounding text, hairline ring), while
// keeping link rendering via the project's <LinkMarkdown> wrapper.

const CUA_MARKDOWN_COMPONENTS: Partial<Components> = {
  code: function CodeComponent({ className, children, node, ...props }: any) {
    const isInline =
      !node?.position?.start.line ||
      node?.position?.start.line === node?.position?.end.line
    if (isInline) {
      return (
        <span
          className="rounded-md bg-foreground/[0.06] ring-1 ring-foreground/[0.05] px-1.5 py-0.5 font-mono text-[0.88em] text-foreground/90"
          {...props}
        >
          {children}
        </span>
      )
    }
    // Block code: plain <code>, parent's [&_pre] selectors style the wrapper.
    return (
      <code
        className={cn("font-mono text-[12px] text-foreground/80", className)}
        {...props}
      >
        {children}
      </code>
    )
  },
  a: function AComponent({ href, children, ...props }: any) {
    if (!href) return <span {...props}>{children}</span>
    return (
      <LinkMarkdown href={href} {...props}>
        {children}
      </LinkMarkdown>
    )
  },
}

function CuaMarkdown({ children }: { children: string }) {
  return <Markdown components={CUA_MARKDOWN_COMPONENTS}>{children}</Markdown>
}

// ── Types ──

type SectionType =
  | "verification"
  | "analysis"
  | "next-action"
  | "grounded-action"
  | "reflection"
  | "code-agent-summary"
  | "code-agent-thought"
  | "code-agent-result"
  | "code-agent-done"
  | "composio-agent-thought"
  | "composio-agent-search"
  | "composio-agent-result"
  | "composio-agent-done"
  | "composio-agent-reauth"
  | "composio-agent-breaker"
  | "composio-agent-cancelled"
  | "composio-agent-deadline"
  | "action-result"
  | "status"
  | "search-results"
  | "awaiting-human"
  | "awaiting-human-timeout"
  | "awaiting-human-resumed"

interface ParsedSection {
  type: SectionType
  content: string
  attrs: Record<string, string>
}

interface StepGroup {
  kind: "step"
  action: string
  observation: string | null
  code: string | null
  results: { content: string; status: string }[]
}

type TopLevelItem =
  | StepGroup
  | { kind: "status"; content: string; status: string }
  | { kind: "code-agent-thought"; content: string; step: string; budget: string }
  | { kind: "code-agent-result"; content: string; step: string }
  | { kind: "code-agent-done"; content: string; step: string }
  | { kind: "code-agent-summary"; content: string }
  | { kind: "composio-agent-thought"; content: string; step: string }
  | { kind: "composio-agent-search"; content: string; step: string }
  | { kind: "composio-agent-result"; content: string; step: string; toolkit: string; slug: string; status: string }
  | { kind: "composio-agent-done"; content: string }
  | { kind: "composio-agent-reauth"; content: string; toolkit: string }
  | { kind: "composio-agent-note"; content: string }
  | { kind: "search-results"; query: string; content: string }
  | { kind: "awaiting-human"; reason: string; machineId: string }
  | { kind: "awaiting-human-timeout"; content: string }
  | { kind: "awaiting-human-resumed"; content: string }
  | { kind: "text"; content: string }

// ── Parser ──

const TAG_REGEX = /<cua-section\s+([^>]*)>([\s\S]*?)<\/cua-section>/g
const ATTR_REGEX = /(\w[\w-]*)="([^"]*)"/g

function stripAgentCode(text: string): string {
  return text.replace(/```(?:python)?\s*agent\.[\s\S]*?```/g, "").trim()
}

/** Truncate long text with ellipsis, respecting word boundaries */
function truncateText(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text
  const cut = text.lastIndexOf(" ", maxLen)
  return text.slice(0, cut > maxLen * 0.5 ? cut : maxLen) + "…"
}

/**
 * Clean agent code for display: truncate long string args (like code agent prompts),
 * strip excessive \n sequences, and format for readability.
 */
function formatAgentCode(code: string): string {
  // Truncate very long string arguments inside agent calls (e.g. code_agent prompts)
  return code.replace(/"([^"]{200,})"/g, (_match, content: string) => {
    return `"${content.slice(0, 150)}…"`
  })
}

function parseAttributes(attrString: string): Record<string, string> {
  const attrs: Record<string, string> = {}
  let m: RegExpExecArray | null
  while ((m = ATTR_REGEX.exec(attrString)) !== null) {
    attrs[m[1]] = m[2]
  }
  return attrs
}

function parseSections(raw: string): ParsedSection[] {
  const sections: ParsedSection[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null
  TAG_REGEX.lastIndex = 0

  while ((match = TAG_REGEX.exec(raw)) !== null) {
    const before = raw.slice(lastIndex, match.index).trim()
    if (before) {
      sections.push({ type: "next-action" as SectionType, content: before, attrs: { _plain: "true" } })
    }
    const attrs = parseAttributes(match[1])
    sections.push({
      type: (attrs.type ?? "next-action") as SectionType,
      content: match[2].trim(),
      attrs,
    })
    lastIndex = match.index + match[0].length
  }

  const trailing = raw.slice(lastIndex).trim()
  if (trailing) {
    sections.push({ type: "next-action" as SectionType, content: trailing, attrs: { _plain: "true" } })
  }
  return sections
}

// ── Grouping ──

const OBSERVATION_TYPES = new Set<SectionType>(["verification", "analysis", "reflection"])

function buildTopLevel(sections: ParsedSection[]): TopLevelItem[] {
  const items: TopLevelItem[] = []
  let i = 0
  let pendingStep: StepGroup | null = null

  function flushStep() {
    if (pendingStep) {
      items.push(pendingStep)
      pendingStep = null
    }
  }

  while (i < sections.length) {
    const s = sections[i]

    if (OBSERVATION_TYPES.has(s.type)) {
      const parts: string[] = []
      while (i < sections.length && OBSERVATION_TYPES.has(sections[i].type)) {
        parts.push(sections[i].content)
        i++
      }
      const merged = parts.join("\n\n")
      if (pendingStep && pendingStep.action) flushStep()
      if (!pendingStep) {
        pendingStep = { kind: "step", action: "", observation: merged, code: null, results: [] }
      } else {
        pendingStep.observation = pendingStep.observation
          ? pendingStep.observation + "\n\n" + merged
          : merged
      }
      continue
    }

    if (s.type === "next-action") {
      if (pendingStep && pendingStep.action) flushStep()
      if (!pendingStep) {
        pendingStep = { kind: "step", action: "", observation: null, code: null, results: [] }
      }
      if (s.attrs._plain === "true") {
        flushStep()
        items.push({ kind: "text", content: s.content })
      } else {
        pendingStep.action = s.content
      }
    } else if (s.type === "grounded-action") {
      if (pendingStep) pendingStep.code = s.content
    } else if (s.type === "action-result") {
      if (pendingStep) pendingStep.results.push({ content: s.content, status: s.attrs.status || "success" })
    } else if (s.type === "status") {
      flushStep()
      items.push({ kind: "status", content: s.content, status: s.attrs.status || "completed" })
    } else if (s.type === "code-agent-thought") {
      flushStep()
      items.push({ kind: "code-agent-thought", content: s.content, step: s.attrs.step || "", budget: s.attrs.budget || "" })
    } else if (s.type === "code-agent-result") {
      flushStep()
      items.push({ kind: "code-agent-result", content: s.content, step: s.attrs.step || "" })
    } else if (s.type === "code-agent-done") {
      flushStep()
      items.push({ kind: "code-agent-done", content: s.content, step: s.attrs.step || "" })
    } else if (s.type === "code-agent-summary") {
      flushStep()
      items.push({ kind: "code-agent-summary", content: s.content })
    } else if (s.type === "composio-agent-thought") {
      flushStep()
      items.push({ kind: "composio-agent-thought", content: s.content, step: s.attrs.step || "" })
    } else if (s.type === "composio-agent-search") {
      flushStep()
      items.push({ kind: "composio-agent-search", content: s.content, step: s.attrs.step || "" })
    } else if (s.type === "composio-agent-result") {
      flushStep()
      items.push({ kind: "composio-agent-result", content: s.content, step: s.attrs.step || "", toolkit: s.attrs.toolkit || "", slug: s.attrs.slug || "", status: s.attrs.status || "success" })
    } else if (s.type === "composio-agent-done") {
      flushStep()
      items.push({ kind: "composio-agent-done", content: s.content })
    } else if (s.type === "composio-agent-reauth") {
      flushStep()
      items.push({ kind: "composio-agent-reauth", content: s.content, toolkit: s.attrs.toolkit || "" })
    } else if (
      s.type === "composio-agent-breaker" ||
      s.type === "composio-agent-cancelled" ||
      s.type === "composio-agent-deadline"
    ) {
      flushStep()
      items.push({ kind: "composio-agent-note", content: s.content })
    } else if (s.type === "search-results") {
      flushStep()
      items.push({ kind: "search-results", query: s.attrs.query || "", content: s.content })
    } else if (s.type === "awaiting-human") {
      flushStep()
      items.push({ kind: "awaiting-human", reason: s.attrs.reason || s.content, machineId: s.attrs.machineId || s.attrs.machineid || "" })
    } else if (s.type === "awaiting-human-timeout") {
      flushStep()
      items.push({ kind: "awaiting-human-timeout", content: s.content })
    } else if (s.type === "awaiting-human-resumed") {
      flushStep()
      items.push({ kind: "awaiting-human-resumed", content: s.content })
    }

    i++
  }

  flushStep()
  return items
}

// ── Screenshot Lightbox ──

function ScreenshotLightbox({
  src,
  onClose,
}: {
  src: string
  onClose: () => void
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [onClose])

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm cursor-zoom-out"
      onClick={onClose}
    >
      <motion.img
        src={src}
        alt="Screenshot"
        initial={{ scale: 0.92 }}
        animate={{ scale: 1 }}
        exit={{ scale: 0.95 }}
        transition={{ type: "spring", stiffness: 400, damping: 25 }}
        className="max-w-[90vw] max-h-[90vh] rounded-lg object-contain"
        onClick={(e) => e.stopPropagation()}
      />
    </motion.div>,
    document.body
  )
}

// ── Screenshot Thumbnail (replaces timeline dot) ──

function ScreenshotDot({ src }: { src: string }) {
  const [lightboxOpen, setLightboxOpen] = useState(false)

  // Micro-interactions:
  //   • Rest        — tilted -7° to match TerminalDot's character.
  //   • Hover       — straightens to 0°, scales up 12%, lifts 1px, and
  //                   the shadow + ring intensify. Reads as "the
  //                   screenshot is righting itself for inspection."
  //   • Press       — quick scale-down + slight counter-tilt for a
  //                   tactile click response.
  // Springs are tuned snappy (stiffness 380 / damping 25) so the
  // interactions feel responsive rather than bouncy.
  return (
    <>
      <motion.button
        type="button"
        onClick={() => setLightboxOpen(true)}
        aria-label="View screenshot"
        initial={false}
        animate={{ rotate: -7, scale: 1, y: 0 }}
        whileHover={{ rotate: 0, scale: 1.12, y: -1 }}
        whileTap={{ scale: 0.95, rotate: -3 }}
        transition={{ type: "spring", stiffness: 380, damping: 25 }}
        className={cn(
          // 36×22 landscape — close to 16:10 screen aspect so the
          // thumbnail reads as a tiny screen rather than a generic
          // square chip. Position -left-[15px] keeps the dot's center
          // on the timeline rail at x=3 (36/2 - 3 = 15).
          "absolute -left-[15px] top-[3px] z-[2] block h-[22px] w-[36px] cursor-pointer overflow-hidden rounded-[5px]",
          "ring-1 ring-black/[0.06] dark:ring-white/[0.08]",
          "shadow-[0_1px_2px_rgba(0,0,0,0.06),0_3px_6px_rgba(0,0,0,0.04)]",
          // Shadow + ring transitions handled by CSS since they're not
          // on Framer Motion's animatable transform path.
          "transition-[box-shadow,outline-color] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]",
          "hover:ring-black/[0.12] dark:hover:ring-white/[0.16]",
          "hover:shadow-[0_3px_8px_rgba(0,0,0,0.10),0_8px_24px_rgba(0,0,0,0.08)]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/40",
        )}
      >
        <img src={src} alt="" className="size-full object-cover" draggable={false} />
      </motion.button>

      <AnimatePresence>
        {lightboxOpen && (
          <ScreenshotLightbox src={src} onClose={() => setLightboxOpen(false)} />
        )}
      </AnimatePresence>
    </>
  )
}

// ── Plain Timeline Dot (no screenshot) — no-op with dotted line ──
// Kept as a stub so StepCard doesn't need restructuring.

function PlainDot({ status: _status }: { status: "success" | "error" | "pending" }) {
  return null
}

// ── Primitives ──

function stripAgentMarkup(raw: string): string {
  // The code agent wraps each command/answer in <answer>...</answer>
  // tags and wraps stdout in ``` fences. Strip both so the user sees
  // clean text — these are internal markers, not user-facing markup.
  // Used by every code-agent-* section type (thought, result, summary)
  // since the agent can leak the tags into any of them.
  return raw
    // Strip <answer> / </answer> tags wherever they appear (inline OR
    // on their own line). The backend produces both forms.
    .replace(/<\/?answer\b[^>]*>/gi, "")
    // Strip inline triple-backtick fences with an optional language tag
    // (e.g. ```bash ...```) wherever they appear.
    .replace(/```\w*\s*/g, "")
    .replace(/\s*```/g, "")
    // Strip lone fence lines that survived (``` on its own line).
    .split("\n")
    .filter((line) => !/^\s*```\s*\w*\s*$/.test(line))
    .join("\n")
    // Collapse runs of 3+ blank lines down to one for tidiness.
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

function CopyButton({
  text,
  className,
}: {
  text: string
  className?: string
}) {
  const [copied, setCopied] = useState(false)

  const onClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (typeof navigator === "undefined" || !navigator.clipboard) return
    void navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={copied ? "Copied" : "Copy result"}
      title={copied ? "Copied" : "Copy"}
      className={cn(
        "-mr-1 inline-flex size-6 items-center justify-center rounded-md text-foreground/35 transition-all duration-150 hover:bg-foreground/[0.06] hover:text-foreground/80 active:scale-95",
        className
      )}
    >
      {copied ? (
        <Check weight="bold" className="size-3 text-emerald-500" />
      ) : (
        <Copy weight="regular" className="size-3" />
      )}
    </button>
  )
}

function DetailRow({
  icon: Icon,
  label,
  children,
  defaultOpen = false,
}: {
  icon: React.ComponentType<any>
  label: string
  children: React.ReactNode
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="group/detail flex items-center gap-1.5 py-0.5 text-[12px] font-medium tracking-tight text-foreground/40 hover:text-foreground/70 transition-colors"
      >
        <CaretRight
          weight="bold"
          className={cn(
            "size-2.5 shrink-0 transition-transform duration-200 ease-out",
            open && "rotate-90"
          )}
        />
        <Icon className="size-3 shrink-0 opacity-70 group-hover/detail:opacity-100 transition-opacity" />
        <span>{label}</span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <div className="ml-[22px] pb-2 pt-0.5 text-[14px] leading-relaxed text-foreground/60">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function StatusDot({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "inline-block size-[5px] rounded-full shrink-0",
        status === "success" && "bg-emerald-500",
        status === "error" && "bg-red-500",
        status !== "success" && status !== "error" && "bg-foreground/20",
      )}
    />
  )
}

// ── Unified content primitives (the redesign system) ──
//
// Every section's CONTENT (everything to the RIGHT of the timeline rail) is
// built from this tiny vocabulary so all ~15 section types share one type
// scale, one color ladder, and one set of surfaces. The rail / dots / shimmer
// are deliberately untouched — they are the single signature element.
//
//   • prose  = text-[14px] leading-relaxed   (tier by opacity: /90 /60 /40)
//   • meta   = text-[12px]                    (labels, chips, status words)
//   • mono   = font-mono text-[12.5px]        (code surfaces only, /80)
//   • COLOR is reserved for STATUS (emerald success / red error / amber
//     attention). Everything else lives on the neutral foreground opacity
//     ladder, so the eye reads color as "an outcome happened", nothing else.

type Tone = "success" | "error" | "attention"

const TONE_TEXT: Record<Tone, string> = {
  success: "text-emerald-500",
  error: "text-red-500",
  attention: "text-amber-500",
}
const TONE_MOMENT: Record<Tone, string> = {
  success: "ring-emerald-500/20 bg-emerald-500/[0.05] text-emerald-600 dark:text-emerald-400",
  error: "ring-red-500/20 bg-red-500/[0.05] text-red-600 dark:text-red-400",
  attention: "ring-amber-500/20 bg-amber-500/[0.05] text-amber-600 dark:text-amber-400",
}

/** Faint caption/header sitting above a block (e.g. "Session summary"). */
function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-1 text-[12px] font-medium tracking-tight text-foreground/40">
      {children}
    </div>
  )
}

/** The single delegation tag. Neutral by design — color is for status only. */
function Chip({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 shrink-0 rounded-full px-2 py-0.5 text-[12px] font-medium text-foreground/70 ring-1 ring-inset ring-foreground/10 bg-foreground/[0.04]">
      {icon}
      {children}
    </span>
  )
}

/** Soft tinted container for terminal/important states — one radius, one ring
 *  weight, one padding everywhere (status, reauth, awaiting-human lifecycle). */
function MomentPill({
  tone,
  icon,
  children,
}: {
  tone: Tone
  icon?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-[12px] font-medium ring-1 ring-inset",
        TONE_MOMENT[tone],
      )}
    >
      {icon}
      <span>{children}</span>
    </div>
  )
}

/** Bare status line (no container) — a tone dot + text. Used for the quiet
 *  sub-agent "done" notes so they read as a soft beat, not a banner. */
function StatusLine({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-[12px]", TONE_TEXT[tone])}>
      <StatusDot status={tone === "attention" ? "pending" : tone} />
      {children}
    </span>
  )
}

/** The single code/console surface — shared by the running command (thought)
 *  and its output (result). Hairline ring, subtle fill, mono body, hover copy. */
function CodeSurface({ text, error = false }: { text: string; error?: boolean }) {
  return (
    <div className="group/code relative overflow-hidden rounded-lg ring-1 ring-inset ring-foreground/[0.06] bg-foreground/[0.02]">
      <div className="absolute right-1.5 top-1.5 z-[1] opacity-0 transition-opacity duration-150 group-hover/code:opacity-100">
        <CopyButton text={text} />
      </div>
      <pre
        className={cn(
          "m-0 px-3.5 pr-10 py-3 font-mono text-[12.5px] leading-[1.6] tabular-nums whitespace-pre-wrap break-words min-w-0 overflow-hidden",
          error ? "text-red-500/90 dark:text-red-400/90" : "text-foreground/80",
        )}
      >
        {text}
      </pre>
    </div>
  )
}

// ── Step ──

/** Extract a short task description from agent.call_code_agent(...) code */
function extractCodeAgentTask(code: string): string | null {
  const match = code.match(/agent\.call_code_agent\s*\(\s*task\s*=\s*"([\s\S]*?)(?:"\s*[,)])/)
    || code.match(/agent\.call_code_agent\s*\(\s*task\s*=\s*'([\s\S]*?)(?:'\s*[,)])/)
  if (!match) return null
  return match[1].replace(/\\n/g, " ").trim()
}

/**
 * Composio (Integration) action parser — mirrors the backend's
 * `_describe_agent_action` handler for composio_* methods. The backend
 * already produces a humanized next-action label ("Search the OUTLOOK
 * integration for 'send email'"); this parser only needs to surface the
 * TOOLKIT so the pill can show that integration's logo. The natural-
 * language label already conveys the query/action verbatim, so we don't
 * re-render it as a noisy detail row.
 *
 * Returns null when the code isn't a composio_* call. When it is:
 *   - method:   "search" | "call" | "actions"
 *   - toolkit:  uppercase toolkit slug (best-effort, may be "" for
 *               toolkit-less composio_search calls).
 */
type IntegrationKind = "search" | "call" | "actions"
interface IntegrationAction {
  method: IntegrationKind
  toolkit: string
}

function extractIntegrationAction(code: string): IntegrationAction | null {
  // composio_search(query?, toolkits=[...], limit=N)
  if (/agent\.composio_search\s*\(/.test(code)) {
    let toolkit = ""
    const tk = code.match(/toolkits\s*=\s*\[\s*([^\]]*)\]/)
    if (tk) {
      // Pull the FIRST entry; the pill renders one toolkit slug. If
      // multiple toolkits are searched, the backend's natural-language
      // label already enumerates them in the line above the pill.
      const first = tk[1].match(/["']([^"']+)["']/)
      if (first) toolkit = first[1].toUpperCase()
    }
    return { method: "search", toolkit }
  }

  // composio_call("TOOLKIT_ACTION", ...kwargs) — toolkit is the prefix
  // segment before the first underscore.
  const callMatch = code.match(/agent\.composio_call\s*\(\s*["']([A-Z0-9_]+)["']/)
  if (callMatch) {
    const toolkit = callMatch[1].split("_")[0] || ""
    return { method: "call", toolkit }
  }

  // composio_actions("toolkit", search=?, limit=N)
  const actionsMatch = code.match(/agent\.composio_actions\s*\(\s*["']([^"']+)["']/)
  if (actionsMatch) {
    return { method: "actions", toolkit: actionsMatch[1].toUpperCase() }
  }

  return null
}

/**
 * Compact toolkit logo for the Integration pill.
 *
 * Sourced from `https://logos.composio.dev/api/<slug>` — Composio's
 * public logo CDN, same source that powers the connections page. The
 * image renders at its natural SVG size inside the pill chip (no tile,
 * no ring, no forced background) so it sits "relaxed" next to the chip
 * text the way the Terminal icon sits next to "Code Agent". On 404 /
 * network error we silently fall back to a Plug glyph — a broken-image
 * outline never appears.
 *
 * Uses a React state flag (rather than `onError` mutating the src
 * in-place) so a slug change resets the fallback automatically — eg.
 * a StepCard streaming outlook → gmail won't be permanently locked into
 * the plug icon.
 */
function IntegrationLogo({ toolkit }: { toolkit: string }) {
  const slug = toolkit.trim().toLowerCase()
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    setFailed(false)
  }, [slug])

  if (!slug || failed) {
    return <Plug className="size-2.5 shrink-0" weight="fill" />
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- 3rd-party CDN,
    // no Image() optimization benefit for an inline SVG.
    <img
      src={`https://logos.composio.dev/api/${slug}`}
      alt=""
      className="h-3 w-3 shrink-0 object-contain"
      onError={() => setFailed(true)}
    />
  )
}

/** Check if grounded action code is an agent function call (code_agent, wait, etc.) */
function extractAgentAction(code: string): { type: string; label: string; detail?: string } | null {
  // Code agent
  const codeAgentTask = extractCodeAgentTask(code)
  if (codeAgentTask || /agent\.call_code_agent/.test(code)) {
    return { type: "code-agent", label: "Code Agent", detail: codeAgentTask || undefined }
  }
  return null
}

/**
 * Detect the worker's `agent.call_composio(...)` DELEGATION (the post-refactor
 * entry point — the inline composio_call/search/actions primitives are retired).
 * Returns the optional narrow-task string the worker passed, or {} for a no-arg
 * full-task delegation. Returns null when the code isn't a call_composio.
 */
function extractComposioDelegation(code: string): { task?: string } | null {
  const m =
    code.match(/agent\.call_composio\s*\(\s*(?:task\s*=\s*)?"([\s\S]*?)(?:"\s*[,)])/) ||
    code.match(/agent\.call_composio\s*\(\s*(?:task\s*=\s*)?'([\s\S]*?)(?:'\s*[,)])/)
  if (m) return { task: m[1].replace(/\\n/g, " ").trim() || undefined }
  if (/agent\.call_composio\s*\(/.test(code)) return {}
  return null
}

/** "gmail" → "Gmail", "google_drive" → "Google Drive" */
function humanizeToolkit(toolkit: string): string {
  return (toolkit || "")
    .split("_")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ")
}

/** "GMAIL_SEND_EMAIL" + toolkit "gmail" → "Send email" (toolkit prefix dropped, sentence-cased). */
function humanizeAction(slug: string, toolkit: string): string {
  if (!slug) return ""
  let rest = slug
  const tkUpper = (toolkit || "").toUpperCase()
  if (tkUpper && rest.toUpperCase().startsWith(tkUpper + "_")) {
    rest = rest.slice(tkUpper.length + 1)
  }
  const words = rest.replace(/_/g, " ").trim().toLowerCase()
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : ""
}

/**
 * Timeline marker for Composio sub-agent items — the integration equivalent of
 * TerminalDot. A small upright tile with a SOLID surface so the (often colored)
 * brand logo reads cleanly against the timeline. Centered on the rail at +3px
 * (-left-[8px] + 22/2 = 3).
 */
function IntegrationDot({ toolkit }: { toolkit: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "absolute -left-[8px] top-[1px] z-[2]",
        "flex h-[22px] w-[22px] items-center justify-center rounded-[6px]",
        // Solid surface (not a translucent tint) so it sits as a distinct object.
        "bg-white dark:bg-neutral-800",
        "ring-1 ring-black/[0.06] dark:ring-white/[0.08]",
        "shadow-[0_1px_2px_rgba(0,0,0,0.08),0_2px_5px_rgba(0,0,0,0.04)]",
      )}
    >
      <IntegrationLogo toolkit={toolkit} />
    </div>
  )
}

function StepCard({
  step,
  screenshot,
}: {
  step: StepGroup
  screenshot?: string | null
}) {
  const actionText = step.action ? stripAgentCode(step.action) : ""
  const hasDetails = step.observation || step.code || step.results.length > 0

  if (!actionText && !hasDetails) return null

  const hasError = step.results.some(r => r.status === "error")
  const isDone = step.results.length > 0
  const status: "success" | "error" | "pending" = hasError
    ? "error"
    : isDone
      ? "success"
      : "pending"
  const hasScreenshot = !!screenshot
  // Integration pill takes precedence over the generic Code Agent pill
  // because both could match if a future composio_* slug ever overlaps
  // with the code-agent regex. extractIntegrationAction returns null for
  // non-composio code, so this is a no-op for all other action types.
  const integrationAction = step.code ? extractIntegrationAction(step.code) : null
  const composioDelegation =
    !integrationAction && step.code ? extractComposioDelegation(step.code) : null
  const agentAction =
    !integrationAction && !composioDelegation && step.code ? extractAgentAction(step.code) : null
  const isDelegation = !!(agentAction || composioDelegation)

  // A delegation's eval returns a no-op `time.sleep(...)`, which the executor
  // surfaces as a "Waiting about N seconds…" line/badge. Drop it on delegation
  // steps — the real result comes from the sub-agent's own timeline sections.
  const isWaitNoop = (s: string) => /^\s*waiting\b[\s\S]*\bseconds?\b/i.test(s)
  const showAction = actionText && !(isDelegation && isWaitNoop(actionText))
  const visibleResults = isDelegation
    ? step.results.filter((r) => !isWaitNoop(r.content))
    : step.results

  return (
    // Bottom padding intentionally omitted — the parent timeline uses a
    // uniform `gap-y` to space adjacent items, so individual cards stay
    // tight internally and breathing room lives at the seam between them.
    <div className={cn("group/step relative", hasScreenshot ? "pl-8" : "pl-6")}>
      {hasScreenshot ? (
        <ScreenshotDot src={screenshot!} />
      ) : (
        <PlainDot status={status} />
      )}

      {/* Action — the natural-language line. Canonical timeline prose:
          14px / leading-relaxed / sans, matched by every other prose line. */}
      {showAction && (
        <p className="text-[14px] leading-relaxed text-foreground/90 break-words overflow-hidden">
          {truncateText(actionText, 200)}
        </p>
      )}

      {/* Integration primitive (legacy) — one neutral Chip + a faint verb. */}
      {integrationAction && (
        <div className="mt-1 flex items-center gap-2 flex-wrap min-w-0">
          <Chip icon={<IntegrationLogo toolkit={integrationAction.toolkit} />}>
            {humanizeToolkit(integrationAction.toolkit) || "Integration"}
          </Chip>
          <span className="text-[12px] text-foreground/40">
            {integrationAction.method === "search" && "search"}
            {integrationAction.method === "call" && "run"}
            {integrationAction.method === "actions" && "browse"}
          </span>
        </div>
      )}

      {/* Integration delegation — the one neutral Chip + the (secondary) task.
          The per-toolkit logo appears later on the result row. */}
      {composioDelegation && (
        <div className="mt-1 flex items-center gap-2 flex-wrap min-w-0">
          <Chip icon={<Plug weight="fill" className="size-3 shrink-0" />}>Integration</Chip>
          {composioDelegation.task && (
            <span className="text-[14px] leading-snug text-foreground/60 break-words min-w-0">
              {truncateText(composioDelegation.task, 140)}
            </span>
          )}
        </div>
      )}

      {/* Code-agent delegation — same neutral Chip treatment. */}
      {agentAction && (
        <div className="mt-1 flex items-center gap-2 flex-wrap min-w-0">
          <Chip icon={<Terminal className="size-3 shrink-0" />}>{agentAction.label}</Chip>
          {agentAction.detail && (
            <span className="text-[14px] leading-snug text-foreground/60 break-words min-w-0">
              {truncateText(agentAction.detail, 140)}
            </span>
          )}
        </div>
      )}

      {/* Inline results — bare status rows (no pills): a tone dot + the
          outcome. Only the dot (and error text) carries color, so a column
          of successful steps stays calm. Wait no-ops filtered on delegations. */}
      {visibleResults.length > 0 && (
        <div className="flex flex-col gap-y-0.5 mt-1">
          {visibleResults.map((r, j) => (
            <span
              key={j}
              className={cn(
                "inline-flex items-center gap-1.5 text-[12px] min-w-0",
                r.status === "error" ? "text-red-500" : "text-foreground/60",
              )}
            >
              <StatusDot status={r.status} />
              <span className="break-words min-w-0">{truncateText(r.content, 120)}</span>
            </span>
          ))}
        </div>
      )}

      {/* Expandable details */}
      {step.observation && (
        <div className="mt-0.5">
          <DetailRow icon={Eye} label="What it noticed">
            <CuaMarkdown>{step.observation}</CuaMarkdown>
          </DetailRow>
        </div>
      )}
    </div>
  )
}

// ── Timeline markers for non-step items ──

function TerminalDot() {
  // The code-step equivalent of ScreenshotDot. A small solid-black
  // rectangle — slightly tilted (-7deg) for character — with a mono
  // `>_` prompt in white. Minimal: no title bar, no traffic lights —
  // just the silhouette of a terminal screen and a prompt cursor.
  // Layers:
  //   • neutral-950 base — the canonical "terminal black" surface
  //   • subtle ring (light/dark adaptive) defines the outer edge
  //   • inset-top white highlight + layered drop shadows for depth
  return (
    <div
      aria-hidden="true"
      className={cn(
        "absolute -left-[13px] top-[2px]",
        "flex h-[22px] w-[32px] items-center justify-center",
        "rounded-[6px] -rotate-[7deg]",
        "bg-neutral-950",
        "ring-1 ring-black/40 dark:ring-white/[0.08]",
        "shadow-[0_2px_6px_rgba(0,0,0,0.18),0_5px_14px_rgba(0,0,0,0.08),inset_0_1px_0_rgba(255,255,255,0.08)]",
      )}
    >
      <span className="font-mono text-[10px] font-bold leading-none tracking-tight text-neutral-100/90">
        {">_"}
      </span>
    </div>
  )
}

// ── Item Renderer ──

function ItemRenderer({
  item,
  screenshot,
  isStreaming,
}: {
  item: TopLevelItem
  screenshot?: string | null
  isStreaming?: boolean
}) {
  switch (item.kind) {
    case "step":
      return <StepCard step={item} screenshot={screenshot} />

    case "status": {
      const done = item.status === "completed"
      return (
        <div className="pl-6">
          <MomentPill
            tone={done ? "success" : "error"}
            icon={
              done ? (
                <CheckCircle className="size-3.5 shrink-0" weight="fill" />
              ) : (
                <XCircle className="size-3.5 shrink-0" weight="fill" />
              )
            }
          >
            {item.content}
          </MomentPill>
        </div>
      )
    }

    case "code-agent-thought": {
      // The running command (with the agent's narrative occasionally mixed
      // in). Markdown is bypassed — it turned Python comments into <h1> and
      // `>` lines into blockquotes — so the whole block renders in the one
      // shared CodeSurface, identical to its output below.
      const cleaned = truncateText(stripAgentMarkup(item.content), 3000)
      if (!cleaned) return null
      return (
        <div className="pl-6">
          <CodeSurface text={cleaned} />
        </div>
      )
    }

    case "code-agent-result": {
      // The command's output — the SAME CodeSurface as the thought above,
      // behind a TerminalDot rail marker. Errors tint the body red; no
      // other chrome distinguishes it.
      const cleaned = stripAgentMarkup(item.content)
      if (!cleaned) return null
      const hasError = /\bError:\s/.test(cleaned)
      return (
        <div className="relative pl-8">
          <TerminalDot />
          <CodeSurface text={cleaned} error={hasError} />
        </div>
      )
    }

    case "code-agent-done":
      return (
        <div className="pl-6">
          <StatusLine tone="success">{item.content}</StatusLine>
        </div>
      )

    case "code-agent-summary": {
      // The agent's end-of-execution recap. No card chrome, no sparkle
      // icon, no decorative gradient — just a small muted label and
      // clean prose. Copy button hovers in the top-right at low opacity
      // until the group is hovered. stripAgentMarkup filters any
      // <answer> tags / fences the agent leaks into the summary too.
      // Cap at 5000 chars (very generous — most summaries fit easily).
      const cleaned = truncateText(stripAgentMarkup(item.content), 5000)
      if (!cleaned) return null
      return (
        <div className="group/summary relative pl-6">
          <div className="absolute right-1 top-0 opacity-0 transition-opacity duration-150 group-hover/summary:opacity-100">
            <CopyButton text={cleaned} />
          </div>
          <Eyebrow>Session summary</Eyebrow>
          <div
            className={cn(
              "text-[14px] leading-relaxed text-foreground/90",
              // Containment: long unbreakable strings wrap inside the
              // bubble instead of pushing it wider.
              "min-w-0 overflow-hidden break-words",
              "[&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
              "[&_p]:my-2",
              "[&_strong]:font-semibold [&_strong]:text-foreground",
              "[&_em]:italic [&_em]:text-foreground/60",
              "[&_ul]:my-2 [&_ul]:space-y-0.5 [&_ul]:pl-4",
              "[&_ol]:my-2 [&_ol]:space-y-0.5 [&_ol]:pl-5",
              "[&_li]:marker:text-foreground/40 [&_li]:leading-relaxed",
              // Headings collapse to body size + weight — the timeline keeps
              // a flat type scale; emphasis comes from weight, not size.
              "[&_h1]:mt-3 [&_h1]:mb-1 [&_h1]:text-[14px] [&_h1]:font-semibold [&_h1]:text-foreground",
              "[&_h2]:mt-3 [&_h2]:mb-1 [&_h2]:text-[14px] [&_h2]:font-semibold [&_h2]:text-foreground",
              "[&_h3]:mt-2.5 [&_h3]:mb-1 [&_h3]:text-[14px] [&_h3]:font-medium [&_h3]:text-foreground",
              "[&_pre]:my-2 [&_pre]:rounded-lg [&_pre]:ring-1 [&_pre]:ring-inset [&_pre]:ring-foreground/[0.06] [&_pre]:!bg-foreground/[0.02] [&_pre]:p-3",
              "[&_pre]:whitespace-pre-wrap [&_pre]:break-words [&_pre]:overflow-x-hidden",
              "[&_code]:break-words",
              "[&_a]:text-foreground [&_a]:underline [&_a]:underline-offset-[3px] [&_a]:decoration-foreground/30 hover:[&_a]:decoration-foreground/60 [&_a]:break-all",
              "[&_blockquote]:my-2 [&_blockquote]:border-l-2 [&_blockquote]:border-foreground/15 [&_blockquote]:pl-3 [&_blockquote]:text-foreground/60 [&_blockquote]:italic"
            )}
          >
            <CuaMarkdown>{cleaned}</CuaMarkdown>
          </div>
        </div>
      )
    }

    case "composio-agent-thought": {
      // Sub-agent reasoning — the secondary prose tier (/60) so the
      // integration timeline reads as calm progress, not noise.
      const cleaned = truncateText(stripAgentMarkup(item.content), 600)
      if (!cleaned) return null
      return (
        <p className="pl-6 text-[14px] leading-relaxed text-foreground/60 break-words min-w-0 overflow-hidden">
          {cleaned}
        </p>
      )
    }

    case "composio-agent-search": {
      // Candidate-action discovery — folded behind progressive disclosure so
      // the default timeline stays clean; curious users can expand it.
      const cleaned = stripAgentMarkup(item.content)
      if (!cleaned) return null
      return (
        <div className="pl-6">
          <DetailRow icon={MagnifyingGlass} label="Searched connected apps">
            <CuaMarkdown>{cleaned}</CuaMarkdown>
          </DetailRow>
        </div>
      )
    }

    case "composio-agent-result": {
      // Signature element — a single clean line: the integration name + the
      // humanized action it ran, with a success/error tick. The raw API payload
      // is intentionally NOT shown (it's noise); the dot carries the live logo.
      const isError =
        item.status === "error" || /\bError:\s/.test(stripAgentMarkup(item.content))
      const toolkitName = humanizeToolkit(item.toolkit)
      const fn = humanizeAction(item.slug, item.toolkit)
      const errMsg = isError
        ? truncateText(stripAgentMarkup(item.content).replace(/^Error:\s*/i, ""), 140)
        : ""
      return (
        <div className="relative pl-8">
          <IntegrationDot toolkit={item.toolkit} />
          <div className="flex min-h-[22px] items-center gap-1.5">
            <span className="text-[14px] leading-snug text-foreground/90">
              {toolkitName || "Integration"}
              {fn && <span className="text-foreground/40">{" · "}{fn}</span>}
            </span>
            {isError ? (
              <XCircle className="size-3.5 shrink-0 text-red-500" weight="fill" />
            ) : (
              <CheckCircle className="size-3.5 shrink-0 text-emerald-500" weight="fill" />
            )}
          </div>
          {errMsg && (
            <p className="mt-0.5 text-[12px] leading-relaxed text-red-500 dark:text-red-400 break-words">
              {errMsg}
            </p>
          )}
        </div>
      )
    }

    case "composio-agent-done":
      return (
        <div className="pl-6">
          <StatusLine tone="success">{item.content}</StatusLine>
        </div>
      )

    case "composio-agent-reauth":
      return (
        <div className="pl-6">
          <MomentPill tone="attention" icon={<IntegrationLogo toolkit={item.toolkit} />}>
            {item.content}
          </MomentPill>
        </div>
      )

    case "composio-agent-note": {
      const cleaned = item.content.trim()
      if (!cleaned) return null
      return <p className="pl-6 text-[12px] text-foreground/40">{cleaned}</p>
    }

    case "search-results": {
      const label = item.query ? `Search · ${item.query}` : "Web search"
      return (
        <div className="pl-6">
          <DetailRow icon={MagnifyingGlass} label={label} defaultOpen>
            <CuaMarkdown>{item.content}</CuaMarkdown>
          </DetailRow>
        </div>
      )
    }

    case "awaiting-human":
      return (
        <div className="relative pl-6 py-2">
          <AwaitingHumanBanner
            reason={item.reason}
            machineId={item.machineId}
            isActive={isStreaming}
          />
        </div>
      )

    case "awaiting-human-timeout":
      return (
        <div className="pl-6">
          <MomentPill tone="attention" icon={<Timer className="size-3.5 shrink-0" weight="fill" />}>
            {item.content}
          </MomentPill>
        </div>
      )

    case "awaiting-human-resumed":
      return (
        <div className="pl-6">
          <MomentPill tone="success" icon={<CheckCircle className="size-3.5 shrink-0" weight="fill" />}>
            Human finished. Agent resuming with fresh screen state.
          </MomentPill>
        </div>
      )

    case "text": {
      const cleaned = stripAgentCode(item.content)
      if (!cleaned) return null
      return (
        <div
          className={cn(
            "pl-6 text-[14px] leading-relaxed text-foreground/90",
            "min-w-0 overflow-hidden break-words",
            "[&_pre]:whitespace-pre-wrap [&_pre]:break-words [&_pre]:overflow-x-hidden",
            "[&_code]:break-words",
            "[&_a]:break-all",
          )}
        >
          <CuaMarkdown>{truncateText(cleaned, 500)}</CuaMarkdown>
        </div>
      )
    }

    default:
      return null
  }
}

// ── Live "still working" pulse ──
//
// Shown at the foot of the timeline while `isStreaming` is true, to signal
// that the agent is still active between sections. The pulse hides itself
// in any state where another live signal already exists (the
// AwaitingHumanBanner has its own timer + resume button) or where work has
// visibly concluded (status=completed, code-agent-done, summary). That
// keeps the indicator from contradicting what the user just read.

type ThinkingVisibility = "show" | "hidden"

function shouldShowThinking(items: TopLevelItem[]): ThinkingVisibility {
  if (items.length === 0) return "show"
  const last = items[items.length - 1]
  switch (last.kind) {
    case "awaiting-human":
    case "awaiting-human-timeout":
      return "hidden"
    case "status":
      // Terminal — completed or error; either way the agent is done.
      return "hidden"
    case "code-agent-done":
    case "code-agent-summary":
      return "hidden"
    default:
      return "show"
  }
}

function ThinkingPulse() {
  // Muted "Thinking" label with the .text-shine glow sweep — the same
  // self-contained text effect used for page-loader titles. The timeline
  // rail to the left already serves as the visual border, so no extra
  // chrome is added here: just the shimmering word at the same pl-6
  // indent as every other item in the timeline.
  return (
    <motion.div
      initial={{ opacity: 0, y: 3 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      role="status"
      aria-live="polite"
      aria-label="Agent is working"
      className="pl-6"
    >
      <span className="text-shine text-[13.5px] font-medium tracking-tight text-muted-foreground">
        Thinking
      </span>
    </motion.div>
  )
}

// ── Screenshot extraction helper ──

function toDataUri(raw: string): string | null {
  const clean = raw.trim()
  if (!clean) return null
  if (clean.startsWith("data:image/")) return clean
  if (clean.startsWith("/9j/")) return `data:image/jpeg;base64,${clean}`
  if (clean.startsWith("iVBOR")) return `data:image/png;base64,${clean}`
  return `data:image/jpeg;base64,${clean}`
}

/** Extract all screenshots from message parts in order */
export function extractScreenshots(
  parts?: Array<{ type: string; toolInvocation?: any }>
): string[] {
  if (!parts) return []
  const screenshots: string[] = []

  for (const part of parts) {
    if (part.type !== "tool-invocation" || !part.toolInvocation) continue
    const inv = part.toolInvocation as any

    // DB-persisted format
    if (inv.frontendScreenshot && typeof inv.frontendScreenshot === "string") {
      const uri = toDataUri(inv.frontendScreenshot)
      if (uri) {
        screenshots.push(uri)
        continue
      }
    }

    // Streaming format
    if (
      inv.state === "result" &&
      inv.result &&
      typeof inv.result === "object" &&
      "frontendScreenshot" in inv.result
    ) {
      const uri = toDataUri(inv.result.frontendScreenshot)
      if (uri) {
        screenshots.push(uri)
        continue
      }
    }
  }

  return screenshots
}

// ── Exported ──

export function hasCuaSections(content: string): boolean {
  return /<cua-section\s/.test(content)
}

export const CuaSectionRenderer = memo(function CuaSectionRenderer({
  content,
  className,
  screenshots,
  isStreaming,
}: {
  content: string
  className?: string
  screenshots?: string[]
  isStreaming?: boolean
}) {
  const items = useMemo(() => {
    const sections = parseSections(content)
    return buildTopLevel(sections)
  }, [content])

  // Map screenshots to step items only (skip non-step items)
  const stepScreenshotMap = useMemo(() => {
    if (!screenshots || screenshots.length === 0) return new Map<number, string>()
    const map = new Map<number, string>()
    let screenshotIdx = 0
    for (let i = 0; i < items.length; i++) {
      if (items[i].kind === "step" && screenshotIdx < screenshots.length) {
        map.set(i, screenshots[screenshotIdx])
        screenshotIdx++
      }
    }
    return map
  }, [items, screenshots])

  // Show the live "thinking" pulse only while streaming AND when no other
  // signal is already covering the same ground — see shouldShowThinking
  // for the corner cases (awaiting-human / status / done / summary).
  const showThinking = isStreaming === true && shouldShowThinking(items) === "show"

  return (
    <div className={cn("flex flex-col", className)}>
      <div className="relative">
        {/* ── Timeline rail ──────────────────────────────────────
            A single 1px column at left-[2.5px] hosts two coupled
            layers that read as one object:
              1. Static soft gradient line (replaces the old dotted
                 pattern — reads as ink, not as a graph axis).
                 Draws itself top→down on first mount via the
                 .cua-line-draw class (scaleY 0→1 over 800ms).
              2. A travelling light caret — a 60px soft glow that
                 drifts top→bottom on a 4s loop, fading in/out at
                 the edges so it materializes rather than blinks.
                 Only renders while isStreaming; AnimatePresence
                 fades the whole layer in/out at state boundaries
                 so it never snaps. */}
        {/* overflow-hidden clips the travelling caret to the rail's
            vertical bounds — without it the caret would bleed above
            and below the message bubble during its drift cycle. */}
        <div
          className="absolute left-[2.5px] top-0 bottom-0 w-px overflow-hidden"
          aria-hidden="true"
        >
          {/* Static gradient line — vertical fade at both ends bakes
              the old mask treatment into the gradient itself. */}
          <div
            className="cua-line-draw absolute inset-0 opacity-[0.20] dark:opacity-[0.28]"
            style={{
              backgroundImage:
                "linear-gradient(to bottom, transparent 0%, currentColor 10%, currentColor 90%, transparent 100%)",
            }}
          />
          {/* Travelling light caret — only mounted while streaming.
              The 60px height + soft top/bottom fade make it tail
              like a comet. Opacity ramps inside the @keyframes
              itself so we don't need a separate animation here. */}
          <AnimatePresence>
            {isStreaming === true && (
              <motion.div
                key="cua-caret"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                className="cua-caret-drift absolute left-0 w-px h-[60px] opacity-[0.55] dark:opacity-[0.65]"
                style={{
                  backgroundImage:
                    "linear-gradient(to bottom, transparent 0%, currentColor 50%, transparent 100%)",
                }}
              />
            )}
          </AnimatePresence>
        </div>
        {/* Generous vertical rhythm — 20px between every item. Each
            point gets clear breathing room so the timeline reads as
            distinct beats rather than a paragraph of activity. Per-item
            internal padding stays tight; all the breath lives at the
            seam between items. */}
        <div className="relative flex flex-col gap-y-5">
          {/* initial={false} → existing items on first mount (chat history
              load) don't animate. New items appended during streaming get
              the soft fade + 6px lift. Keyed by index because the items
              array only ever appends — stable index = stable mount. */}
          <AnimatePresence initial={false}>
            {items.map((item, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
              >
                <ItemRenderer
                  item={item}
                  screenshot={stepScreenshotMap.get(i)}
                  isStreaming={isStreaming}
                />
              </motion.div>
            ))}
            {showThinking && <ThinkingPulse key="thinking-pulse" />}
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
})
