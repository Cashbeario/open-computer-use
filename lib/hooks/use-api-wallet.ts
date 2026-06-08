"use client"

import { useCallback, useEffect, useState } from "react"
import { useUser } from "@/lib/user-store/provider"

export interface ApiWallet {
  balanceCents: number
  balanceUsd: number
  totalToppedUpCents: number
  totalSpentCents: number
  currency: string
  lastTopupAt: string | null
  lastSpendAt: string | null
}

/**
 * The developer API dollar wallet (independent of consumer credits).
 * Pass `enabled = false` to skip the network request entirely — used by the
 * sidebar so the wallet is only fetched when the user is in Developer mode.
 */
export function useApiWallet(enabled = true) {
  const { user } = useUser()
  const [wallet, setWallet] = useState<ApiWallet | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchWallet = useCallback(async () => {
    if (!user || !enabled) {
      setWallet(null)
      setLoading(false)
      return
    }
    try {
      setLoading(true)
      const res = await fetch("/api/developers/wallet")
      if (!res.ok) throw new Error("Failed to fetch wallet")
      const data = (await res.json()) as ApiWallet
      setWallet(data)
      setError(null)
    } catch (err) {
      console.error("Error fetching API wallet:", err)
      setError(err instanceof Error ? err.message : "Failed to fetch wallet")
      setWallet(null)
    } finally {
      setLoading(false)
    }
  }, [user, enabled])

  useEffect(() => {
    fetchWallet()
  }, [fetchWallet])

  return { wallet, loading, error, refetch: fetchWallet }
}
