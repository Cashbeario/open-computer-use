/**
 * Platform mode — which "face" of Coasty the user is in:
 *
 *   - "consumer":  the default app (chat, agents, automation)
 *   - "developer": the developer / API platform
 *
 * This store is the single source of truth for the current mode and backs
 * the sidebar mode switcher. The actual surfaces behind each mode are wired
 * up elsewhere; flipping the mode here is intentionally side-effect free so
 * it can never half-navigate the app.
 *
 * The choice is persisted to localStorage so it survives reloads (it is
 * restored per tab on load; it does not live-sync between already-open tabs,
 * which would need a `storage` event listener). The store hydrates eagerly at
 * import on the client, so any consumer that reads `mode` during an SSR render
 * must gate on mount to avoid a hydration mismatch. Every read path is
 * defended against corrupted / hand-edited / future-shaped storage: anything
 * that isn't one of the two known modes collapses to the default rather than
 * rendering a broken UI.
 */

import { create } from "zustand"
import { persist } from "zustand/middleware"

export type PlatformMode = "consumer" | "developer"

export const PLATFORM_MODES = ["consumer", "developer"] as const
export const DEFAULT_PLATFORM_MODE: PlatformMode = "consumer"
export const PLATFORM_MODE_STORAGE_KEY = "coasty:platform-mode"

/**
 * Runtime guard — the ONLY values we ever trust as a mode. Used both when
 * accepting external input (`setMode`) and when rehydrating from storage.
 */
export function isPlatformMode(value: unknown): value is PlatformMode {
  return value === "consumer" || value === "developer"
}

interface PlatformModeState {
  mode: PlatformMode
  /**
   * Set the mode. Invalid values are ignored (defensive against callers that
   * pass through unchecked input); setting the current mode is a no-op so
   * subscribers don't re-render needlessly.
   */
  setMode: (mode: PlatformMode) => void
  /** Flip between the two modes. */
  toggleMode: () => void
  /** Reset to the default mode. */
  resetMode: () => void
}

export const usePlatformMode = create<PlatformModeState>()(
  persist(
    (set, get) => ({
      mode: DEFAULT_PLATFORM_MODE,
      setMode: (mode) => {
        if (!isPlatformMode(mode)) return
        if (get().mode === mode) return
        set({ mode })
      },
      toggleMode: () =>
        set({ mode: get().mode === "developer" ? "consumer" : "developer" }),
      resetMode: () => set({ mode: DEFAULT_PLATFORM_MODE }),
    }),
    {
      name: PLATFORM_MODE_STORAGE_KEY,
      version: 1,
      // Persist only the mode — never the action functions.
      partialize: (state) => ({ mode: state.mode }),
      // Forward-compat: if a future `version` bump makes the persisted version
      // differ from the one above, validate-and-preserve the mode rather than
      // letting zustand discard it (and log an error). Keep in lockstep with
      // `merge`. Runs ONLY on a version mismatch.
      migrate: (persisted) => ({
        mode: isPlatformMode(
          (persisted as { mode?: unknown } | null | undefined)?.mode
        )
          ? (persisted as { mode: PlatformMode }).mode
          : DEFAULT_PLATFORM_MODE,
      }),
      // Rehydration guard for the matching-version path: a persisted payload
      // that isn't a recognised mode (corruption, a hand-edited value, or a
      // non-object `state`) falls back to the default instead of poisoning the
      // store. NB: the `...current` spread is load-bearing — rehydrate replaces
      // state wholesale (replace=true), so dropping it would strip the actions.
      merge: (persisted, current) => {
        const persistedMode = (persisted as { mode?: unknown } | null | undefined)
          ?.mode
        return {
          ...current,
          mode: isPlatformMode(persistedMode) ? persistedMode : DEFAULT_PLATFORM_MODE,
        }
      },
    }
  )
)
