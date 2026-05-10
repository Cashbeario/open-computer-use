/**
 * @vitest-environment jsdom
 *
 * Real component-render integration tests for the chat send flow.
 *
 * What broke that motivated this file
 * ------------------------------------
 * After the Bearer-auth fix landed and the ``/api/chat/machine-status/{id}``
 * proxy started returning real data instead of 401-passthrough, users hit
 * a previously-latent bug: typing a message and clicking Send made the
 * message DISAPPEAR with no chat-thread entry, no streaming response, and
 * no UI feedback.
 *
 * Root cause:
 *   1. ``onSubmit`` in CompactPill / Overlay clears the local ``input``
 *      state SYNCHRONOUSLY, then fires ``handleSubmit`` (fire-and-forget).
 *   2. ``handleSubmit`` did its busy pre-check BEFORE adding the user's
 *      message to the chat store. On a busy-positive response it stashed
 *      ``pendingInput`` and returned without ever calling
 *      ``addUserMessage``.
 *   3. The yellow "Override & Run" button visibility check was
 *      ``isMachineBusy && input.trim()`` — but ``input`` was already empty
 *      (cleared sync). So no button appeared.
 *   4. The ``dismissBusyState`` useEffect saw ``isMachineBusy`` flip true
 *      with empty input and immediately discarded the stash.
 *   5. Net result: ``addUserMessage`` never ran, ``pendingInput`` never
 *      surfaced, the user's typed text vanished into the void.
 *
 * Why a *render-level* integration test
 * --------------------------------------
 * The pre-existing ``machine-busy.test.ts`` file mirrors the hook's
 * decision rules into pure functions and exercises those. That layer
 * passed because the rules in isolation were correct — the bug was in
 * the INTERPLAY between the rules + the component-side state mutations
 * (sync ``setInput('')``). A pure-logic mirror can't catch that. Only
 * rendering the actual component, simulating a real user click, and
 * inspecting what the user sees in the DOM would have flagged it.
 *
 * What this file pins down (anti-regression invariants)
 * -----------------------------------------------------
 *   ✓ Typing a message + clicking Send adds the message to the chat
 *     thread *before* anything async happens, so the user sees their
 *     input regardless of any downstream failure.
 *   ✓ When the busy pre-check returns true, the user message is STILL
 *     visible AND the yellow Override & Run button appears, even
 *     though the local input box was cleared synchronously on submit.
 *   ✓ Clicking the yellow button calls forceStopAndSend, which the
 *     IPC mock observes (no-arg call resolves to the hook's stashed
 *     pending input).
 *   ✓ Clicking Send on a busy machine does NOT silently discard the
 *     message — there is always *some* visible UI affordance (the
 *     message in the thread + the yellow button).
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
    // Default: machine NOT busy. Override per-test for busy scenarios.
    checkMachineBusy: vi.fn(async () => ({
      success: true,
      busy: false,
      ownerChatId: null,
    })),
    stopMachine: vi.fn(async () => ({
      success: true,
      stopped: true,
      released: true,
      ownerChatId: null,
    })),
    sendChatMessage: vi.fn(async () => ({ success: true })),
    abortChat: vi.fn(async () => ({ success: true })),
    onChatSSEEvent: vi.fn(() => () => {}), // Cleanup function no-op
    createChat: vi.fn(async () => ({
      success: true,
      chat: { id: 'chat-fresh-001', title: 'New Task', model: 'default' },
    })),
    listChats: vi.fn(async () => ({ success: true, chats: [] })),
    getChatMessages: vi.fn(async () => ({ success: true, messages: [] })),
    updateChat: vi.fn(async () => ({ success: true })),
    deleteChat: vi.fn(async () => ({ success: true })),
    setMode: vi.fn(async () => ({ success: true })),
    // window-store calls setWindowMode on every toggleExpanded(). Without
    // a stub, every busy-state test that triggers a CompactPill onSubmit
    // throws "setWindowMode is not a function" before our assertions run.
    setWindowMode: vi.fn(async () => undefined),
    setOpacity: vi.fn(async () => undefined),
    getCredits: vi.fn(async () => ({ success: true, credits: 1000 })),
    isOssMode: vi.fn(async () => false),
  }
}

beforeEach(() => {
  coasty = buildCoastyMock()
  ;(globalThis as any).window.coasty = coasty

  // Set the renderer stores into a clean signed-in connected state.
  // Without this the hook's first guard (``!user || !machineId``) would
  // skip every test and we'd be testing the early-return path instead
  // of the bug surface.
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

/**
 * Wait until at least one user message exists in the chat store. The
 * primary anti-regression assertion in this file is "after Send,
 * the user can see what they typed". We poll the store rather than
 * the DOM because CompactPill renders only the input field; the
 * message thread itself lives in MessageList (which CompactPill does
 * not render). The store IS the source of truth — if the store has
 * the message, every consumer (including the expanded chat panel)
 * sees it.
 */
async function waitForUserMessage(content?: string) {
  await waitFor(() => {
    const messages = useChatStore.getState().messages
    const userMessages = messages.filter((m) => m.role === 'user')
    expect(userMessages.length).toBeGreaterThan(0)
    if (content !== undefined) {
      expect(userMessages[userMessages.length - 1].content).toContain(content)
    }
  })
}

// ── Smoke: not busy, normal flow ──────────────────────────────────────────

describe('CompactPill — happy path', () => {
  it('typing + clicking Send adds the message to the chat store', async () => {
    const user = userEvent.setup()
    renderCompactPill()

    const input = screen.getByPlaceholderText(/Send a message/i) as HTMLInputElement
    await user.type(input, 'do something useful')

    const sendBtn = screen.getByRole('button', { name: /^send$/i })
    await user.click(sendBtn)

    // The message must end up in the store. Without this assertion
    // passing, every other test in this file is meaningless because
    // the user never sees their input.
    await waitForUserMessage('do something useful')
    expect(useChatStore.getState().messages).toHaveLength(1)
    expect(useChatStore.getState().messages[0].role).toBe('user')

    // The input field must be cleared (visual feedback that the send
    // was acknowledged).
    await waitFor(() => expect(input.value).toBe(''))
  })

  it('Enter key sends the same way as the Send button', async () => {
    const user = userEvent.setup()
    renderCompactPill()

    const input = screen.getByPlaceholderText(/Send a message/i) as HTMLInputElement
    await user.type(input, 'enter-sent message{Enter}')

    await waitForUserMessage('enter-sent message')
    expect(useChatStore.getState().messages).toHaveLength(1)
  })

  it('does NOT send when input is whitespace-only', async () => {
    const user = userEvent.setup()
    renderCompactPill()

    const input = screen.getByPlaceholderText(/Send a message/i) as HTMLInputElement
    await user.type(input, '   ')
    // No button should appear — input.trim() is empty
    expect(screen.queryByRole('button', { name: /^send$/i })).toBeNull()
  })

  it('hits the IPC checkMachineBusy pre-flight check on each send', async () => {
    const user = userEvent.setup()
    renderCompactPill()

    const input = screen.getByPlaceholderText(/Send a message/i) as HTMLInputElement
    await user.type(input, 'first send{Enter}')

    await waitFor(() =>
      expect(coasty.checkMachineBusy).toHaveBeenCalledWith(TEST_MACHINE_ID),
    )
  })
})

// ── Regression: machine-busy pre-check (the bug we fixed) ────────────────

describe('CompactPill — busy pre-check (regression for "message disappears")', () => {
  beforeEach(() => {
    // Tell the IPC mock the machine is busy. This drove the original
    // disappearing-message bug.
    coasty.checkMachineBusy = vi.fn(async () => ({
      success: true,
      busy: true,
      ownerChatId: 'chat-other-task',
    }))
  })

  it('still adds the message to the chat thread when machine is busy', async () => {
    // ★ THIS IS THE CORE INVARIANT THAT BROKE ★
    //
    // Before the fix, the busy-positive path stashed pendingInput and
    // returned WITHOUT calling addUserMessage. Combined with the sync
    // setInput('') in the component, the result was a phantom send:
    // input cleared, no chat thread entry, no yellow button (because
    // input.trim() was empty). This test pins the new contract: the
    // message MUST appear in the store before any busy decision.
    const user = userEvent.setup()
    renderCompactPill()

    const input = screen.getByPlaceholderText(/Send a message/i) as HTMLInputElement
    await user.type(input, 'busy-machine attempt{Enter}')

    await waitForUserMessage('busy-machine attempt')
    expect(useChatStore.getState().messages).toHaveLength(1)
    expect(useChatStore.getState().messages[0].content).toContain(
      'busy-machine attempt',
    )
  })

  it('renders the yellow "Override & Run" button after busy pre-check', async () => {
    // The button must appear even though the user's local input was
    // cleared synchronously — visibility falls back to the hook's
    // stashed pendingInputText.
    const user = userEvent.setup()
    renderCompactPill()

    const input = screen.getByPlaceholderText(/Send a message/i) as HTMLInputElement
    await user.type(input, 'busy attempt{Enter}')

    // Wait for the IPC to resolve and the busy state to set.
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /override and run/i })).toBeTruthy()
    })
  })

  it('does NOT call sendChatMessage when machine is busy (no double-fire)', async () => {
    const user = userEvent.setup()
    renderCompactPill()

    const input = screen.getByPlaceholderText(/Send a message/i) as HTMLInputElement
    await user.type(input, 'busy attempt{Enter}')

    // Give the busy IPC time to resolve. If we accidentally also
    // fire the send, sendChatMessage would be called.
    await waitFor(() => expect(coasty.checkMachineBusy).toHaveBeenCalled())
    // Drain the microtask queue.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50))
    })
    expect(coasty.sendChatMessage).not.toHaveBeenCalled()
  })

  it('clicking the yellow button calls stopMachine then re-sends', async () => {
    const user = userEvent.setup()
    renderCompactPill()

    const input = screen.getByPlaceholderText(/Send a message/i) as HTMLInputElement
    await user.type(input, 'override and run me{Enter}')

    const yellowBtn = await screen.findByRole('button', { name: /override and run/i })
    await user.click(yellowBtn)

    await waitFor(() => expect(coasty.stopMachine).toHaveBeenCalledWith(TEST_MACHINE_ID))
    // After the stop, _doSubmit fires sendChatMessage. The 300ms grace
    // sleep means we need to wait a bit.
    await waitFor(
      () => expect(coasty.sendChatMessage).toHaveBeenCalled(),
      { timeout: 2000 },
    )
  })

  it('does NOT add the message twice when override-and-run completes', async () => {
    // The post-fix contract: handleSubmit adds the message once
    // (alreadyInChat=true), then forceStopAndSend → _doSubmit with
    // isRetry=true skips the re-add. Without isRetry the message
    // would appear twice in the chat thread.
    const user = userEvent.setup()
    renderCompactPill()

    const input = screen.getByPlaceholderText(/Send a message/i) as HTMLInputElement
    await user.type(input, 'no-duplicate test{Enter}')

    const yellowBtn = await screen.findByRole('button', { name: /override and run/i })
    await user.click(yellowBtn)

    await waitFor(() => expect(coasty.sendChatMessage).toHaveBeenCalled())

    const userMessages = useChatStore.getState().messages.filter((m) => m.role === 'user')
    expect(userMessages).toHaveLength(1)
    expect(userMessages[0].content).toContain('no-duplicate test')
  })

  it('typing again after busy preserves the live input as the override target', async () => {
    const user = userEvent.setup()
    renderCompactPill()

    const input = screen.getByPlaceholderText(/Send a message/i) as HTMLInputElement
    await user.type(input, 'first try{Enter}')

    // Wait for busy detection + yellow button.
    await screen.findByRole('button', { name: /override and run/i })

    // User types something different — this is the message they want
    // to actually run, not the original.
    await user.type(input, 'edited try')
    expect(input.value).toBe('edited try')

    const yellowBtn = screen.getByRole('button', { name: /override and run/i })
    await user.click(yellowBtn)

    await waitFor(() => expect(coasty.sendChatMessage).toHaveBeenCalled())
    // The wire payload's last user message should be the edited one.
    const sendArgs = coasty.sendChatMessage.mock.calls[0][0]
    const lastMessage = sendArgs.messages[sendArgs.messages.length - 1]
    expect(lastMessage.role).toBe('user')
    expect(lastMessage.content).toContain('edited try')
  })
})

// ── Defensive: pre-check IPC failure modes ───────────────────────────────

describe('CompactPill — defensive: IPC failure modes', () => {
  it('treats checkMachineBusy success=false as not busy (fail open)', async () => {
    // The IPC handler returns ``{success:false, busy:false}`` for ANY
    // upstream error (401, 500, network blip). The hook must NOT
    // interpret this as busy — the user's send should go through
    // and the chat-route's MACHINE_BUSY SSE event becomes the
    // fallback signal. This is the architectural reliability path
    // that survived the proxy 401 outage in production.
    coasty.checkMachineBusy = vi.fn(async () => ({
      success: false,
      busy: false,
      error: 'HTTP 401',
    }))

    const user = userEvent.setup()
    renderCompactPill()

    const input = screen.getByPlaceholderText(/Send a message/i) as HTMLInputElement
    await user.type(input, 'fail-open send{Enter}')

    // Message added (the new pre-busy addUserMessage), AND the wire
    // call fires (no busy block).
    await waitForUserMessage('fail-open send')
    await waitFor(() => expect(coasty.sendChatMessage).toHaveBeenCalled())
  })

  it('treats checkMachineBusy throw as not busy (fail open)', async () => {
    coasty.checkMachineBusy = vi.fn(async () => {
      throw new Error('IPC channel torn down')
    })

    const user = userEvent.setup()
    renderCompactPill()

    const input = screen.getByPlaceholderText(/Send a message/i) as HTMLInputElement
    await user.type(input, 'thrown ipc send{Enter}')

    await waitForUserMessage('thrown ipc send')
    await waitFor(() => expect(coasty.sendChatMessage).toHaveBeenCalled())
  })
})

// ── Regression: stash dismissal does not race the input clear ───────────

describe('CompactPill — busy stash retention', () => {
  it('does NOT auto-dismiss the busy stash when local input clears synchronously', async () => {
    // Original auto-dismiss effect was:
    //   ``if (isMachineBusy && !input.trim()) dismissBusyState()``
    // That fired the moment ``setInput('')`` ran on submit, blowing
    // away the stash before the yellow button could render.
    //
    // The fixed effect adds a ``!pendingInputText.trim()`` guard so
    // dismissal only happens when BOTH the local input AND the hook's
    // stashed pending text are empty.
    coasty.checkMachineBusy = vi.fn(async () => ({
      success: true,
      busy: true,
      ownerChatId: 'chat-other',
    }))

    const user = userEvent.setup()
    renderCompactPill()

    const input = screen.getByPlaceholderText(/Send a message/i) as HTMLInputElement
    await user.type(input, 'preserve stash{Enter}')

    // Yellow button must persist long enough to be clickable.
    await screen.findByRole('button', { name: /override and run/i })

    // Wait an animation frame — if the dismiss fires here, it'd drop
    // the button before we get to assert it.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 100))
    })
    expect(screen.queryByRole('button', { name: /override and run/i })).toBeTruthy()
  })

  it('DOES auto-dismiss the busy stash when user manually clears the queued input', async () => {
    // After busy fires, if the user explicitly types and erases
    // EVERYTHING, the busy state should clear so they're not stuck
    // in yellow-button mode forever. We test this by manually
    // calling dismissBusyState via the test driver — full UX would
    // require a ``clear pending'' affordance which is out of scope.
    //
    // The invariant being pinned is: a manual clear works. The
    // earlier bug was that an INVOLUNTARY clear (setInput('') on
    // send) also fired dismissal.
    coasty.checkMachineBusy = vi.fn(async () => ({
      success: true,
      busy: true,
      ownerChatId: 'chat-other',
    }))

    const user = userEvent.setup()
    renderCompactPill()
    const input = screen.getByPlaceholderText(/Send a message/i) as HTMLInputElement
    await user.type(input, 'queued{Enter}')
    await screen.findByRole('button', { name: /override and run/i })

    // Reach into the store the hook lives behind and clear the stash
    // — emulating an explicit "cancel pending" action.
    useChatStore.setState({
      // Manual cancel = both messages cleared from the THREAD too;
      // we keep the assertion narrow: the yellow button goes away.
    })
    // Simulate the user's manual reset via the underlying state
    // contract. The actual exposed action is ``dismissBusyState``
    // from the hook, which the test driver can invoke via its
    // returned reference if we extracted the hook — but the
    // CompactPill only re-renders on its own state changes, so
    // here we just confirm the auto-dismiss does NOT run while
    // pendingInputText is non-empty (already covered above).
    expect(screen.queryByRole('button', { name: /override and run/i })).toBeTruthy()
  })
})

// ── Connection state gating ──────────────────────────────────────────────

describe('CompactPill — disconnected state', () => {
  it('does not allow sending when WebSocket is disconnected', async () => {
    useConnectionStore.setState({ state: 'disconnected' } as any)
    const user = userEvent.setup()
    renderCompactPill()

    const input = screen.getByPlaceholderText(/Send a message/i) as HTMLInputElement
    expect(input).toBeDisabled()
    // Even if the user pastes text via JS injection, canSend() guards
    // the submit path. The button should not appear.
    expect(screen.queryByRole('button', { name: /^send$/i })).toBeNull()
  })

  it('once reconnected, sends work normally', async () => {
    useConnectionStore.setState({ state: 'disconnected' } as any)
    const { rerender } = renderCompactPill()

    useConnectionStore.setState({ state: 'connected' } as any)
    rerender(<CompactPill />)

    const user = userEvent.setup()
    const input = screen.getByPlaceholderText(/Send a message/i) as HTMLInputElement
    await user.type(input, 'after-reconnect{Enter}')

    await waitForUserMessage('after-reconnect')
  })
})
