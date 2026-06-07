import { BrowserWindow, app } from 'electron'
import { randomUUID } from 'node:crypto'
import * as fs from 'fs'
import * as path from 'path'
import { bringToFront } from './window-manager'

export type ApprovalMode = 'full_control' | 'smart_approve' | 'approve_all' | 'off'

const VALID_MODES: ApprovalMode[] = ['full_control', 'smart_approve', 'approve_all', 'off']

// Read-only / side-effect-free commands that are safe to auto-approve in smart mode
const SAFE_COMMANDS = new Set([
  'screenshot',
  'browser_screenshot',
  'browser_state',
  'browser_info',
  'browser_get_dom',
  'browser_get_clickables',
  'browser_get_context',
  'browser_dom',
  'file_read',
  'file_exists',
  'directory_list',
  'file_list_downloads',
  'file_download',
  'terminal_read',
  'terminal_connect',
  'list_windows',
  'browser_list_tabs',
])

export interface ApprovalResult {
  approved: boolean
  reason?: string
}

interface PendingApproval {
  id: string
  command: string
  parameters: any
  resolve: (result: ApprovalResult) => void
}

export class ApprovalManager {
  private mode: ApprovalMode = 'full_control'
  private pending: Map<string, PendingApproval> = new Map()
  private configPath: string

  constructor() {
    this.configPath = path.join(app.getPath('userData'), 'approval-config.json')
    this.loadConfig()
  }

  getMode(): ApprovalMode {
    return this.mode
  }

  setMode(mode: ApprovalMode): void {
    if (!VALID_MODES.includes(mode)) return
    this.mode = mode
    this.saveConfig()
    BrowserWindow.getAllWindows().forEach((win) => {
      win.webContents.send('approval-mode-changed', mode)
    })
  }

  /** Returns true if the command should execute immediately without user approval. */
  shouldAutoApprove(command: string): boolean {
    switch (this.mode) {
      case 'full_control':
        return true
      case 'off':
        return false
      case 'approve_all':
        return false
      case 'smart_approve':
        return SAFE_COMMANDS.has(command)
    }
  }

  /** Check if mode blocks all actions. */
  isDenyAll(): boolean {
    return this.mode === 'off'
  }

  /**
   * Request approval from the user via IPC to the renderer.
   * Resolves with { approved, reason? }.
   */
  requestApproval(command: string, parameters: any): Promise<ApprovalResult> {
    // crypto.randomUUID() — 122 bits of entropy, guaranteed unique across the
    // process. The previous `${Date.now()}_${Math.random().slice(2,6)}` scheme
    // collapsed to only 4 base-36 chars of entropy when many requests landed
    // inside the same millisecond, with a ~30% collision rate per 1000 calls.
    // That's a real correctness bug — two near-simultaneous approvals could
    // collide and an approval response could route to the wrong pending promise.
    const id = `approval_${randomUUID()}`

    return new Promise((resolve) => {
      this.pending.set(id, { id, command, parameters, resolve })

      BrowserWindow.getAllWindows().forEach((win) => {
        win.webContents.send('approval-request', {
          id,
          command,
          parameters,
        })
      })

      // Bring overlay to front so the user can see and interact with the approval
      bringToFront()
    })
  }

  /** Handle user response from the renderer. */
  handleResponse(id: string, approved: boolean, reason?: string): void {
    const pending = this.pending.get(id)
    if (!pending) return
    this.pending.delete(id)
    pending.resolve({ approved, reason })
  }

  /** Cancel all pending approvals (e.g. on WebSocket disconnect). */
  cancelAll(): void {
    for (const [, pending] of this.pending) {
      pending.resolve({ approved: false })
    }
    this.pending.clear()
  }

  private loadConfig(): void {
    try {
      if (fs.existsSync(this.configPath)) {
        const data = JSON.parse(fs.readFileSync(this.configPath, 'utf-8'))
        if (data.mode && VALID_MODES.includes(data.mode)) {
          this.mode = data.mode
        }
      }
    } catch {
      // Use default
    }
  }

  private saveConfig(): void {
    try {
      fs.writeFileSync(this.configPath, JSON.stringify({ mode: this.mode }), 'utf-8')
    } catch {
      console.error('[ApprovalManager] Failed to save config')
    }
  }
}
