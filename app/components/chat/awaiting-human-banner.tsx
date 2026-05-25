"use client"

import { cn } from "@/lib/utils"
import {
  HandPalm,
  Play,
  Desktop,
  CheckCircle,
  CircleNotch,
  Copy,
  Warning,
} from "@phosphor-icons/react"
import { useTranslations } from "next-intl"
import { useState, useEffect, useCallback } from "react"

interface AwaitingHumanBannerProps {
  reason: string
  machineId: string
  since?: number
  /** True while the SSE stream is still open (agent is actively waiting) */
  isActive?: boolean
  /**
   * Tight layout for narrow surfaces (e.g. 280px-wide player cards in the
   * Machines view). Stacks the two action buttons vertically and shrinks
   * paddings / type sizes. Falls back to the spacious full layout when
   * unset / false (chat panel, swarm-tree step cards).
   */
  compact?: boolean
  className?: string
}

/**
 * Fallback text used when the agent didn't include a `reason` (or sent an
 * empty / whitespace-only one). Anything is better than a silent banner —
 * users need to know SOMETHING is being asked of them.
 */
const DEFAULT_REASON = "Human intervention requested. Open the desktop to investigate, then click Done."

/**
 * Resolve a noVNC URL for the given machine and try to open it in a new tab.
 *
 * Returns a structured result so callers can show a popup-blocked fallback
 * (the browser silently refuses ``window.open`` when not in a user gesture,
 * or when a popup blocker is active — and the user has no way to know
 * unless we tell them). Shape:
 *   - ``{ ok: true, url }`` — popup opened (or appears to have)
 *   - ``{ ok: false, url, reason }`` — popup was blocked / no IP / etc.,
 *      the URL is returned so the UI can offer Copy-to-Clipboard
 */
export type VncOpenResult =
  | { ok: true; url: string }
  | { ok: false; url: string; reason: string }

async function openVncForMachine(machineId: string): Promise<VncOpenResult> {
  let res: Response
  try {
    res = await fetch(`/api/machines/${machineId}`)
  } catch (e) {
    const fallback = `/machines?id=${machineId}`
    const opened = window.open(fallback, "_blank")
    return opened
      ? { ok: true, url: fallback }
      : { ok: false, url: fallback, reason: "Popup blocked" }
  }
  if (!res.ok) {
    const fallback = `/machines?id=${machineId}`
    const opened = window.open(fallback, "_blank")
    return opened
      ? { ok: true, url: fallback }
      : { ok: false, url: fallback, reason: "Popup blocked" }
  }
  const data = await res.json()
  const machine = data.machine || data

  const ip = machine.publicIpAddress || machine.public_ip_address
  if (!ip) {
    const fallback = `/machines?id=${machineId}`
    const opened = window.open(fallback, "_blank")
    return opened
      ? { ok: true, url: fallback }
      : { ok: false, url: fallback, reason: "Popup blocked" }
  }

  const port = machine.websocketPort || machine.websocket_port || 6080
  // VNC protocol truncates passwords to 8 chars (TightVNC)
  const password = (machine.vncPassword || machine.vnc_password || "").substring(0, 8)
  const encoded = encodeURIComponent(password)
  const url = `http://${ip}:${port}/vnc.html?autoconnect=1&resize=scale&password=${encoded}`
  const opened = window.open(url, "_blank")
  return opened
    ? { ok: true, url }
    : { ok: false, url, reason: "Popup blocked" }
}

// Exported for unit testing without spinning up the DOM. Keep in sync with
// the function above's signature.
export const __test_openVncForMachine = openVncForMachine

export function AwaitingHumanBanner({
  reason,
  machineId,
  since,
  isActive,
  compact = false,
  className,
}: AwaitingHumanBannerProps) {
  const t = useTranslations("chat.awaitingHuman")
  const [elapsed, setElapsed] = useState(0)
  const [resuming, setResuming] = useState(false)
  const [resumed, setResumed] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [connectError, setConnectError] = useState<{
    url: string
    reason: string
  } | null>(null)
  const [urlCopied, setUrlCopied] = useState(false)

  useEffect(() => {
    if (!isActive) return
    const start = since || Date.now()
    const tick = () => setElapsed(Math.floor((Date.now() - start) / 1000))
    tick()
    const interval = setInterval(tick, 1000)
    return () => clearInterval(interval)
  }, [since, isActive])

  // Defensive: agent might emit empty/missing reason. A blank banner is
  // worse than a generic one because the user can't tell what they're
  // being asked to do.
  const displayReason = (reason && reason.trim()) || DEFAULT_REASON

  const handleResume = useCallback(async () => {
    if (resuming) return
    if (!machineId) {
      // Machine ID didn't make it through the event pipeline (bug or stale
      // history view). Surface explicitly instead of no-op so the user
      // knows the page is bad and to refresh, vs the click being lost.
      setConnectError({
        url: "",
        reason: "Machine ID missing — try refreshing the page",
      })
      return
    }
    setResuming(true)
    try {
      const res = await fetch(`/api/chat/resume-human/${machineId}`, {
        method: "POST",
      })
      if (res.ok) {
        setResumed(true)
      } else {
        const text = await res.text().catch(() => "")
        console.error("Failed to resume:", text)
        setConnectError({
          url: "",
          reason: `Resume failed: ${res.status} ${text.slice(0, 80) || res.statusText}`,
        })
        setResuming(false)
      }
    } catch (err) {
      console.error("Resume error:", err)
      setConnectError({
        url: "",
        reason: `Resume error: ${err instanceof Error ? err.message : String(err)}`,
      })
      setResuming(false)
    }
  }, [machineId, resuming])

  const handleConnect = useCallback(async () => {
    if (connecting) return
    if (!machineId) {
      setConnectError({
        url: "",
        reason: "Machine ID missing — try refreshing the page",
      })
      return
    }
    setConnecting(true)
    setConnectError(null)
    try {
      const result = await openVncForMachine(machineId)
      if (!result.ok) {
        setConnectError({ url: result.url, reason: result.reason })
      }
    } catch (err) {
      console.error("Connect error:", err)
      setConnectError({
        url: "",
        reason: `Connect error: ${err instanceof Error ? err.message : String(err)}`,
      })
    } finally {
      setConnecting(false)
    }
  }, [machineId, connecting])

  const handleCopyUrl = useCallback(async () => {
    if (!connectError?.url) return
    try {
      await navigator.clipboard.writeText(connectError.url)
      setUrlCopied(true)
      setTimeout(() => setUrlCopied(false), 2000)
    } catch (e) {
      console.warn("Failed to copy VNC URL:", e)
    }
  }, [connectError])

  const mins = Math.floor(elapsed / 60)
  const secs = elapsed % 60
  const timeStr = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`

  // ── Completed state (agent already resumed — viewing history) ──
  if (!isActive || resumed) {
    return (
      <div
        className={cn(
          "flex items-center rounded-xl border",
          compact ? "gap-2 px-2.5 py-1.5" : "gap-2.5 px-3.5 py-2",
          "border-zinc-200/50 bg-zinc-500/[0.03]",
          "dark:border-zinc-700/50 dark:bg-zinc-400/[0.03]",
          className,
        )}
      >
        <CheckCircle
          className={cn(
            "shrink-0 text-emerald-500",
            compact ? "size-3.5" : "size-4"
          )}
          weight="fill"
        />
        <span
          className={cn(
            "text-zinc-500 dark:text-zinc-400",
            compact ? "text-[11px]" : "text-xs"
          )}
        >
          {t("completed")}
        </span>
      </div>
    )
  }

  // ── Active state (agent is currently waiting for human) ──
  return (
    <div
      data-testid="awaiting-human-banner"
      className={cn(
        "flex flex-col rounded-2xl border bg-gradient-to-b",
        compact ? "gap-2 px-3 py-2.5 rounded-xl" : "gap-3 px-4 py-3.5",
        "border-amber-300/70 from-amber-50/80 to-amber-50/40",
        "dark:border-amber-600/40 dark:from-amber-950/30 dark:to-amber-950/10",
        className,
      )}
    >
      {/* Header */}
      <div className={cn("flex items-start", compact ? "gap-2" : "gap-3")}>
        <div className="relative mt-0.5 shrink-0">
          <HandPalm
            className={cn(
              "text-amber-500 dark:text-amber-400",
              compact ? "size-4" : "size-5"
            )}
            weight="fill"
          />
          <span className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-amber-400 animate-pulse" />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "font-semibold text-amber-800 dark:text-amber-200",
                compact ? "text-[12px]" : "text-[13px]"
              )}
            >
              {t("yourTurn")}
            </span>
            <span className="text-[10px] tabular-nums text-amber-500/70 dark:text-amber-400/50">
              {timeStr}
            </span>
          </div>
          <p
            className={cn(
              "leading-relaxed text-amber-700/90 dark:text-amber-300/80 line-clamp-3",
              compact ? "text-[11.5px]" : "text-[12.5px]"
            )}
            title={displayReason.length > 80 ? displayReason : undefined}
          >
            {displayReason}
          </p>
        </div>
      </div>

      {/* Popup-blocked fallback — shows when window.open returned null
          (browser blocked the popup, or non-user-gesture context). Surfaces
          the URL with a copy-to-clipboard option so the user can paste it
          into a new tab manually. */}
      {connectError && (
        <div
          role="alert"
          className={cn(
            "flex items-center gap-2 rounded-lg border border-amber-300/60 bg-white/60 px-2.5 py-1.5 dark:bg-amber-950/30",
            compact ? "text-[10.5px]" : "text-[11px]"
          )}
        >
          <Warning
            className="size-3 text-amber-600 dark:text-amber-400 shrink-0"
            weight="fill"
          />
          <span className="text-amber-700 dark:text-amber-300 truncate flex-1">
            {connectError.url ? `${connectError.reason} — copy URL?` : connectError.reason}
          </span>
          {connectError.url && (
            <button
              type="button"
              onClick={handleCopyUrl}
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-amber-700 dark:text-amber-300 hover:bg-amber-500/15 transition-colors shrink-0"
            >
              {urlCopied ? (
                <>
                  <CheckCircle className="size-3" weight="fill" /> Copied
                </>
              ) : (
                <>
                  <Copy className="size-3" /> Copy URL
                </>
              )}
            </button>
          )}
        </div>
      )}

      {/* Action buttons.
          - Full mode: side-by-side, indented past the icon column.
          - Compact mode (280px-wide player cards): stacked vertically so each
            button gets a full-width tap target and the labels don't wrap.
            Primary action on top — "Done, Continue" is the success path. */}
      <div
        className={cn(
          "flex",
          compact
            ? "flex-col-reverse gap-1.5"
            : "flex-row items-stretch gap-2.5 pl-8"
        )}
      >
        <button
          type="button"
          onClick={handleConnect}
          disabled={connecting}
          className={cn(
            "flex items-center justify-center gap-2 rounded-lg border font-medium transition-all",
            compact ? "px-2.5 py-1.5 text-[12px]" : "flex-1 px-3 py-2 text-[13px]",
            "border-zinc-200/80 bg-white text-zinc-700 shadow-sm",
            "hover:bg-zinc-50 hover:border-zinc-300",
            "dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200",
            "dark:hover:bg-zinc-700 dark:hover:border-zinc-500",
            connecting && "opacity-60 cursor-not-allowed",
          )}
        >
          {connecting ? (
            <CircleNotch
              className={cn(compact ? "size-3.5" : "size-4", "animate-spin")}
            />
          ) : (
            <Desktop className={compact ? "size-3.5" : "size-4"} />
          )}
          {t("connectToDesktop")}
        </button>
        <button
          type="button"
          onClick={handleResume}
          disabled={resuming}
          className={cn(
            "flex items-center justify-center gap-2 rounded-lg border font-medium transition-all",
            compact ? "px-2.5 py-1.5 text-[12px]" : "flex-1 px-3 py-2 text-[13px]",
            "border-amber-400/80 bg-amber-500 text-white shadow-sm",
            "hover:bg-amber-600 hover:border-amber-500",
            "dark:border-amber-500/60 dark:bg-amber-600 dark:text-amber-50",
            "dark:hover:bg-amber-500",
            resuming && "opacity-60 cursor-not-allowed",
          )}
        >
          {resuming ? (
            <CircleNotch
              className={cn(compact ? "size-3.5" : "size-4", "animate-spin")}
            />
          ) : (
            <Play className={compact ? "size-3.5" : "size-4"} weight="fill" />
          )}
          {resuming ? t("resuming") : t("doneContinue")}
        </button>
      </div>
    </div>
  )
}
