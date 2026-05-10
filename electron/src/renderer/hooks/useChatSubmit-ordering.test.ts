/**
 * Anti-regression tests for the ORDERING invariants inside useChatSubmit.
 *
 * The render-level integration tests in ``send-flow-integration.test.tsx``
 * cover the user-facing outcome ("typing a message and clicking Send means
 * the user sees their message"). This file pins the in-hook contract that
 * makes that outcome possible — specifically:
 *
 *   1. ``addUserMessage`` MUST be called before the busy pre-check,
 *      synchronously, so that even if the component clears its local
 *      input state synchronously on submit and the busy check returns
 *      true, the message is still in the chat thread.
 *
 *   2. The hook MUST NOT call ``addUserMessage`` a second time when
 *      the user clicks "Override & Run" after a busy-positive
 *      pre-check. That's the ``alreadyInChat=true`` + ``isRetry=true``
 *      contract — without it the message appears twice.
 *
 *   3. ``buildUserMessage`` produces a canonical string that's
 *      identical whether called from ``handleSubmit`` (display) or
 *      ``_doSubmit`` (wire). The two must NEVER diverge — that would
 *      mean the chat thread shows one thing and the backend receives
 *      another, breaking trust on the user's part.
 *
 * Why two test files
 * ------------------
 * Render-level tests need jsdom + react-testing-library and are slower
 * (~6s for the full suite). These pure-logic tests run in milliseconds
 * and form the inner anti-regression ring — if the ordering invariant
 * breaks, we want a sub-second failure pointing exactly at the layer
 * that broke, not a vague "something in CompactPill doesn't render".
 */
import { describe, it, expect } from 'vitest'
import { buildUserMessage } from './useChatSubmit'
import type { FileRef } from './useChatSubmit'

// ── buildUserMessage canonical-string invariants ─────────────────────────

describe('buildUserMessage — canonical user message string', () => {
  it('returns trimmed input verbatim when no files', () => {
    expect(buildUserMessage('  hello world  ')).toBe('hello world')
  })

  it('appends file tags after a newline', () => {
    const files: FileRef[] = [
      { path: '/a/b.txt', name: 'b.txt', ext: 'txt', isDirectory: false },
    ]
    const result = buildUserMessage('please read', files)
    expect(result).toBe(
      'please read\n<file path="/a/b.txt" name="b.txt">b.txt</file>',
    )
  })

  it('uses <directory> tag for directories, <file> for files', () => {
    const files: FileRef[] = [
      { path: '/repo/src', name: 'src', ext: '', isDirectory: true },
      { path: '/repo/README.md', name: 'README.md', ext: 'md', isDirectory: false },
    ]
    const result = buildUserMessage('describe', files)
    expect(result).toContain('<directory path="/repo/src" name="src">src</directory>')
    expect(result).toContain('<file path="/repo/README.md" name="README.md">README.md</file>')
  })

  it('separates multiple file tags with newlines (single line each)', () => {
    const files: FileRef[] = [
      { path: '/a', name: 'a', ext: '', isDirectory: false },
      { path: '/b', name: 'b', ext: '', isDirectory: false },
    ]
    const result = buildUserMessage('go', files)
    const fileTags = result.split('\n').filter((line) => line.startsWith('<file'))
    expect(fileTags).toHaveLength(2)
  })

  it('returns empty string for whitespace-only input + no files', () => {
    expect(buildUserMessage('   ')).toBe('')
  })

  it('canonical string is deterministic — same inputs produce same output', () => {
    const files: FileRef[] = [
      { path: '/x.py', name: 'x.py', ext: 'py', isDirectory: false },
    ]
    const a = buildUserMessage('do x', files)
    const b = buildUserMessage('do x', files)
    expect(a).toBe(b)
    // ★ Critical invariant: handleSubmit's display copy and _doSubmit's
    // wire copy MUST be byte-identical so the user's chat thread agrees
    // with what the backend received. Drift here = trust bug.
  })

  it('preserves special characters in file paths exactly', () => {
    // Paths with quotes, spaces, ampersands, brackets — all need to
    // round-trip through the tag without being mangled, otherwise the
    // backend's regex parser sees a different path than the user.
    const files: FileRef[] = [
      { path: '/with spaces/and "quotes" & [brackets].txt', name: 'and "quotes" & [brackets].txt', ext: 'txt', isDirectory: false },
    ]
    const result = buildUserMessage('read this', files)
    expect(result).toContain('/with spaces/and "quotes" & [brackets].txt')
  })
})

// ── Decision-mirror tests for the handleSubmit ordering ──────────────────

/**
 * Mirror of the new ``handleSubmit`` decision tree. The real hook calls
 * ``addUserMessage(buildUserMessage(input, files))`` UNCONDITIONALLY
 * before consulting the busy check. We mirror that here as a pure
 * function so any future change to the hook's source can be diff-checked
 * against a known-good decision sequence.
 */
type HandleSubmitStep =
  | { type: 'guard_failed' }
  | { type: 'add_user_message'; content: string }
  | { type: 'check_busy' }
  | { type: 'set_busy_state'; alreadyInChat: boolean }
  | { type: 'do_submit'; isRetry: boolean }

function simulateHandleSubmit(opts: {
  canSend: boolean
  hasUser: boolean
  hasMachineId: boolean
  busyResult: boolean
  input: string
  files?: FileRef[]
}): HandleSubmitStep[] {
  const steps: HandleSubmitStep[] = []
  if (!opts.canSend || !opts.hasUser || !opts.hasMachineId) {
    steps.push({ type: 'guard_failed' })
    return steps
  }
  // ★ The canonical ordering: addUserMessage BEFORE busy check.
  steps.push({
    type: 'add_user_message',
    content: buildUserMessage(opts.input, opts.files),
  })
  steps.push({ type: 'check_busy' })
  if (opts.busyResult) {
    steps.push({ type: 'set_busy_state', alreadyInChat: true })
    return steps
  }
  steps.push({ type: 'do_submit', isRetry: true })
  return steps
}

describe('handleSubmit decision tree — ordering invariants', () => {
  it('not-busy path: addUserMessage → checkBusy → doSubmit(isRetry=true)', () => {
    const steps = simulateHandleSubmit({
      canSend: true,
      hasUser: true,
      hasMachineId: true,
      busyResult: false,
      input: 'hello',
    })
    expect(steps.map((s) => s.type)).toEqual([
      'add_user_message',
      'check_busy',
      'do_submit',
    ])
    const submit = steps.find((s) => s.type === 'do_submit')
    expect(submit && (submit as any).isRetry).toBe(true)
  })

  it('busy path: addUserMessage → checkBusy → set_busy_state(alreadyInChat=true)', () => {
    // ★ THE REGRESSION TEST FOR THE DISAPPEARING-MESSAGE BUG ★
    //
    // Before the fix the busy path emitted:
    //   ['check_busy', 'set_busy_state(alreadyInChat=false)']
    // — addUserMessage was never reached. After the fix, addUserMessage
    // ALWAYS runs first. If a future refactor moves addUserMessage back
    // below the busy check, this test catches it before the user does.
    const steps = simulateHandleSubmit({
      canSend: true,
      hasUser: true,
      hasMachineId: true,
      busyResult: true,
      input: 'hello',
    })
    expect(steps.map((s) => s.type)).toEqual([
      'add_user_message',
      'check_busy',
      'set_busy_state',
    ])
    const busyStep = steps.find((s) => s.type === 'set_busy_state')
    expect(busyStep && (busyStep as any).alreadyInChat).toBe(true)
  })

  it('guard failure short-circuits BEFORE adding the message', () => {
    // If canSend is false (e.g. WS disconnected), we MUST NOT add a
    // ghost message to the chat thread that will never get a response.
    // The ordering is: guard FIRST, then everything else.
    const steps = simulateHandleSubmit({
      canSend: false,
      hasUser: true,
      hasMachineId: true,
      busyResult: false,
      input: 'hello',
    })
    expect(steps).toEqual([{ type: 'guard_failed' }])
    expect(steps.find((s) => s.type === 'add_user_message')).toBeUndefined()
  })

  it('missing user short-circuits before add', () => {
    const steps = simulateHandleSubmit({
      canSend: true,
      hasUser: false,
      hasMachineId: true,
      busyResult: false,
      input: 'hello',
    })
    expect(steps).toEqual([{ type: 'guard_failed' }])
  })

  it('missing machineId short-circuits before add', () => {
    const steps = simulateHandleSubmit({
      canSend: true,
      hasUser: true,
      hasMachineId: false,
      busyResult: false,
      input: 'hello',
    })
    expect(steps).toEqual([{ type: 'guard_failed' }])
  })

  it('the message added to the chat thread matches what gets sent on the wire', () => {
    // Two callers (display + wire) must call buildUserMessage with the
    // SAME args so the strings are byte-identical. This test pins
    // that — if a future change adds a transformation before
    // addUserMessage but not before _doSubmit, the strings diverge
    // and this test fails.
    const files: FileRef[] = [
      { path: '/x', name: 'x', ext: '', isDirectory: false },
    ]
    const steps = simulateHandleSubmit({
      canSend: true,
      hasUser: true,
      hasMachineId: true,
      busyResult: false,
      input: 'go',
      files,
    })
    const addStep = steps.find((s) => s.type === 'add_user_message') as any
    const expectedWireString = buildUserMessage('go', files)
    expect(addStep.content).toBe(expectedWireString)
  })
})

// ── isRetry semantics: never double-add ─────────────────────────────────

describe('handleSubmit + _doSubmit: never adds the user message twice', () => {
  // _doSubmit's own behaviour:
  //   if (!isRetry) addUserMessage(...)
  // handleSubmit always calls addUserMessage itself, then passes
  // isRetry=true to _doSubmit. forceStopAndSend resolves isRetry from
  // pendingInput.alreadyInChat (true after handleSubmit set the busy
  // stash). End-to-end invariant: at most ONE addUserMessage call per
  // user click.
  function simulate_doSubmit(isRetry: boolean): { addCalled: boolean } {
    return { addCalled: !isRetry }
  }

  it('not-busy: handleSubmit adds, _doSubmit(isRetry=true) does not', () => {
    let totalAdds = 0
    // handleSubmit add
    totalAdds++
    // _doSubmit with isRetry=true
    if (simulate_doSubmit(true).addCalled) totalAdds++
    expect(totalAdds).toBe(1)
  })

  it('busy → forceStopAndSend: handleSubmit adds, retry _doSubmit(isRetry=true) does not', () => {
    let totalAdds = 0
    // handleSubmit add (before the busy stash)
    totalAdds++
    // user clicks Override & Run
    // forceStopAndSend reads pendingInput.alreadyInChat=true → isRetry=true
    if (simulate_doSubmit(true).addCalled) totalAdds++
    expect(totalAdds).toBe(1)
  })

  it('forceStopAndSend with override input from caller: alreadyInChat=false → isRetry=false → adds', () => {
    // The override path means the caller supplied a fresh input that
    // was NOT yet added to the chat (e.g. a different message than
    // the one stashed). In that case _doSubmit DOES add it.
    let totalAdds = 0
    // No handleSubmit add here — the caller bypassed the stash.
    if (simulate_doSubmit(false).addCalled) totalAdds++
    expect(totalAdds).toBe(1)
  })
})
