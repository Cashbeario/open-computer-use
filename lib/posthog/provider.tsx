"use client"

import posthog from "posthog-js"
import { useEffect } from "react"
import { useConsent } from "@/lib/consent/consent-context"

const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY
const POSTHOG_HOST =
  process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com"

let initialized = false

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  const { analyticsAllowed, ready } = useConsent()

  // Initialize once, but capture NOTHING until consent is in effect. With
  // `opt_out_capturing_by_default: true` no events, autocapture, pageleaves, or
  // session recordings fire until we explicitly opt in below. This replaces the
  // previous unconditional init that began tracking on first paint.
  useEffect(() => {
    if (initialized || !POSTHOG_KEY || typeof window === "undefined") return

    posthog.init(POSTHOG_KEY, {
      api_host: POSTHOG_HOST,
      capture_pageview: false,
      capture_pageleave: true,
      autocapture: true,
      session_recording: {
        maskInputOptions: { password: true },
      },
      persistence: "localStorage+cookie",
      person_profiles: "identified_only",
      opt_out_capturing_by_default: true,
    })

    initialized = true
  }, [])

  // React to consent: opt in/out of capturing. Runs after init and on every
  // consent change (banner accept/decline, settings toggle, GPC).
  useEffect(() => {
    if (!initialized || !ready || typeof window === "undefined") return
    try {
      if (analyticsAllowed) {
        posthog.opt_in_capturing()
      } else {
        posthog.opt_out_capturing()
      }
    } catch {
      // posthog not ready yet (no key) — nothing to gate.
    }
  }, [analyticsAllowed, ready])

  return <>{children}</>
}
