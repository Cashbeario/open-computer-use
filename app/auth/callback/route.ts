import { MODEL_DEFAULT } from "@/lib/config"
import { isSupabaseEnabled } from "@/lib/supabase/config"
import { createClient } from "@/lib/supabase/server"
import { createServiceClient } from "@/lib/supabase/server-guest"
import { getClientIp } from "@/lib/client-ip"
import { TERMS_VERSION, PRIVACY_VERSION } from "@/lib/legal/versions"
import { NextResponse } from "next/server"

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get("code")
  const next = searchParams.get("next") ?? "/"

  if (!isSupabaseEnabled) {
    return NextResponse.redirect(
      `${origin}/auth/error?message=${encodeURIComponent("Supabase is not enabled in this deployment.")}`
    )
  }

  if (!code) {
    return NextResponse.redirect(
      `${origin}/auth/error?message=${encodeURIComponent("Missing authentication code")}`
    )
  }

  const supabase = await createClient()
  const supabaseAdmin = await createServiceClient()

  if (!supabase || !supabaseAdmin) {
    return NextResponse.redirect(
      `${origin}/auth/error?message=${encodeURIComponent("Supabase is not enabled in this deployment.")}`
    )
  }

  const { data, error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    // Authentication error occurred
    return NextResponse.redirect(
      `${origin}/auth/error?message=${encodeURIComponent(error.message)}`
    )
  }

  const user = data?.user
  if (!user || !user.id || !user.email) {
    return NextResponse.redirect(
      `${origin}/auth/error?message=${encodeURIComponent("Missing user info")}`
    )
  }

  let isNewUser = false

  try {
    // Try to insert user only if not exists
    const { error: insertError } = await supabaseAdmin.from("users").insert({
      id: user.id,
      email: user.email,
      created_at: new Date().toISOString(),
      message_count: 0,
      premium: false,
      favorite_models: [MODEL_DEFAULT],
      onboarding_completed: false,
    })

    if (insertError && insertError.code !== "23505") {
      // User insert error (duplicate check passed)
    }

    // New user was inserted successfully
    if (!insertError) {
      isNewUser = true

      // Record the user's acceptance of the Terms + Privacy Policy at the
      // moment of account creation. This is the durable, server-verified
      // consent artifact (IP + user-agent observed here, never client-trusted)
      // that satisfies GDPR Art. 7(1) demonstrability and anchors enforcement
      // of the Terms to a specific document version. The button-level notice on
      // the auth screen is the user-facing assent; this is the record of it.
      //
      // Idempotent: the unique index on (user_id, terms_version,
      // privacy_version) means a duplicate callback hit is a no-op. Failure to
      // record consent must NEVER block account creation, so it is best-effort.
      try {
        const method = user.app_metadata?.provider || "email"
        await supabaseAdmin
          .from("user_consents")
          .upsert(
            {
              user_id: user.id,
              terms_version: TERMS_VERSION,
              privacy_version: PRIVACY_VERSION,
              method,
              source: "web",
              ip: getClientIp(request.headers),
              user_agent: request.headers.get("user-agent") || null,
              accepted_at: new Date().toISOString(),
            },
            { onConflict: "user_id,terms_version,privacy_version", ignoreDuplicates: true }
          )
      } catch {
        // Non-blocking: a consent-logging failure must not break signup.
      }

      // Email signups get 50 credits instead of the default 100
      const provider = user.app_metadata?.provider
      if (provider === "email") {
        await supabaseAdmin
          .from("user_credits")
          .update({ balance: 50 })
          .eq("user_id", user.id)
      }
    }
  } catch (err) {
    // Unexpected error during user creation
  }

  const host = request.headers.get("host")
  const protocol = host?.includes("localhost") ? "http" : "https"

  // Redirect new users to onboarding
  if (isNewUser) {
    return NextResponse.redirect(`${protocol}://${host}/onboarding`)
  }

  // Check if existing user has completed onboarding
  if (!isNewUser) {
    try {
      const { data: existingUser } = await supabaseAdmin
        .from("users")
        .select("onboarding_completed")
        .eq("id", user.id)
        .single()

      if (existingUser && !existingUser.onboarding_completed) {
        return NextResponse.redirect(`${protocol}://${host}/onboarding`)
      }
    } catch {
      // If check fails, proceed normally
    }
  }

  const redirectUrl = `${protocol}://${host}${next}`

  return NextResponse.redirect(redirectUrl)
}
