"use client"

import { useEffect } from "react"
import { useSearchParams } from "next/navigation"
import { useAccountDialog, type AccountSectionType } from "@/lib/account-dialog-store"

// Mirrors validSections in account-dialog.tsx — Guide and Referral are
// intentionally excluded since they redirect rather than render inline.
const validSections: AccountSectionType[] = ["account", "billing", "privacy", "appearance", "data", "feedback", "about", "social", "memory", "public-chats"]

export function AccountOpener() {
  const searchParams = useSearchParams()
  const { isOpen, _syncFromUrl } = useAccountDialog()

  useEffect(() => {
    if (!isOpen) {
      const sec = searchParams.get("section") as AccountSectionType | null
      // Save "/" as previous path so closing goes home
      useAccountDialog.setState({ _previousPath: "/" })
      // Bare `/account` → user wants the section-list hub, so on mobile
      // we start in menu view. `/account?section=X` is a deep link and
      // jumps into that panel directly.
      const resolved = sec && validSections.includes(sec) ? sec : "account"
      _syncFromUrl(resolved, sec ? "content" : "menu")
    }
    // Only run on mount and when searchParams change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  return null
}
