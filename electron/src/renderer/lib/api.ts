/**
 * Chat API — routes all network calls through the main process via IPC.
 *
 * The renderer runs from file:// in production, making any external
 * fetch() a cross-origin request that gets blocked by CORS.  By routing
 * through the main process (which has no CORS restrictions), we avoid
 * the problem entirely while keeping auth tokens in the main process.
 *
 * The main process does the actual HTTP request, parses the SSE stream,
 * and forwards events to the renderer via IPC.
 */

export interface SSECallbacks {
  onText: (text: string) => void
  onToolCall: (data: { toolCallId: string; toolName: string; args: any }) => void
  onToolResult: (data: { toolCallId: string; result: any; frontendScreenshot?: string }) => void
  onReasoning: (text: string) => void
  onFinish: (data: { finishReason: string; content: string; toolInvocations?: any[] }) => void
  onError: (error: string) => void
  onAwaitingHuman?: (data: { reason: string; machineId: string }) => void
  // Fires when the backend's structured MACHINE_BUSY error arrives via
  // SSE. Distinct from onError because the renderer wants to react by
  // showing the yellow "Override & Run" button instead of treating it
  // as a generic error to display in the chat. If this callback isn't
  // provided, a MACHINE_BUSY event falls through to onError so legacy
  // callers stay functional.
  onMachineBusy?: (data: {
    message: string
    machineId?: string
    ownerChatId?: string | null
  }) => void
}

/**
 * Send a chat message and stream the response via the main process.
 */
export async function sendChatMessage(
  params: {
    messages: Array<{ role: string; content: string }>
    chatId: string
    userId: string
    machineId: string
    model?: string
  },
  callbacks: SSECallbacks,
  signal?: AbortSignal,
): Promise<void> {
  const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`

  // Listen for SSE events from the main process
  const cleanup = window.coasty.onChatSSEEvent((event) => {
    if (event.requestId !== requestId) return

    try {
      switch (event.type) {
        case '0': {
          const text = JSON.parse(event.data)
          callbacks.onText(text)
          break
        }
        case '3': {
          const errorData = JSON.parse(event.data)
          // ── MACHINE_BUSY: structured payload from backend ─────────
          // The chat route emits a JSON object with `code === "MACHINE_BUSY"`
          // when the user submits to a machine that's already running
          // another task. Detect it BEFORE coercing to a string so we
          // can route it to the dedicated `onMachineBusy` callback,
          // which the chat hook uses to set isMachineBusy=true and show
          // the yellow "Override & Run" button. This is the
          // architectural reliability path — the IPC pre-check is a
          // best-effort optimization that may fail (OSS mode routing,
          // stale build, network blip), but this post-error reactive
          // path always works because it triggers off the SAME signal
          // the user actually saw.
          if (
            errorData &&
            typeof errorData === 'object' &&
            errorData.code === 'MACHINE_BUSY'
          ) {
            if (callbacks.onMachineBusy) {
              callbacks.onMachineBusy({
                message: errorData.message || 'Machine is currently busy',
                machineId: errorData.machineId,
                ownerChatId: errorData.ownerChatId,
              })
              break
            }
            // No onMachineBusy callback wired up → fall through to the
            // generic onError path below using the structured message.
          }

          let msg = typeof errorData === 'string'
            ? errorData
            : errorData.error || errorData.message || 'Unknown error'
          // The user is inside the Electron desktop app — any "desktop
          // app is not connected" phrasing from the backend is not
          // useful to surface verbatim (this app IS the desktop). Map
          // it to a context-appropriate reconnect hint instead.
          if (/electron\s+desktop\s+app\s+is\s+not\s+connected/i.test(msg)) {
            msg = 'Reconnecting — please try again in a moment.'
          }
          callbacks.onError(msg)
          break
        }
        case '9': {
          const toolData = JSON.parse(event.data)
          callbacks.onToolCall({
            toolCallId: toolData.toolCallId,
            toolName: toolData.toolName,
            args: toolData.args || {},
          })
          break
        }
        case 'a': {
          const resultData = JSON.parse(event.data)
          const result = resultData.result || resultData
          const screenshot = result?.frontendScreenshot || resultData?.frontendScreenshot
          callbacks.onToolResult({
            toolCallId: resultData.toolCallId,
            result: result?._result || result,
            frontendScreenshot: screenshot,
          })
          break
        }
        case 'g': {
          const reasoning = JSON.parse(event.data)
          callbacks.onReasoning(typeof reasoning === 'string' ? reasoning : reasoning.text || '')
          break
        }
        case 'd': {
          const finishData = JSON.parse(event.data)
          callbacks.onFinish({
            finishReason: finishData.finishReason || 'stop',
            content: finishData.content || '',
            toolInvocations: finishData.toolInvocations,
          })
          break
        }
        case 'h': {
          // Awaiting human input
          const awaitData = JSON.parse(event.data)
          callbacks.onAwaitingHuman?.({
            reason: awaitData.reason || 'Human intervention needed',
            machineId: awaitData.machineId || '',
          })
          break
        }
        case 'error': {
          // Direct error string from main process (not SSE-encoded)
          callbacks.onError(event.data)
          break
        }
      }
    } catch (parseError) {
      console.warn('[Chat] Failed to parse SSE event:', event.type, event.data, parseError)
    }
  })

  // Abort handling
  const onAbort = () => {
    window.coasty.abortChat(requestId)
  }
  signal?.addEventListener('abort', onAbort)

  try {
    // Invoke the main process to do the actual fetch + SSE streaming
    await window.coasty.sendChatMessage({
      requestId,
      messages: params.messages,
      chatId: params.chatId,
      userId: params.userId,
      machineId: params.machineId,
      model: params.model,
    })
  } catch (err: any) {
    if (err.name !== 'AbortError') {
      callbacks.onError(err.message || 'Failed to send message')
    }
  } finally {
    cleanup()
    signal?.removeEventListener('abort', onAbort)
  }
}
