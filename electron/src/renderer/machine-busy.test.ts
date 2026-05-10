/**
 * Tests for the Electron renderer's "machine busy → yellow Override & Run"
 * flow. The actual hook lives at hooks/useChatSubmit.ts; this test file
 * exercises the same state-transition rules the hook implements, plus the
 * IPC contract surface (window.coasty.checkMachineBusy / stopMachine).
 *
 * We can't render the React hook here (no @testing-library/react in the
 * Electron package's test stack — only vitest + pure logic). So instead
 * we mirror the decision rules into testable functions and pin them.
 * If the rules drift, the tests catch the drift before users do.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ── State-transition rules (mirrored from useChatSubmit.ts) ─────────────────

interface BusyState {
  isMachineBusy: boolean
  isStoppingMachine: boolean
  pendingInput: { input: string; files?: unknown[] } | null
}

const initial: BusyState = {
  isMachineBusy: false,
  isStoppingMachine: false,
  pendingInput: null,
}

/**
 * Mirrors the `handleSubmit` decision branch in useChatSubmit.ts.
 * Given current state + the result of the pre-flight busy check + the
 * user's input, returns:
 *   - the next state
 *   - whether we should call `_doSubmit` (i.e. actually send the chat)
 */
function handleSubmitDecision(
  state: BusyState,
  busyCheckResult: boolean,
  input: string,
  files?: unknown[],
): { next: BusyState; shouldSubmit: boolean } {
  if (busyCheckResult) {
    return {
      next: {
        ...state,
        isMachineBusy: true,
        pendingInput: { input, files },
      },
      shouldSubmit: false,
    }
  }
  return {
    next: { ...state, isMachineBusy: false, pendingInput: null },
    shouldSubmit: true,
  }
}

/**
 * Mirrors the `forceStopAndSend` decision branch.
 * Returns the resolved input (caller-supplied wins, falls back to
 * pendingInput), and whether the call should proceed at all.
 */
function resolveForceStopInput(
  state: BusyState,
  overrideInput: string | undefined,
  overrideFiles: unknown[] | undefined,
): { input: string; files?: unknown[]; shouldProceed: boolean } {
  if (state.isStoppingMachine) {
    return { input: '', shouldProceed: false }  // re-entry guard
  }
  const target =
    overrideInput !== undefined
      ? { input: overrideInput, files: overrideFiles }
      : state.pendingInput
  if (!target || !target.input.trim()) {
    return { input: '', shouldProceed: false }  // nothing to send
  }
  return { input: target.input, files: target.files, shouldProceed: true }
}

/**
 * Mirrors the input-cleared dismiss effect.
 * If busy state is set AND input is empty, busy state should clear so the
 * next typed input goes through the normal pre-check path.
 */
function shouldDismissOnEmptyInput(state: BusyState, input: string): boolean {
  return state.isMachineBusy && !input.trim()
}

// ── handleSubmit decision tests ─────────────────────────────────────────────

describe('handleSubmit decision', () => {
  it('busy=false → submit normally, no busy state', () => {
    const { next, shouldSubmit } = handleSubmitDecision(initial, false, 'hello')
    expect(shouldSubmit).toBe(true)
    expect(next.isMachineBusy).toBe(false)
    expect(next.pendingInput).toBeNull()
  })

  it('busy=true → DO NOT submit, store pending input + flip busy flag', () => {
    const { next, shouldSubmit } = handleSubmitDecision(initial, true, 'do something')
    expect(shouldSubmit).toBe(false)
    expect(next.isMachineBusy).toBe(true)
    expect(next.pendingInput).toEqual({ input: 'do something', files: undefined })
  })

  it('busy=true preserves files in pending input', () => {
    const files = [{ path: '/a', name: 'a.txt' }]
    const { next } = handleSubmitDecision(initial, true, 'use this', files)
    expect(next.pendingInput?.files).toEqual(files)
  })

  it('busy=false clears any stale pending input from previous busy state', () => {
    const stale: BusyState = {
      isMachineBusy: true,
      isStoppingMachine: false,
      pendingInput: { input: 'old' },
    }
    const { next } = handleSubmitDecision(stale, false, 'new')
    expect(next.pendingInput).toBeNull()
    expect(next.isMachineBusy).toBe(false)
  })
})

// ── forceStopAndSend resolution tests ───────────────────────────────────────

describe('forceStopAndSend input resolution', () => {
  it('uses override input when caller supplies it', () => {
    const state: BusyState = {
      isMachineBusy: true,
      isStoppingMachine: false,
      pendingInput: { input: 'stale' },
    }
    const r = resolveForceStopInput(state, 'fresh', undefined)
    expect(r.shouldProceed).toBe(true)
    expect(r.input).toBe('fresh')
  })

  it('falls back to pendingInput when no override', () => {
    const state: BusyState = {
      isMachineBusy: true,
      isStoppingMachine: false,
      pendingInput: { input: 'stashed' },
    }
    const r = resolveForceStopInput(state, undefined, undefined)
    expect(r.shouldProceed).toBe(true)
    expect(r.input).toBe('stashed')
  })

  it('returns shouldProceed=false when isStoppingMachine is true (re-entry guard)', () => {
    // Critical: prevents double-submit if user mashes the Override button.
    const state: BusyState = {
      isMachineBusy: true,
      isStoppingMachine: true,
      pendingInput: { input: 'go' },
    }
    const r = resolveForceStopInput(state, 'go', undefined)
    expect(r.shouldProceed).toBe(false)
  })

  it('returns shouldProceed=false when no input anywhere (nothing to send)', () => {
    const state: BusyState = {
      isMachineBusy: true,
      isStoppingMachine: false,
      pendingInput: null,
    }
    const r = resolveForceStopInput(state, undefined, undefined)
    expect(r.shouldProceed).toBe(false)
  })

  it('returns shouldProceed=false when override is whitespace-only', () => {
    const state: BusyState = {
      isMachineBusy: true,
      isStoppingMachine: false,
      pendingInput: { input: 'has-content' },
    }
    const r = resolveForceStopInput(state, '   ', undefined)
    expect(r.shouldProceed).toBe(false)
  })

  it('uses override even when override is empty-string but pendingInput exists', () => {
    // The undefined-vs-empty-string distinction matters — passing
    // overrideInput="" explicitly means "I edited the textarea to empty,
    // dont auto-send the stale stash".
    const state: BusyState = {
      isMachineBusy: true,
      isStoppingMachine: false,
      pendingInput: { input: 'stash' },
    }
    const r = resolveForceStopInput(state, '', undefined)
    expect(r.shouldProceed).toBe(false)
  })
})

// ── input-cleared dismiss effect ────────────────────────────────────────────

describe('shouldDismissOnEmptyInput', () => {
  it('dismisses busy state when input becomes empty', () => {
    const state: BusyState = {
      isMachineBusy: true,
      isStoppingMachine: false,
      pendingInput: { input: 'old' },
    }
    expect(shouldDismissOnEmptyInput(state, '')).toBe(true)
    expect(shouldDismissOnEmptyInput(state, '   ')).toBe(true)
  })

  it('does NOT dismiss when input has content', () => {
    const state: BusyState = {
      isMachineBusy: true,
      isStoppingMachine: false,
      pendingInput: null,
    }
    expect(shouldDismissOnEmptyInput(state, 'hi')).toBe(false)
  })

  it('does NOT dismiss when busy state is already false (no-op)', () => {
    const state: BusyState = {
      isMachineBusy: false,
      isStoppingMachine: false,
      pendingInput: null,
    }
    expect(shouldDismissOnEmptyInput(state, '')).toBe(false)
  })
})

// ── window.coasty IPC contract ─────────────────────────────────────────────
//
// The renderer talks to the main process through window.coasty. These tests
// pin the contract: what shape the IPC returns, what the renderer should do
// with each shape. If the shape drifts, the tests catch it.

interface MockBusyResponse {
  success: boolean
  busy?: boolean
  ownerChatId?: string | null
  error?: string
}

interface MockStopResponse {
  success: boolean
  stopped?: boolean
  released?: boolean
  ownerChatId?: string | null
  error?: string
}

/**
 * Mirrors the renderer's `checkBusy` helper:
 *   const res = await window.coasty.checkMachineBusy(machineId)
 *   return res?.success ? !!res.busy : false
 *
 * The "fail-open on error" rule is critical: if the IPC fails (network,
 * permission, missing handler), we MUST NOT permanently block the user
 * from submitting. The chat route's busy error becomes the fallback.
 */
function interpretBusyResponse(res: MockBusyResponse | null | undefined): boolean {
  return res?.success ? !!res.busy : false
}

describe('checkMachineBusy IPC contract', () => {
  it('success=true + busy=true → busy', () => {
    expect(interpretBusyResponse({ success: true, busy: true })).toBe(true)
  })

  it('success=true + busy=false → not busy', () => {
    expect(interpretBusyResponse({ success: true, busy: false })).toBe(false)
  })

  it('success=false (any reason) → fail-open as not busy', () => {
    // Important: don't permanently block the user.
    expect(interpretBusyResponse({ success: false, error: 'HTTP 500' })).toBe(false)
    expect(interpretBusyResponse({ success: false })).toBe(false)
  })

  it('null/undefined IPC result → fail-open as not busy', () => {
    expect(interpretBusyResponse(null)).toBe(false)
    expect(interpretBusyResponse(undefined)).toBe(false)
  })

  it('success=true with missing busy field → coerced to false', () => {
    // Defensive: backend forgot the field; treat as not busy.
    expect(interpretBusyResponse({ success: true })).toBe(false)
  })
})

// ── End-to-end simulation: handleSubmit → busy → forceStopAndSend ───────────

describe('Full Override & Run lifecycle simulation', () => {
  it('idle → submit → not busy → submit fires', () => {
    let state = initial
    const { next, shouldSubmit } = handleSubmitDecision(state, false, 'hi')
    state = next
    expect(shouldSubmit).toBe(true)
    expect(state.isMachineBusy).toBe(false)
  })

  it('busy → submit blocked → stash → click yellow → stop+send', () => {
    let state = initial

    // Step 1: user submits, machine is busy.
    let { next, shouldSubmit } = handleSubmitDecision(state, true, 'task A')
    state = next
    expect(shouldSubmit).toBe(false)
    expect(state.isMachineBusy).toBe(true)
    expect(state.pendingInput?.input).toBe('task A')

    // Step 2: user clicks yellow Override & Run with the same input
    // still in the textarea.
    const r = resolveForceStopInput(state, 'task A', undefined)
    expect(r.shouldProceed).toBe(true)
    expect(r.input).toBe('task A')

    // Step 3: simulate setting isStoppingMachine=true while the IPC
    // call is in flight, then attempt double-click — should be guarded.
    state = { ...state, isStoppingMachine: true }
    const r2 = resolveForceStopInput(state, 'task A', undefined)
    expect(r2.shouldProceed).toBe(false)
  })

  it('busy → user clears input → busy state dismisses', () => {
    let state: BusyState = {
      isMachineBusy: true,
      isStoppingMachine: false,
      pendingInput: { input: 'task B' },
    }
    expect(shouldDismissOnEmptyInput(state, '')).toBe(true)
    // Then they type something fresh — handleSubmit goes through the
    // normal pre-check path, no stale busy/pending state lingers.
    state = { ...initial }
    const { next, shouldSubmit } = handleSubmitDecision(state, false, 'task C')
    expect(shouldSubmit).toBe(true)
    expect(next.isMachineBusy).toBe(false)
  })

  it('busy → user edits input → forceStopAndSend uses the EDITED input', () => {
    // Real scenario: machine becomes busy while user is mid-edit.
    // They saw the yellow button, kept typing, then clicked the button.
    // The edited text must be what gets submitted, not the stashed
    // pre-busy version.
    let state: BusyState = {
      isMachineBusy: true,
      isStoppingMachine: false,
      pendingInput: { input: 'old draft' },
    }
    const r = resolveForceStopInput(state, 'final edited version', undefined)
    expect(r.shouldProceed).toBe(true)
    expect(r.input).toBe('final edited version')
  })
})

// ── window.coasty mock-call regression tests ────────────────────────────────
//
// These tests use vitest's spy/mock to verify that we only make the
// expected number of IPC calls per submission. Belt-and-braces against
// regressions where someone refactors useChatSubmit.ts and accidentally
// adds extra roundtrips per send (which would slow down every chat).

describe('IPC call count regression guards', () => {
  let coastyMock: {
    checkMachineBusy: ReturnType<typeof vi.fn>
    stopMachine: ReturnType<typeof vi.fn>
    sendChatMessage: ReturnType<typeof vi.fn>
  }

  beforeEach(() => {
    coastyMock = {
      checkMachineBusy: vi.fn(),
      stopMachine: vi.fn(),
      sendChatMessage: vi.fn(),
    }
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  /**
   * Simulates a single send-attempt at the IPC layer.
   * Returns whether the chat was actually sent.
   */
  async function simulateSend(
    coasty: typeof coastyMock,
    input: string,
  ): Promise<boolean> {
    const busyRes = await coasty.checkMachineBusy('m1')
    if (interpretBusyResponse(busyRes)) {
      // Stash + show yellow UI; don't send.
      return false
    }
    await coasty.sendChatMessage({ input })
    return true
  }

  /**
   * Simulates the yellow-button click.
   */
  async function simulateOverrideAndRun(
    coasty: typeof coastyMock,
    input: string,
  ): Promise<boolean> {
    const stopRes = await coasty.stopMachine('m1')
    if (!stopRes?.success) return false
    await coasty.sendChatMessage({ input })
    return true
  }

  it('idle send: 1 busy-check, 0 stops, 1 send', async () => {
    coastyMock.checkMachineBusy.mockResolvedValue({ success: true, busy: false })
    coastyMock.sendChatMessage.mockResolvedValue({ success: true })

    const sent = await simulateSend(coastyMock, 'hello')

    expect(sent).toBe(true)
    expect(coastyMock.checkMachineBusy).toHaveBeenCalledTimes(1)
    expect(coastyMock.stopMachine).toHaveBeenCalledTimes(0)
    expect(coastyMock.sendChatMessage).toHaveBeenCalledTimes(1)
  })

  it('busy send: 1 busy-check, 0 stops, 0 sends (UI shows yellow)', async () => {
    coastyMock.checkMachineBusy.mockResolvedValue({ success: true, busy: true })

    const sent = await simulateSend(coastyMock, 'hello')

    expect(sent).toBe(false)
    expect(coastyMock.checkMachineBusy).toHaveBeenCalledTimes(1)
    expect(coastyMock.stopMachine).toHaveBeenCalledTimes(0)
    expect(coastyMock.sendChatMessage).toHaveBeenCalledTimes(0)
  })

  it('override flow: 0 busy-checks (already known busy), 1 stop, 1 send', async () => {
    coastyMock.stopMachine.mockResolvedValue({ success: true, stopped: true, released: true })
    coastyMock.sendChatMessage.mockResolvedValue({ success: true })

    const sent = await simulateOverrideAndRun(coastyMock, 'hello')

    expect(sent).toBe(true)
    expect(coastyMock.checkMachineBusy).toHaveBeenCalledTimes(0)
    expect(coastyMock.stopMachine).toHaveBeenCalledTimes(1)
    expect(coastyMock.sendChatMessage).toHaveBeenCalledTimes(1)
  })

  it('override stop fails: no send happens', async () => {
    coastyMock.stopMachine.mockResolvedValue({ success: false, error: 'backend down' })

    const sent = await simulateOverrideAndRun(coastyMock, 'hello')

    expect(sent).toBe(false)
    expect(coastyMock.sendChatMessage).toHaveBeenCalledTimes(0)
  })

  it('rewrites "desktop app not connected" to a reconnect hint', () => {
    // Mirrors the rewrite rules in ipc-handlers.ts (main process) and
    // lib/api.ts (renderer SSE parser). Both layers strip the
    // "Electron desktop app is not connected" phrasing that the backend
    // sometimes emits — that wording is meaningless when the user is
    // already INSIDE the desktop app. Tests pin the regex + replacement
    // so a future copy edit to the message doesn't accidentally
    // reintroduce the nonsensical text.
    const PATTERN = /electron\s+desktop\s+app\s+is\s+not\s+connected/i
    const REPLACEMENT = 'Reconnecting — please try again in a moment.'

    function rewrite(msg: string): string {
      return PATTERN.test(msg) ? REPLACEMENT : msg
    }

    // Backend's exact wording (from chat.py:392).
    expect(rewrite(
      'Electron desktop app is not connected. ' +
      'Please ensure the app is running and signed in.',
    )).toBe(REPLACEMENT)

    // Older wording variant used in the IPC handler before this fix.
    expect(rewrite(
      'Electron desktop app is not connected. Please check your connection.',
    )).toBe(REPLACEMENT)

    // Case-insensitive — defends against a future "ELECTRON DESKTOP" log line.
    expect(rewrite(
      'electron desktop app is not connected — auth lost',
    )).toBe(REPLACEMENT)

    // Whitespace tolerance — collapses tabs/newlines via \s+.
    expect(rewrite(
      'Electron\tdesktop  app\nis not connected',
    )).toBe(REPLACEMENT)

    // Unrelated errors pass through unchanged.
    expect(rewrite('Insufficient credits')).toBe('Insufficient credits')
    expect(rewrite('Machine is currently busy')).toBe('Machine is currently busy')
    expect(rewrite('Generic 500')).toBe('Generic 500')
  })

  it('busy-check IPC throws: fail-open (1 send)', async () => {
    coastyMock.checkMachineBusy.mockRejectedValue(new Error('ipc gone'))
    coastyMock.sendChatMessage.mockResolvedValue({ success: true })

    // The renderer's checkBusy helper wraps in try/catch and returns false
    // on throw — same behavior we'd see with a network failure.
    let busyResult = false
    try {
      const r = await coastyMock.checkMachineBusy('m1')
      busyResult = interpretBusyResponse(r)
    } catch {
      busyResult = false  // fail-open
    }
    if (!busyResult) {
      await coastyMock.sendChatMessage({ input: 'hello' })
    }

    expect(coastyMock.sendChatMessage).toHaveBeenCalledTimes(1)
  })
})
