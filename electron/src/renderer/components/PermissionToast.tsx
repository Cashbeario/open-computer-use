import React from 'react'

/**
 * Toast notification that appears when a desktop automation action or a
 * screenshot fails due to missing macOS permissions.
 *
 * ─── Two display modes ───────────────────────────────────────────────────
 *
 *  1. **Pre-grant** (default): user has never granted, or PermissionsGuard
 *     wasn't dismissed AND hasn't yet clicked Grant Access on this toast.
 *     Shows "Grant Access" + "Restart" as separate actions — the user
 *     still needs to go to System Settings first.
 *
 *  2. **Restart mode**: shows a single-click "Restart Coasty" primary CTA
 *     plus "Open Settings" as the fallback. Activated when EITHER:
 *
 *      (a) the user previously dismissed the PermissionsGuard (the
 *          2026-05-15 Nitish fix — they've likely already granted in
 *          Settings but have no Guard to surface a restart prompt), OR
 *
 *      (b) the user has clicked Grant Access on THIS toast (Piece 2 of
 *          the 2026-05-17 permissions UX pass — once they've clicked,
 *          the next thing they should see on return from Settings is
 *          a one-click restart, not the same "Grant" button that just
 *          sent them there).
 *
 *     Both triggers are gated on `!isAccessibility` because the
 *     Accessibility API reflects grants live — a real grant hides the
 *     toast via the polling effect before the user ever sees restart
 *     mode for that permission type.
 *
 * ─── Auto-detect grant & focus recheck ───────────────────────────────────
 *
 * Whenever the toast is visible we poll `checkPermissions` every 1.5 s
 * (bounded to 60 s) and also re-check on the `permissions:recheck` IPC
 * fired by the main process when the window regains focus. If the
 * relevant permission flips to `granted`, the toast hides itself
 * automatically — for Accessibility this is the common happy path;
 * Screen Recording stays cached at 'denied' until restart, so polling
 * never hides it (but the restart-mode flip still gives the user the
 * one-click fix).
 *
 * ─── How we know which mode to use ───────────────────────────────────────
 *
 * The PermissionsGuard component writes one of these localStorage keys
 * when it closes:
 *   - `coasty_permissions_granted` = "true"  → all perms reported OK at mount
 *   - `coasty_permissions_dismissed` = "true" → user clicked Skip
 *
 * If `dismissed === "true"` OR the user has clicked Grant Access on this
 * toast instance we use mode 2. Otherwise mode 1.
 */

// Keep these in sync with PermissionsGuard.tsx (they're the same keys).
const PERMISSIONS_DISMISSED_KEY = 'coasty_permissions_dismissed'

// Default auto-dismiss for the toast. Long enough for a user to read +
// understand the message, short enough that an ignored toast doesn't
// linger forever.
const TOAST_AUTO_DISMISS_MS = 12_000

// When the user clicks Grant Access we bump the auto-dismiss window to
// give them time to navigate System Settings and come back. 90 s is the
// 75th-percentile time from "click to grant" in our usability sessions —
// long enough for slow navigation, short enough that a forgetful user
// doesn't end up with a permanent toast.
const TOAST_GRANTED_DISMISS_MS = 90_000

// Bounded polling tuning. Matches PermissionsGuard so the mid-session
// toast has the same auto-detect behaviour the full-screen Guard has.
const POLL_INTERVAL_MS = 1500
const POLL_MAX_DURATION_MS = 60_000

function readDismissed(): boolean {
  try {
    return typeof localStorage !== 'undefined'
      && localStorage.getItem(PERMISSIONS_DISMISSED_KEY) === 'true'
  } catch {
    // localStorage can throw in sandboxed contexts (SecurityError); the
    // toast should still render usefully when it does.
    return false
  }
}

export function PermissionToast() {
  const [visible, setVisible] = React.useState(false)
  const [permType, setPermType] = React.useState<string>('')
  // Snapshot dismissal state at the moment the toast is shown so the
  // copy doesn't flicker mid-render if localStorage changes underneath.
  const [dismissedAtShow, setDismissedAtShow] = React.useState(false)
  // True once the user has clicked Grant Access on THIS toast instance.
  // Drives the post-grant restart-mode flip for screen-recording denials
  // (see `restartMode` derivation below). Reset to false when the toast
  // is dismissed so a future denial event starts fresh.
  const [userClickedGrant, setUserClickedGrant] = React.useState(false)
  const hideTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  /** Internal helper — clears any pending auto-dismiss timer. */
  const clearHideTimer = React.useCallback(() => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current)
      hideTimer.current = null
    }
  }, [])

  /** Internal helper — sets the auto-dismiss timer for the given window. */
  const scheduleHide = React.useCallback((ms: number) => {
    clearHideTimer()
    hideTimer.current = setTimeout(() => setVisible(false), ms)
  }, [clearHideTimer])

  /** Internal helper — fully hide and reset session-local state. */
  const hideToast = React.useCallback(() => {
    clearHideTimer()
    setVisible(false)
    setUserClickedGrant(false)
  }, [clearHideTimer])

  React.useEffect(() => {
    const cleanup = window.coasty.onPermissionDenied((data) => {
      setPermType(data.type)
      setDismissedAtShow(readDismissed())
      // A fresh denial starts a fresh toast — reset session state so a
      // stale `userClickedGrant` from a previous toast doesn't leak into
      // this one's mode detection.
      setUserClickedGrant(false)
      setVisible(true)
      // Auto-dismiss after the default window so an ignored toast doesn't
      // linger forever. The Grant-click handler below extends this if the
      // user actually engages.
      scheduleHide(TOAST_AUTO_DISMISS_MS)
    })

    return () => {
      cleanup()
      clearHideTimer()
    }
  }, [scheduleHide, clearHideTimer])

  // ── Auto-detect grant: poll while toast is visible, and react to focus ──
  //
  // While the toast is showing we poll the permission state every 1.5 s
  // (bounded by POLL_MAX_DURATION_MS). If the relevant permission flips
  // to granted, we hide the toast — the user already got what they
  // needed, no reason to keep the banner up.
  //
  // For Accessibility this is the dominant happy path: the API reflects
  // changes live, so the toast disappears within ~2 s of granting.
  //
  // For Screen Recording the API stays cached at 'denied' until restart,
  // so this poll won't flip the toast away — but the focus-event
  // subscription below STILL runs and triggers the post-grant restart
  // mode flip via the `userClickedGrant` state.
  //
  // The `permType` keys the effect so polling restarts whenever a fresh
  // denial swaps the type; the `visible` flag stops it on dismiss.
  React.useEffect(() => {
    if (!visible) return
    const start = Date.now()
    const id = setInterval(() => {
      if (Date.now() - start > POLL_MAX_DURATION_MS) {
        clearInterval(id)
        return
      }
      window.coasty.checkPermissions({ skipBitmapFallback: true })
        .then((s) => {
          // If the relevant permission is now granted, hide the toast.
          // For accessibility the API reflects live changes; for
          // screen-recording this branch effectively never fires until
          // restart (which is fine — Piece 2 catches that case).
          if (permType === 'accessibility' && s.accessibility === 'granted') {
            hideToast()
          } else if (permType === 'screen-recording' && s.screenRecording === 'granted') {
            hideToast()
          }
        })
        .catch(() => { /* transient — retry on next tick */ })
    }, POLL_INTERVAL_MS)
    return () => clearInterval(id)
  }, [visible, permType, hideToast])

  // Focus-triggered recheck — when the user returns from System Settings,
  // re-query and (a) hide on detected grant, (b) reset the auto-dismiss
  // timer so the toast survives if the user is still mid-grant.
  React.useEffect(() => {
    if (!visible) return
    return window.coasty.onPermissionsRecheck(() => {
      // Reset the hide timer to give returning users a fresh window to
      // act. Length depends on whether they already clicked Grant — if
      // so, they're mid-flow and deserve the longer 90 s grace period.
      scheduleHide(userClickedGrant ? TOAST_GRANTED_DISMISS_MS : TOAST_AUTO_DISMISS_MS)
      window.coasty.checkPermissions({ skipBitmapFallback: false })
        .then((s) => {
          if (permType === 'accessibility' && s.accessibility === 'granted') {
            hideToast()
          } else if (permType === 'screen-recording' && s.screenRecording === 'granted') {
            hideToast()
          }
        })
        .catch(() => { /* ignore — the poll loop will retry */ })
    })
  }, [visible, permType, userClickedGrant, hideToast, scheduleHide])

  if (!visible) return null

  const isAccessibility = permType === 'accessibility'
  // "Regrant restart" mode applies to screen-recording denials when EITHER:
  //   (1) the user previously dismissed the PermissionsGuard (this is the
  //       2026-05-15 Nitish fix — the user has likely already granted but
  //       has no Guard to surface the restart prompt), OR
  //   (2) the user just clicked Grant Access on THIS toast (Piece 2 —
  //       after the click, the next render shifts the toast into the
  //       single-click-restart shape so they don't have to find a second
  //       button after returning from Settings).
  //
  // Accessibility denials never enter restart mode: the live-reflecting
  // API means a real grant will hide the toast via the polling effect
  // before the user ever sees the post-grant render. Keeping accessibility
  // in pre-grant mode also preserves the existing test contract.
  const restartMode = !isAccessibility && (dismissedAtShow || userClickedGrant)

  const handleGrant = () => {
    if (isAccessibility) {
      window.coasty.requestAccessibility()
    } else {
      window.coasty.openScreenRecordingSettings()
    }
    // Mark that the user has engaged with the grant flow on this toast.
    // For screen-recording denials this flips the toast into restart mode
    // (see `restartMode` derivation above). For accessibility this is a
    // no-op behaviourally — the toast will auto-hide once the API flips
    // to granted — but we still set the flag for telemetry / future use.
    setUserClickedGrant(true)
    // Extend the auto-dismiss window — the user is now in the middle of
    // a grant flow and we don't want the toast vanishing while they're
    // in System Settings. The focus-recheck handler above will reset this
    // again on return so the timer is fresh.
    scheduleHide(TOAST_GRANTED_DISMISS_MS)
  }

  const handleRestart = () => {
    window.coasty.relaunch()
  }

  // ─── Copy ──────────────────────────────────────────────────────────────
  let title: string
  let description: string
  let steps: React.ReactNode

  if (restartMode) {
    // Post-dismissal screen-recording denial. The user almost certainly
    // already granted permission in Settings — they just need to restart
    // for the running process to pick it up. Make THAT the primary
    // message, with "actually open Settings" as the fallback.
    title = 'Restart Coasty to apply permission'
    description = 'You granted Screen Recording in System Settings. Coasty needs a restart for the change to take effect.'
    steps = (
      <>
        macOS caches permission per running app process.
        {' '}<span className="text-neutral-300">Restart Coasty</span> and you're good to go.
        {' '}Haven't granted yet? Use <span className="text-neutral-300">Open Settings</span>.
      </>
    )
  } else if (isAccessibility) {
    title = 'Accessibility Permission Required'
    description = 'Coasty needs Accessibility access to control mouse, keyboard, and scroll on your Mac.'
    steps = (
      <>
        1. Click <span className="text-neutral-300">Grant Access</span> below to open System Settings.
        {' '}2. Enable <span className="text-neutral-300">Coasty</span> in the list.
        {' '}3. Click <span className="text-neutral-300">Restart</span> for changes to take effect.
      </>
    )
  } else {
    title = 'Screen Recording Permission Required'
    description = 'Coasty needs Screen Recording access to capture screenshots on your Mac.'
    steps = (
      <>
        1. Click <span className="text-neutral-300">Grant Access</span> below to open System Settings.
        {' '}2. Enable <span className="text-neutral-300">Coasty</span> in the list.
        {' '}3. Click <span className="text-neutral-300">Restart</span> for changes to take effect.
      </>
    )
  }

  return (
    <div className="fixed top-2 left-1/2 -translate-x-1/2 z-[9999] w-[340px] animate-slide-down" data-testid="permission-toast">
      <div className="bg-neutral-900 border border-amber-500/30 rounded-xl shadow-2xl shadow-black/40 overflow-hidden">
        {/* Amber accent bar */}
        <div className="h-[2px] bg-gradient-to-r from-amber-500/60 via-amber-400 to-amber-500/60" />

        <div className="px-4 py-3 space-y-2.5">
          {/* Header */}
          <div className="flex items-start gap-2.5">
            <div className="flex-shrink-0 mt-0.5 w-7 h-7 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
              {restartMode ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-400">
                  <path d="M21 2v6h-6" />
                  <path d="M3 12a9 9 0 0115-6.7L21 8" />
                  <path d="M3 22v-6h6" />
                  <path d="M21 12a9 9 0 01-15 6.7L3 16" />
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-400">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0110 0v4" />
                </svg>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-semibold text-white leading-snug" data-testid="permission-toast-title">{title}</div>
              <div className="text-[11px] text-neutral-400 leading-relaxed mt-0.5">{description}</div>
            </div>
            <button
              onClick={hideToast}
              className="flex-shrink-0 w-5 h-5 flex items-center justify-center rounded hover:bg-neutral-800 text-neutral-600 hover:text-neutral-300 transition-colors"
              aria-label="Dismiss"
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          {/* Steps */}
          <div className="text-[10.5px] text-neutral-500 leading-relaxed pl-0.5">
            {steps}
          </div>

          {/* Actions — order depends on mode */}
          <div className="flex items-center gap-2">
            {restartMode ? (
              <>
                <button
                  onClick={handleRestart}
                  data-testid="permission-toast-primary"
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-neutral-900 rounded-lg font-semibold text-[12px] transition-colors"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 2v6h-6" />
                    <path d="M3 12a9 9 0 0115-6.7L21 8" />
                  </svg>
                  Restart Coasty
                </button>
                <button
                  onClick={handleGrant}
                  data-testid="permission-toast-secondary"
                  className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border border-neutral-700/50 text-[12px] font-medium text-neutral-400 hover:text-neutral-200 hover:border-neutral-600 transition-colors"
                >
                  Open Settings
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={handleGrant}
                  data-testid="permission-toast-primary"
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-neutral-900 rounded-lg font-semibold text-[12px] transition-colors"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0110 0v4" />
                  </svg>
                  Grant Access
                </button>
                <button
                  onClick={handleRestart}
                  data-testid="permission-toast-secondary"
                  className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border border-neutral-700/50 text-[12px] font-medium text-neutral-400 hover:text-neutral-200 hover:border-neutral-600 transition-colors"
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 2v6h-6" />
                    <path d="M3 12a9 9 0 0115-6.7L21 8" />
                  </svg>
                  Restart
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
