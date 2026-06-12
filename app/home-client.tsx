"use client"

import { ChatContainer } from "@/app/components/chat/chat-container"
import { LayoutApp } from "@/app/components/layout/layout-app"
import { MessagesProvider } from "@/lib/chat-store/messages/provider"
import { LandingPage } from "@/app/components/landing/landing-page"
import { Toaster } from "@/components/ui/sonner"
import { PaymentHandler } from "@/app/components/payment-handler"
import { ReferralProcessor } from "@/app/components/referral/referral-processor"

export function HomeClient({
  isAuthenticated,
  ossMode = false,
}: {
  isAuthenticated: boolean
  ossMode?: boolean
}) {
  // OSS mode: render the chat surface directly. The identity is the API key
  // (no Supabase session), so skip PaymentHandler / ReferralProcessor —
  // both are Stripe/Supabase-coupled and have no OSS equivalent.
  if (ossMode) {
    return (
      <>
        <Toaster position="top-center" />
        <MessagesProvider>
          <LayoutApp>
            <ChatContainer />
          </LayoutApp>
        </MessagesProvider>
      </>
    )
  }

  // Landing page doesn't need sidebar
  if (!isAuthenticated) {
    return (
      <>
        <Toaster position="top-center" />
        <LandingPage />
      </>
    )
  }

  // Authenticated app has its own SidebarProvider in LayoutApp
  return (
    <>
      <Toaster position="top-center" />
      <PaymentHandler />
      <ReferralProcessor />
      <MessagesProvider>
        <LayoutApp>
          <ChatContainer />
        </LayoutApp>
      </MessagesProvider>
    </>
  )
}