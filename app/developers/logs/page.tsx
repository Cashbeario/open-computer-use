import { LayoutApp } from "@/app/components/layout/layout-app"
import { LogsContent } from "@/app/components/developers/logs-content"

export const dynamic = "force-dynamic"

// Request logs / traces. Auth-scoped via LayoutApp; surfaced in the sidebar
// only in the "developer" platform mode.
export default function DeveloperLogsPage() {
  return (
    <LayoutApp>
      <LogsContent />
    </LayoutApp>
  )
}
