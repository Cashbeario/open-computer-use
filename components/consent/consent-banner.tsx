"use client"

/**
 * ConsentBanner — slim, hairline opt-in bar shown only to EU/EEA/UK visitors
 * who have not yet made a choice (and who are not sending Global Privacy
 * Control). Everyone else is on the opt-out default and never sees this.
 *
 * Design: one hairline-topped row pinned to the bottom, a single line of copy,
 * and two quiet actions. No backdrop scrim, no card, no icon — it informs and
 * gets out of the way. Until the consent layer has read storage/geo we render
 * nothing, so there is no first-paint flash.
 */

import Link from "next/link"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { useConsent } from "@/lib/consent/consent-context"

export function ConsentBanner() {
  const { showBanner, accept, reject } = useConsent()
  const t = useTranslations("consent")

  if (!showBanner) return null

  return (
    <div
      role="region"
      aria-label={t("ariaLabel")}
      className="fixed inset-x-0 bottom-0 z-[9999] border-t border-border/60 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80"
    >
      <div className="mx-auto flex max-w-screen-xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs leading-relaxed text-muted-foreground">
          {t("message")}{" "}
          <Link
            href="/privacy"
            className="underline underline-offset-2 hover:text-foreground transition-colors"
          >
            {t("learnMore")}
          </Link>
        </p>
        <div className="flex shrink-0 items-center gap-2 self-end sm:self-auto">
          <Button
            variant="ghost"
            size="sm"
            onClick={reject}
            className="h-8 px-3 text-xs text-muted-foreground hover:text-foreground"
          >
            {t("decline")}
          </Button>
          <Button size="sm" onClick={accept} className="h-8 px-3 text-xs">
            {t("accept")}
          </Button>
        </div>
      </div>
    </div>
  )
}
