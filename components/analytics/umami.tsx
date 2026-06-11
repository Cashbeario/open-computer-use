"use client"

/**
 * UmamiAnalytics — loads the Umami tracking script only when analytics consent
 * is in effect (opt-out regions by default, opt-in regions after the user
 * accepts). Previously the script lived unconditionally in the document <head>,
 * so it fired before any consent. Now it is a consent-gated client component:
 * if consent is not allowed, the <Script> never mounts, so no request is made.
 *
 * Dev builds never load it (matches the prior `!isDev` guard).
 */

import Script from "next/script"
import { useConsent } from "@/lib/consent/consent-context"

const UMAMI_WEBSITE_ID = "42e5b68c-5478-41a6-bc68-088d029cee52"

export function UmamiAnalytics() {
  const { analyticsAllowed } = useConsent()

  if (process.env.NODE_ENV === "development") return null
  if (!analyticsAllowed) return null

  return (
    <Script
      async
      src="https://analytics.umami.is/script.js"
      data-website-id={UMAMI_WEBSITE_ID}
    />
  )
}
