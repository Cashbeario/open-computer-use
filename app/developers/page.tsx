import { redirect } from "next/navigation"

export const dynamic = "force-dynamic"

// The developer dashboard was split into independent pages (keys / logs /
// usage / docs). The bare /developers route now lands on API keys — the
// primary surface. The sidebar links straight to each sub-route, so users
// rarely hit this redirect, but deep links and bookmarks to /developers keep
// working.
export default function DevelopersPage() {
  redirect("/developers/keys")
}
