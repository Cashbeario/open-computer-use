/**
 * Server-side messages fetch with screenshot decryption.
 *
 * GET /api/chats/:chatId/messages → { messages: Message[] }
 *
 * Why this exists
 * ---------------
 * `frontendScreenshot` values inside `messages.parts` are now optionally
 * AES-256-GCM ciphertext (sentinel `enc:v1:...`) when the user has opted in
 * to ``users.encryption_prefs.messages``. Decrypting them requires the
 * `ENCRYPTION_KEY` — which must NEVER ship to the browser. So this route
 * is the chokepoint that does the decrypt server-side and returns plaintext
 * to the client.
 *
 * The previous client-side direct-Supabase fetch in
 * `lib/chat-store/messages/api.ts:getMessagesFromDb` now points at this
 * route. RLS still applies (we use the server-side Supabase client with the
 * user's session cookie), so the security boundary is unchanged — we've
 * just moved the read from "browser → Supabase" to "browser → Next.js →
 * Supabase" so a decryption step can sit in the middle.
 *
 * Collaborative chats are still handled by the existing
 * `/api/collaborative-rooms/[roomId]/messages` route (which also does the
 * decryption). This route is only for the standard non-collaborative path.
 */
import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import { decryptScreenshotsInMessages } from "@/lib/screenshot-encryption"

export const dynamic = "force-dynamic"

export async function GET(
  _req: Request,
  context: { params: Promise<{ chatId: string }> }
) {
  const { chatId } = await context.params
  if (!chatId) {
    return NextResponse.json({ error: "Missing chatId" }, { status: 400 })
  }

  const supabase = await createClient()
  if (!supabase) {
    return NextResponse.json(
      { error: "Database connection failed" },
      { status: 500 }
    )
  }

  // Auth — RLS will enforce per-row access too, but we 401 early on no
  // session to avoid an unintentional empty array masking missing auth.
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // Fetch — RLS on public.messages restricts to chats owned by the caller,
  // so a foreign chatId comes back as an empty array.
  const { data: rawMessages, error } = await supabase
    .from("messages")
    .select("*")
    .eq("chat_id", chatId)
    .order("created_at", { ascending: true })

  if (error) {
    console.error(`/api/chats/${chatId}/messages fetch error:`, error)
    return NextResponse.json(
      { error: "Failed to fetch messages" },
      { status: 500 }
    )
  }

  // Decrypt any encrypted frontendScreenshot values inside the JSONB parts.
  // Plaintext messages pass through unchanged; decryption failures (wrong
  // key, tampered bytes) drop the screenshot rather than render a broken
  // image. See lib/screenshot-encryption.ts for the contract.
  const messages = decryptScreenshotsInMessages(rawMessages || [])

  return NextResponse.json({ messages })
}
