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

export default async function ConnectionsPage() {
  const supabase = await createClient()

  if (!supabase) {
    redirect("/auth/login?next=/connections")
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/auth/login?next=/connections")
  }

  return (
    <LayoutApp>
      <ConnectionsContent />
    </LayoutApp>
  )
}
