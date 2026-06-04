/**
 * Popup-safe "open authorization in a new tab" helper.
 *
 * The Composio OAuth flow is two async steps: POST /connect → receive a
 * `redirect_url` → send the browser there. If we waited for the POST to
 * resolve and *then* called `window.open(redirect_url)`, most browsers would
 * treat it as a programmatic (non-user-gesture) popup and BLOCK it, because
 * the transient user activation from the click is consumed/expired across the
 * `await`.
 *
 * The reliable pattern — implemented here — is:
 *   1. Synchronously open a blank tab *inside the click handler* (still within
 *      the user-activation window) and hold the reference.
 *   2. After the POST resolves, point that already-open tab at the real URL.
 *   3. If the POST fails, close the blank tab so the user isn't left with a
 *      dangling `about:blank`.
 *
 * If the synchronous open is itself blocked (aggressive popup blockers,
 * embedded webviews), `blocked` is true and the caller should fall back to a
 * plain anchor the user can click directly (a direct click is never blocked).
 *
 * Security: we sever `opener` on the new tab so the cross-origin Composio page
 * cannot navigate our tab back via `window.opener` (reverse tab-nabbing). We
 * can't pass `noopener` to `window.open` because that makes it return `null`,
 * which would defeat step 2.
 */
export interface AuthTab {
  /** True when the browser refused to open the tab (popup blocked / no DOM). */
  readonly blocked: boolean
  /** Point the held tab at `url`. No-op when blocked. */
  navigate(url: string): void
  /** Close the held tab (e.g. when the connect request failed). No-op when blocked. */
  close(): void
}

export function openAuthTab(): AuthTab {
  let win: Window | null = null

  if (typeof window !== "undefined" && typeof window.open === "function") {
    try {
      win = window.open("about:blank", "_blank")
    } catch {
      win = null
    }
    if (win) {
      // Sever the opener link while the tab is still same-origin (about:blank)
      // so the soon-to-be cross-origin Composio page can't reach back into us.
      try {
        ;(win as { opener: unknown }).opener = null
      } catch {
        // Some engines make `opener` read-only; the worst case is a still-set
        // opener on a trusted Composio domain, which is acceptable.
      }
    }
  }

  return {
    blocked: win === null,
    navigate(url: string) {
      if (!win) return
      try {
        win.location.href = url
      } catch {
        // Tab was closed by the user between open and navigate — ignore.
      }
    },
    close() {
      if (!win) return
      try {
        win.close()
      } catch {
        // Already closed — ignore.
      }
    },
  }
}
