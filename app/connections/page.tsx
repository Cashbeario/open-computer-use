import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { LayoutApp } from "@/app/components/layout/layout-app"
import { getLocalizedMetadata } from "@/lib/seo"
import { ConnectionsContent } from "./connections-content"

export const dynamic = "force-dynamic"

export async function generateMetadata(): Promise<Metadata> {
  return getLocalizedMetadata("connections", "/connections")
}

/**
 * E2E auth-bypass. Honored ONLY when the dev/test server is non-production
 * AND either the env var is set at boot OR a Playwright-seeded cookie is
 * present on the request. Production is hard-gated by NODE_ENV so a
 * misconfigured deploy can never accidentally serve the page without auth.
 *
 * Evaluated per-request inside the async page so a reused dev server can
 * honor the cookie even when the env var wasn't present at boot.
 */
async function isE2EBypassEnabled(): Promise<boolean> {
  if (process.env.NODE_ENV === "production") return false
  if (process.env.E2E_AUTH_BYPASS === "1") return true
  const { cookies } = await import("next/headers")
  const store = await cookies()
  return store.get("coasty_e2e_bypass")?.value === "1"
}

export default async function ConnectionsPage() {
  if (!(await isE2EBypassEnabled())) {
    const supabase = await createClient()

    if (!supabase) {
      redirect("/auth?next=/connections")
    }

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      redirect("/auth?next=/connections")
    }
  }

  return (
    <LayoutApp>
      <ConnectionsContent />
    </LayoutApp>
  )
}
