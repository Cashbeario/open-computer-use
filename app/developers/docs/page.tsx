import { LayoutApp } from "@/app/components/layout/layout-app"
import { DocsContent } from "@/app/components/developers/docs-content"

export const dynamic = "force-dynamic"

// In-app API quick reference. Auth-scoped via LayoutApp; surfaced in the
// sidebar only in the "developer" platform mode. The full reference lives at
// /guide?tab=api, which this page links out to.
export default function DeveloperDocsPage() {
  return (
    <LayoutApp>
      <DocsContent />
    </LayoutApp>
  )
}
