"use client"

import { useEffect } from "react"
import { useTranslations } from "next-intl"
import { isSigningOut } from "@/lib/user-store/sign-out-state"

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const t = useTranslations("errorPages")

  useEffect(() => {
    console.error("Application error:", error)
  }, [error])

  // Sign-out tear-down kill switch.
  //
  // The sign-out flow (lib/user-store/provider.tsx#signOut) hard-navigates
  // to "/" via window.location.replace. Between supabase.auth.signOut()
  // clearing the auth cookie and the navigation actually landing, any
  // protected-tree descendant that throws while it briefly sees a missing
  // session would mount THIS component as a full-page UI for 50–300ms
  // before the redirect completes. The user-visible symptom is "I click
  // logout and see an error message, then the landing page."
  //
  // While the sign-out sentinel is set, render nothing — the navigation
  // is imminent and the user's intent is to leave, not to see an error.
  // The console.error above still fires for diagnostics.
  if (isSigningOut()) {
    return null
  }

  return (
    <div className="flex h-screen w-screen items-center justify-center">
      <div className="text-center max-w-md px-6">
        <h1 className="text-xl font-semibold">{t("error.title")}</h1>
        <p className="text-muted-foreground mt-2">
          {t("error.description")}
        </p>
        <button
          onClick={reset}
          className="mt-4 rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background transition-colors hover:bg-foreground/90"
        >
          {t("error.tryAgain")}
        </button>
      </div>
    </div>
  )
}
