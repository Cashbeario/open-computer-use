import { createClient } from "@/lib/supabase/server"
import { getCoastyApiKey, isOssMode } from "@/lib/oss-mode"
import { OssSetupPrompt } from "@/components/common/oss-setup-prompt"
import { HomeClient } from "./home-client"
import { FAQSchema } from "./seo-schemas"
import { redirect } from "next/navigation"
import { getLocale } from "next-intl/server"

export const dynamic = "force-dynamic"

export default async function Home() {
  const locale = await getLocale()

  // OSS mode: no Supabase session exists, so the auth gate below would
  // permanently strand visitors on the marketing page (whose CTAs lead to
  // /auth — a sign-in flow that doesn't exist in this mode). The API key is
  // the identity (lib/user/api.ts:22-41 synthesizes the profile), so go
  // straight to the app surface; if the operator enabled OSS mode without a
  // key (COASTY_OSS_MODE=1 edge case), show the setup prompt instead.
  if (isOssMode()) {
    if (!getCoastyApiKey()) {
      return <OssSetupPrompt />
    }
    return (
      <>
        <FAQSchema locale={locale} />
        <HomeClient isAuthenticated={false} ossMode />
      </>
    )
  }

  const supabase = await createClient()
  let isAuthenticated = false

  if (supabase) {
    const { data: { user } } = await supabase.auth.getUser()
    isAuthenticated = !!user

    // Redirect authenticated users who haven't completed onboarding
    if (user) {
      try {
        const { data: userData } = await supabase
          .from("users")
          .select("onboarding_completed")
          .eq("id", user.id)
          .single()

        if (userData && !userData.onboarding_completed) {
          redirect("/onboarding")
        }
      } catch (e) {
        // Re-throw redirect (Next.js throws NEXT_REDIRECT internally)
        if (e && typeof e === "object" && "digest" in e) throw e
        // Otherwise silently continue if check fails
      }
    }
  }

  return (
    <>
      <FAQSchema locale={locale} />
      <HomeClient isAuthenticated={isAuthenticated} />
    </>
  )
}
