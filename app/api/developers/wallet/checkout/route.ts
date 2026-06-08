import { createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"
import Stripe from "stripe"

export const runtime = "nodejs"

const stripe = new Stripe(process.env.STRIPE_API_KEY!, {
  apiVersion: "2025-08-27.basil",
})

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"

// Bounds enforced server-side; the client only suggests an amount.
const MIN_TOPUP_CENTS = 500 //   $5 minimum
const MAX_TOPUP_CENTS = 500_000 // $5,000 maximum per top-up

// POST /api/developers/wallet/checkout — start a Stripe one-time payment that
// tops up the dollar API wallet. Unlike consumer credit packs, this requires
// NO active subscription: the wallet is fully independent of the consumer plan.
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    if (!supabase) {
      return NextResponse.json({ error: "Database connection error" }, { status: 500 })
    }

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Resolve the amount in integer cents from either amountCents or amountUsd.
    // Never trust the client beyond the validated bounds below.
    const body = await req.json().catch(() => ({}) as Record<string, unknown>)
    let amountCents: number
    if (typeof body.amountCents === "number" && Number.isFinite(body.amountCents)) {
      amountCents = Math.round(body.amountCents)
    } else if (typeof body.amountUsd === "number" && Number.isFinite(body.amountUsd)) {
      amountCents = Math.round(body.amountUsd * 100)
    } else {
      return NextResponse.json(
        { error: "Provide amountUsd or amountCents." },
        { status: 400 },
      )
    }

    if (
      !Number.isInteger(amountCents) ||
      amountCents < MIN_TOPUP_CENTS ||
      amountCents > MAX_TOPUP_CENTS
    ) {
      return NextResponse.json(
        {
          error: `Top-up must be between $${MIN_TOPUP_CENTS / 100} and $${MAX_TOPUP_CENTS / 100}.`,
        },
        { status: 400 },
      )
    }

    // Reuse the consumer stripe_customers mapping.
    let stripeCustomerId: string
    const { data: existingCustomer } = await supabase
      .from("stripe_customers")
      .select("stripe_customer_id")
      .eq("user_id", user.id)
      .maybeSingle()

    if (existingCustomer) {
      stripeCustomerId = existingCustomer.stripe_customer_id
    } else {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { user_id: user.id },
      })
      await supabase.from("stripe_customers").insert({
        user_id: user.id,
        stripe_customer_id: customer.id,
        email: user.email,
      })
      stripeCustomerId = customer.id
    }

    const usd = (amountCents / 100).toFixed(2)
    const session = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: `API wallet top-up — $${usd}`,
              description: "Prepaid balance for the Coasty developer API",
            },
            unit_amount: amountCents,
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      payment_intent_data: { setup_future_usage: "off_session" },
      success_url: `${BASE_URL}/developers/usage?topup_success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${BASE_URL}/developers/usage?topup_canceled=true`,
      // The webhook routes on metadata.type === "api_wallet_topup".
      metadata: {
        user_id: user.id,
        type: "api_wallet_topup",
        amount_cents: amountCents.toString(),
      },
    })

    return NextResponse.json({ sessionId: session.id, url: session.url })
  } catch (error) {
    console.error("Error creating wallet checkout session:", error)
    return NextResponse.json(
      { error: "Failed to create checkout session" },
      { status: 500 },
    )
  }
}
