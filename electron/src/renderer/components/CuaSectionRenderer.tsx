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

function IconSparkle({ className }: { className?: string }) {
  // 4-point star sparkle — used in the Session Summary header chip.
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0L13.6 9.4L23 12L13.6 14.6L12 24L10.4 14.6L1 12L10.4 9.4L12 0Z" />
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

  return (
    <>
      <div
        className="absolute -left-[10px] top-[3px] z-[2] cursor-pointer cua-thumb"
        onClick={() => setLightboxOpen(true)}
      >
        <div className="w-[26px] h-[26px] rounded-[5px] overflow-hidden ring-1 ring-white/[0.08] shadow-sm">
          <img src={src} alt="" className="w-full h-full object-cover" draggable={false} />
        </div>
        <style>{`
          .cua-thumb { transition: transform 0.25s cubic-bezier(0.34,1.56,0.64,1); }
          .cua-thumb:hover { transform: scale(1.18); }
          .cua-thumb:active { transform: scale(0.95); }
        `}</style>
      </div>

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

function stripResultFences(raw: string): string {
  // The backend wraps stdout in ``` fences (see code_agent.py). Strip those
  // fence lines so the Markdown renderer's code-block chrome (language label,
  // its own copy button) doesn't appear inside the result card.
  return raw
    .split('\n')
    .filter((line) => !/^\s*```\s*\w*\s*$/.test(line))
    .join('\n')
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
        className="group/detail flex items-center gap-1.5 py-1 text-[12.5px] text-neutral-500/50 hover:text-neutral-400/80 transition-colors"
      >
        <IconChevronRight
          className={cn(
            'w-2.5 h-2.5 shrink-0 transition-transform duration-200 ease-out',
            open && 'rotate-90'
          )}
        />
        <Icon className="w-3 h-3 shrink-0 opacity-50 group-hover/detail:opacity-80 transition-opacity" />
        <span>{label}</span>
      </button>
      <div
        className={cn(
          'overflow-hidden transition-all duration-150 ease-out',
          open ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0'
        )}
      >
        <div className="ml-[22px] pb-2 text-[13px] leading-relaxed text-neutral-400/80">
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
        status === 'success' && 'bg-emerald-500/70',
        status === 'error' && 'bg-red-500/70',
        status !== 'success' && status !== 'error' && 'bg-neutral-400/10',
      )}
    />
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

/** Check if grounded action code is an agent function call (code_agent, wait, etc.) */
function extractAgentAction(code: string): { type: string; label: string; detail?: string } | null {
  const codeAgentTask = extractCodeAgentTask(code)
  if (codeAgentTask || /agent\.call_code_agent/.test(code)) {
    return { type: 'code-agent', label: 'Code Agent', detail: codeAgentTask || undefined }
  }
  return null
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
  const agentAction = step.code ? extractAgentAction(step.code) : null

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

      {/* Action — the natural language line (truncated for readability) */}
      {actionText && (
        <p className="text-[15px] leading-relaxed text-neutral-100/90">
          {truncateText(actionText, 200)}
        </p>
      )}

      {/* Agent function call pill + prompt card (e.g. code_agent) */}
      {agentAction && (
        <div className="mt-1.5 rounded-lg border border-emerald-400/12 bg-emerald-400/[0.03] overflow-hidden">
          <div className="flex items-center gap-2 px-2.5 py-1.5">
            <span className="inline-flex items-center gap-1.5 text-[11.5px] leading-none font-medium px-2 py-[3px] rounded-full bg-emerald-500/12 text-emerald-400">
              <IconTerminal className="w-3 h-3 shrink-0" />
              {agentAction.label}
            </span>
          </div>
          {agentAction.detail && (
            <div className="px-3 pb-2.5 -mt-0.5">
              <p className="text-[12.5px] leading-relaxed text-neutral-300/50">
                {truncateText(agentAction.detail, 300)}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Inline result badges */}
      {step.results.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 mt-1">
          {step.results.map((r, j) => (
            <span
              key={j}
              className={cn(
                'inline-flex items-center gap-1 text-[11px] leading-none px-1.5 py-0.5 rounded-full',
                r.status === 'success' && 'text-emerald-400/70 bg-emerald-500/8',
                r.status === 'error' && 'text-red-400/70 bg-red-500/8',
                r.status !== 'success' && r.status !== 'error' && 'text-neutral-500/50 bg-neutral-500/5',
              )}
            >
              <StatusDot status={r.status} />
              {truncateText(r.content, 120)}
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
        <div className="py-1.5 pl-6">
          <div className={cn(
            'inline-flex items-center gap-2 rounded-lg border px-3 py-1.5',
            done
              ? 'border-emerald-700/40 bg-emerald-400/[0.04]'
              : 'border-red-700/40 bg-red-400/[0.04]',
          )}>
            {done ? (
              <IconCheckCircle className="w-3.5 h-3.5 shrink-0 text-emerald-500" />
            ) : (
              <IconXCircle className="w-3.5 h-3.5 shrink-0 text-red-500" />
            )}
            <span className={cn(
              'text-[13px] font-medium',
              done ? 'text-emerald-300' : 'text-red-400',
            )}>
              {item.content}
            </span>
          </div>
        </div>
      )
    }

    case 'code-agent-thought': {
      // Render the agent's mid-execution reasoning as regular timeline text —
      // same size and color as the rest of the agent's output.
      const cleaned = item.content.trim()
      if (!cleaned) return null
      return (
        <div className="pl-6 py-0.5 text-[15px] leading-relaxed text-neutral-100">
          <Markdown>{cleaned}</Markdown>
        </div>
      )
    }

    case 'code-agent-result': {
      // Show the result of one execution step in a clean two-row card:
      // header strip with a contextual label + copy button, hairline divider,
      // mono content below. Strip the producer's ``` fences first so the
      // Markdown renderer's code-block chrome doesn't appear.
      const cleaned = stripResultFences(item.content)
      if (!cleaned) return null
      const hasError = /\bError:\s/.test(cleaned)
      return (
        <div className="pl-6 py-1.5">
          <div className="group/result-card relative overflow-hidden rounded-xl border border-white/[0.07] bg-white/[0.02] shadow-sm">
            <div className="flex items-center justify-between gap-3 border-b border-white/[0.05] px-3.5 py-1.5">
              <span
                className={cn(
                  'text-[10px] font-medium uppercase tracking-[0.12em]',
                  hasError ? 'text-red-400/70' : 'text-neutral-200/40'
                )}
              >
                {hasError ? 'Error' : 'Output'}
              </span>
              <CopyButton text={cleaned} />
            </div>
            <pre className="m-0 px-3.5 py-2.5 font-mono text-[12px] leading-[1.6] tabular-nums text-neutral-100/80 whitespace-pre-wrap break-words">
              {cleaned}
            </pre>
          </div>
        </div>
      )
    }

    case 'code-agent-done':
      return (
        <div className="py-0.5 pl-6">
          <span className="inline-flex items-center gap-1.5 text-[12px] text-emerald-400/40">
            <IconCheckCircle className="w-3 h-3 shrink-0" />
            {item.content}
          </span>
        </div>
      )

    case 'code-agent-summary': {
      // The agent's end-of-execution recap. This is a "report card" — a
      // dedicated, premium card with a sparkle-chip header, a hairline
      // decorative top accent, a copy button, and refined markdown styling
      // for the body (proper spacing for headings, lists, inline code).
      const cleaned = item.content.trim()
      if (!cleaned) return null
      return (
        <div className="pl-6 py-2">
          <div className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.025] shadow-[0_1px_3px_rgba(0,0,0,0.2)]">
            {/* Decorative top hairline gradient — gives a "premium card" cue */}
            <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/[0.18] to-transparent" />

            {/* Header: sparkle chip + label, copy button on the right */}
            <div className="flex items-center justify-between gap-3 border-b border-white/[0.06] px-4 py-2.5">
              <div className="flex items-center gap-2">
                <div className="flex w-5 h-5 items-center justify-center rounded-md bg-gradient-to-br from-white/[0.08] to-white/[0.04] ring-1 ring-white/[0.05]">
                  <IconSparkle className="w-2.5 h-2.5 text-neutral-100/60" />
                </div>
                <span className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-neutral-200/55">
                  Session Summary
                </span>
              </div>
              <CopyButton text={cleaned} />
            </div>

            {/* Body: refined markdown styling */}
            <div
              className={cn(
                'px-4 py-3 text-[14px] leading-[1.6] text-neutral-100/85',
                '[&>*:first-child]:mt-0 [&>*:last-child]:mb-0',
                '[&_p]:my-2',
                '[&_strong]:font-semibold [&_strong]:text-neutral-100',
                '[&_em]:italic [&_em]:text-neutral-100/75',
                '[&_ul]:my-2 [&_ul]:space-y-0.5 [&_ul]:pl-4',
                '[&_ol]:my-2 [&_ol]:space-y-0.5 [&_ol]:pl-5',
                '[&_li]:marker:text-neutral-400/40 [&_li]:leading-[1.55]',
                '[&_h1]:mt-3 [&_h1]:mb-1.5 [&_h1]:text-[15px] [&_h1]:font-semibold [&_h1]:text-neutral-100',
                '[&_h2]:mt-3 [&_h2]:mb-1.5 [&_h2]:text-[14.5px] [&_h2]:font-semibold [&_h2]:text-neutral-100',
                '[&_h3]:mt-2.5 [&_h3]:mb-1 [&_h3]:text-[14px] [&_h3]:font-medium [&_h3]:text-neutral-100',
                '[&_code]:rounded-md [&_code]:bg-white/[0.06] [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[12px] [&_code]:text-neutral-100/90 [&_code]:before:content-none [&_code]:after:content-none',
                '[&_pre]:my-2 [&_pre]:rounded-lg [&_pre]:border [&_pre]:border-white/[0.06] [&_pre]:!bg-white/[0.03] [&_pre]:p-3',
                '[&_a]:text-neutral-100 [&_a]:underline [&_a]:underline-offset-[3px] [&_a]:decoration-neutral-400/40 hover:[&_a]:decoration-neutral-100/60',
                '[&_blockquote]:my-2 [&_blockquote]:border-l-2 [&_blockquote]:border-white/15 [&_blockquote]:pl-3 [&_blockquote]:text-neutral-100/70 [&_blockquote]:italic'
              )}
            >
              <Markdown>{cleaned}</Markdown>
            </div>
          </div>
        </div>
      )
    }

    case 'search-results': {
      const label = item.query ? `Search: ${item.query}` : 'Web search'
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
        <div className="py-1.5 pl-6">
          <div className="inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 border-amber-700/40 bg-amber-400/[0.04]">
            <svg className="w-3.5 h-3.5 shrink-0 text-amber-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
            </svg>
            <span className="text-[13px] font-medium text-amber-300">{item.content}</span>
          </div>
        </div>
      )

    case 'awaiting-human-resumed':
      return (
        <div className="py-1.5 pl-6">
          <div className="inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 border-emerald-700/40 bg-emerald-400/[0.04]">
            <IconCheckCircle className="w-3.5 h-3.5 shrink-0 text-emerald-500" />
            <span className="text-[13px] font-medium text-emerald-300">
              Human finished — agent resuming with fresh screen state
            </span>
          </div>
        </div>
      )

    case 'text': {
      const cleaned = stripAgentCode(item.content)
      if (!cleaned) return null
      return (
        <div className="pl-6 py-0.5 text-[15px] leading-relaxed text-neutral-200/80">
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
