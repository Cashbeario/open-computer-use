import React, { memo, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '../lib/utils'
import { Markdown } from './Markdown'
import { AwaitingHumanBanner } from './AwaitingHumanBanner'

// ── Icons (inline SVGs replacing @phosphor-icons/react) ──

function IconCheckCircle({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
    </svg>
  )
}

function IconXCircle({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2C6.47 2 2 6.47 2 12s4.47 10 10 10 10-4.47 10-10S17.53 2 12 2zm5 13.59L15.59 17 12 13.41 8.41 17 7 15.59 10.59 12 7 8.41 8.41 7 12 10.59 15.59 7 17 8.41 13.41 12 17 15.59z" />
    </svg>
  )
}

function IconChevronRight({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 18l6-6-6-6" />
    </svg>
  )
}

function IconEye({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

function IconCode({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="16 18 22 12 16 6" />
      <polyline points="8 6 2 12 8 18" />
    </svg>
  )
}

function IconCopy({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  )
}

function IconCheck({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

function IconTerminal({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="4 17 10 11 4 5" />
      <line x1="12" y1="19" x2="20" y2="19" />
    </svg>
  )
}

function IconMagnifyingGlass({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  )
}

function IconPlug({ className }: { className?: string }) {
  // Plug icon — fallback for the Composio Integration pill when the
  // toolkit logo CDN fails (404 / network error). Sized to fit the
  // 16px logo tile, so it draws at 10px inside an inset rounded square.
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M16 7V3h-2v4h-4V3H8v4H6v5c0 2.97 2.16 5.43 5 5.91V22h2v-4.09c2.84-.48 5-2.94 5-5.91V7h-2z" />
    </svg>
  )
}


// ── Types ──

type SectionType =
  | 'verification'
  | 'analysis'
  | 'next-action'
  | 'grounded-action'
  | 'reflection'
  | 'code-agent-summary'
  | 'code-agent-thought'
  | 'code-agent-result'
  | 'code-agent-done'
  | 'composio-agent-thought'
  | 'composio-agent-search'
  | 'composio-agent-result'
  | 'composio-agent-done'
  | 'composio-agent-reauth'
  | 'composio-agent-breaker'
  | 'composio-agent-cancelled'
  | 'composio-agent-deadline'
  | 'action-result'
  | 'status'
  | 'search-results'
  | 'awaiting-human'
  | 'awaiting-human-timeout'
  | 'awaiting-human-resumed'

interface ParsedSection {
  type: SectionType
  content: string
  attrs: Record<string, string>
}

interface StepGroup {
  kind: 'step'
  action: string
  observation: string | null
  code: string | null
  results: { content: string; status: string }[]
}

type TopLevelItem =
  | StepGroup
  | { kind: 'status'; content: string; status: string }
  | { kind: 'code-agent-thought'; content: string; step: string; budget: string }
  | { kind: 'code-agent-result'; content: string; step: string }
  | { kind: 'code-agent-done'; content: string; step: string }
  | { kind: 'code-agent-summary'; content: string }
  | { kind: 'composio-agent-thought'; content: string; step: string }
  | { kind: 'composio-agent-search'; content: string; step: string }
  | { kind: 'composio-agent-result'; content: string; step: string; toolkit: string; slug: string; status: string }
  | { kind: 'composio-agent-done'; content: string }
  | { kind: 'composio-agent-reauth'; content: string; toolkit: string }
  | { kind: 'composio-agent-note'; content: string }
  | { kind: 'search-results'; query: string; content: string }
  | { kind: 'awaiting-human'; reason: string; machineId: string }
  | { kind: 'awaiting-human-timeout'; content: string }
  | { kind: 'awaiting-human-resumed'; content: string }
  | { kind: 'text'; content: string }

// ── Parser ──

const TAG_REGEX = /<cua-section\s+([^>]*)>([\s\S]*?)<\/cua-section>/g
const ATTR_REGEX = /(\w[\w-]*)="([^"]*)"/g

function stripAgentCode(text: string): string {
  return text.replace(/```(?:python)?\s*agent\.[\s\S]*?```/g, '').trim()
}

/** Truncate long text with ellipsis, respecting word boundaries */
function truncateText(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text
  const cut = text.lastIndexOf(' ', maxLen)
  return text.slice(0, cut > maxLen * 0.5 ? cut : maxLen) + '…'
}

/** Clean agent code for display: truncate long string args */
function formatAgentCode(code: string): string {
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
      sections.push({ type: 'next-action' as SectionType, content: before, attrs: { _plain: 'true' } })
    }
    const attrs = parseAttributes(match[1])
    sections.push({
      type: (attrs.type ?? 'next-action') as SectionType,
      content: match[2].trim(),
      attrs,
    })
    lastIndex = match.index + match[0].length
  }

  const trailing = raw.slice(lastIndex).trim()
  if (trailing) {
    sections.push({ type: 'next-action' as SectionType, content: trailing, attrs: { _plain: 'true' } })
  }
  return sections
}

// ── Grouping ──

const OBSERVATION_TYPES = new Set<SectionType>(['verification', 'analysis', 'reflection'])

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
      const merged = parts.join('\n\n')
      if (pendingStep && pendingStep.action) flushStep()
      if (!pendingStep) {
        pendingStep = { kind: 'step', action: '', observation: merged, code: null, results: [] }
      } else {
        pendingStep.observation = pendingStep.observation
          ? pendingStep.observation + '\n\n' + merged
          : merged
      }
      continue
    }

    if (s.type === 'next-action') {
      if (pendingStep && pendingStep.action) flushStep()
      if (!pendingStep) {
        pendingStep = { kind: 'step', action: '', observation: null, code: null, results: [] }
      }
      if (s.attrs._plain === 'true') {
        flushStep()
        items.push({ kind: 'text', content: s.content })
      } else {
        pendingStep.action = s.content
      }
    } else if (s.type === 'grounded-action') {
      if (pendingStep) pendingStep.code = s.content
    } else if (s.type === 'action-result') {
      if (pendingStep) pendingStep.results.push({ content: s.content, status: s.attrs.status || 'success' })
    } else if (s.type === 'status') {
      flushStep()
      items.push({ kind: 'status', content: s.content, status: s.attrs.status || 'completed' })
    } else if (s.type === 'code-agent-thought') {
      flushStep()
      items.push({ kind: 'code-agent-thought', content: s.content, step: s.attrs.step || '', budget: s.attrs.budget || '' })
    } else if (s.type === 'code-agent-result') {
      flushStep()
      items.push({ kind: 'code-agent-result', content: s.content, step: s.attrs.step || '' })
    } else if (s.type === 'code-agent-done') {
      flushStep()
      items.push({ kind: 'code-agent-done', content: s.content, step: s.attrs.step || '' })
    } else if (s.type === 'code-agent-summary') {
      flushStep()
      items.push({ kind: 'code-agent-summary', content: s.content })
    } else if (s.type === 'composio-agent-thought') {
      flushStep()
      items.push({ kind: 'composio-agent-thought', content: s.content, step: s.attrs.step || '' })
    } else if (s.type === 'composio-agent-search') {
      flushStep()
      items.push({ kind: 'composio-agent-search', content: s.content, step: s.attrs.step || '' })
    } else if (s.type === 'composio-agent-result') {
      flushStep()
      items.push({ kind: 'composio-agent-result', content: s.content, step: s.attrs.step || '', toolkit: s.attrs.toolkit || '', slug: s.attrs.slug || '', status: s.attrs.status || 'success' })
    } else if (s.type === 'composio-agent-done') {
      flushStep()
      items.push({ kind: 'composio-agent-done', content: s.content })
    } else if (s.type === 'composio-agent-reauth') {
      flushStep()
      items.push({ kind: 'composio-agent-reauth', content: s.content, toolkit: s.attrs.toolkit || '' })
    } else if (
      s.type === 'composio-agent-breaker' ||
      s.type === 'composio-agent-cancelled' ||
      s.type === 'composio-agent-deadline'
    ) {
      flushStep()
      items.push({ kind: 'composio-agent-note', content: s.content })
    } else if (s.type === 'search-results') {
      flushStep()
      items.push({ kind: 'search-results', query: s.attrs.query || '', content: s.content })
    } else if (s.type === 'awaiting-human') {
      flushStep()
      items.push({ kind: 'awaiting-human', reason: s.attrs.reason || s.content, machineId: s.attrs.machineId || s.attrs.machineid || '' })
    } else if (s.type === 'awaiting-human-timeout') {
      flushStep()
      items.push({ kind: 'awaiting-human-timeout', content: s.content })
    } else if (s.type === 'awaiting-human-resumed') {
      flushStep()
      items.push({ kind: 'awaiting-human-resumed', content: s.content })
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
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm cursor-zoom-out"
      onClick={onClose}
      style={{ animation: 'cua-fade-in 0.15s ease' }}
    >
      <img
        src={src}
        alt="Screenshot"
        className="max-w-[90vw] max-h-[90vh] rounded-lg object-contain"
        onClick={(e) => e.stopPropagation()}
        style={{ animation: 'cua-bounce-in 0.3s cubic-bezier(0.34,1.56,0.64,1)' }}
      />
      <style>{`
        @keyframes cua-fade-in { from { opacity: 0; } to { opacity: 1; } }
        @keyframes cua-bounce-in { from { transform: scale(0.92); } to { transform: scale(1); } }
      `}</style>
    </div>,
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
  // Easing uses a slight overshoot bezier (1.56 peak) so the spring-y
  // feel matches the web version's Framer Motion springs.
  return (
    <>
      <button
        type="button"
        onClick={() => setLightboxOpen(true)}
        aria-label="View screenshot"
        className={cn(
          // 30×19 landscape — smaller than the web version because the
          // Electron 400×520 panel needs every pixel of horizontal room
          // for content. Aspect still ~16:10 so the thumbnail reads as
          // a tiny screen. Position -left-[12px] keeps the dot's center
          // on the timeline rail at x=3 (30/2 - 3 = 12).
          'absolute -left-[12px] top-[3px] z-[2] block w-[30px] h-[19px] cursor-pointer overflow-hidden rounded-[4px]',
          'ring-1 ring-white/[0.08]',
          'shadow-[0_1px_2px_rgba(0,0,0,0.18),0_3px_6px_rgba(0,0,0,0.08)]',
          '-rotate-[7deg]',
          'transition-[transform,box-shadow,outline-color] duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)]',
          'hover:rotate-0 hover:scale-[1.15] hover:-translate-y-[1px]',
          'hover:ring-white/[0.16]',
          'hover:shadow-[0_4px_10px_rgba(0,0,0,0.30),0_10px_28px_rgba(0,0,0,0.18)]',
          'active:scale-[0.95] active:-rotate-[3deg] active:duration-100',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40',
        )}
      >
        <img src={src} alt="" className="w-full h-full object-cover" draggable={false} />
      </button>

      {lightboxOpen && (
        <ScreenshotLightbox src={src} onClose={() => setLightboxOpen(false)} />
      )}
    </>
  )
}

// ── Plain Timeline Dot (no screenshot) — no-op with dotted line ──
// Kept as a stub so StepCard doesn't need restructuring.

function PlainDot({ status: _status }: { status: 'success' | 'error' | 'pending' }) {
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
    .replace(/<\/?answer\b[^>]*>/gi, '')
    // Strip inline triple-backtick fences with an optional language tag
    // (e.g. ```bash ...```) wherever they appear.
    .replace(/```\w*\s*/g, '')
    .replace(/\s*```/g, '')
    // Strip lone fence lines that survived (``` on its own line).
    .split('\n')
    .filter((line) => !/^\s*```\s*\w*\s*$/.test(line))
    .join('\n')
    // Collapse runs of 3+ blank lines down to one for tidiness.
    .replace(/\n{3,}/g, '\n\n')
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
    if (typeof navigator === 'undefined' || !navigator.clipboard) return
    void navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={copied ? 'Copied' : 'Copy result'}
      title={copied ? 'Copied' : 'Copy'}
      className={cn(
        '-mr-1 inline-flex items-center justify-center w-6 h-6 rounded-md text-neutral-400/45 transition-all duration-150 hover:bg-white/[0.06] hover:text-neutral-100 active:scale-95',
        className
      )}
    >
      {copied ? (
        <IconCheck className="w-3 h-3 text-emerald-400" />
      ) : (
        <IconCopy className="w-3 h-3" />
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
  icon: React.ElementType
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
        className="group/detail flex items-center gap-1.5 py-0.5 text-[12px] font-medium tracking-tight text-neutral-400/40 hover:text-neutral-300/70 transition-colors"
      >
        <IconChevronRight
          className={cn(
            'w-2.5 h-2.5 shrink-0 transition-transform duration-200 ease-out',
            open && 'rotate-90'
          )}
        />
        <Icon className="w-3 h-3 shrink-0 opacity-70 group-hover/detail:opacity-100 transition-opacity" />
        <span>{label}</span>
      </button>
      <div
        className={cn(
          'overflow-hidden transition-all duration-150 ease-out',
          open ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0'
        )}
      >
        <div className="ml-[22px] pb-2 pt-0.5 text-[14px] leading-relaxed text-neutral-300/60">
          {children}
        </div>
      </div>
    </div>
  )
}

function StatusDot({ status }: { status: string }) {
  return (
    <span
      className={cn(
        'inline-block w-[5px] h-[5px] rounded-full shrink-0',
        status === 'success' && 'bg-emerald-500',
        status === 'error' && 'bg-red-500',
        status !== 'success' && status !== 'error' && 'bg-neutral-400/20',
      )}
    />
  )
}

// ── Unified content primitives (the redesign system) ──
//
// Mirrors the web renderer (app/components/chat/cua-section-renderer.tsx).
// Every section's CONTENT (everything right of the rail) is built from this
// vocabulary so all ~15 section types share one type scale, color ladder, and
// surface set. The rail / dots / shimmer are untouched — the signature element.
//
//   • prose = text-[14px] leading-relaxed  (tier by opacity: /90 /60 /40)
//   • meta  = text-[12px]                   (labels, chips, status words)
//   • mono  = font-mono text-[12.5px]       (code surfaces only, /80)
//   • COLOR is reserved for STATUS (emerald / red / amber); everything else
//     is on the neutral opacity ladder.

type Tone = 'success' | 'error' | 'attention'

const TONE_TEXT: Record<Tone, string> = {
  success: 'text-emerald-400',
  error: 'text-red-400',
  attention: 'text-amber-400',
}
const TONE_MOMENT: Record<Tone, string> = {
  success: 'ring-emerald-500/20 bg-emerald-500/[0.06] text-emerald-400',
  error: 'ring-red-500/20 bg-red-500/[0.06] text-red-400',
  attention: 'ring-amber-500/20 bg-amber-500/[0.06] text-amber-400',
}

/** Faint caption/header above a block (e.g. "Session summary"). */
function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-1 text-[12px] font-medium tracking-tight text-neutral-400/40">
      {children}
    </div>
  )
}

/** The single delegation tag. Neutral — color is for status only. */
function Chip({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 shrink-0 rounded-full px-2 py-0.5 text-[12px] font-medium text-neutral-200/70 ring-1 ring-inset ring-white/10 bg-white/[0.05]">
      {icon}
      {children}
    </span>
  )
}

/** Soft tinted container for terminal/important states — one radius, one ring
 *  weight, one padding (status, reauth, awaiting-human lifecycle). */
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
        'inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-[12px] font-medium ring-1 ring-inset',
        TONE_MOMENT[tone],
      )}
    >
      {icon}
      <span>{children}</span>
    </div>
  )
}

/** Bare status line (no container) — a tone dot + text. Used for quiet
 *  sub-agent "done" notes. */
function StatusLine({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-[12px]', TONE_TEXT[tone])}>
      <StatusDot status={tone === 'attention' ? 'pending' : tone} />
      {children}
    </span>
  )
}

/** The single code/console surface — shared by the running command (thought)
 *  and its output (result). Hairline ring, subtle fill, mono body, hover copy. */
function CodeSurface({ text, error = false }: { text: string; error?: boolean }) {
  return (
    <div className="group/code relative overflow-hidden rounded-lg ring-1 ring-inset ring-white/[0.07] bg-white/[0.02]">
      <div className="absolute right-1.5 top-1.5 z-[1] opacity-0 transition-opacity duration-150 group-hover/code:opacity-100">
        <CopyButton text={text} />
      </div>
      <pre
        className={cn(
          'm-0 px-3.5 pr-10 py-3 font-mono text-[12.5px] leading-[1.6] tabular-nums whitespace-pre-wrap break-words min-w-0 overflow-hidden',
          error ? 'text-red-400/90' : 'text-neutral-100/80',
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
  const match = code.match(/agent\.call_code_agent\s*\(\s*task\s*=\s*"([\s\S]*?)(?:"\s*[,)])/s)
    || code.match(/agent\.call_code_agent\s*\(\s*task\s*=\s*'([\s\S]*?)(?:'\s*[,)])/s)
  if (!match) return null
  return match[1].replace(/\\n/g, ' ').trim()
}

// Composio (Integration) action parser — mirrors the web renderer at
// app/components/chat/cua-section-renderer.tsx. Only the toolkit slug
// is surfaced; the natural-language line above the pill already conveys
// the query / action verbatim.
type IntegrationKind = 'search' | 'call' | 'actions'
interface IntegrationAction {
  method: IntegrationKind
  toolkit: string
}

function extractIntegrationAction(code: string): IntegrationAction | null {
  if (/agent\.composio_search\s*\(/.test(code)) {
    let toolkit = ''
    const tk = code.match(/toolkits\s*=\s*\[\s*([^\]]*)\]/)
    if (tk) {
      const first = tk[1].match(/["']([^"']+)["']/)
      if (first) toolkit = first[1].toUpperCase()
    }
    return { method: 'search', toolkit }
  }

  const callMatch = code.match(/agent\.composio_call\s*\(\s*["']([A-Z0-9_]+)["']/)
  if (callMatch) {
    const toolkit = callMatch[1].split('_')[0] || ''
    return { method: 'call', toolkit }
  }

  const actionsMatch = code.match(/agent\.composio_actions\s*\(\s*["']([^"']+)["']/)
  if (actionsMatch) {
    return { method: 'actions', toolkit: actionsMatch[1].toUpperCase() }
  }

  return null
}

// IntegrationLogo — natural-size SVG from logos.composio.dev. No tile,
// no ring — sits relaxed inside the chip the way IconTerminal sits next
// to "Code Agent". Plug fallback on 404/network error.
function IntegrationLogo({ toolkit }: { toolkit: string }) {
  const slug = toolkit.trim().toLowerCase()
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    setFailed(false)
  }, [slug])

  if (!slug || failed) {
    return <IconPlug className="w-2.5 h-2.5 shrink-0" />
  }

  return (
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
  const codeAgentTask = extractCodeAgentTask(code)
  if (codeAgentTask || /agent\.call_code_agent/.test(code)) {
    return { type: 'code-agent', label: 'Code Agent', detail: codeAgentTask || undefined }
  }
  return null
}

/**
 * Detect the worker's `agent.call_composio(...)` DELEGATION (the post-refactor
 * entry point; the inline composio_call/search/actions primitives are retired).
 * Returns the optional narrow-task string, or {} for a no-arg full-task call.
 */
function extractComposioDelegation(code: string): { task?: string } | null {
  const m =
    code.match(/agent\.call_composio\s*\(\s*(?:task\s*=\s*)?"([\s\S]*?)(?:"\s*[,)])/s) ||
    code.match(/agent\.call_composio\s*\(\s*(?:task\s*=\s*)?'([\s\S]*?)(?:'\s*[,)])/s)
  if (m) return { task: m[1].replace(/\\n/g, ' ').trim() || undefined }
  if (/agent\.call_composio\s*\(/.test(code)) return {}
  return null
}

/** "gmail" → "Gmail", "google_drive" → "Google Drive" */
function humanizeToolkit(toolkit: string): string {
  return (toolkit || '')
    .split('_')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ')
}

/** "GMAIL_SEND_EMAIL" + toolkit "gmail" → "Send email" (prefix dropped, sentence-cased). */
function humanizeAction(slug: string, toolkit: string): string {
  if (!slug) return ''
  let rest = slug
  const tkUpper = (toolkit || '').toUpperCase()
  if (tkUpper && rest.toUpperCase().startsWith(tkUpper + '_')) {
    rest = rest.slice(tkUpper.length + 1)
  }
  const words = rest.replace(/_/g, ' ').trim().toLowerCase()
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : ''
}

/**
 * Timeline marker for Composio sub-agent items — the integration equivalent of
 * TerminalDot. A small upright tile with a SOLID surface so the (often colored)
 * brand logo reads cleanly. Centered on the rail at +3px (-left-[8px] + 22/2 = 3).
 */
function IntegrationDot({ toolkit }: { toolkit: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'absolute -left-[8px] top-[1px] z-[2]',
        'flex h-[22px] w-[22px] items-center justify-center rounded-[6px]',
        'bg-neutral-800 ring-1 ring-white/[0.08]',
        'shadow-[0_1px_2px_rgba(0,0,0,0.25),0_2px_5px_rgba(0,0,0,0.15)]',
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
  const actionText = step.action ? stripAgentCode(step.action) : ''
  const hasDetails = step.observation || step.code || step.results.length > 0

  if (!actionText && !hasDetails) return null

  const hasError = step.results.some((r) => r.status === 'error')
  const isDone = step.results.length > 0
  const status: 'success' | 'error' | 'pending' = hasError
    ? 'error'
    : isDone
      ? 'success'
      : 'pending'
  const hasScreenshot = !!screenshot
  // Integration pill wins over the Code Agent pill — see the web
  // renderer for the rationale (same parser, same precedence).
  const integrationAction = step.code ? extractIntegrationAction(step.code) : null
  const composioDelegation =
    !integrationAction && step.code ? extractComposioDelegation(step.code) : null
  const agentAction =
    !integrationAction && !composioDelegation && step.code ? extractAgentAction(step.code) : null
  const isDelegation = !!(agentAction || composioDelegation)

  // A delegation's eval returns a no-op time.sleep(...), surfaced as a
  // "Waiting about N seconds…" line/badge. Drop it on delegation steps.
  const isWaitNoop = (s: string) => /^\s*waiting\b[\s\S]*\bseconds?\b/i.test(s)
  const showAction = actionText && !(isDelegation && isWaitNoop(actionText))
  const visibleResults = isDelegation
    ? step.results.filter((r) => !isWaitNoop(r.content))
    : step.results

  return (
    // Bottom padding intentionally omitted — the parent timeline uses a
    // uniform `gap-y` to space adjacent items, so individual cards stay
    // tight internally and breathing room lives at the seam between them.
    <div className={cn('group/step relative', hasScreenshot ? 'pl-8' : 'pl-6')}>
      {hasScreenshot ? (
        <ScreenshotDot src={screenshot!} />
      ) : (
        <PlainDot status={status} />
      )}

      {/* Action — canonical timeline prose: 14px / leading-relaxed / sans. */}
      {showAction && (
        <p className="text-[14px] leading-relaxed text-neutral-100/90 break-words overflow-hidden">
          {truncateText(actionText, 200)}
        </p>
      )}

      {/* Integration primitive (legacy) — one neutral Chip + a faint verb. */}
      {integrationAction && (
        <div className="mt-1 flex items-center gap-2 flex-wrap min-w-0">
          <Chip icon={<IntegrationLogo toolkit={integrationAction.toolkit} />}>
            {humanizeToolkit(integrationAction.toolkit) || 'Integration'}
          </Chip>
          <span className="text-[12px] text-neutral-400/40">
            {integrationAction.method === 'search' && 'search'}
            {integrationAction.method === 'call' && 'run'}
            {integrationAction.method === 'actions' && 'browse'}
          </span>
        </div>
      )}

      {/* Integration delegation — the one neutral Chip + the (secondary) task. */}
      {composioDelegation && (
        <div className="mt-1 flex items-center gap-2 flex-wrap min-w-0">
          <Chip icon={<IconPlug className="w-3 h-3 shrink-0" />}>Integration</Chip>
          {composioDelegation.task && (
            <span className="text-[14px] leading-snug text-neutral-300/60 break-words min-w-0">
              {truncateText(composioDelegation.task, 140)}
            </span>
          )}
        </div>
      )}

      {/* Code-agent delegation — same neutral Chip treatment. */}
      {agentAction && (
        <div className="mt-1 flex items-center gap-2 flex-wrap min-w-0">
          <Chip icon={<IconTerminal className="w-3 h-3 shrink-0" />}>{agentAction.label}</Chip>
          {agentAction.detail && (
            <span className="text-[14px] leading-snug text-neutral-300/60 break-words min-w-0">
              {truncateText(agentAction.detail, 140)}
            </span>
          )}
        </div>
      )}

      {/* Inline results — bare status rows (no pills): a tone dot + the
          outcome. Only the dot (and error text) carries color. */}
      {visibleResults.length > 0 && (
        <div className="flex flex-col gap-y-0.5 mt-1">
          {visibleResults.map((r, j) => (
            <span
              key={j}
              className={cn(
                'inline-flex items-center gap-1.5 text-[12px] min-w-0',
                r.status === 'error' ? 'text-red-400' : 'text-neutral-300/60',
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
          <DetailRow icon={IconEye} label="What it noticed">
            <Markdown>{step.observation}</Markdown>
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
  return (
    <div
      aria-hidden="true"
      className={cn(
        'absolute -left-[13px] top-[2px]',
        'flex h-[22px] w-[32px] items-center justify-center',
        'rounded-[6px] -rotate-[7deg]',
        'bg-neutral-950',
        'ring-1 ring-white/[0.08]',
        'shadow-[0_2px_6px_rgba(0,0,0,0.30),0_5px_14px_rgba(0,0,0,0.18),inset_0_1px_0_rgba(255,255,255,0.08)]',
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
  onResumeHuman,
}: {
  item: TopLevelItem
  screenshot?: string | null
  isStreaming?: boolean
  onResumeHuman?: () => void
}) {
  switch (item.kind) {
    case 'step':
      return <StepCard step={item} screenshot={screenshot} />

    case 'status': {
      const done = item.status === 'completed'
      return (
        <div className="pl-6">
          <MomentPill
            tone={done ? 'success' : 'error'}
            icon={
              done ? (
                <IconCheckCircle className="w-3.5 h-3.5 shrink-0" />
              ) : (
                <IconXCircle className="w-3.5 h-3.5 shrink-0" />
              )
            }
          >
            {item.content}
          </MomentPill>
        </div>
      )
    }

    case 'code-agent-thought': {
      // The agent's mid-execution reasoning is virtually always a code
      // command (with the agent's narrative occasionally mixed in).
      // Rendering through Markdown was the source of inconsistent
      // formatting: Python comments (`# x`) became headings, `>` lines
      // became blockquotes, indentation got collapsed in paragraphs,
      // and stripped fence markers left some lines as plain prose and
      // others as monospace. We bypass Markdown entirely and render
      // the whole block as a single monospace <pre> so every line —
      // code, narrative, comment — gets the same treatment.
      const cleaned = truncateText(stripAgentMarkup(item.content), 3000)
      if (!cleaned) return null
      return (
        <div className="pl-6">
          <CodeSurface text={cleaned} />
        </div>
      )
    }

    case 'code-agent-result': {
      // The command's output — the SAME CodeSurface as the thought above,
      // behind a TerminalDot rail marker. Errors tint the body red.
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

    case 'code-agent-done':
      return (
        <div className="pl-6">
          <StatusLine tone="success">{item.content}</StatusLine>
        </div>
      )

    case 'code-agent-summary': {
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
              'text-[14px] leading-relaxed text-neutral-100/90',
              // Containment: long unbreakable strings wrap inside the
              // bubble instead of pushing it wider.
              'min-w-0 overflow-hidden break-words',
              '[&>*:first-child]:mt-0 [&>*:last-child]:mb-0',
              '[&_p]:my-2',
              '[&_strong]:font-semibold [&_strong]:text-neutral-100',
              '[&_em]:italic [&_em]:text-neutral-100/60',
              '[&_ul]:my-2 [&_ul]:space-y-0.5 [&_ul]:pl-4',
              '[&_ol]:my-2 [&_ol]:space-y-0.5 [&_ol]:pl-5',
              '[&_li]:marker:text-neutral-400/40 [&_li]:leading-relaxed',
              // Headings collapse to body size + weight — flat type scale.
              '[&_h1]:mt-3 [&_h1]:mb-1 [&_h1]:text-[14px] [&_h1]:font-semibold [&_h1]:text-neutral-100',
              '[&_h2]:mt-3 [&_h2]:mb-1 [&_h2]:text-[14px] [&_h2]:font-semibold [&_h2]:text-neutral-100',
              '[&_h3]:mt-2.5 [&_h3]:mb-1 [&_h3]:text-[14px] [&_h3]:font-medium [&_h3]:text-neutral-100',
              '[&_code]:rounded-md [&_code]:bg-white/[0.06] [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[12px] [&_code]:text-neutral-100/90 [&_code]:before:content-none [&_code]:after:content-none [&_code]:break-words',
              '[&_pre]:my-2 [&_pre]:rounded-lg [&_pre]:ring-1 [&_pre]:ring-inset [&_pre]:ring-white/[0.07] [&_pre]:!bg-white/[0.02] [&_pre]:p-3',
              '[&_pre]:whitespace-pre-wrap [&_pre]:break-words [&_pre]:overflow-x-hidden',
              '[&_a]:text-neutral-100 [&_a]:underline [&_a]:underline-offset-[3px] [&_a]:decoration-neutral-400/40 hover:[&_a]:decoration-neutral-100/60 [&_a]:break-all',
              '[&_blockquote]:my-2 [&_blockquote]:border-l-2 [&_blockquote]:border-white/15 [&_blockquote]:pl-3 [&_blockquote]:text-neutral-100/60 [&_blockquote]:italic'
            )}
          >
            <Markdown>{cleaned}</Markdown>
          </div>
        </div>
      )
    }

    case 'composio-agent-thought': {
      // Sub-agent reasoning — kept quiet (muted) so the integration timeline
      // reads as calm progress, not noise.
      const cleaned = truncateText(stripAgentMarkup(item.content), 600)
      if (!cleaned) return null
      return (
        <p className="pl-6 text-[14px] leading-relaxed text-neutral-300/60 break-words min-w-0 overflow-hidden">
          {cleaned}
        </p>
      )
    }

    case 'composio-agent-search': {
      // Candidate-action discovery — folded behind progressive disclosure.
      const cleaned = stripAgentMarkup(item.content)
      if (!cleaned) return null
      return (
        <div className="pl-6">
          <DetailRow icon={IconMagnifyingGlass} label="Searched connected apps">
            <Markdown>{cleaned}</Markdown>
          </DetailRow>
        </div>
      )
    }

    case 'composio-agent-result': {
      // Signature element — one clean line: integration name + humanized action
      // it ran, with a success/error tick. The raw API payload is intentionally
      // NOT shown; the dot carries the live logo.
      const isError =
        item.status === 'error' || /\bError:\s/.test(stripAgentMarkup(item.content))
      const toolkitName = humanizeToolkit(item.toolkit)
      const fn = humanizeAction(item.slug, item.toolkit)
      const errMsg = isError
        ? truncateText(stripAgentMarkup(item.content).replace(/^Error:\s*/i, ''), 140)
        : ''
      return (
        <div className="relative pl-8">
          <IntegrationDot toolkit={item.toolkit} />
          <div className="flex min-h-[22px] items-center gap-1.5">
            <span className="text-[14px] leading-snug text-neutral-100/90">
              {toolkitName || 'Integration'}
              {fn && <span className="text-neutral-100/40">{' · '}{fn}</span>}
            </span>
            {isError ? (
              <IconXCircle className="w-3.5 h-3.5 shrink-0 text-red-500" />
            ) : (
              <IconCheckCircle className="w-3.5 h-3.5 shrink-0 text-emerald-500" />
            )}
          </div>
          {errMsg && (
            <p className="mt-0.5 text-[12px] leading-relaxed text-red-400 break-words">
              {errMsg}
            </p>
          )}
        </div>
      )
    }

    case 'composio-agent-done':
      return (
        <div className="pl-6">
          <StatusLine tone="success">{item.content}</StatusLine>
        </div>
      )

    case 'composio-agent-reauth':
      return (
        <div className="pl-6">
          <MomentPill tone="attention" icon={<IntegrationLogo toolkit={item.toolkit} />}>
            {item.content}
          </MomentPill>
        </div>
      )

    case 'composio-agent-note': {
      const cleaned = item.content.trim()
      if (!cleaned) return null
      return <p className="pl-6 text-[12px] text-neutral-400/40">{cleaned}</p>
    }

    case 'search-results': {
      const label = item.query ? `Search · ${item.query}` : 'Web search'
      return (
        <div className="pl-6">
          <DetailRow icon={IconMagnifyingGlass} label={label} defaultOpen>
            <Markdown>{item.content}</Markdown>
          </DetailRow>
        </div>
      )
    }

    case 'awaiting-human':
      return (
        <div className="relative pl-6 py-2">
          <AwaitingHumanBanner
            reason={item.reason}
            machineId={item.machineId}
            isActive={isStreaming}
            onResume={onResumeHuman}
          />
        </div>
      )

    case 'awaiting-human-timeout':
      return (
        <div className="pl-6">
          <MomentPill
            tone="attention"
            icon={
              <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
              </svg>
            }
          >
            {item.content}
          </MomentPill>
        </div>
      )

    case 'awaiting-human-resumed':
      return (
        <div className="pl-6">
          <MomentPill tone="success" icon={<IconCheckCircle className="w-3.5 h-3.5 shrink-0" />}>
            Human finished. Agent resuming with fresh screen state.
          </MomentPill>
        </div>
      )

    case 'text': {
      const cleaned = stripAgentCode(item.content)
      if (!cleaned) return null
      return (
        <div
          className={cn(
            'pl-6 text-[14px] leading-relaxed text-neutral-200/90',
            'min-w-0 overflow-hidden break-words',
            '[&_pre]:whitespace-pre-wrap [&_pre]:break-words [&_pre]:overflow-x-hidden',
            '[&_code]:break-words',
            '[&_a]:break-all',
          )}
        >
          <Markdown>{truncateText(cleaned, 500)}</Markdown>
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

function shouldShowThinking(items: TopLevelItem[]): boolean {
  if (items.length === 0) return true
  const last = items[items.length - 1]
  switch (last.kind) {
    case 'awaiting-human':
    case 'awaiting-human-timeout':
    case 'status':
    case 'code-agent-done':
    case 'code-agent-summary':
      return false
    default:
      return true
  }
}

function ThinkingPulse() {
  // Muted "Thinking" label with the .shimmer-text glow sweep — the same
  // self-contained text effect used elsewhere as a loader placeholder.
  // The timeline rail to the left already serves as the visual border,
  // so no extra chrome is added here: just the shimmering word at the
  // same pl-6 indent as every other item in the timeline.
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Agent is working"
      className="pl-6 thinking-pulse-enter"
    >
      <span className="shimmer-text text-[13.5px] font-medium tracking-tight">
        Thinking
      </span>
    </div>
  )
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
  onResumeHuman,
}: {
  content: string
  className?: string
  screenshots?: string[]
  isStreaming?: boolean
  onResumeHuman?: () => void
}) {
  const items = useMemo(() => {
    const sections = parseSections(content)
    return buildTopLevel(sections)
  }, [content])

  // Map screenshots to step items only
  const stepScreenshotMap = useMemo(() => {
    if (!screenshots || screenshots.length === 0) return new Map<number, string>()
    const map = new Map<number, string>()
    let screenshotIdx = 0
    for (let i = 0; i < items.length; i++) {
      if (items[i].kind === 'step' && screenshotIdx < screenshots.length) {
        map.set(i, screenshots[screenshotIdx])
        screenshotIdx++
      }
    }
    return map
  }, [items, screenshots])

  // Show the live "thinking" pulse only while streaming AND when no other
  // signal is already covering the same ground — see shouldShowThinking
  // for the corner cases (awaiting-human / status / done / summary).
  const showThinking = isStreaming === true && shouldShowThinking(items)

  return (
    <div className={cn('flex flex-col', className)}>
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
                 Only rendered while isStreaming. */}
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
            className="cua-line-draw absolute inset-0 opacity-[0.28]"
            style={{
              backgroundImage:
                'linear-gradient(to bottom, transparent 0%, currentColor 10%, currentColor 90%, transparent 100%)',
            }}
          />
          {/* Travelling light caret — only mounted while streaming.
              The drift @keyframes ramps opacity at the entry and exit
              of each cycle, so the caret naturally materializes at the
              top of the line and dissolves past the bottom. */}
          {isStreaming === true && (
            <div
              className="cua-caret-drift absolute left-0 w-px h-[60px] opacity-[0.65]"
              style={{
                backgroundImage:
                  'linear-gradient(to bottom, transparent 0%, currentColor 50%, transparent 100%)',
              }}
            />
          )}
        </div>
        {/* Generous vertical rhythm — 20px between every item. Each
            point gets clear breathing room so the timeline reads as
            distinct beats rather than a paragraph of activity. Per-item
            internal padding stays tight; all the breath lives at the
            seam between items. */}
        <div className="relative flex flex-col gap-y-5">
          {/* Each item gets the cua-item-in fade + lift on mount. CSS
              animations don't replay on re-render, so existing items
              stay still and only newly streamed items animate. */}
          {items.map((item, i) => (
            <div key={i} className="cua-item-in">
              <ItemRenderer
                item={item}
                screenshot={stepScreenshotMap.get(i)}
                isStreaming={isStreaming}
                onResumeHuman={onResumeHuman}
              />
            </div>
          ))}
          {showThinking && <ThinkingPulse />}
        </div>
      </div>
    </div>
  )
})
