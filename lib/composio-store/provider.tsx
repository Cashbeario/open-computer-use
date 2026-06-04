"use client"

/**
 * Composio store — Context provider for non-query state.
 *
 * Data fetching itself runs on TanStack Query inside hooks (see
 * use-composio.ts), which relies on the app-wide QueryClientProvider
 * already mounted in lib/tanstack-query/tanstack-query-provider.tsx.
 *
 * This Context exists purely to hold per-chat UI state that does NOT
 * belong in the query cache:
 *   - Per-chat selected toolkits (v2 stub — always returns null in v1).
 *   - Setter is a no-op in v1.
 *
 * Designed to mirror lib/user-preference-store/provider.tsx in shape
 * (Context + hook), minus the QueryClient bootstrap (already global).
 */

import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react"

interface ComposioContextValue {
  /**
   * v2 stub: returns the per-chat toolkit allow-list for the given
   * chat id, or null when no override is set. Always null in v1.
   */
  getPerChatToolkits: (chatId: string) => string[] | null
  /**
   * v2 stub: sets the per-chat toolkit allow-list. No-op in v1.
   * The signature is stable so callers can wire it up today.
   */
  setPerChatToolkits: (chatId: string, toolkits: string[] | null) => void
}

const ComposioContext = createContext<ComposioContextValue | undefined>(
  undefined
)

export function ComposioProvider({ children }: { children: ReactNode }) {
  // v2 stub state. Kept local so a future implementation can swap to
  // useState<Record<string, string[]>> without touching consumers.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_perChatToolkits, _setPerChatToolkits] = useState<
    Record<string, string[]>
  >({})

  const getPerChatToolkits = useCallback((_chatId: string) => {
    // v1: per-chat picker not yet wired. Always return null so callers
    // fall back to the user's global active-toolkit set.
    return null
  }, [])

  const setPerChatToolkits = useCallback(
    (_chatId: string, _toolkits: string[] | null) => {
      // v1: no-op. Reserved for v2 per-chat picker UI.
    },
    []
  )

  const value = useMemo<ComposioContextValue>(
    () => ({ getPerChatToolkits, setPerChatToolkits }),
    [getPerChatToolkits, setPerChatToolkits]
  )

  return (
    <ComposioContext.Provider value={value}>
      {children}
    </ComposioContext.Provider>
  )
}

/**
 * Internal hook for the Context only. Most callers should reach for
 * the higher-level hooks in `./use-composio` (which combine TanStack
 * Query and this Context).
 */
export function useComposioContext(): ComposioContextValue {
  const ctx = useContext(ComposioContext)
  if (!ctx) {
    throw new Error("useComposioContext must be used within ComposioProvider")
  }
  return ctx
}

// Re-export the aggregate facade hook from the same module path so
// consumers that import `useComposio` from "@/lib/composio-store/provider"
// resolve correctly without changing their import paths.
export { useComposio } from "./use-composio"
