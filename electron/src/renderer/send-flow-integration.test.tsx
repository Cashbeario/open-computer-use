/**
 * @vitest-environment jsdom
 *
 * Real component-render integration tests for the chat send flow.
 *
 * What this file pins (web-app-style contract)
 * --------------------------------------------
 * The web app at ``app/components/chat-input/chat-input.tsx`` follows
 * a simple rule: **the user's typed text stays in the input until the
 * system has a definite answer about what happens to it**. The
 * Electron desktop app must match this contract, because users move
 * between web and desktop and any behavioural drift is a trust
 * violation.
 *
 * Concretely, after clicking Send:
 *
 *   1. If the machine is NOT busy → message lands in the chat
 *      thread, wire call fires, input is cleared. ('sent' branch)
 *
 *   2. If the machine IS busy → text STAYS in the input, the yellow
 *      "Override & Run" button appears, and NO message is added to
 *      the chat thread until the user clicks Override. ('busy' branch)
 *
 *   3. If the request is rejected (empty input, disconnected, force-
 *      stop failed) → text STAYS in the input, no state change.
 *      ('rejected' branch)
 *
 * The two regressions this file guards against
 * --------------------------------------------
 *   (A) "Message disappears on send" — the old code cleared the input
 *       synchronously BEFORE the busy pre-check resolved. Combined
 *       with the auto-dismiss useEffect, a busy-positive response
 *       wiped the user's text into the void with no UI feedback.
 *       Fixed by returning a status from handleSubmit + clearing
 *       only on 'sent'.
 *
 *   (B) "Message added to chat thread before user confirms" — an
 *       intermediate fix added the message BEFORE the busy check to
 *       avoid the disappear. That polluted the chat thread with
 *       not-yet-confirmed messages. The web app doesn't do that;
 *       neither should we. Fixed by adding the message INSIDE the
 *       'sent' branch only.
 *
 * Both regressions had us fixing the symptom in the wrong layer.
 * The right layer is the hook's return value: it carries the
 * decision authority to the caller, which knows whether to mutate
 * the input.
 *
 * Test layering
 * -------------
 *   - This file: render-level integration via @testing-library/react.
 *     Slowest (~6s) but catches issues only visible when the hook +
 *     components + chat store interact under real React/jsdom
 *     semantics.
 *
 *   - useChatSubmit-ordering.test.ts: fast pure-logic mirror of the
 *     decision tree. Runs in 300ms; pins the in-hook contract that
 *     these integration tests verify end-to-end.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom/vitest'
import React from 'react'
import { CompactPill } from './components/CompactPill'
import { useAuthStore } from './stores/auth-store'
import { useConnectionStore } from './stores/connection-store'
import { useChatStore } from './stores/chat-store'
import { useWindowStore } from './stores/window-store'

// ── Test fixtures ─────────────────────────────────────────────────────────

interface CoastyMock {
  checkMachineBusy: ReturnType<typeof vi.fn>
  stopMachine: ReturnType<typeof vi.fn>
  sendChatMessage: ReturnType<typeof vi.fn>
  abortChat: ReturnType<typeof vi.fn>
  onChatSSEEvent: ReturnType<typeof vi.fn>
  createChat: ReturnType<typeof vi.fn>
  listChats: ReturnType<typeof vi.fn>
  getChatMessages: ReturnType<typeof vi.fn>
  updateChat: ReturnType<typeof vi.fn>
  deleteChat: ReturnType<typeof vi.fn>
  setMode: ReturnType<typeof vi.fn>
  setWindowMode: ReturnType<typeof vi.fn>
  setOpacity: ReturnType<typeof vi.fn>
  getCredits: ReturnType<typeof vi.fn>
  isOssMode: ReturnType<typeof vi.fn>
}

let coasty: CoastyMock
const TEST_USER_ID = 'user-test-001'
const TEST_MACHINE_ID = 'machine-test-001'

function buildCoastyMock(): CoastyMock {
  return {
    checkMachineBusy: vi.fn(async () => ({
      success: true,
      busy: false,
      ownerChatId: null,
    })),
    stopMachine: vi.fn(async () => ({
      success: true,
      stopped: true,
      released: true,
      forced: false,
      ownerChatId: null,
    })),
    sendChatMessage: vi.fn(async () => ({ success: true })),
    abortChat: vi.fn(async () => ({ success: true })),
    onChatSSEEvent: vi.fn(() => () => {}),
    createChat: vi.fn(async () => ({
      success: true,
      chat: { id: 'chat-fresh-001', title: 'New Task', model: 'default' },
    })),
    listChats: vi.fn(async () => ({ success: true, chats: [] })),
    getChatMessages: vi.fn(async () => ({ success: true, messages: [] })),
    updateChat: vi.fn(async () => ({ success: true })),
    deleteChat: vi.fn(async () => ({ success: true })),
    setMode: vi.fn(async () => ({ success: true })),
    setWindowMode: vi.fn(async () => undefined),
    setOpacity: vi.fn(async () => undefined),
    getCredits: vi.fn(async () => ({ success: true, credits: 1000 })),
    isOssMode: vi.fn(async () => false),
  }
}

beforeEach(() => {
  coasty = buildCoastyMock()
  ;(globalThis as any).window.coasty = coasty

  useAuthStore.setState({
    user: {
      id: TEST_USER_ID,
      email: 'test@coasty.ai',
      name: 'Test',
      avatar: null,
    },
    machineId: TEST_MACHINE_ID,
    loading: false,
  } as any)
  useConnectionStore.setState({ state: 'connected' } as any)
  useChatStore.setState({
    messages: [],
    isStreaming: false,
    chatId: '',
    chatTitle: null,
    isSynced: false,
    abortController: null,
    awaitingHuman: null,
    chatList: [],
    chatListLoading: false,
  })
  useWindowStore.setState({ mode: 'compact' } as any)
})

afterEach(() => {
  delete (globalThis as any).window.coasty
  vi.clearAllMocks()
})

// ── Helpers ───────────────────────────────────────────────────────────────

function renderCompactPill() {
  return render(<CompactPill />)
}

function getInput(): HTMLInputElement {
  return screen.getByPlaceholderText(/Send a message|Another task running|Working/i) as HTMLInputElement
}

async function userMessages() {
  return useChatStore.getState().messages.filter((m) => m.role === 'user')
}

async function waitForUserMessage(content?: string) {
  await waitFor(async () => {
    const um = await userMessages()
    expect(um.length).toBeGreaterThan(0)
    if (content !== undefined) {
      expect(um[um.length - 1].content).toContain(content)
    }
  })
}

// ═════════════════════════════════════════════════════════════════════════
// 1. Happy path — machine NOT busy
// ═════════════════════════════════════════════════════════════════════════

describe('CompactPill — happy path (not busy)', () => {
  it('typing + Send adds the message to chat AND clears input', async () => {
    const user = userEvent.setup()
    renderCompactPill()

    const input = getInput()
    await user.type(input, 'do something useful')
    await user.click(screen.getByRole('button', { name: /^send$/i }))

    await waitForUserMessage('do something useful')
    expect((await userMessages())).toHaveLength(1)
    // Input cleared because handleSubmit resolved to 'sent'.
    await waitFor(() => expect(input.value).toBe(''))
  })

  it('Enter key works the same as the Send button', async () => {
    const user = userEvent.setup()
    renderCompactPill()
    await user.type(getInput(), 'enter-sent message{Enter}')
    await waitForUserMessage('enter-sent message')
    expect((await userMessages())).toHaveLength(1)
  })

  it('hits the IPC checkMachineBusy pre-flight on each send', async () => {
    const user = userEvent.setup()
    renderCompactPill()
    await user.type(getInput(), 'first send{Enter}')
    await waitFor(() =>
      expect(coasty.checkMachineBusy).toHaveBeenCalledWith(TEST_MACHINE_ID),
    )
  })

  it('hits sendChatMessage IPC after a clean pre-check', async () => {
    const user = userEvent.setup()
    renderCompactPill()
    await user.type(getInput(), 'do it{Enter}')
    await waitFor(() => expect(coasty.sendChatMessage).toHaveBeenCalled())
    const sendArgs = coasty.sendChatMessage.mock.calls[0][0]
    expect(sendArgs.machineId).toBe(TEST_MACHINE_ID)
    expect(sendArgs.userId).toBe(TEST_USER_ID)
    // The last wire message must be the user's input.
    const lastMsg = sendArgs.messages[sendArgs.messages.length - 1]
    expect(lastMsg.role).toBe('user')
    expect(lastMsg.content).toContain('do it')
  })
})

// ═════════════════════════════════════════════════════════════════════════
// 2. Busy pre-check — web-app-style behavior
// ═════════════════════════════════════════════════════════════════════════

describe('CompactPill — busy pre-check', () => {
  beforeEach(() => {
    coasty.checkMachineBusy = vi.fn(async () => ({
      success: true,
      busy: true,
      ownerChatId: 'chat-other-task',
    }))
  })

  it('★ does NOT add the message to the chat thread on busy pre-check', async () => {
    // Web parity: the chat thread is reserved for confirmed sends.
    // A pre-check busy is the system asking the user "are you sure?"
    // — nothing has actually happened yet from the user's perspective,
    // and the chat thread should reflect that.
    const user = userEvent.setup()
    renderCompactPill()

    await user.type(getInput(), 'queued via busy{Enter}')

    // Wait for the pre-check to resolve (the IPC mock is synchronous-ish).
    await waitFor(() => expect(coasty.checkMachineBusy).toHaveBeenCalled())
    // Drain any async state updates so the UI has fully rendered.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50))
    })

    // ★ No message added to the chat thread.
    expect((await userMessages())).toHaveLength(0)
  })

  it('★ KEEPS the typed text in the input on busy pre-check', async () => {
    // Web parity: the input box is the user's draft, never destroyed
    // without their explicit consent. On busy, the draft must remain
    // so they can edit before clicking Override or clear to dismiss.
    const user = userEvent.setup()
    renderCompactPill()

    const input = getInput()
    await user.type(input, 'keep me{Enter}')

    await waitFor(() => expect(coasty.checkMachineBusy).toHaveBeenCalled())
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50))
    })

    // ★ Input value is the SAME as what the user typed — not cleared.
    expect(input.value).toBe('keep me')
  })

  it('★ renders the yellow Override & Run button after busy', async () => {
    const user = userEvent.setup()
    renderCompactPill()

    await user.type(getInput(), 'wants to override{Enter}')
    await screen.findByRole('button', { name: /override and run/i })
  })

  it('does NOT call sendChatMessage on busy pre-check (no rogue send)', async () => {
    // The whole point of pre-check: don't fire the wire call when
    // we already know it will be rejected. This protects against the
    // user being billed for a doomed dispatch.
    const user = userEvent.setup()
    renderCompactPill()

    await user.type(getInput(), 'no rogue send{Enter}')
    await waitFor(() => expect(coasty.checkMachineBusy).toHaveBeenCalled())
    await act(async () => {
      await new Promise((r) => setTimeout(r, 80))
    })
    expect(coasty.sendChatMessage).not.toHaveBeenCalled()
  })

  it('clicking the yellow button calls stopMachine then sends', async () => {
    const user = userEvent.setup()
    renderCompactPill()

    await user.type(getInput(), 'override and send{Enter}')
    const yellowBtn = await screen.findByRole('button', { name: /override and run/i })
    await user.click(yellowBtn)

    await waitFor(() => expect(coasty.stopMachine).toHaveBeenCalledWith(TEST_MACHINE_ID))
    await waitFor(
      () => expect(coasty.sendChatMessage).toHaveBeenCalled(),
      { timeout: 2000 },
    )
  })

  it('after Override & Run, the message lands in the chat thread', async () => {
    // After confirmation, the message must materialize. This is the
    // moment the chat thread is allowed to mutate — the user has now
    // explicitly authorized the send.
    const user = userEvent.setup()
    renderCompactPill()

    await user.type(getInput(), 'finally send{Enter}')
    const yellowBtn = await screen.findByRole('button', { name: /override and run/i })
    await user.click(yellowBtn)

    await waitForUserMessage('finally send')
    expect((await userMessages())).toHaveLength(1)
  })

  it('after Override & Run, the input is cleared (sent branch)', async () => {
    const user = userEvent.setup()
    renderCompactPill()

    const input = getInput()
    await user.type(input, 'clear me on override{Enter}')
    const yellowBtn = await screen.findByRole('button', { name: /override and run/i })
    await user.click(yellowBtn)

    await waitFor(() => expect(coasty.sendChatMessage).toHaveBeenCalled())
    await waitFor(() => expect(input.value).toBe(''))
  })

  it('Override & Run sends the LIVE input when user edited after busy', async () => {
    // The yellow button uses whatever's currently in the input. If the
    // user edited the original text before clicking Override, the
    // edited version is what goes on the wire.
    //
    // Important UX detail: the user edits by APPENDING (or partial
    // backspace), not by fully clearing. A full ``user.clear(input)``
    // is the cancellation gesture — auto-dismiss fires and the busy
    // state goes away. To preserve the busy state while editing, the
    // input must remain non-empty throughout.
    const user = userEvent.setup()
    renderCompactPill()

    const input = getInput()
    await user.type(input, 'first try{Enter}')
    await screen.findByRole('button', { name: /override and run/i })

    expect(input.value).toBe('first try')
    // Edit by appending (cursor is at end after type). This keeps
    // input non-empty so auto-dismiss doesn't fire.
    await user.type(input, ' (edited)')
    expect(input.value).toBe('first try (edited)')

    const yellowBtn = screen.getByRole('button', { name: /override and run/i })
    await user.click(yellowBtn)

    await waitFor(() => expect(coasty.sendChatMessage).toHaveBeenCalled())
    const sendArgs = coasty.sendChatMessage.mock.calls[0][0]
    const lastMsg = sendArgs.messages[sendArgs.messages.length - 1]
    expect(lastMsg.role).toBe('user')
    expect(lastMsg.content).toContain('first try (edited)')
  })

  it('clearing the input dismisses the busy state (pre-check stash, user cancels)', async () => {
    // Web parity: typing then clearing communicates "never mind".
    // The yellow button should go away.
    const user = userEvent.setup()
    renderCompactPill()

    const input = getInput()
    await user.type(input, 'maybe{Enter}')
    await screen.findByRole('button', { name: /override and run/i })

    // User clears the input — cancellation gesture.
    await user.clear(input)

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /override and run/i })).toBeNull()
    })
  })

  it('placeholder text attribute communicates the busy state', async () => {
    // Belt-and-braces UX: even if the user doesn't notice the
    // button colour change, the placeholder explains what's
    // happening. We assert at the ATTRIBUTE level (not visibility)
    // because the placeholder is only shown when input is empty —
    // and on the busy path the input is preserved (non-empty), so
    // the user sees their text instead. The attribute being set
    // correctly still matters: if they later clear the input, the
    // moment-of-clearing snapshot would briefly show the busy text
    // before auto-dismiss fires.
    const user = userEvent.setup()
    renderCompactPill()

    const input = getInput()
    await user.type(input, 'placeholder test{Enter}')
    await screen.findByRole('button', { name: /override and run/i })
    expect(input.placeholder).toMatch(/Another task running/i)
  })
})

// ═════════════════════════════════════════════════════════════════════════
// 3. Defensive — IPC failure modes
// ═════════════════════════════════════════════════════════════════════════

describe('CompactPill — IPC failure modes', () => {
  it('checkMachineBusy success=false → treats as not busy (fail open)', async () => {
    coasty.checkMachineBusy = vi.fn(async () => ({
      success: false,
      busy: false,
      error: 'HTTP 401',
    }))

    const user = userEvent.setup()
    renderCompactPill()
    await user.type(getInput(), 'fail-open send{Enter}')

    await waitForUserMessage('fail-open send')
    await waitFor(() => expect(coasty.sendChatMessage).toHaveBeenCalled())
  })

  it('checkMachineBusy throw → treats as not busy', async () => {
    coasty.checkMachineBusy = vi.fn(async () => {
      throw new Error('IPC torn down')
    })

    const user = userEvent.setup()
    renderCompactPill()
    await user.type(getInput(), 'thrown ipc{Enter}')

    await waitForUserMessage('thrown ipc')
    await waitFor(() => expect(coasty.sendChatMessage).toHaveBeenCalled())
  })

  it('stopMachine throw during Override & Run → busy state persists, input preserved', async () => {
    // If forceStopAndSend fails to stop the running task, the user
    // shouldn't lose their input. They should be able to retry.
    coasty.checkMachineBusy = vi.fn(async () => ({
      success: true,
      busy: true,
      ownerChatId: 'chat-other',
    }))
    coasty.stopMachine = vi.fn(async () => {
      throw new Error('stop-machine network error')
    })

    const user = userEvent.setup()
    renderCompactPill()
    const input = getInput()
    await user.type(input, 'preserved on stop fail{Enter}')

    const yellowBtn = await screen.findByRole('button', { name: /override and run/i })
    await user.click(yellowBtn)

    await waitFor(() => expect(coasty.stopMachine).toHaveBeenCalled())
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50))
    })

    // Wire call did NOT fire (stop failed).
    expect(coasty.sendChatMessage).not.toHaveBeenCalled()
    // Input preserved so the user can retry.
    expect(input.value).toBe('preserved on stop fail')
    // Busy state still visible.
    expect(screen.queryByRole('button', { name: /override and run/i })).toBeTruthy()
  })
})

// ═════════════════════════════════════════════════════════════════════════
// 4. Connection-state gating
// ═════════════════════════════════════════════════════════════════════════

describe('CompactPill — disconnected', () => {
  it('input disabled while disconnected — no send possible', async () => {
    useConnectionStore.setState({ state: 'disconnected' } as any)
    renderCompactPill()
    expect(getInput()).toBeDisabled()
    expect(screen.queryByRole('button', { name: /^send$/i })).toBeNull()
  })

  it('reconnect → sends work normally', async () => {
    useConnectionStore.setState({ state: 'disconnected' } as any)
    const { rerender } = renderCompactPill()
    useConnectionStore.setState({ state: 'connected' } as any)
    rerender(<CompactPill />)

    const user = userEvent.setup()
    await user.type(getInput(), 'after reconnect{Enter}')
    await waitForUserMessage('after reconnect')
  })

  it('does not check busy when not connected (canSend gate)', async () => {
    useConnectionStore.setState({ state: 'disconnected' } as any)
    renderCompactPill()
    // No way to trigger a send when disabled; assert the IPC was
    // never called by the component lifecycle.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50))
    })
    expect(coasty.checkMachineBusy).not.toHaveBeenCalled()
  })
})

// ═════════════════════════════════════════════════════════════════════════
// 5. Post-error MACHINE_BUSY path (rare but pinned for completeness)
// ═════════════════════════════════════════════════════════════════════════

describe('CompactPill — post-error MACHINE_BUSY recovery', () => {
  // The post-error path arises when the pre-check said "not busy" but
  // the backend rejected the actual send with MACHINE_BUSY (race
  // condition). In this path, addUserMessage already ran inside
  // _doSubmit, the input was cleared on the 'sent' branch, and then
  // the onMachineBusy SSE event fires. The yellow button must STILL
  // appear and clicking it must NOT add the message twice.

  it('does not orphan the chat-thread message after a post-error busy event', async () => {
    // Pre-check says not busy.
    coasty.checkMachineBusy = vi.fn(async () => ({
      success: true,
      busy: false,
      ownerChatId: null,
    }))

    // Simulate the backend SSE returning MACHINE_BUSY mid-stream.
    // The chat:send-message IPC mock fires sse-event callbacks via
    // window.coasty.onChatSSEEvent — we drive that synthetically.
    const sseListeners: Array<(event: any) => void> = []
    coasty.onChatSSEEvent = vi.fn((listener) => {
      sseListeners.push(listener)
      return () => {
        const i = sseListeners.indexOf(listener)
        if (i >= 0) sseListeners.splice(i, 1)
      }
    })
    coasty.sendChatMessage = vi.fn(async (params) => {
      // Fire the MACHINE_BUSY + finish events WHILE the IPC promise
      // is still awaiting — this models real SSE streaming where
      // events arrive during the open stream, BEFORE the stream
      // closes. Resolving without firing would leave lib/api.ts
      // to clean up its listener first, and the events would
      // dispatch to nothing.
      await new Promise((r) => setTimeout(r, 5))
      for (const l of sseListeners) {
        l({
          requestId: params.requestId,
          type: '3',
          data: JSON.stringify({
            code: 'MACHINE_BUSY',
            message: 'Machine is busy',
            machineId: TEST_MACHINE_ID,
            ownerChatId: 'chat-other',
          }),
        })
        l({
          requestId: params.requestId,
          type: 'd',
          data: JSON.stringify({ finishReason: 'error' }),
        })
      }
      return { success: true }
    })

    const user = userEvent.setup()
    renderCompactPill()

    await user.type(getInput(), 'race condition send{Enter}')

    // First: the message IS added to the chat thread (pre-check said
    // not busy → handleSubmit's 'sent' branch ran addUserMessage).
    await waitForUserMessage('race condition send')

    // Then the SSE MACHINE_BUSY event fires → isMachineBusy=true.
    // Yellow button must appear because pendingInput.alreadyInChat=true
    // (stashed by _doSubmit at the top of its function).
    await screen.findByRole('button', { name: /override and run/i })

    // Critically: the message is STILL in the chat thread (not
    // discarded by the busy-state transition).
    expect((await userMessages())).toHaveLength(1)
  })

  it('Override & Run after post-error busy does NOT double-add the message', async () => {
    // ``alreadyInChat: true`` in pendingInput → forceStopAndSend
    // passes isRetry=true to _doSubmit → _doSubmit skips its own
    // addUserMessage. Net total adds = 1.
    coasty.checkMachineBusy = vi.fn(async () => ({
      success: true,
      busy: false,
      ownerChatId: null,
    }))

    const sseListeners: Array<(event: any) => void> = []
    coasty.onChatSSEEvent = vi.fn((listener) => {
      sseListeners.push(listener)
      return () => {
        const i = sseListeners.indexOf(listener)
        if (i >= 0) sseListeners.splice(i, 1)
      }
    })
    let callCount = 0
    coasty.sendChatMessage = vi.fn(async (params) => {
      callCount++
      if (callCount === 1) {
        // First call: fire MACHINE_BUSY while still awaiting.
        await new Promise((r) => setTimeout(r, 5))
        for (const l of sseListeners) {
          l({
            requestId: params.requestId,
            type: '3',
            data: JSON.stringify({
              code: 'MACHINE_BUSY',
              message: 'Busy',
              machineId: TEST_MACHINE_ID,
              ownerChatId: 'chat-other',
            }),
          })
          l({
            requestId: params.requestId,
            type: 'd',
            data: JSON.stringify({ finishReason: 'error' }),
          })
        }
      }
      // Second call: succeed silently.
      return { success: true }
    })

    const user = userEvent.setup()
    renderCompactPill()
    await user.type(getInput(), 'one shot{Enter}')

    await waitForUserMessage('one shot')
    const yellowBtn = await screen.findByRole('button', { name: /override and run/i })
    await user.click(yellowBtn)

    await waitFor(() => expect(callCount).toBeGreaterThanOrEqual(2))

    // ★ The message appears EXACTLY ONCE in the chat thread, even
    // though we went through send → MACHINE_BUSY → Override → send.
    expect((await userMessages())).toHaveLength(1)
  })
})

// ═════════════════════════════════════════════════════════════════════════
// 6. Web parity — anti-regression invariants
// ═════════════════════════════════════════════════════════════════════════

describe('CompactPill — web-app parity invariants', () => {
  it('typed text is never destroyed without an explicit user action', async () => {
    // The strongest possible expression of the contract: from the
    // moment the user types something, that text is theirs until
    // EITHER they clear it themselves OR they confirm a send and
    // the system reports 'sent'.
    coasty.checkMachineBusy = vi.fn(async () => ({
      success: true,
      busy: true,
      ownerChatId: 'chat-other',
    }))

    const user = userEvent.setup()
    renderCompactPill()
    const input = getInput()

    // Type, send (busy detected), text preserved.
    await user.type(input, 'sacred text{Enter}')
    await screen.findByRole('button', { name: /override and run/i })
    expect(input.value).toBe('sacred text')

    // 200ms pass — text still there.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 200))
    })
    expect(input.value).toBe('sacred text')

    // Even if we re-render (simulate React reconciliation), text
    // persists.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50))
    })
    expect(input.value).toBe('sacred text')
  })

  it('two consecutive sends with no busy: both messages added in order', async () => {
    const user = userEvent.setup()
    renderCompactPill()

    await user.type(getInput(), 'first{Enter}')
    await waitForUserMessage('first')

    await user.type(getInput(), 'second{Enter}')
    await waitFor(async () => {
      const um = await userMessages()
      expect(um).toHaveLength(2)
    })
    const um = await userMessages()
    expect(um[0].content).toContain('first')
    expect(um[1].content).toContain('second')
  })
})
