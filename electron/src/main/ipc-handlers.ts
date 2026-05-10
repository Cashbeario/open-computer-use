import { ipcMain, dialog, BrowserWindow } from 'electron'
import * as os from 'os'
import * as path from 'path'
import * as fs from 'fs'
import { ElectronAuth } from './auth'
import { WebSocketBridge } from './ws-bridge'
import { ApprovalManager } from './approval-manager'
import { suspendTopmost, resumeTopmost } from './window-manager'
import {
  isOssMode,
  getStoredKey,
  clearStoredKey,
  getCoastyApiBaseUrl,
  hashApiKeyToUserId,
} from './oss-mode'

/**
 * Standard header set for all OSS-mode coasty.ai calls. Centralised so the
 * X-API-Key + X-Coasty-Source pair is identical across every handler — the
 * backend keys off `X-Coasty-Source: electron-oss` to route into the OSS
 * tenancy and emit OSS-tier billing events; missing it on a single endpoint
 * would silently drop those events.
 */
function ossHeaders(key: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'X-API-Key': key,
    'X-Coasty-Source': 'electron-oss',
    'User-Agent': 'coasty-electron/1.0',
  }
}

export function registerIpcHandlers(
  auth: ElectronAuth,
  getWsBridge: () => WebSocketBridge | null,
  setWsBridge: (bridge: WebSocketBridge) => void,
  backendUrl: string,
  approvalManager: ApprovalManager,
  getMainWindow: () => BrowserWindow | null,
): void {
  // Validate that IPC calls come from the app's own renderer window.
  // Prevents other processes on the IPC socket from invoking handlers.
  const _ipcHandle = ipcMain.handle.bind(ipcMain)
  function secureHandle(
    channel: string,
    handler: (event: Electron.IpcMainInvokeEvent, ...args: any[]) => any,
  ): void {
    _ipcHandle(channel, async (event: Electron.IpcMainInvokeEvent, ...args: any[]) => {
      const mw = getMainWindow()
      if (!mw || event.sender !== mw.webContents) {
        console.error(`[Security] Blocked unauthorized IPC call to '${channel}'`)
        return { success: false, error: 'Unauthorized' }
      }
      return handler(event, ...args)
    })
  }

  // Auth handlers
  secureHandle('auth:sign-in', async () => {
    try {
      const result = await auth.signInWithGoogle()
      return {
        success: true,
        user: {
          id: result.user.id,
          email: result.user.email,
          name: result.user.user_metadata?.full_name,
          avatar: result.user.user_metadata?.avatar_url,
        },
      }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  secureHandle('auth:sign-in-email', async (_event, email: string, password: string) => {
    try {
      const result = await auth.signInWithEmail(email, password)
      return {
        success: true,
        user: {
          id: result.user.id,
          email: result.user.email,
          name: result.user.user_metadata?.full_name || null,
          avatar: result.user.user_metadata?.avatar_url || null,
        },
      }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // Sign-up: long-running — waits for user to click confirmation email link
  secureHandle('auth:sign-up-email', async (_event, email: string, password: string) => {
    try {
      const result = await auth.signUpWithEmail(email, password)
      return {
        success: true,
        user: {
          id: result.user.id,
          email: result.user.email,
          name: result.user.user_metadata?.full_name || null,
          avatar: result.user.user_metadata?.avatar_url || null,
        },
      }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // Magic link phase 1: send OTP (returns quickly)
  secureHandle('auth:send-magic-link', async (_event, email: string) => {
    try {
      await auth.sendMagicLink(email)
      return { success: true }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // Magic link phase 2: wait for user to click link (long-running)
  secureHandle('auth:await-magic-link', async () => {
    try {
      const result = await auth.awaitMagicLinkSession()
      return {
        success: true,
        user: {
          id: result.user.id,
          email: result.user.email,
          name: result.user.user_metadata?.full_name || null,
          avatar: result.user.user_metadata?.avatar_url || null,
        },
      }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  secureHandle('auth:reset-password', async (_event, email: string) => {
    try {
      await auth.resetPassword(email)
      return { success: true }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // Cancel any pending auth flow (sign-up confirmation wait, magic link wait)
  secureHandle('auth:cancel-auth', async () => {
    auth.cancelPendingAuth()
    return { success: true }
  })

  secureHandle('auth:sign-out', async () => {
    try {
      const bridge = getWsBridge()
      if (bridge) {
        bridge.disconnect()
      }
      // OSS mode: there's no Supabase session to revoke — the only piece of
      // identity is the encrypted API key on disk, so wipe that and stop.
      // Calling auth.signOut() here would attempt to revoke a non-existent
      // Supabase session and throw.
      if (await isOssMode()) {
        await clearStoredKey()
      } else {
        await auth.signOut()
      }
      return { success: true }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  secureHandle('auth:get-session', async () => {
    // OSS mode: synthesise a session keyed off a hash of the API key.
    // The renderer treats `kind === 'oss'` as the signal to skip Supabase-
    // dependent paths (profile photo lookups, OAuth-only menus, etc.) and
    // route directly through the IPC handlers below. `email` is null
    // because we have no identity beyond the API key itself.
    if (await isOssMode()) {
      const key = await getStoredKey()
      return {
        isAuthenticated: true,
        kind: 'oss',
        userId: key ? hashApiKeyToUserId(key) : null,
        email: null,
        name: null,
        avatar: null,
        machineId: auth.getMachineId(),
      }
    }
    return {
      isAuthenticated: auth.isAuthenticated(),
      kind: 'production',
      userId: auth.getUserId(),
      email: auth.getUserEmail(),
      name: auth.getUserName(),
      avatar: auth.getUserAvatar(),
      machineId: auth.getMachineId(),
    }
  })

  secureHandle('auth:get-token', async () => {
    // OSS mode has no Bearer JWT — the backend authenticates via X-API-Key
    // headers in IPC handlers and the auth-message body in the WS bridge.
    // Returning null here makes any caller that reflexively adds a
    // `Bearer ${token}` header skip that header (the existing handlers do
    // exactly this — see chat:resume-human).
    if (await isOssMode()) return null
    return await auth.getAccessToken()
  })

  // WebSocket bridge handlers
  secureHandle('bridge:connect', async () => {
    try {
      const machineId = auth.getMachineId()

      // OSS mode: use the stored API key as the WS token. The bridge's
      // `looksLikeCoastyApiKey` heuristic will detect the `coasty_*` prefix
      // and tag the URL + auth message with `source=electron-oss`, which is
      // what the backend's WS handler keys off. The token-provider on
      // reconnect re-reads the encrypted file rather than calling Supabase
      // — keys don't expire so this is mostly a safety net (e.g. user
      // rotated their key from the web UI mid-session).
      if (await isOssMode()) {
        const key = await getStoredKey()
        if (!key) {
          return { success: false, error: 'No API key stored — sign in with a Coasty API key' }
        }
        const userId = hashApiKeyToUserId(key)

        let bridge = getWsBridge()
        if (bridge) bridge.disconnect()

        bridge = new WebSocketBridge(backendUrl, key, machineId, userId, approvalManager)
        bridge.setTokenProvider(async () => await getStoredKey())
        setWsBridge(bridge)
        bridge.connect()

        return { success: true, machineId }
      }

      const token = await auth.getAccessToken()
      const userId = auth.getUserId()

      if (!token || !userId) {
        return { success: false, error: 'Not authenticated' }
      }

      let bridge = getWsBridge()
      if (bridge) {
        bridge.disconnect()
      }

      bridge = new WebSocketBridge(backendUrl, token, machineId, userId, approvalManager)
      // Let the bridge fetch fresh tokens on reconnect (e.g. after sleep/hibernate)
      // so it doesn't try to authenticate with an expired JWT.
      bridge.setTokenProvider(() => auth.getAccessToken())
      setWsBridge(bridge)
      bridge.connect()

      return { success: true, machineId }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  secureHandle('bridge:disconnect', async () => {
    const bridge = getWsBridge()
    if (bridge) {
      bridge.disconnect()
    }
    return { success: true }
  })

  secureHandle('bridge:get-state', async () => {
    const bridge = getWsBridge()
    return bridge?.getState() || 'disconnected'
  })

  // Renderer-driven rainbow lifecycle. The renderer's `isStreaming` is
  // the source of truth — the backend's `task_end` WebSocket message is
  // fire-and-forget and cannot be trusted to always arrive. This IPC
  // ensures the rainbow ALWAYS follows the renderer's streaming state.
  secureHandle('bridge:set-task-active', async (_event, active: boolean) => {
    const bridge = getWsBridge()
    if (bridge) bridge.setTaskActive(!!active)
    return { success: true }
  })

  // Config handlers
  secureHandle('config:get-backend-url', async () => {
    return backendUrl
  })

  secureHandle('config:get-machine-id', async () => {
    return auth.getMachineId()
  })

  // ── Chat CRUD handlers ──────────────────────────────────────────────
  // Query Supabase directly — no proxy, no CORS, no routing issues.

  secureHandle('chats:create', async (_event, params: { title?: string; model?: string }) => {
    try {
      const machineId = auth.getMachineId()

      // OSS path: POST /v1/chats with X-API-Key. Body matches the
      // production Supabase row shape (title/model + room_settings) but is
      // flattened — the backend persists it server-side under the API
      // key's tenant rather than the user's Supabase row. `source` is
      // duplicated into the body so the API server can emit the right
      // billing event without re-parsing the X-Coasty-Source header.
      if (await isOssMode()) {
        const key = await getStoredKey()
        if (!key) return { success: false, error: 'No API key stored' }
        const res = await fetch(`${getCoastyApiBaseUrl()}/v1/chats`, {
          method: 'POST',
          headers: ossHeaders(key),
          body: JSON.stringify({
            title: params.title || 'New Task',
            model: params.model || 'default',
            source: 'electron-oss',
            machine_id: machineId,
            machine_name: `${os.hostname()} (Desktop)`,
            platform: process.platform,
          }),
        })
        if (!res.ok) {
          const text = await res.text().catch(() => '')
          return { success: false, error: `coasty.ai ${res.status}: ${text.slice(0, 200)}` }
        }
        const body: any = await res.json().catch(() => ({}))
        return { success: true, chat: body.chat ?? body }
      }

      const userId = auth.getUserId()
      if (!userId) return { success: false, error: 'Not authenticated' }

      const supabase = await auth.getSupabaseClient()
      const { data: chat, error } = await supabase
        .from('chats')
        .insert({
          user_id: userId,
          title: params.title || 'New Task',
          model: params.model || 'default',
          room_settings: {
            source: 'electron',
            machine_id: machineId,
            machine_name: `${os.hostname()} (Desktop)`,
            platform: process.platform,
          },
        })
        .select()
        .single()

      if (error) throw error
      return { success: true, chat }
    } catch (error: any) {
      console.error('[Chats] Create failed:', error.message)
      return { success: false, error: error.message }
    }
  })

  secureHandle('chats:list', async () => {
    try {
      const machineId = auth.getMachineId()

      // OSS path: server-side filter by machine_id via query param. The
      // production Supabase path filters in-process because RLS already
      // narrows to user_id; the OSS API has to do the machine-id narrow
      // server-side because the API key's tenancy can span machines.
      if (await isOssMode()) {
        const key = await getStoredKey()
        if (!key) return { success: false, error: 'No API key stored' }
        const url = `${getCoastyApiBaseUrl()}/v1/chats?machine_id=${encodeURIComponent(machineId)}`
        const res = await fetch(url, { method: 'GET', headers: ossHeaders(key) })
        if (!res.ok) {
          const text = await res.text().catch(() => '')
          return { success: false, error: `coasty.ai ${res.status}: ${text.slice(0, 200)}` }
        }
        const body: any = await res.json().catch(() => ({}))
        return { success: true, chats: body.chats ?? [] }
      }

      const userId = auth.getUserId()
      if (!userId) return { success: false, error: 'Not authenticated' }

      const supabase = await auth.getSupabaseClient()
      const { data: chats, error } = await supabase
        .from('chats')
        .select('*')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false })

      if (error) throw error

      // Filter to this machine's chats (room_settings.machine_id)
      const machineChats = (chats || []).filter((c: any) => {
        const settings = c.room_settings || {}
        return settings.machine_id === machineId
      })

      return { success: true, chats: machineChats }
    } catch (error: any) {
      console.error('[Chats] List failed:', error.message)
      return { success: false, error: error.message }
    }
  })

  secureHandle('chats:get-messages', async (_event, chatId: string) => {
    try {
      if (await isOssMode()) {
        const key = await getStoredKey()
        if (!key) return { success: false, error: 'No API key stored' }
        const res = await fetch(
          `${getCoastyApiBaseUrl()}/v1/chats/${encodeURIComponent(chatId)}/messages`,
          { method: 'GET', headers: ossHeaders(key) },
        )
        if (!res.ok) {
          const text = await res.text().catch(() => '')
          return { success: false, error: `coasty.ai ${res.status}: ${text.slice(0, 200)}` }
        }
        const body: any = await res.json().catch(() => ({}))
        return { success: true, messages: body.messages ?? [] }
      }

      const supabase = await auth.getSupabaseClient()
      const { data: messages, error } = await supabase
        .from('messages')
        .select('*')
        .eq('chat_id', chatId)
        .order('created_at', { ascending: true })

      if (error) throw error
      return { success: true, messages: messages || [] }
    } catch (error: any) {
      console.error('[Chats] Get messages failed:', error.message)
      return { success: false, error: error.message }
    }
  })

  secureHandle('chats:update', async (_event, params: { chatId: string; title: string }) => {
    try {
      if (await isOssMode()) {
        const key = await getStoredKey()
        if (!key) return { success: false, error: 'No API key stored' }
        const res = await fetch(
          `${getCoastyApiBaseUrl()}/v1/chats/${encodeURIComponent(params.chatId)}`,
          {
            method: 'PATCH',
            headers: ossHeaders(key),
            body: JSON.stringify({ title: params.title }),
          },
        )
        if (!res.ok) {
          const text = await res.text().catch(() => '')
          return { success: false, error: `coasty.ai ${res.status}: ${text.slice(0, 200)}` }
        }
        return { success: true }
      }

      const userId = auth.getUserId()
      if (!userId) return { success: false, error: 'Not authenticated' }

      const supabase = await auth.getSupabaseClient()
      const { error } = await supabase
        .from('chats')
        .update({ title: params.title, updated_at: new Date().toISOString() })
        .eq('id', params.chatId)
        .eq('user_id', userId)

      if (error) throw error
      return { success: true }
    } catch (error: any) {
      console.error('[Chats] Update failed:', error.message)
      return { success: false, error: error.message }
    }
  })

  secureHandle('chats:delete', async (_event, chatId: string) => {
    try {
      if (await isOssMode()) {
        const key = await getStoredKey()
        if (!key) return { success: false, error: 'No API key stored' }
        const res = await fetch(
          `${getCoastyApiBaseUrl()}/v1/chats/${encodeURIComponent(chatId)}`,
          { method: 'DELETE', headers: ossHeaders(key) },
        )
        if (!res.ok) {
          const text = await res.text().catch(() => '')
          return { success: false, error: `coasty.ai ${res.status}: ${text.slice(0, 200)}` }
        }
        return { success: true }
      }

      const userId = auth.getUserId()
      if (!userId) return { success: false, error: 'Not authenticated' }

      const supabase = await auth.getSupabaseClient()
      const { error } = await supabase
        .from('chats')
        .delete()
        .eq('id', chatId)
        .eq('user_id', userId)

      if (error) throw error
      return { success: true }
    } catch (error: any) {
      console.error('[Chats] Delete failed:', error.message)
      return { success: false, error: error.message }
    }
  })

  // ── Credits / Billing ─────────────────────────────────────────────
  // Query Supabase directly from the main process — no proxy needed.
  // This is the same query the Next.js /api/credits/balance route does.
  secureHandle('credits:get-balance', async () => {
    try {
      // OSS path: hit /v1/credits with X-API-Key. Same balance/threshold
      // semantics as production (>=20 credits to start a session, ~10
      // credits per minute) so the renderer's gating logic works
      // unchanged. Never reach Supabase here — there's no user_id row.
      if (await isOssMode()) {
        const key = await getStoredKey()
        if (!key) return { success: false, error: 'No API key stored' }
        const res = await fetch(`${getCoastyApiBaseUrl()}/v1/credits`, {
          method: 'GET',
          headers: ossHeaders(key),
        })
        if (!res.ok) {
          const text = await res.text().catch(() => '')
          return { success: false, error: `coasty.ai ${res.status}: ${text.slice(0, 200)}` }
        }
        const body: any = await res.json().catch(() => ({}))
        const balance = typeof body.balance === 'number' ? body.balance : 0
        return {
          success: true,
          balance,
          can_start_session: balance >= 20,
          estimated_runtime_minutes: Math.floor(balance / 10),
        }
      }

      const userId = auth.getUserId()
      if (!userId) return { success: false, error: 'Not authenticated' }

      const supabase = await auth.getSupabaseClient()

      // Try RPC first (creates credits row if missing)
      const { data: credits, error: rpcError } = await (supabase as any)
        .rpc('get_or_create_user_credits', { p_user_id: userId })
        .single()

      if (!rpcError && credits) {
        return {
          success: true,
          balance: credits.balance ?? 0,
          can_start_session: (credits.balance ?? 0) >= 20,
          estimated_runtime_minutes: Math.floor((credits.balance ?? 0) / 10),
        }
      }

      // Fallback: direct select
      const { data: existing, error: selectError } = await (supabase as any)
        .from('user_credits')
        .select('balance, total_purchased, total_used')
        .eq('user_id', userId)
        .single()

      if (!selectError && existing) {
        return {
          success: true,
          balance: existing.balance ?? 0,
          can_start_session: (existing.balance ?? 0) >= 20,
          estimated_runtime_minutes: Math.floor((existing.balance ?? 0) / 10),
        }
      }

      // No credits row at all — return zero
      return {
        success: true,
        balance: 0,
        can_start_session: false,
        estimated_runtime_minutes: 0,
      }
    } catch (error: any) {
      console.error('[Credits] Failed to fetch balance:', error.message)
      return { success: false, error: error.message }
    }
  })

  // ── Resume from human handoff ────────────────────────────────────
  secureHandle('chat:resume-human', async (_event, machineId: string) => {
    try {
      const token = await auth.getAccessToken()
      const res = await fetch(`${backendUrl}/api/chat/resume-human/${machineId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
      })
      if (!res.ok) {
        const text = await res.text()
        return { success: false, error: text }
      }
      const data = await res.json()
      return { success: true, resumed: data.resumed ?? true }
    } catch (err: any) {
      console.error('[ResumeHuman] Failed:', err.message)
      return { success: false, error: err.message }
    }
  })

  // ── Machine busy-state queries (yellow "Override & Run" UI) ─────
  //
  // Both endpoints are routed through the main process for the same
  // reason as chat streaming: the renderer at file:// can't directly
  // fetch the backend without CORS issues, and the auth token lives
  // in the main process for security.
  //
  // The renderer calls these BEFORE submitting a chat: if `busy=true`
  // is returned, the UI shows a yellow "Override & Run" button instead
  // of the normal Send button. Clicking it triggers `chat:stop-machine`
  // followed by a normal send.

  secureHandle(
    'chat:check-machine-busy',
    async (_event, machineId: string): Promise<{
      success: boolean
      busy?: boolean
      ownerChatId?: string | null
      error?: string
    }> => {
      // Always log the entry so terminal output shows the IPC was hit.
      // Without this, a "send button does nothing" report has no signal
      // in the main-process log — the bug could be anywhere from the
      // canSend guard to the IPC dispatch and we'd be guessing.
      console.log(`[Electron] chat:check-machine-busy invoked for ${machineId}`)
      try {
        const token = await auth.getAccessToken()
        const res = await fetch(
          `${backendUrl}/api/chat/machine-status/${machineId}`,
          {
            method: 'GET',
            headers: {
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
          },
        )
        if (!res.ok) {
          // 4xx/5xx — be defensive: log and return busy=false so the
          // user isn't permanently locked out by a transient backend
          // hiccup. The actual /api/chat/ call will surface any real
          // error if there is one.
          const text = await res.text().catch(() => '')
          console.warn(
            `[Electron] machine-status ${res.status} for ${machineId}: ${text}`,
          )
          return { success: false, busy: false, error: `HTTP ${res.status}` }
        }
        const data = await res.json()
        console.log(
          `[Electron] machine-status 200 for ${machineId}: busy=${!!data.busy}`,
        )
        return {
          success: true,
          busy: !!data.busy,
          ownerChatId: data.ownerChatId ?? null,
        }
      } catch (err: any) {
        console.error('[Electron] check-machine-busy failed:', err.message)
        // Network failure → fail open. The user's send will go through;
        // if the machine really IS busy, the chat route will return
        // the busy error event mid-stream and the user sees a chat
        // message (the legacy fallback path).
        return { success: false, busy: false, error: err.message }
      }
    },
  )

  secureHandle(
    'chat:stop-machine',
    async (_event, machineId: string): Promise<{
      success: boolean
      stopped?: boolean
      released?: boolean
      ownerChatId?: string | null
      error?: string
    }> => {
      try {
        const token = await auth.getAccessToken()
        const res = await fetch(
          `${backendUrl}/api/chat/stop-machine/${machineId}`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
          },
        )
        if (!res.ok) {
          const text = await res.text().catch(() => '')
          return { success: false, error: text || `HTTP ${res.status}` }
        }
        const data = await res.json()
        return {
          success: true,
          stopped: !!data.stopped,
          released: !!data.released,
          ownerChatId: data.ownerChatId ?? null,
        }
      } catch (err: any) {
        console.error('[Electron] stop-machine failed:', err.message)
        return { success: false, error: err.message }
      }
    },
  )

  // ── Chat SSE Streaming (main process, no CORS) ───────────────────
  // The renderer cannot fetch() external URLs without CORS issues
  // (it loads from file://). All streaming goes through the main process
  // which has no CORS restrictions. SSE events are forwarded to the
  // renderer via IPC events.

  // Active abort controllers for chat streams, keyed by requestId
  const chatAbortControllers = new Map<string, AbortController>()

  secureHandle('chat:send-message', async (event, params: {
    requestId: string
    messages: Array<{ role: string; content: string }>
    chatId: string
    userId: string
    machineId: string
    model?: string
  }) => {
    // Trace each chat-send dispatch so a "send button does nothing"
    // report can be triaged from the terminal log without DevTools.
    // Length-only on the message preview to avoid leaking content.
    const lastMessage = params.messages[params.messages.length - 1]
    const preview = lastMessage
      ? `${lastMessage.role}:${(lastMessage.content || '').slice(0, 60)}`
      : '(no messages)'
    console.log(
      `[Electron] chat:send-message dispatched req=${params.requestId} chatId=${params.chatId} msgs=${params.messages.length} last="${preview}"`,
    )
    // Clear the stopped flag so the WebSocket bridge accepts commands for this new task
    const bridge = getWsBridge()
    if (bridge) bridge.resumeTask()

    // OSS mode: stream from coasty.ai/v1/chat with X-API-Key (no Bearer).
    // Production: stream from local backend's /api/chat/ with Bearer JWT.
    // Both paths share the same SSE wire format below, so only the URL
    // and auth header differ.
    let url: string
    let authHeaders: Record<string, string>
    const oss = await isOssMode()
    if (oss) {
      const key = await getStoredKey()
      if (!key) return { success: false, error: 'No API key stored' }
      url = `${getCoastyApiBaseUrl()}/v1/chat`
      authHeaders = {
        'X-API-Key': key,
        'X-Coasty-Source': 'electron-oss',
        'User-Agent': 'coasty-electron/1.0',
      }
    } else {
      const token = await auth.getAccessToken()
      url = `${backendUrl}/api/chat/`
      authHeaders = token ? { 'Authorization': `Bearer ${token}` } : {}
    }

    const controller = new AbortController()
    chatAbortControllers.set(params.requestId, controller)

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream',
          ...authHeaders,
        },
        body: JSON.stringify({
          messages: params.messages,
          chat_id: params.chatId,
          user_id: params.userId,
          machine_id: params.machineId,
          model: params.model || 'default',
          is_authenticated: true,
          ...(oss ? { source: 'electron-oss' } : {}),
        }),
        signal: controller.signal,
      })

      if (!response.ok) {
        const text = await response.text()
        let errorMessage = `Request failed: ${response.status}`
        try {
          const json = JSON.parse(text)
          errorMessage = json.detail || json.error || errorMessage
        } catch { /* use default */ }

        // The user is INSIDE the Electron desktop app right now, so any
        // "the desktop app is not connected" wording from the backend is
        // nonsensical — this app IS the desktop. Strip that phrasing and
        // replace with a context-appropriate reconnect message. The web
        // app still gets the original wording (it surfaces the same
        // backend error elsewhere) — this rewrite is local to the
        // Electron main process.
        const looksLikeNotConnected =
          response.status === 503 ||
          /electron\s+desktop\s+app\s+is\s+not\s+connected/i.test(errorMessage)

        // Send error to renderer
        const sender = event.sender
        if (!sender.isDestroyed()) {
          sender.send('chat:sse-event', {
            requestId: params.requestId,
            type: 'error',
            data: response.status === 402
              ? 'Insufficient credits. Please purchase more credits to continue.'
              : looksLikeNotConnected
                ? 'Reconnecting — please try again in a moment.'
                : errorMessage,
          })
        }
        return { success: false, error: errorMessage }
      }

      // Stream SSE events to the renderer
      const reader = response.body?.getReader()
      if (!reader) {
        return { success: false, error: 'No response body' }
      }

      const decoder = new TextDecoder()
      let buffer = ''
      const sender = event.sender

      try {
        while (true) {
          if (controller.signal.aborted) break

          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })

          const events = buffer.split('\n\n')
          buffer = events.pop() || ''

          for (const sseEvent of events) {
            const trimmed = sseEvent.trim()
            if (!trimmed) continue

            const colonIndex = trimmed.indexOf(':')
            if (colonIndex === -1) continue

            const code = trimmed.slice(0, colonIndex)
            const rawData = trimmed.slice(colonIndex + 1)

            if (!sender.isDestroyed()) {
              sender.send('chat:sse-event', {
                requestId: params.requestId,
                type: code,
                data: rawData,
              })
            }
          }
        }
      } finally {
        reader.releaseLock()
      }

      return { success: true }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        return { success: true, aborted: true }
      }
      // Send error to renderer
      const sender = event.sender
      if (!sender.isDestroyed()) {
        sender.send('chat:sse-event', {
          requestId: params.requestId,
          type: 'error',
          data: err.message || 'Failed to connect to backend',
        })
      }
      return { success: false, error: err.message }
    } finally {
      chatAbortControllers.delete(params.requestId)
    }
  })

  secureHandle('chat:abort', async (_event, requestId: string) => {
    const controller = chatAbortControllers.get(requestId)
    if (controller) {
      controller.abort()
      chatAbortControllers.delete(requestId)
    }
    // Tell the WebSocket bridge to stop the task — this sends task_stop to
    // the backend and rejects any further commands that arrive on the bridge.
    const bridge = getWsBridge()
    if (bridge) bridge.stopTask()

    // ALSO hit the dedicated HTTP stop endpoint. The WebSocket task_stop
    // only arrives if vm_control is mid-recv on this machine — if the
    // executor is blocked inside agent.predict() or code_agent, no one is
    // reading the socket and the message sits in the buffer. The HTTP call
    // goes to a separate request handler that unconditionally sets the
    // cancellation event.
    try {
      const machineId = auth.getMachineId()
      const token = await auth.getAccessToken()
      if (machineId && token) {
        await fetch(`${backendUrl}/api/chat/stop-machine/${machineId}`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` },
        }).catch((err) => {
          console.error('[chat:abort] stop-machine HTTP call failed:', err?.message || err)
        })
      }
    } catch (err: any) {
      console.error('[chat:abort] stop-machine error:', err?.message || err)
    }
    return { success: true }
  })

  // File/folder picker — opens native OS dialog, returns selected paths + metadata
  secureHandle('files:select', async (_event, opts?: { directories?: boolean }) => {
    const properties: Electron.OpenDialogOptions['properties'] = ['multiSelections']
    if (opts?.directories) {
      properties.push('openDirectory')
    } else {
      properties.push('openFile')
    }
    // Suspend always-on-top so the native dialog isn't buried behind the overlay
    suspendTopmost()
    try {
      const result = await dialog.showOpenDialog({ properties })
      if (result.canceled || result.filePaths.length === 0) {
        return { success: true, files: [] }
      }
      const files = result.filePaths.map((fp) => {
        let isDir = false
        try { isDir = fs.statSync(fp).isDirectory() } catch {}
        return {
          path: fp,
          name: path.basename(fp),
          ext: isDir ? '' : path.extname(fp).replace('.', ''),
          isDirectory: isDir,
        }
      })
      return { success: true, files }
    } finally {
      resumeTopmost()
    }
  })
}
