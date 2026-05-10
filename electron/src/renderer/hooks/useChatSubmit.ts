import { useState, useCallback } from 'react'
import { useChatStore } from '../stores/chat-store'
import { useAuthStore } from '../stores/auth-store'
import { useConnectionStore } from '../stores/connection-store'
import { sendChatMessage } from '../lib/api'

export interface FileRef {
  path: string
  name: string
  ext: string
  isDirectory: boolean
}

export function useChatSubmit() {
  const {
    messages, isStreaming, chatId, chatTitle,
    addUserMessage, setStreaming, setAbortController, stopStreaming,
    appendAssistantContent, addToolCall, updateToolResult,
    finishAssistantMessage, clearMessages, ensureChat, loadChatList,
    setAwaitingHuman,
  } = useChatStore()
  const { user, machineId } = useAuthStore()
  const connectionState = useConnectionStore((s) => s.state)

  // ── Yellow "Override & Run" state ─────────────────────────────────────
  // Mirror of the web app pattern at app/components/chat-input/chat-input.tsx.
  // When the user submits and the backend reports the machine is already
  // running another task, we DON'T silently send and let the user see an
  // error string in the chat thread. We set ``isMachineBusy`` so the UI
  // re-renders with a yellow "Override & Run" button. Clicking that button
  // calls ``forceStopAndSend`` which stops the previous task and submits
  // again.
  const [isMachineBusy, setIsMachineBusy] = useState(false)
  const [isStoppingMachine, setIsStoppingMachine] = useState(false)
  // Pending input is what the user typed before we discovered the machine
  // was busy. Stored so `forceStopAndSend` can re-submit it without
  // requiring the UI to keep the textarea state.
  const [pendingInput, setPendingInput] = useState<{
    input: string
    files?: FileRef[]
  } | null>(null)

  const canSend = (input: string) =>
    input.trim().length > 0 && !isStreaming && connectionState === 'connected'

  // Pre-flight busy check. Returns true if the machine is actively
  // running another task (different chat). On any error (network, IPC
  // not available, backend 5xx) we fail-open — return false so the
  // user's send goes through and the chat-route's busy error becomes
  // the fallback signal.
  const checkBusy = useCallback(async (): Promise<boolean> => {
    if (!machineId) return false
    try {
      const res = await window.coasty.checkMachineBusy(machineId)
      return res?.success ? !!res.busy : false
    } catch {
      return false
    }
  }, [machineId])

  // Internal: actually run the chat submission. Used by both
  // handleSubmit (when not busy) and forceStopAndSend (after stop).
  const _doSubmit = useCallback(
    async (input: string, files?: FileRef[]) => {
      if (!user || !machineId) return

      let userMessage = input.trim()
      if (files && files.length > 0) {
        const tags = files.map((f) =>
          f.isDirectory
            ? `<directory path="${f.path}" name="${f.name}">${f.name}</directory>`
            : `<file path="${f.path}" name="${f.name}">${f.name}</file>`,
        )
        userMessage = userMessage + '\n' + tags.join('\n')
      }

      addUserMessage(userMessage)
      setStreaming(true)

      const activeChatId = await ensureChat(userMessage)

      // Snapshot messages BEFORE adding the user message so we don't
      // double-add it. ``addUserMessage`` already pushed it into the
      // store, so the wire payload comes from the local userMessage var.
      const allMessages = [
        ...messages.map((m) => ({ role: m.role, content: m.content })),
        { role: 'user', content: userMessage },
      ]

      const controller = new AbortController()
      setAbortController(controller)

      try {
        await sendChatMessage(
          {
            messages: allMessages,
            chatId: activeChatId,
            userId: user.id,
            machineId,
          },
          {
            onText: (text) => appendAssistantContent(text),
            onToolCall: (data) =>
              addToolCall({
                toolCallId: data.toolCallId,
                toolName: data.toolName,
                args: data.args,
                state: 'pending',
              }),
            onToolResult: (data) =>
              updateToolResult(data.toolCallId, data.result, data.frontendScreenshot),
            onReasoning: () => {},
            onFinish: (data) => {
              finishAssistantMessage(data.content, data.toolInvocations)
              loadChatList()
            },
            onAwaitingHuman: (data) => {
              setAwaitingHuman({
                reason: data.reason,
                machineId: data.machineId,
                since: Date.now(),
              })
            },
            onError: (error) => {
              appendAssistantContent(`\n\nError: ${error}`)
              setStreaming(false)
            },
          },
          controller.signal,
        )
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          appendAssistantContent(`\n\nError: ${err.message}`)
        }
      } finally {
        setStreaming(false)
        setAbortController(null)
      }
    },
    [
      user, machineId, messages,
      addUserMessage, setStreaming, setAbortController,
      ensureChat, appendAssistantContent, addToolCall, updateToolResult,
      finishAssistantMessage, loadChatList, setAwaitingHuman,
    ],
  )

  const handleSubmit = useCallback(
    async (input: string, files?: FileRef[]) => {
      if (!canSend(input) || !user || !machineId) return

      // Pre-flight: is the machine running another task?
      const busy = await checkBusy()
      if (busy) {
        // DO NOT send. Stash the input and let the UI render the yellow
        // "Override & Run" button. The user's next click on that button
        // calls ``forceStopAndSend`` which will pick up the stashed input.
        setIsMachineBusy(true)
        setPendingInput({ input, files })
        return
      }

      // Clear any stale busy/pending state, then submit normally.
      setIsMachineBusy(false)
      setPendingInput(null)
      await _doSubmit(input, files)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [canSend, user, machineId, checkBusy, _doSubmit],
  )

  // Yellow-button click handler. Stops the running task on the machine,
  // waits briefly for the lock to release, then re-submits the user's
  // pending input. Idempotent: if called twice in a row, the second call
  // is a no-op (``isStoppingMachine`` guards against re-entry).
  const forceStopAndSend = useCallback(
    async (overrideInput?: string, overrideFiles?: FileRef[]) => {
      if (isStoppingMachine || !machineId) return
      // Resolve which input to send. Caller-supplied wins (e.g. user
      // edited the textarea after the busy state was detected); falls
      // back to the stashed pending input from the failed pre-check.
      const target =
        overrideInput !== undefined
          ? { input: overrideInput, files: overrideFiles }
          : pendingInput
      if (!target || !target.input.trim()) {
        // Nothing to send — clear the busy state so the UI returns to
        // its normal empty-input look.
        setIsMachineBusy(false)
        setPendingInput(null)
        return
      }

      setIsStoppingMachine(true)
      try {
        const stopRes = await window.coasty.stopMachine(machineId)
        if (stopRes?.success) {
          // Brief grace so the previous task's `finally` (billing
          // teardown, lock release) finishes before we acquire the lock
          // for the new submission. 300 ms matches the web app pattern.
          await new Promise((r) => setTimeout(r, 300))
        }
        setIsMachineBusy(false)
        setPendingInput(null)
        await _doSubmit(target.input, target.files)
      } catch (err: any) {
        console.error('[Electron] forceStopAndSend failed:', err?.message)
        // Don't clear busy state on failure — let the user retry.
      } finally {
        setIsStoppingMachine(false)
      }
    },
    [isStoppingMachine, machineId, pendingInput, _doSubmit],
  )

  // Allow the UI to dismiss the yellow state (e.g. user clears the
  // textarea or types something different and decides not to override).
  const dismissBusyState = useCallback(() => {
    setIsMachineBusy(false)
    setPendingInput(null)
  }, [])

  return {
    messages,
    isStreaming,
    chatId,
    chatTitle,
    connectionState,
    canSend,
    handleSubmit,
    handleStop: stopStreaming,
    clearMessages,
    loadChatList,
    // Yellow "Override & Run" surface
    isMachineBusy,
    isStoppingMachine,
    forceStopAndSend,
    dismissBusyState,
  }
}
