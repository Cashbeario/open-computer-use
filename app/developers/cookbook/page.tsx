import { LayoutApp } from "@/app/components/layout/layout-app"
import { CookbookContent } from "@/app/components/developers/cookbook-content"

export const dynamic = "force-dynamic"

// Cookbook — open-source examples + repos for building on the Coasty API.
// Auth-scoped via LayoutApp; surfaced in the sidebar only in the
// "developer" platform mode.
export default function DeveloperCookbookPage() {
  return (
    <LayoutApp>
      <CookbookContent />
    </LayoutApp>
  )
}
