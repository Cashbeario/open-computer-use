import type { Tray } from 'electron'
import type { WebSocketBridge } from './ws-bridge'
import type { ElectronAuth } from './auth'

/**
 * Dependencies the shutdown routine needs to tear down. Passed as an object
 * rather than imported from `index.ts` so the function stays unit-testable
 * without dragging the whole app bootstrap into the test environment.
 */
export interface ShutdownDeps {
  wsBridge: WebSocketBridge | null
  auth: ElectronAuth | null
  tray: Tray | null
}

let shuttingDown = false

/**
 * Idempotent full-shutdown routine.
 *
 * Tears down every long-lived resource that can block a clean exit so that
 * `window-all-closed` fires and the process actually quits (Alt+F4 on
 * Windows, ⌘W on macOS, the in-app close button, the tray Quit item):
 *
 *  1. WebSocket bridge  — stops heartbeat, clears reconnect timer, cancels
 *                         pending approvals, closes the socket.
 *  2. Auth              — clears the token-refresh timer and any in-flight
 *                         OAuth/magic-link HTTP callback server.
 *  3. Tray              — removes the system-tray icon so there's no ghost
 *                         icon between `close` and `quit`.
 *
 * (The app used to also leak a second `BrowserWindow` — the rainbow-border
 * desktop glow — which is why this routine existed; that window has since
 * been removed entirely, so there is nothing left to destroy for it.)
 *
 * Called from two places:
 *  - `mainWindow.on('close')` — user-initiated close path. Cleans up BEFORE
 *    the main window is destroyed so `window-all-closed` fires correctly.
 *  - `app.on('before-quit')` — programmatic quit path (tray menu, auto-
 *    updater, etc.). Runs as a safety net in case `close` wasn't reached.
 *
 * Idempotent: safe to call multiple times. Each teardown step is wrapped in
 * its own try/catch so a failure in one resource cannot prevent the others
 * from being released.
 */
export function performFullShutdown(deps: ShutdownDeps): void {
  if (shuttingDown) return
  shuttingDown = true

  // 1. WebSocket bridge — heartbeat, reconnect timer, approvals, socket.
  try {
    deps.wsBridge?.disconnect()
  } catch (err) {
    console.error('[Shutdown] ws bridge disconnect failed:', err)
  }

  // 2. Auth — refresh timer + pending callback server.
  try {
    deps.auth?.dispose()
  } catch (err) {
    console.error('[Shutdown] auth dispose failed:', err)
  }

  // 3. Tray icon.
  try {
    if (deps.tray && !deps.tray.isDestroyed()) {
      deps.tray.destroy()
    }
  } catch (err) {
    console.error('[Shutdown] tray destroy failed:', err)
  }
}

/** Whether a shutdown is currently in progress (or has completed). */
export function isShutdownInProgress(): boolean {
  return shuttingDown
}

/** Test-only helper to reset the module-level guard between test cases. */
export function __resetShutdownForTests(): void {
  shuttingDown = false
}
