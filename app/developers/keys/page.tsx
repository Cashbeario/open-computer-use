import { LayoutApp } from "@/app/components/layout/layout-app"
import { KeysContent } from "@/app/components/developers/keys-content"

export const dynamic = "force-dynamic"

// API keys (credentials). Access is gated by LayoutApp auth; the sidebar
// entry only surfaces in the "developer" platform mode. Anyone reaching this
// URL directly still sees only their own auth-scoped keys.
export default function DeveloperKeysPage() {
  return (
    <LayoutApp>
      <KeysContent />
    </LayoutApp>
  )
}
