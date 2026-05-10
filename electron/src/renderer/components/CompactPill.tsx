import React from 'react'
import { useConnectionStore } from '../stores/connection-store'
import { useWindowStore } from '../stores/window-store'
import { useAuthStore } from '../stores/auth-store'
import { useChatSubmit } from '../hooks/useChatSubmit'

function statusDot(state: string): string {
  switch (state) {
    case 'connected': return 'bg-emerald-400'
    case 'connecting': return 'bg-yellow-400 animate-pulse'
    case 'error': return 'bg-red-400'
    default: return 'bg-neutral-500'
  }
}

export function CompactPill() {
  const connectionState = useConnectionStore((s) => s.state)
  const { toggleExpanded } = useWindowStore()
  const { signOut } = useAuthStore()
  const {
    isStreaming, canSend, handleSubmit, handleStop,
    isMachineBusy, isStoppingMachine, forceStopAndSend, dismissBusyState,
  } = useChatSubmit()

  const [input, setInput] = React.useState('')

  // If the user clears the input while the busy state is set, dismiss it
  // so the next non-empty input goes through the normal pre-check path
  // rather than auto-firing forceStopAndSend with empty content.
  React.useEffect(() => {
    if (isMachineBusy && !input.trim()) {
      dismissBusyState()
    }
  }, [input, isMachineBusy, dismissBusyState])

  const onSubmit = () => {
    if (isMachineBusy) {
      // User clicked the yellow Override & Run button (or hit Enter
      // while busy state was active). Pass the live input so any edits
      // the user made after seeing the busy state are preserved.
      forceStopAndSend(input)
      setInput('')
      toggleExpanded()
      return
    }
    if (!canSend(input)) return
    handleSubmit(input)
    setInput('')
    toggleExpanded() // expand to show the conversation
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      onSubmit()
    }
  }

  return (
    <div className="glow-border animate-compact-in titlebar-drag flex items-center gap-2.5 w-full h-full px-3 rounded-2xl bg-neutral-900/90 backdrop-blur-xl select-none">
      {/* Coasty logo */}
      <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="coastyGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="rgba(255,255,255,0)" stopOpacity={0} />
            <stop offset="30%" stopColor="rgba(255,255,255,0.1)" stopOpacity={1} />
            <stop offset="50%" stopColor="rgba(255,255,255,0.3)" stopOpacity={1} />
            <stop offset="70%" stopColor="rgba(255,255,255,0.6)" stopOpacity={1} />
            <stop offset="100%" stopColor="rgba(255,255,255,1)" stopOpacity={1} />
          </linearGradient>
        </defs>
        <circle cx="100" cy="100" r="100" fill="url(#coastyGrad)" />
      </svg>

      {/* Status dot */}
      <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${statusDot(connectionState)}`} />

      {/* Inline input */}
      <input
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={isStreaming ? 'Working...' : 'Send a message...'}
        disabled={connectionState !== 'connected' || isStreaming}
        className="titlebar-no-drag flex-1 min-w-0 bg-transparent text-xs text-neutral-200 placeholder-neutral-500 outline-none disabled:opacity-50"
      />

      {/* Actions */}
      <div className="titlebar-no-drag flex items-center gap-1">
        {isStreaming ? (
          <button
            onClick={handleStop}
            className="px-2 py-1 rounded-lg bg-red-600/20 border border-red-500/30 text-red-400 text-[11px] font-medium hover:bg-red-600/30 transition-colors"
          >
            Stop
          </button>
        ) : isMachineBusy && input.trim() ? (
          // Yellow "Override & Run" — same colour family as the web app's
          // chat-input.tsx Override button (amber-600). Clicking it calls
          // forceStopAndSend which stops the running task on this machine
          // and submits the user's input. Disabled while the stop call is
          // in flight to prevent double-submit.
          <button
            onClick={onSubmit}
            disabled={isStoppingMachine}
            title="Stop running task and start this one"
            className="px-2 py-1 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-[11px] font-medium disabled:opacity-50 transition-colors"
          >
            {isStoppingMachine ? 'Switching…' : 'Override & Run'}
          </button>
        ) : input.trim() ? (
          <button
            onClick={onSubmit}
            disabled={!canSend(input)}
            className="px-2 py-1 rounded-lg bg-brand-600 text-white text-[11px] font-medium hover:bg-brand-500 disabled:opacity-30 transition-colors"
          >
            Send
          </button>
        ) : null}

        <button
          onClick={() => toggleExpanded()}
          className="p-1.5 rounded-lg hover:bg-neutral-800/60 text-neutral-400 hover:text-neutral-200 transition-colors"
          title="Expand"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>

        <button
          onClick={signOut}
          className="p-1.5 rounded-lg hover:bg-neutral-800/60 text-neutral-500 hover:text-neutral-300 transition-colors"
          title="Sign out"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
        </button>
      </div>
    </div>
  )
}
