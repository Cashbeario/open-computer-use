import { isSupabaseEnabled } from "@/lib/supabase/config"
import { getCoastyApiKey, isOssMode } from "@/lib/oss-mode"
import { OssSetupPrompt } from "@/components/common/oss-setup-prompt"
import { notFound } from "next/navigation"
import LoginPage from "./login-page"

export default function AuthPage() {
  // OSS mode: there is no Supabase / OAuth flow — the API key is the
  // identity. Replace the sign-in surface with an instructional one instead
  // of redirecting or 404ing (see components/common/oss-setup-prompt.tsx:4-14
  // for why deep links to /auth must land on a clear message).
  if (isOssMode()) {
    return <OssSetupPrompt keyPresent={Boolean(getCoastyApiKey())} />
  }

  if (!isSupabaseEnabled) {
    return notFound()
  }

  return <LoginPage />
}
