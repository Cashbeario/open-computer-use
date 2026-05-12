import WebSocket from 'ws'
import { BrowserWindow, screen } from 'electron'
import * as os from 'os'
import { LocalExecutor } from './local-executor'
import { ApprovalManager } from './approval-manager'
import { showRainbowBorder, hideRainbowBorder, initRainbowBorder } from './rainbow-border'
import { errorReporter, reportError } from './error-reporter'

// 'error'      → transient connection error (TLS/DNS/5xx/network); keeps retrying
// 'auth_error' → backend rejected the JWT; fatal, triggers sign-out in the renderer
export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error' | 'auth_error'

/**
 * Per-command parameter preview for failure logs. Pulls the most
 * informative field for each command type so a "failed" log line
 * actually tells you what was attempted (we previously logged only
 * the command name, which made every terminal_execute failure look
 * identical).
 */
function previewParameters(command: string, parameters: any): string | null {
  if (!parameters || typeof parameters !== 'object') return null
  const trim = (s: any, n = 100) => {
    const str = typeof s === 'string' ? s : JSON.stringify(s)
    if (!str) return ''
    return str.length > n ? str.slice(0, n) + '…' : str
  }
  switch (command) {
    case 'terminal_execute':
    case 'execute_command':
      return trim(parameters.command)
    case 'terminal_type':
    case 'type':
      return trim(parameters.text)
    case 'key_press':
    case 'key_combo':
      return trim(parameters.keys ?? parameters.key)
    case 'click':
    case 'double_click':
    case 'click_with_modifiers':
      if (typeof parameters.x === 'number' && typeof parameters.y === 'number') {
        return `(${parameters.x}, ${parameters.y})`
      }
      return null
    case 'browser_navigate':
      return trim(parameters.url)
    case 'browser_type':
      return trim(parameters.text)
    case 'file_read':
    case 'file_write':
    case 'file_edit':
    case 'file_delete':
    case 'file_exists':
    case 'directory_list':
      return trim(parameters.path ?? parameters.filepath ?? parameters.dirpath)
    default:
      return null
  }
}

/** Compose a human-readable failure reason from an executor result. */
function formatFailureReason(result: any): string {
  if (!result || typeof result !== 'object') return 'no result returned'
  const parts: string[] = []
  if (result.error) parts.push(String(result.error))
  if (result.exit_code !== undefined && result.exit_code !== 0) {
    parts.push(`exit=${result.exit_code}`)
  }
  if (result.output && typeof result.output === 'string' && result.output.trim()) {
    const head = result.output.trim().split('\n').slice(0, 2).join(' / ').slice(0, 200)
    parts.push(`out="${head}"`)
  }
  return parts.length ? parts.join(' | ') : 'unknown failure (no error message in result)'
}

/**
 * Heuristic for an OSS-mode Coasty API key.
 *
 * Production tokens are JWTs (compact serialization: three base64-url segments
 * separated by dots; the header always decodes to JSON starting with `{"alg"`,
 * which after base64-url-encoding always begins with `eyJ`). API keys minted
 * by coasty.ai start with the literal prefix `coasty_`. Treat anything that
 * doesn't start with `eyJ` AND does start with `coasty_` as an API key.
 *
 * The two callers (URL builder + auth message) MUST use the same predicate so
 * the backend never sees a mismatch (e.g. a JWT in the URL and an API key in
 * the auth body, or vice versa).
 */
function looksLikeCoastyApiKey(token: string): boolean {
  return typeof token === 'string' && token.startsWith('coasty_')
}

/** Collect local system details to send to the backend. */
function getSystemInfo(): Record<string, string> {
  const primary = screen.getPrimaryDisplay()
  return {
    platform: process.platform,                    // win32, darwin, linux
    os_name: `${os.type()} ${os.release()}`,       // Windows_NT 10.0.26200, Darwin 23.2.0, etc.
    os_version: os.release(),
    arch: os.arch(),                               // x64, arm64
    hostname: os.hostname(),
    username: os.userInfo().username,
    home_dir: os.homedir(),
    shell: process.platform === 'win32' ? 'powershell' : (process.env.SHELL || '/bin/bash'),
    screen_width: String(primary.size.width),
    screen_height: String(primary.size.height),
  }
}

export class WebSocketBridge {
  private ws: WebSocket | null = null
  private executor: LocalExecutor
  private backendUrl: string
  private token: string
  private machineId: string
  private userId: string
  private reconnectAttempts = 0
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private state: ConnectionState = 'disconnected'
  private intentionalClose = false
  private approvalManager: ApprovalManager
  // Remote approval tracking: approval_id → { resolve }
  private pendingRemoteApprovals = new Map<string, { resolve: (result: { approved: boolean; reason?: string }) => void }>()
  // Rainbow border: on for the entire task, off on task_end / disconnect
  private rainbowActive = false
  // When true, reject all incoming commands (user clicked Stop)
  private taskStopped = false
  /**
   * Strict serial queue for command execution.
   *
   * The 'message' WebSocket handler is `async` — Node's ws library will
   * dispatch the next message as soon as the current handler hits its
   * first `await`. If two commands land in the bridge before the first
   * completes, both call `executor.executeCommand` concurrently. That's
   * a problem: many commands wrap the action in `withOverlayHidden`,
   * which hides the overlay (50ms wait) → runs the action → schedules
   * a fire-and-forget 250ms fade-in. Concurrent execution causes:
   *   - the overlay fade-in for cmd A overlapping the hide for cmd B
   *   - screenshots capturing the overlay mid-fade
   *   - keyboard input from `type` interleaving with `key_press`
   *   - the result for cmd B arriving at the backend before cmd A
   *
   * Even if the backend awaits each result before sending the next
   * (it does), network jitter or backend pipelining can land two
   * messages in the bridge before the first's full chain (hide → action
   * → send-result) finishes. Chaining onto a single promise guarantees
   * strict in-order, one-at-a-time execution. Errors don't break the chain.
   */
  private commandQueue: Promise<unknown> = Promise.resolve()

  private getToken: (() => Promise<string | null>) | null = null

  constructor(backendUrl: string, token: string, machineId: string, userId: string, approvalManager: ApprovalManager) {
    this.backendUrl = backendUrl
    this.token = token
    this.machineId = machineId
    this.userId = userId
    this.executor = new LocalExecutor()
    this.approvalManager = approvalManager
  }

  /** Provide a callback to fetch a fresh token on reconnect. */
  setTokenProvider(fn: () => Promise<string | null>): void {
    this.getToken = fn
  }

  /** Turn on the rainbow aura for the duration of the task. */
  private startRainbow(): void {
    if (this.rainbowActive) return
    this.rainbowActive = true
    showRainbowBorder()
  }

  /** Turn off the rainbow (task_end / disconnect). */
  private stopRainbow(): void {
    if (!this.rainbowActive) return
    this.rainbowActive = false
    hideRainbowBorder()
  }

  /**
   * Run a command through the serial queue. Each call chains onto the
   * previous one's completion (success OR failure), guaranteeing strict
   * in-order execution. The returned promise resolves when THIS command
   * completes; the queue itself swallows errors so a failed command
   * doesn't break the chain for subsequent ones.
   *
   * Telemetry: logs duration + outcome so concurrency / latency issues
   * show up in the logs.
   */
  private executeSerially(command: string, parameters: any): Promise<any> {
    const start = Date.now()
    // For commands whose parameters carry the actual workload (e.g.
    // terminal_execute's `command` field), log a short preview so a
    // failure log has enough context to debug what was attempted.
    const paramPreview = previewParameters(command, parameters)
    if (paramPreview) {
      console.log(`[WS Bridge] ${command} → ${paramPreview}`)
    }

    // ── Last-mile stop gate (commands queued before stop) ──────────────
    //
    // The ``taskStopped`` flag is also checked at message ingress
    // (line 358), but that only catches commands that ARRIVE after the
    // flag was set. Anything already queued onto ``commandQueue`` would
    // execute without this check.
    //
    // Real-world race: user clicks Stop, ``stopTask`` flips the flag,
    // ``task_stop`` goes to the backend. Meanwhile the backend has
    // already pipelined 1-3 commands into the WS that landed BEFORE
    // the flag flipped, so they passed the ingress check and chained
    // onto the queue. Without this gate they execute (clicks, types,
    // screenshots) AFTER the user thought they'd stopped the task.
    //
    // The gate fires when THIS link in the chain unblocks — i.e. at
    // the moment the command would actually run. If ``taskStopped``
    // is true by then, we skip the executor and return a synthetic
    // "task was stopped" result. The next chain link still runs (it
    // hits the same gate too), so the queue drains cleanly without
    // executing anything.
    const next = this.commandQueue.then(() => {
      if (this.taskStopped) {
        console.log(`[WS Bridge] Queue-drained (task stopped): ${command}`)
        return {
          success: false,
          error: 'Task was stopped by user',
          stoppedByUser: true,
        }
      }
      return this.executor.executeCommand(command, parameters)
    })
    // Don't break the chain on rejected promises — every chain link
    // must always resolve so subsequent commands still get to run.
    this.commandQueue = next.catch(() => undefined)
    next.then(
      (result) => {
        const ms = Date.now() - start
        const ok = result && result.success !== false
        if (ok) {
          console.log(`[WS Bridge] ${command} ok (${ms}ms)`)
        } else {
          // Surface the actual failure cause: the executor's error string,
          // the exit code (terminal commands), and the head of any output.
          const reason = formatFailureReason(result)
          console.log(`[WS Bridge] ${command} failed (${ms}ms) — ${reason}`)
          // Funnel into the central reporter so this gets persisted to
          // disk + shipped to the backend even when stdout is invisible
          // (packaged builds, no attached terminal, etc.).
          reportError('local_executor', {
            severity: 'warn',
            message: `${command} failed: ${reason}`,
            command,
            context: {
              durationMs: ms,
              exitCode: result?.exit_code,
              permissionDenied: result?.permissionDenied || undefined,
              permissionType: result?.permissionType || undefined,
            },
          })
        }
      },
      (err) => {
        const ms = Date.now() - start
        console.log(`[WS Bridge] ${command} threw (${ms}ms): ${err?.message || err}`)
        // Exceptions bubbling out of a handler are MORE serious than a
        // soft `success: false` — surface as error severity so they're
        // never sampled and they always reach the backend.
        reportError('local_executor', {
          error: err,
          message: `${command} threw: ${err?.message || String(err)}`,
          command,
          context: { durationMs: ms },
        })
      },
    )
    return next
  }

  getState(): ConnectionState {
    return this.state
  }

  /**
   * External task-active sync — driven by the renderer's `isStreaming`
   * state via IPC. The backend's `task_end` WebSocket message is a
   * fire-and-forget send and isn't always delivered (network blip,
   * backend exception, missing is_electron flag, etc.), so we can't
   * rely on it alone. The renderer is the source of truth: when its
   * SSE stream finishes, this method ensures the rainbow follows.
   * Both `startRainbow`/`stopRainbow` are guarded by `rainbowActive`,
   * so this is idempotent and safe to interleave with the bridge's
   * own task-end / disconnect handlers.
   */
  setTaskActive(active: boolean): void {
    if (active) this.startRainbow()
    else this.stopRainbow()
  }

  /** Signal that the user stopped the current task. Tells the backend to
   *  cancel the CUA executor and rejects any further commands on the bridge
   *  until a new task begins. */
  stopTask(): void {
    if (this.taskStopped) return
    this.taskStopped = true
    this.send({ type: 'task_stop' })
    this.stopRainbow()
    this.approvalManager.cancelAll()
    this.cancelAllRemoteApprovals()
    console.log('[WS Bridge] Task stopped by user')
  }

  /** Reset the stopped flag so the bridge accepts commands for the next task. */
  resumeTask(): void {
    this.taskStopped = false
  }

  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN) return

    this.setState('connecting')
    this.intentionalClose = false

    // Only non-sensitive system info goes in the URL query params.
    // Auth credentials (token, user_id, machine_id) are sent in the
    // first message after the connection opens — this avoids exposing
    // tokens in URLs which get logged by proxies, servers, and CDNs.
    //
    // OSS-mode hint: when the token is an API key (not a JWT), tag the URL
    // with `source=electron-oss` so the backend's WS handler can route the
    // session through the API-key auth path before the body's `auth` message
    // arrives. The hint is a routing breadcrumb only — the actual key never
    // travels in the URL; it goes in the body's auth message like all other
    // credentials.
    const sysInfo = getSystemInfo()
    const params = new URLSearchParams(sysInfo)
    if (looksLikeCoastyApiKey(this.token)) {
      params.set('source', 'electron-oss')
    }
    const wsUrl = `${this.backendUrl.replace(/^http/, 'ws')}/api/electron/ws?${params.toString()}`

    this.ws = new WebSocket(wsUrl)

    this.ws.on('open', async () => {
      console.log('[WS Bridge] Connected, authenticating...')
      // On reconnect (e.g. after sleep/hibernate), the stored token may be
      // expired. Ask the auth layer for a fresh token before authenticating.
      if (this.getToken) {
        try {
          const freshToken = await this.getToken()
          if (freshToken) {
            this.token = freshToken
          }
        } catch (err) {
          console.error('[WS Bridge] Failed to refresh token on reconnect:', err)
        }
      }
      // Send auth credentials in the message body, not the URL.
      // OSS mode: also include explicit `apiKey` + `source` fields so the
      // backend's WS auth path can take the API-key branch without having
      // to re-sniff the token shape. `token` is left populated for backward
      // compat (older backend builds only read `token`).
      const authMsg: Record<string, unknown> = {
        type: 'auth',
        token: this.token,
        machine_id: this.machineId,
        user_id: this.userId,
      }
      if (looksLikeCoastyApiKey(this.token)) {
        authMsg.apiKey = this.token
        authMsg.source = 'electron-oss'
      }
      this.send(authMsg)
    })

    this.ws.on('message', async (data: WebSocket.RawData) => {
      try {
        const message = JSON.parse(data.toString())

        if (message.type === 'command') {
          const { command, parameters } = message.data
          console.log(`[WS Bridge] Received command: ${command}`)

          // Reject commands that arrive after the user stopped the task.
          // The backend may still have in-flight commands queued before
          // it processes our task_stop message.
          if (this.taskStopped) {
            console.log(`[WS Bridge] Rejected (task stopped): ${command}`)
            this.send({
              type: 'result',
              data: { success: false, error: 'Task was stopped by user' },
            })
          } else if (this.approvalManager.isDenyAll()) {
            console.log(`[WS Bridge] Denied (mode=off): ${command}`)
            this.send({
              type: 'result',
              data: { success: false, error: 'Action blocked: agent actions are currently paused by user' },
            })
          } else if (this.approvalManager.shouldAutoApprove(command)) {
            console.log(`[WS Bridge] Auto-approved: ${command}`)
            this.startRainbow()
            try {
              // Route through the serial queue — never call executor directly.
              // See comment on `commandQueue` for why this MUST be serialized.
              const result = await this.executeSerially(command, parameters)
              this.send({ type: 'result', data: result })
            } catch (error: any) {
              this.send({
                type: 'result',
                data: { success: false, error: error.message || String(error) },
              })
            }
          } else {
            console.log(`[WS Bridge] Requesting approval: ${command}`)

            // Notify backend about the pending approval so the web/phone UI
            // can also show the prompt and respond remotely.
            const approvalId = `approval_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
            this.send({
              type: 'approval_request',
              data: { id: approvalId, command, parameters },
            })

            // Race: local Electron overlay approval vs remote web/phone approval.
            // The approval manager handles local UI; we also listen for a
            // 'approval_response' message from the backend (sent by the web UI).
            const localPromise = this.approvalManager.requestApproval(command, parameters)
            const remotePromise = this.waitForRemoteApproval(approvalId)

            const { approved, reason } = await Promise.race([localPromise, remotePromise])

            // Cancel the local approval prompt if remote won the race (and vice versa)
            this.approvalManager.cancelAll()
            this.clearRemoteApproval(approvalId)

            if (approved) {
              console.log(`[WS Bridge] Approved: ${command}`)
              this.startRainbow()
              try {
                // Route through the serial queue — never call executor directly.
                const result = await this.executeSerially(command, parameters)
                this.send({ type: 'result', data: result })
              } catch (error: any) {
                this.send({
                  type: 'result',
                  data: { success: false, error: error.message || String(error) },
                })
              }
            } else {
              const msg = reason ? `Action denied by user: ${reason}` : 'Action denied by user'
              console.log(`[WS Bridge] Denied: ${command} — ${msg}`)
              this.send({
                type: 'result',
                data: { success: false, error: msg },
              })
            }
          }
        } else if (message.type === 'task_end') {
          console.log('[WS Bridge] Task ended')
          this.taskStopped = false
          this.stopRainbow()
        } else if (message.type === 'approval_response') {
          // Remote approval response from web/phone UI (forwarded by backend)
          const { id, approved, reason } = message.data || {}
          console.log(`[WS Bridge] Remote approval response: ${id} → ${approved ? 'approved' : 'denied'}`)
          this.resolveRemoteApproval(id, { approved: !!approved, reason })
        } else if (message.type === 'ping') {
          this.send({ type: 'heartbeat' })
        } else if (message.type === 'auth_success') {
          console.log('[WS Bridge] Authenticated with backend')
          this.reconnectAttempts = 0
          this.setState('connected')
          this.startHeartbeat()
          // Pre-create rainbow border so first show is instant
          initRainbowBorder()
          // Wire the error reporter so future errors flow over THIS WS.
          // Identity propagates the user_id/machine_id into every report.
          errorReporter.setIdentity(this.machineId, this.userId)
          errorReporter.setWebSocketSink((report) => {
            // Best-effort: if the underlying socket isn't open the send()
            // helper logs and drops; the reporter then queues for the HTTP
            // fallback. We never let the reporter's send throw upstream.
            try {
              this.send({ type: 'error_report', data: report })
            } catch (e) {
              throw e // signal failure so reporter falls back to HTTP queue
            }
          })
        } else if (message.type === 'auth_failed') {
          // Distinct from generic connection 'error' so the renderer can tell
          // "your JWT is invalid, log out" apart from "transient network blip,
          // keep retrying". App.tsx only auto-signs-out on 'auth_error'.
          console.error('[WS Bridge] Authentication failed:', message.reason)
          this.setState('auth_error')
          this.intentionalClose = true
          this.ws?.close()
          reportError('auth', {
            message: `Backend rejected JWT: ${message.reason || '<no reason>'}`,
            context: { reason: message.reason },
          })
        }
      } catch (e) {
        console.error('[WS Bridge] Error processing message:', e)
        reportError('ws_bridge', {
          error: e,
          message: 'Error processing inbound WS message',
        })
      }
    })

    this.ws.on('close', (code, reason) => {
      console.log(`[WS Bridge] Disconnected: ${code} ${reason}`)
      this.stopHeartbeat()
      this.stopRainbow()
      // Cancel all pending approvals (local + remote) so promises don't hang
      this.approvalManager.cancelAll()
      this.cancelAllRemoteApprovals()
      // Tear down the WS sink so future reports queue for HTTP instead of
      // failing against a dead socket.
      errorReporter.setWebSocketSink(null)

      if (!this.intentionalClose) {
        this.setState('disconnected')
        this.scheduleReconnect()
      }
    })

    this.ws.on('error', (error) => {
      console.error('[WS Bridge] Error:', error.message)
      this.setState('error')
      reportError('ws_bridge', {
        severity: 'warn',  // transient network errors are warns; reconnect handles them
        error,
        message: `WebSocket error: ${error.message}`,
      })
    })
  }

  disconnect(): void {
    this.intentionalClose = true
    this.stopHeartbeat()
    this.stopRainbow()
    this.clearReconnectTimer()
    this.approvalManager.cancelAll()
    this.cancelAllRemoteApprovals()
    this.ws?.close()
    this.ws = null
    this.setState('disconnected')
  }

  updateToken(token: string): void {
    this.token = token
    // Re-authenticate on the existing connection instead of tearing it down.
    // This avoids a visible 'disconnected' flicker in the UI every ~55 minutes
    // when the scheduled token refresh fires.
    if (this.ws?.readyState === WebSocket.OPEN) {
      const authMsg: Record<string, unknown> = {
        type: 'auth',
        token: this.token,
        machine_id: this.machineId,
        user_id: this.userId,
      }
      if (looksLikeCoastyApiKey(this.token)) {
        authMsg.apiKey = this.token
        authMsg.source = 'electron-oss'
      }
      this.send(authMsg)
    }
  }

  /** Wait for a remote approval response from the backend (web/phone UI).
   *  Includes a 120-second timeout to prevent indefinite hangs. */
  private waitForRemoteApproval(approvalId: string): Promise<{ approved: boolean; reason?: string }> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pendingRemoteApprovals.delete(approvalId)
        resolve({ approved: false, reason: 'Remote approval timed out' })
      }, 120_000)

      this.pendingRemoteApprovals.set(approvalId, {
        resolve: (result) => {
          clearTimeout(timer)
          resolve(result)
        },
      })
    })
  }

  /** Resolve a pending remote approval promise. */
  private resolveRemoteApproval(approvalId: string, result: { approved: boolean; reason?: string }): void {
    const pending = this.pendingRemoteApprovals.get(approvalId)
    if (pending) {
      this.pendingRemoteApprovals.delete(approvalId)
      pending.resolve(result)
    }
  }

  /** Clear a remote approval by resolving it as denied (e.g. when local won the race). */
  private clearRemoteApproval(approvalId: string): void {
    const pending = this.pendingRemoteApprovals.get(approvalId)
    if (pending) {
      this.pendingRemoteApprovals.delete(approvalId)
      pending.resolve({ approved: false, reason: 'Superseded by local approval' })
    }
  }

  /** Cancel all pending remote approvals (e.g. on disconnect). */
  private cancelAllRemoteApprovals(): void {
    for (const [id, pending] of this.pendingRemoteApprovals) {
      pending.resolve({ approved: false, reason: 'Disconnected' })
    }
    this.pendingRemoteApprovals.clear()
  }

  private send(data: any): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data))
    }
  }

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      this.send({ type: 'heartbeat' })
    }, 30000)
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval)
      this.heartbeatInterval = null
    }
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
  }

  private scheduleReconnect(): void {
    // Cap backoff at 15s so the overlay reconnects quickly when the backend comes up
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 15000)
    this.reconnectAttempts++
    console.log(`[WS Bridge] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`)

    this.reconnectTimer = setTimeout(() => {
      this.connect()
    }, delay)
  }

  private setState(state: ConnectionState): void {
    this.state = state
    // Notify all renderer windows
    BrowserWindow.getAllWindows().forEach((win) => {
      win.webContents.send('connection-state-changed', state)
    })
  }
}
