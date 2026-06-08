import { LayoutApp } from "@/app/components/layout/layout-app"
import { UsageContent } from "@/app/components/developers/usage-content"

export const dynamic = "force-dynamic"

// Usage analytics. Auth-scoped via LayoutApp; surfaced in the sidebar only in
// the "developer" platform mode.
export default function DeveloperUsagePage() {
  return (
    <LayoutApp>
      <UsageContent />
    </LayoutApp>
  )
}
