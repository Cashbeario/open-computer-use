import React from 'react'

type PermValue = 'granted' | 'denied' | 'not-applicable'

interface PermissionStatus {
  screenRecording: PermValue
  accessibility: PermValue
}

function allGranted(status: PermissionStatus): boolean {
  return (
    (status.screenRecording === 'granted' || status.screenRecording === 'not-applicable') &&
    (status.accessibility === 'granted' || status.accessibility === 'not-applicable')
  )
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-400">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

function XIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-red-400">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}

function PermissionRow({
  granted,
  title,
  description,
  actionLabel,
  onAction,
}: {
  granted: boolean
  title: string
  description: string
  actionLabel?: string
  onAction?: () => void
}) {
  return (
    <div className="flex items-start gap-2.5 px-3 py-2 rounded-lg bg-neutral-800/40 border border-neutral-700/30">
      <div className="mt-0.5 flex-shrink-0">
        {granted ? <CheckIcon /> : <XIcon />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[12.5px] font-medium text-neutral-200 truncate">{title}</div>
        <div className="text-[11px] text-neutral-500 leading-snug mt-0.5">{description}</div>
      </div>
      {!granted && actionLabel && onAction && (
        <button
          onClick={onAction}
          className="flex-shrink-0 mt-0.5 px-2.5 py-1 rounded-md bg-neutral-700/60 border border-neutral-600/40 text-[11px] font-medium text-neutral-300 hover:bg-neutral-700 hover:text-neutral-100 transition-colors whitespace-nowrap"
        >
          {actionLabel}
        </button>
      )}
    </div>
  )
}

const PERMISSIONS_DISMISSED_KEY = 'coasty_permissions_dismissed'
const PERMISSIONS_GRANTED_KEY = 'coasty_permissions_granted'

// Bounded polling tuning. While the Guard is visible the renderer
// re-queries the permission state every POLL_INTERVAL_MS. After
// POLL_MAX_DURATION_MS we stop polling to avoid burning CPU forever if
// the user walks away — the focus listener installed in the main process
// will resume re-checks when they come back.
//
// 1500 ms is a balance: fast enough that the row visibly greens within
// ~2 s of returning from Settings, slow enough that we're not pinging
// TCC 60 times per minute. 60 s is long enough that even a slow user
// navigating System Settings will be caught.
const POLL_INTERVAL_MS = 1500
const POLL_MAX_DURATION_MS = 60_000

// Window during which a recent "Open Settings" / "Grant" click is
// treated as evidence that the user has likely toggled the permission.
// If the API still reports denied within this window after a focus
// return, the Guard surfaces the "Detected likely grant — restart?"
// banner. 5 min mirrors typical Settings navigation patience.
const SETTINGS_OPENED_WINDOW_MS = 5 * 60 * 1000
const SETTINGS_OPENED_FOR_PERM_KEY = 'coasty_settings_opened_for_perm'

/**
 * Record that the user has clicked something that would take them to
 * System Settings for a permission grant. Stored in localStorage with a
 * timestamp so that even if the renderer reloads we still treat a fresh
 * grant as "likely happened" for SETTINGS_OPENED_WINDOW_MS.
 */
function markSettingsOpened(): void {
  try {
    localStorage.setItem(SETTINGS_OPENED_FOR_PERM_KEY, String(Date.now()))
  } catch { /* sandbox SecurityError — best effort */ }
}

/** Returns true if the user clicked Open Settings within the last window. */
function recentlyOpenedSettings(): boolean {
  try {
    const raw = localStorage.getItem(SETTINGS_OPENED_FOR_PERM_KEY)
    if (!raw) return false
    const ts = Number(raw)
    if (!Number.isFinite(ts)) return false
    return Date.now() - ts < SETTINGS_OPENED_WINDOW_MS
  } catch {
    return false
  }
}

export function PermissionsGuard({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = React.useState<PermissionStatus | null>(null)
  const [dismissed, setDismissed] = React.useState(() => {
    // If user previously dismissed or all permissions were granted, don't show again
    return localStorage.getItem(PERMISSIONS_DISMISSED_KEY) === 'true' ||
           localStorage.getItem(PERMISSIONS_GRANTED_KEY) === 'true'
  })
  const isMac = window.coasty.getPlatform() === 'darwin'

  /**
   * One source of truth for re-running the permission check. Wrapped in
   * useCallback so the focus listener and the polling effect share the
   * same identity-stable function reference and don't re-subscribe on
   * every render.
   *
   * The `fromPoll` flag is forwarded to the IPC so the main process
   * skips the expensive bitmap fallback during periodic re-checks. The
   * mount-time check and the focus-event re-check both pay the bitmap
   * cost (one shot each), so the precision/cost trade-off is honoured.
   */
  const runCheck = React.useCallback((opts: { fromPoll?: boolean } = {}) => {
    if (!isMac) return
    window.coasty.checkPermissions({ skipBitmapFallback: !!opts.fromPoll })
      .then((s) => {
        setStatus(s)
        // If all permissions are now granted, remember it permanently AND
        // clear the "user opened Settings" breadcrumb — it served its
        // purpose, no need to keep it around prompting on the next
        // unrelated denial.
        if (allGranted(s)) {
          try {
            localStorage.setItem(PERMISSIONS_GRANTED_KEY, 'true')
            localStorage.removeItem(SETTINGS_OPENED_FOR_PERM_KEY)
          } catch { /* sandbox SecurityError — best effort */ }
        }
      })
      .catch(() => {
        // Don't clobber the existing status with null on a transient IPC
        // hiccup — the previous render is more useful than a blank state.
        // The next poll tick / focus event will retry.
      })
  }, [isMac])

  // Initial mount: one authoritative check (bitmap fallback allowed).
  React.useEffect(() => {
    if (!isMac) return
    runCheck()
  }, [isMac, runCheck])

  // Subscribe to focus-triggered rechecks from the main process.
  // The main process debounces multi-fire focus storms into a single
  // event, so this handler doesn't need its own throttling. Each focus
  // event pays the bitmap cost (one shot) — that's intentional: a focus
  // return is a deliberate user signal, not a hot loop.
  React.useEffect(() => {
    if (!isMac) return
    return window.coasty.onPermissionsRecheck(() => runCheck())
  }, [isMac, runCheck])

  // Determine if we need to show the permissions guard
  const needsPermissions = isMac && status && !allGranted(status) && !dismissed
  const showGuard = needsPermissions === true

  // Bounded polling while the Guard is visible. Stops when:
  //   - the Guard is dismissed / unmounted
  //   - all permissions become granted (showGuard flips false)
  //   - POLL_MAX_DURATION_MS elapses (defense against the user walking
  //     away with the app open)
  //
  // Uses skipBitmapFallback=true so each tick costs only the two cheap
  // TCC reads — no desktopCapturer.getSources() invocation.
  React.useEffect(() => {
    if (!showGuard) return
    const start = Date.now()
    const id = setInterval(() => {
      if (Date.now() - start > POLL_MAX_DURATION_MS) {
        clearInterval(id)
        return
      }
      runCheck({ fromPoll: true })
    }, POLL_INTERVAL_MS)
    return () => clearInterval(id)
  }, [showGuard, runCheck])

  // Manage window mode: show auth-size window for the guard, compact for overlay
  React.useEffect(() => {
    if (showGuard) {
      window.coasty.setWindowMode('auth')
    } else {
      // Permissions OK, not applicable, not yet checked, or dismissed — go to compact
      window.coasty.setWindowMode('compact')
    }
  }, [showGuard])

  // If not showing guard, always render children (the overlay)
  if (!showGuard) return <>{children}</>

  const screenOk = status!.screenRecording === 'granted'
  const accessOk = status!.accessibility === 'granted'

  // ── Restart banner heuristic ────────────────────────────────────────────
  //
  // Screen Recording is the one permission whose macOS API does NOT reflect
  // a fresh grant without a process restart (see permissions.ts comment
  // about electron/electron#36722). If the user has recently clicked
  // "Open Settings" AND Screen Recording is still reported as denied, the
  // most likely explanation is that they DID grant it and are now waiting
  // for the app to notice — surface a one-click restart prompt above the
  // rows so they don't have to figure that out on their own.
  //
  // We deliberately gate on `!screenOk` rather than "user-clicked AND
  // anything denied", because Accessibility doesn't have the same cache
  // problem — if Accessibility is still denied after a Settings trip the
  // user genuinely hasn't toggled it yet, and we should keep the per-row
  // "Grant" button as the primary CTA, not flip them into a restart loop.
  const likelyGrantedNeedsRestart = !screenOk && recentlyOpenedSettings()

  return (
    <div className="flex flex-col h-screen bg-neutral-950 rounded-xl overflow-hidden">
      {/* Draggable title bar */}
      <div className="titlebar-drag flex items-center justify-between px-4 py-2 flex-shrink-0">
        <span className="text-[11px] text-neutral-600 font-medium">Coasty Desktop</span>
        <div className="titlebar-no-drag flex items-center gap-1">
          <button
            onClick={() => { localStorage.setItem(PERMISSIONS_DISMISSED_KEY, 'true'); setDismissed(true) }}
            className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-neutral-800 text-neutral-500 hover:text-neutral-300 transition-colors"
            title="Skip"
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex flex-col flex-1 px-5 pb-4 overflow-y-auto">
        <div className="w-full max-w-sm mx-auto flex flex-col gap-3.5">
          {/* Header */}
          <div className="text-center flex flex-col items-center gap-1.5 pt-1">
            <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-amber-500/10 border border-amber-500/20">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-amber-400">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0110 0v4" />
              </svg>
            </div>
            <h2 className="text-base font-semibold text-white">Permissions Required</h2>
            <p className="text-[11.5px] text-neutral-500 leading-snug px-2">
              Coasty needs macOS permissions to take screenshots, move the mouse, and type.
            </p>
          </div>

          {/* Detected-likely-grant restart banner.
              Rendered above the rows so a returning user sees it first.
              Single-click "Restart now" — no "did you grant it?" toggle
              loop, because the heuristic for showing this banner already
              encodes "user clicked Open Settings recently, API still says
              denied". If the user actually didn't grant it yet, the per-row
              "Open Settings" button below remains available. */}
          {likelyGrantedNeedsRestart && (
            <div
              className="flex items-start gap-2.5 px-3 py-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30"
              data-testid="permissions-guard-restart-banner"
            >
              <div className="mt-0.5 flex-shrink-0">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-400">
                  <path d="M21 2v6h-6" />
                  <path d="M3 12a9 9 0 0115-6.7L21 8" />
                  <path d="M3 22v-6h6" />
                  <path d="M21 12a9 9 0 01-15 6.7L3 16" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[12.5px] font-medium text-amber-200">
                  Granted? Restart to apply
                </div>
                <div className="text-[11px] text-amber-200/70 leading-snug mt-0.5">
                  macOS caches Screen Recording permission per process. Restart Coasty for the change to take effect.
                </div>
              </div>
              <button
                onClick={() => {
                  try {
                    localStorage.removeItem(PERMISSIONS_DISMISSED_KEY)
                    localStorage.removeItem(PERMISSIONS_GRANTED_KEY)
                    localStorage.removeItem(SETTINGS_OPENED_FOR_PERM_KEY)
                  } catch { /* sandbox SecurityError — best effort */ }
                  window.coasty.relaunch()
                }}
                className="flex-shrink-0 mt-0.5 px-2.5 py-1 rounded-md bg-amber-500 hover:bg-amber-400 text-neutral-900 text-[11px] font-semibold transition-colors whitespace-nowrap"
              >
                Restart now
              </button>
            </div>
          )}

          {/* Permission rows */}
          <div className="flex flex-col gap-1.5">
            <PermissionRow
              granted={screenOk}
              title="Screen Recording"
              description="Take screenshots so the AI can see your screen."
              actionLabel="Open Settings"
              onAction={() => {
                // Breadcrumb: record that the user has likely just headed off
                // to grant the permission. The Guard's restart-banner heuristic
                // keys on this combined with a still-denied API status to
                // surface the one-click restart CTA on focus return.
                markSettingsOpened()
                window.coasty.openScreenRecordingSettings()
              }}
            />

            <PermissionRow
              granted={accessOk}
              title="Accessibility"
              description="Mouse clicks, keyboard input, and window control."
              actionLabel="Grant"
              onAction={() => {
                // Accessibility doesn't have the TCC-cache problem, so the
                // breadcrumb is informational only — even without it, the
                // poll / focus recheck will flip the row green within a
                // couple of seconds. We still mark it so the renderer has
                // a consistent "user has interacted with permissions" signal.
                markSettingsOpened()
                window.coasty.requestAccessibility()
              }}
            />
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => { localStorage.removeItem(PERMISSIONS_DISMISSED_KEY); localStorage.removeItem(PERMISSIONS_GRANTED_KEY); window.coasty.relaunch() }}
              className="flex-1 min-w-0 flex items-center justify-center gap-1.5 px-3 py-2 bg-white text-neutral-900 rounded-lg font-medium text-[13px] hover:bg-neutral-100 transition-colors whitespace-nowrap"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
                <path d="M21 2v6h-6" />
                <path d="M3 12a9 9 0 0115-6.7L21 8" />
                <path d="M3 22v-6h6" />
                <path d="M21 12a9 9 0 01-15 6.7L3 16" />
              </svg>
              <span className="truncate">Restart &amp; Recheck</span>
            </button>
            <button
              onClick={() => { localStorage.setItem(PERMISSIONS_DISMISSED_KEY, 'true'); setDismissed(true) }}
              className="flex-shrink-0 px-3.5 py-2 rounded-lg border border-neutral-700/50 text-[13px] text-neutral-400 hover:text-neutral-200 hover:border-neutral-600 transition-colors whitespace-nowrap"
            >
              Skip
            </button>
          </div>

          <p className="text-[10px] text-neutral-600 text-center leading-snug">
            Restart the app after granting permissions.
          </p>
        </div>
      </div>
    </div>
  )
}
