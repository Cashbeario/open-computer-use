import { LayoutApp } from "@/app/components/layout/layout-app"
import { DevelopersContent } from "@/app/components/developers/developers-content"

export const dynamic = "force-dynamic"

// The in-app developer dashboard (API keys, usage, traces, reference).
//
// No longer gated by DEVELOPERS_API_ENABLED: access is controlled by
// LayoutApp's auth, and the entry is surfaced in the sidebar only when the
// user is in the "developer" platform mode. The platform mode is client-only
// (localStorage), so a server component can't read it to gate here — the
// runtime gate therefore lives in the mode-aware sidebar nav, not in this
// page. Anyone who reaches this URL directly still only sees their own,
// auth-scoped keys/usage.
export default function DevelopersPage() {
  return (
    <LayoutApp>
      <DevelopersContent />
    </LayoutApp>
  )
}
