import { createClient } from "@/lib/supabase/server"
import { createClient as createServiceClient } from "@supabase/supabase-js"
import { headers } from "next/headers"
import { NextRequest, NextResponse } from "next/server"
import Stripe from "stripe"

export const runtime = "nodejs"
export const maxDuration = 60

const stripe = new Stripe(process.env.STRIPE_API_KEY!, {
  apiVersion: "2025-08-27.basil",
})

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!

// Helper function to handle credit purchases (receives service role client)
async function handleCreditPurchase(session: Stripe.Checkout.Session, supabase: any) {
  const userId = session.metadata?.user_id
  const credits = parseInt(session.metadata?.credits || "0")
  
  if (!userId || !credits) {
    console.error("Missing user_id or credits in session metadata")
    return
  }

  // Get current balance
  const { data: currentCredits } = await supabase
    .from("user_credits")
    .select("balance, total_purchased")
    .eq("user_id", userId)
    .single()

  if (currentCredits) {
    // User already has credits - update them
    const newBalance = currentCredits.balance + credits
    const newTotalPurchased = currentCredits.total_purchased + credits

    const { error: updateError } = await supabase
      .from("user_credits")
      .update({
        balance: newBalance,
        total_purchased: newTotalPurchased,
        last_purchase_at: new Date().toISOString(),
      })
      .eq("user_id", userId)

    if (updateError) {
      console.error("Error updating user credits:", updateError)
      return
    }

    // Record transaction with new balance
    await supabase
      .from("credit_transactions")
      .insert({
        user_id: userId,
        type: "purchase",
        amount: credits,
        balance_after: newBalance,
        stripe_payment_intent_id: session.payment_intent as string,
        stripe_checkout_session_id: session.id,
        currency: session.currency,
        price_paid: (session.amount_total || 0) / 100,
        metadata: {
          session_id: session.id,
          customer_email: session.customer_email,
        },
      })
  } else {
    // User doesn't have credits yet - create new record
    const { error: insertError } = await supabase
      .from("user_credits")
      .insert({
        user_id: userId,
        balance: credits,
        total_purchased: credits,
        last_purchase_at: new Date().toISOString(),
      })

    if (insertError) {
      console.error("Error creating user credits:", insertError)
      return
    }

    // Record transaction
    await supabase
      .from("credit_transactions")
      .insert({
        user_id: userId,
        type: "purchase",
        amount: credits,
        balance_after: credits,
        stripe_payment_intent_id: session.payment_intent as string,
        stripe_checkout_session_id: session.id,
        currency: session.currency,
        price_paid: (session.amount_total || 0) / 100,
        metadata: {
          session_id: session.id,
          customer_email: session.customer_email,
        },
      })
  }

  console.log(`Successfully processed payment: ${credits} credits`)
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.text()
    const signature = (await headers()).get("stripe-signature")

    if (!signature) {
      return NextResponse.json(
        { error: "Missing stripe signature" },
        { status: 400 }
      )
    }

    let event: Stripe.Event

    try {
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret)
    } catch (err) {
      console.error("Webhook signature verification failed:", err)
      return NextResponse.json(
        { error: "Invalid signature" },
        { status: 400 }
      )
    }

    // Use service role client for webhook operations (bypasses RLS)
    const supabase = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )

    // Atomically check and record the event (prevents race condition with simultaneous deliveries)
    // Uses upsert with onConflict + ignoreDuplicates → INSERT ON CONFLICT DO NOTHING
    // maybeSingle() returns null data (no error) when the row is skipped, vs single() which throws PGRST116
    const { data: insertedEvent, error: eventInsertError } = await supabase
      .from("stripe_events")
      .upsert(
        {
          id: event.id,
          type: event.type,
          data: event.data,
          processed: false,
        },
        { onConflict: "id", ignoreDuplicates: true }
      )
      .select("id")
      .maybeSingle()

    // Real DB error — let Stripe retry
    if (eventInsertError) {
      console.error(`Error recording stripe event ${event.id}:`, eventInsertError)
      return NextResponse.json({ error: "Database error" }, { status: 500 })
    }

    // No row returned means the event already existed — skip processing
    if (!insertedEvent) {
      console.log(`Event ${event.id} already processed (atomic check)`)
      return NextResponse.json({ received: true })
    }

    // Log the event for debugging
    console.log(`Processing webhook event: ${event.type}`)
    
    // Handle the event
    switch (event.type) {
      // Handle subscription creation
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session
        console.log(`Processing checkout session: ${session.id}, mode: ${session.mode}`)
        
        // Check if this is a subscription checkout
        if (session.mode === "subscription") {
          const userId = session.metadata?.user_id
          const tier = session.metadata?.tier
          const subscriptionId = session.subscription as string
          
          console.log(`Subscription checkout - tier: ${tier}`)
          
          if (!userId || !tier || !subscriptionId) {
            console.error("Missing subscription metadata")
            break
          }

          // IMPORTANT: Check if we've already granted credits for this subscription
          // This prevents double granting when both checkout.session.completed and customer.subscription.created fire
          const { data: existingGrant } = await (supabase as any)
            .from("credit_transactions")
            .select("id")
            .eq("user_id", userId)
            .eq("type", "subscription_grant")
            .eq("metadata->>stripe_subscription_id", subscriptionId)
            .single()

          if (existingGrant) {
            console.log(`Credits already granted for subscription ${subscriptionId}, skipping credit grant in checkout.session.completed`)
            // Still create/update the subscription record, just don't grant credits
          }

          // Get the subscription details from Stripe
          const subscription = await stripe.subscriptions.retrieve(subscriptionId) as any
          
          // Get the plan from database first
          const { data: plan } = await (supabase as any)
            .from("subscription_plans")
            .select("*")
            .eq("tier", tier)
            .single()

          if (!plan) {
            console.error("Subscription plan not found for tier:", tier)
            break
          }

          // Handle timestamps - they might not be available yet in checkout.session.completed
          let periodStart: string
          let periodEnd: string
          
          if (subscription.current_period_start && subscription.current_period_end) {
            try {
              periodStart = new Date(subscription.current_period_start * 1000).toISOString()
              periodEnd = new Date(subscription.current_period_end * 1000).toISOString()
            } catch (e) {
              console.error("Invalid subscription period timestamps:", e)
              // Use fallback dates
              periodStart = new Date().toISOString()
              periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() // 30 days from now
            }
          } else {
            // Subscription timestamps not available yet, use defaults
            console.log("Subscription timestamps not available yet, using defaults")
            periodStart = new Date().toISOString()
            periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() // 30 days from now
          }

          // Check if subscription already exists (user might be resubscribing)
          const { data: existingSubscription } = await (supabase as any)
            .from("user_subscriptions")
            .select("*")
            .eq("stripe_subscription_id", subscriptionId)
            .single()

          let newSubscription
          
          if (existingSubscription) {
            console.log(`Subscription already exists for ${subscriptionId}, updating it`)
            // Update existing subscription record (reactivation)
            const { data: updated, error: updateError } = await (supabase as any)
              .from("user_subscriptions")
              .update({
                subscription_plan_id: plan.id,
                stripe_customer_id: session.customer as string,
                status: subscription.status,
                current_period_start: periodStart,
                current_period_end: periodEnd,
                cancel_at_period_end: false,
                canceled_at: null,  // Clear cancellation date
                updated_at: new Date().toISOString()
              })
              .eq("stripe_subscription_id", subscriptionId)
              .select()
              .single()
            
            if (updateError) {
              console.error("Error updating subscription record:", updateError)
              break
            }
            
            newSubscription = updated
            console.log(`Subscription record updated (reactivated) with ID: ${newSubscription.id}`)
          } else {
            // Create new subscription record
            const { data: created, error: insertError } = await (supabase as any)
              .from("user_subscriptions")
              .insert({
                user_id: userId,
                subscription_plan_id: plan.id,
                stripe_subscription_id: subscriptionId,
                stripe_customer_id: session.customer as string,
                status: subscription.status,
                current_period_start: periodStart,
                current_period_end: periodEnd,
                cancel_at_period_end: subscription.cancel_at_period_end,
                created_at: new Date().toISOString()
              })
              .select()
              .single()

            if (insertError || !created) {
              // Handle edge case where subscription was created between our check and insert
              if (insertError?.code === '23505') {
                console.log("Subscription was created concurrently, fetching it")
                const { data: concurrent } = await (supabase as any)
                  .from("user_subscriptions")
                  .select("*")
                  .eq("stripe_subscription_id", subscriptionId)
                  .single()
                
                if (concurrent) {
                  newSubscription = concurrent
                } else {
                  console.error("Could not find or create subscription")
                  break
                }
              } else {
                console.error("Error creating subscription record:", insertError)
                break
              }
            } else {
              newSubscription = created
              console.log(`Subscription record created with ID: ${newSubscription.id}`)
            }
          }

          // Only grant credits if we haven't already
          if (!existingGrant) {
            // First, ensure user_credits record exists
            const { data: existingCredits } = await (supabase as any)
              .from("user_credits")
              .select("*")
              .eq("user_id", userId)
              .single()

            if (!existingCredits) {
              // Create user_credits record if it doesn't exist
              const { error: createCreditsError } = await (supabase as any)
                .from("user_credits")
                .insert({
                  user_id: userId,
                  balance: plan.monthly_credits,
                  total_purchased: 0,
                  total_used: 0,
                  has_active_subscription: true,
                  subscription_tier: tier,
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString()
                })

              if (createCreditsError) {
                console.error("Error creating user_credits record:", createCreditsError)
                // Still try to record the transaction
              } else {
                console.log(`Created user_credits record with ${plan.monthly_credits} credits`)
              }

              // Record the initial credit grant as a transaction
              const { error: transactionError } = await (supabase as any)
                .from("credit_transactions")
                .insert({
                  user_id: userId,
                  type: "subscription_grant",
                  amount: plan.monthly_credits,
                  balance_after: plan.monthly_credits,
                  subscription_id: newSubscription.id,
                  // Column is `usage_description` per supabase/schema.sql:1747.
                  // Pre-fix this used `description:` and silently failed every
                  // Stripe insert with PGRST204 "Could not find the
                  // 'description' column of 'credit_transactions' in the
                  // schema cache" — confirmed via 2026-04-30 webhook for user
                  // 8d19ce8c-9741-47bd-98c7-eadc6512e642.
                  usage_description: `Initial ${tier} subscription credits`,
                  metadata: {
                    tier: tier,
                    period_start: periodStart,
                    period_end: periodEnd,
                    stripe_subscription_id: subscriptionId,
                    event_type: "checkout.session.completed"
                  },
                  created_at: new Date().toISOString()
                })

              if (transactionError) {
                console.error("Error recording credit transaction:", transactionError)
              }
            } else {
            // Update existing user_credits record
            const newBalance = (existingCredits.balance || 0) + plan.monthly_credits
            
            const { error: updateError } = await (supabase as any)
              .from("user_credits")
              .update({
                balance: newBalance,
                has_active_subscription: true,
                subscription_tier: tier,
                updated_at: new Date().toISOString()
              })
              .eq("user_id", userId)

            if (updateError) {
              console.error("Error updating user_credits:", updateError)
            } else {
              console.log(`Updated user balance: ${newBalance} credits (added ${plan.monthly_credits})`)
            }

              // Record the credit grant as a transaction
              const { error: transactionError } = await (supabase as any)
                .from("credit_transactions")
                .insert({
                  user_id: userId,
                  type: "subscription_grant",
                  amount: plan.monthly_credits,
                  balance_after: newBalance,
                  subscription_id: newSubscription.id,
                  usage_description: `Initial ${tier} subscription credits`,
                  metadata: {
                    tier: tier,
                    period_start: periodStart,
                    period_end: periodEnd,
                    stripe_subscription_id: subscriptionId,
                    event_type: "checkout.session.completed"
                  },
                  created_at: new Date().toISOString()
                })

              if (transactionError) {
                console.error("Error recording credit transaction:", transactionError)
              }
            }
          } else {
            console.log(`Skipped credit granting for subscription ${subscriptionId} - already granted`)
          }

          // Sync tier across user_credits.subscription_tier + machine_limits.tier
          // from the just-written user_subscriptions row.  This is the single
          // canonical projection — see migration 011.  Idempotent.
          {
            const { error: syncError } = await (supabase as any).rpc(
              "sync_user_tier",
              { p_user_id: userId }
            )
            if (syncError) {
              console.error("sync_user_tier after checkout failed:", syncError)
            }
          }

          console.log(`Subscription created for user ${userId}: ${tier} plan`)
        } else {
          // Handle one-time credit purchases (existing code)
          await handleCreditPurchase(session, supabase)
        }
        break
      }

      // Handle subscription creation (this has full subscription data)
      // NOTE: This handler NEVER grants initial credits — that is done exclusively by checkout.session.completed.
      // This handler only manages subscription records and handles reactivation credits.
      case "customer.subscription.created": {
        const subscription = event.data.object as any
        console.log(`Processing subscription created: ${subscription.id}`)

        // Get metadata
        const userId = subscription.metadata?.user_id
        const tier = subscription.metadata?.tier

        if (!userId || !tier) {
          console.error("Missing metadata in subscription.created:", { userId, tier })
          break
        }

        // Check if we already have this subscription record
        const { data: existingSub } = await (supabase as any)
          .from("user_subscriptions")
          .select("*")
          .eq("stripe_subscription_id", subscription.id)
          .single()

        if (existingSub) {
          console.log("Subscription already exists, updating it with full details")
          // Update the subscription with complete information from Stripe
          if (subscription.current_period_start && subscription.current_period_end) {
            await (supabase as any)
              .from("user_subscriptions")
              .update({
                status: subscription.status,
                current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
                current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
                cancel_at_period_end: subscription.cancel_at_period_end,
                updated_at: new Date().toISOString()
              })
              .eq("id", existingSub.id)

            console.log(`Updated subscription ${existingSub.id} with full details`)
          }

          // Check if this is a reactivation (status changed from canceled to active)
          if (existingSub.status === 'canceled' && subscription.status === 'active') {
            console.log("Subscription reactivated, checking for duplicate reactivation grant")

            // Check if we've already granted reactivation credits for this subscription
            const { data: existingReactivation } = await (supabase as any)
              .from("credit_transactions")
              .select("id")
              .eq("user_id", userId)
              .eq("type", "subscription_reactivation")
              .eq("metadata->>stripe_subscription_id", subscription.id)
              .single()

            if (existingReactivation) {
              console.log(`Reactivation credits already granted for subscription ${subscription.id}, skipping`)
            } else {
              // Get the plan
              const { data: plan } = await (supabase as any)
                .from("subscription_plans")
                .select("*")
                .eq("tier", tier)
                .single()

              if (plan) {
                // Grant reactivation credits
                const { data: currentCredits } = await (supabase as any)
                  .from("user_credits")
                  .select("*")
                  .eq("user_id", userId)
                  .single()

                if (currentCredits) {
                  const newBalance = (currentCredits.balance || 0) + plan.monthly_credits
                  await (supabase as any)
                    .from("user_credits")
                    .update({
                      balance: newBalance,
                      has_active_subscription: true,
                      subscription_tier: tier,
                      updated_at: new Date().toISOString()
                    })
                    .eq("user_id", userId)

                  console.log(`Reactivation: Added ${plan.monthly_credits} credits for user ${userId}, new balance: ${newBalance}`)

                  // Record transaction
                  await (supabase as any)
                    .from("credit_transactions")
                    .insert({
                      user_id: userId,
                      type: "subscription_reactivation",
                      amount: plan.monthly_credits,
                      balance_after: newBalance,
                      subscription_id: existingSub.id,
                      usage_description: `${tier} subscription reactivation`,
                      metadata: {
                        tier: tier,
                        stripe_subscription_id: subscription.id,
                        event: "customer.subscription.created (reactivation)"
                      },
                      created_at: new Date().toISOString()
                    })
                }
              }
            }
          }

          // Sync tier across user_credits + machine_limits from the existing
          // (now-updated) user_subscriptions row.  Idempotent.
          {
            const { error: syncError } = await (supabase as any).rpc(
              "sync_user_tier",
              { p_user_id: userId }
            )
            if (syncError) {
              console.error("sync_user_tier after subscription.created (existing) failed:", syncError)
            }
          }

          break
        }

        // No subscription record exists yet — create it without granting credits.
        // Credits are granted exclusively by checkout.session.completed.
        // If that event failed, credits will be granted on the next invoice.payment_succeeded (monthly renewal).
        console.log("Creating subscription record from subscription.created (no credit grant — handled by checkout.session.completed)")

        // Get the plan
        const { data: plan } = await (supabase as any)
          .from("subscription_plans")
          .select("*")
          .eq("tier", tier)
          .single()

        if (!plan) {
          console.error("Plan not found for tier in subscription.created:", tier)
          break
        }

        // Create subscription record only — no credit granting
        const { error: insertError } = await (supabase as any)
          .from("user_subscriptions")
          .insert({
            user_id: userId,
            subscription_plan_id: plan.id,
            stripe_subscription_id: subscription.id,
            stripe_customer_id: subscription.customer,
            status: subscription.status,
            current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
            current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
            cancel_at_period_end: subscription.cancel_at_period_end,
          })

        if (insertError) {
          console.error("Error creating subscription in subscription.created:", insertError)
          break
        }

        // Ensure user_credits has subscription flags set (but don't add credits)
        const { data: currentCredits } = await (supabase as any)
          .from("user_credits")
          .select("*")
          .eq("user_id", userId)
          .single()

        if (currentCredits) {
          await (supabase as any)
            .from("user_credits")
            .update({
              has_active_subscription: true,
              subscription_tier: tier,
              updated_at: new Date().toISOString()
            })
            .eq("user_id", userId)
        }

        // Sync tier across user_credits + machine_limits from the just-inserted
        // user_subscriptions row.  Closes the gap where machine_limits.tier
        // would otherwise stay at 'free' until the next subscription.updated.
        {
          const { error: syncError } = await (supabase as any).rpc(
            "sync_user_tier",
            { p_user_id: userId }
          )
          if (syncError) {
            console.error("sync_user_tier after subscription.created (new) failed:", syncError)
          }
        }

        console.log(`Subscription record created for user ${userId}: ${tier} plan (credits deferred to checkout.session.completed)`)
        break
      }

      // Handle subscription updates (status change, plan change, cancel-at-period-end toggle)
      case "customer.subscription.updated": {
        const subscription = event.data.object as any

        // Validate timestamps exist (best-effort — RPC tolerates NULLs).
        let periodStart: string | null = null
        let periodEnd: string | null = null
        if (subscription.current_period_start && subscription.current_period_end) {
          try {
            periodStart = new Date(subscription.current_period_start * 1000).toISOString()
            periodEnd = new Date(subscription.current_period_end * 1000).toISOString()
          } catch (e) {
            console.error("Invalid subscription update timestamps:", e)
          }
        }

        // Detect plan change: pick the FIRST line item's price id and resolve
        // it against subscription_plans.stripe_price_id.  This corrects the
        // historical bug where plan changes via the Stripe Customer Portal
        // never propagated to user_subscriptions.subscription_plan_id.
        let newPlanId: string | null = null
        let newPlanTier: string | null = null
        try {
          const newPriceId: string | undefined =
            subscription.items?.data?.[0]?.price?.id ??
            subscription.items?.data?.[0]?.plan?.id
          if (newPriceId) {
            const { data: plan } = await (supabase as any)
              .from("subscription_plans")
              .select("id, tier")
              .eq("stripe_price_id", newPriceId)
              .maybeSingle()
            if (plan?.id) {
              newPlanId = plan.id
              newPlanTier = plan.tier
            } else {
              console.warn(
                `subscription.updated: price ${newPriceId} not found in subscription_plans; tier change will not propagate`
              )
            }
          }
        } catch (e) {
          console.error("subscription.updated: plan lookup failed:", e)
        }

        // Single atomic RPC: writes user_subscriptions, user_credits, and
        // machine_limits.tier — see migration 011.
        const { data: rpcResult, error: rpcError } = await (supabase as any).rpc(
          "update_subscription_status",
          {
            p_stripe_subscription_id: subscription.id,
            p_status: subscription.status,
            p_period_start: periodStart,
            p_period_end: periodEnd,
            p_cancel_at_period_end: subscription.cancel_at_period_end,
            p_subscription_plan_id: newPlanId,
          }
        )
        if (rpcError) {
          console.error("update_subscription_status RPC failed:", rpcError)
        }

        // Stripe stores the original tier in subscription.metadata.tier.  When
        // the user changes plan via the Customer Portal, that metadata is
        // stale.  Patch it so future invoice.payment_succeeded events resolve
        // the correct tier from metadata.  Best-effort — DB is the source of
        // truth and the renewal handler reads from DB too.
        if (newPlanTier && subscription.metadata?.tier !== newPlanTier) {
          try {
            await stripe.subscriptions.update(subscription.id, {
              metadata: { ...(subscription.metadata || {}), tier: newPlanTier },
            })
          } catch (e) {
            console.error("Failed to patch subscription.metadata.tier:", e)
          }
        }

        // Reconcile downstream resources whenever tier moved.  Idempotent: if
        // the user is still within limits, this is a no-op.  Skips when:
        //   * the subscription was unknown to our DB (no rpcResult)
        //   * the subscription is past_due/active/trialing AND tier didn't
        //     drop (we still call reconcile because the user may already be
        //     over the cap from grandfathered limits — the function tolerates).
        const resolvedUserId = rpcResult?.[0]?.user_id as string | undefined
        const resolvedTier = rpcResult?.[0]?.resolved_tier as string | undefined
        if (resolvedUserId && resolvedTier) {
          try {
            const { reconcileForTierChange } = await import(
              "@/lib/services/tier-reconciler"
            )
            const reconcileResult = await reconcileForTierChange({
              supabase,
              userId: resolvedUserId,
              newTier: resolvedTier,
              reason: "subscription_downgraded",
            })
            console.log(
              `subscription.updated: reconciled user=${resolvedUserId} tier=${resolvedTier} machines={terminated:${reconcileResult.machinesTerminated}, deferred:${reconcileResult.machinesDeferred}, failed:${reconcileResult.machinesFailedToTerminate}} schedules={paused:${reconcileResult.schedulesPaused}}`
            )
          } catch (reconcileError) {
            console.error(
              `subscription.updated: reconciliation failed for user=${resolvedUserId}:`,
              reconcileError
            )
          }
        }

        console.log(
          `Subscription updated: ${subscription.id} status=${subscription.status} planChange=${
            newPlanId ? `→${newPlanTier}` : "no"
          } rpcUserId=${rpcResult?.[0]?.user_id ?? "none"}`
        )
        break
      }

      // Handle subscription deletion/cancellation.  Routes through the same
      // RPC so machine_limits.tier and user_credits flags are flipped to free
      // atomically.  Also resolves user_id robustly: never relies on
      // metadata.user_id (which Stripe may strip on out-of-band subscription
      // creation, manual Dashboard edits, or migrated subs); instead looks it
      // up via stripe_customers.stripe_customer_id which is a UNIQUE column.
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription
        const customerId = (subscription as any).customer as string | undefined

        // Primary path: RPC handles update + tier sync in one transaction,
        // keyed on stripe_subscription_id (UNIQUE).
        const { data: rpcResult, error: rpcError } = await (supabase as any).rpc(
          "update_subscription_status",
          {
            p_stripe_subscription_id: subscription.id,
            p_status: "canceled",
            p_period_start: null,
            p_period_end: null,
            p_cancel_at_period_end: null,
            p_subscription_plan_id: null,
          }
        )
        if (rpcError) {
          console.error("subscription.deleted RPC failed:", rpcError)
        }

        // Defensive fallback: subscription wasn't in our DB.  Find the user
        // via stripe_customers (NEVER via metadata.user_id — Stripe doesn't
        // guarantee metadata is preserved on subscription deletion, and a
        // canceled subscription created via the Dashboard or by a migration
        // tool may have empty metadata).
        let resolvedUserId: string | null = rpcResult?.[0]?.user_id ?? null
        if (!resolvedUserId && customerId) {
          const { data: customerRow } = await (supabase as any)
            .from("stripe_customers")
            .select("user_id")
            .eq("stripe_customer_id", customerId)
            .maybeSingle()
          if (customerRow?.user_id) {
            resolvedUserId = customerRow.user_id as string
            await (supabase as any).rpc("sync_user_tier", { p_user_id: resolvedUserId })
            console.log(
              `subscription.deleted: ${subscription.id} unknown to DB; resolved user via stripe_customers(${customerId})=${resolvedUserId} and applied sync_user_tier`
            )
          }
        }

        if (!resolvedUserId) {
          console.warn(
            `subscription.deleted: ${subscription.id} could not resolve user_id (customer=${customerId ?? "?"}); skipping reconciliation`
          )
          console.log(`Subscription canceled: ${subscription.id}`)
          break
        }

        // Resource reconciliation — terminate excess machines, pause schedules.
        // Runs after tier has flipped to free so getTierResourceLimits sees
        // the post-cancel state.
        try {
          const { reconcileForTierChange } = await import(
            "@/lib/services/tier-reconciler"
          )
          const reconcileResult = await reconcileForTierChange({
            supabase,
            userId: resolvedUserId,
            newTier: "free",
            reason: "subscription_canceled",
          })
          console.log(
            `subscription.deleted: reconciled user=${resolvedUserId} machines={terminated:${reconcileResult.machinesTerminated}, deferred:${reconcileResult.machinesDeferred}, failed:${reconcileResult.machinesFailedToTerminate}} schedules={paused:${reconcileResult.schedulesPaused}}`
          )
        } catch (reconcileError) {
          console.error(
            `subscription.deleted: reconciliation failed for user=${resolvedUserId}:`,
            reconcileError
          )
        }

        console.log(`Subscription canceled: ${subscription.id}`)
        break
      }

      // Handle invoice payment (monthly renewal)
      case "invoice.payment_succeeded": {
        const invoice = event.data.object as any
        
        // Skip the first invoice (handled by checkout.session.completed)
        if (invoice.billing_reason === "subscription_create") {
          console.log("Skipping first invoice - handled by checkout.session.completed")
          break
        }

        const subscriptionId = invoice.subscription as string
        const subscription = await stripe.subscriptions.retrieve(subscriptionId) as any
        const userId = subscription.metadata?.user_id
        const tier = subscription.metadata?.tier

        if (!userId || !tier) {
          console.error("Missing user_id or tier in subscription metadata")
          break
        }

        // Get the plan
        const { data: plan } = await supabase
          .from("subscription_plans")
          .select("monthly_credits")
          .eq("tier", tier)
          .single()

        if (!plan) {
          console.error("Plan not found for tier:", tier)
          break
        }

        // Get the subscription record
        const { data: subRecord } = await supabase
          .from("user_subscriptions")
          .select("id")
          .eq("stripe_subscription_id", subscriptionId)
          .single()

        if (subRecord) {
          // Validate timestamps exist
          if (!subscription.current_period_start || !subscription.current_period_end) {
            console.error("Invoice payment subscription missing period timestamps:", subscriptionId)
            break
          }
          
          // Safely convert timestamps
          let periodStart: string
          let periodEnd: string
          try {
            periodStart = new Date(subscription.current_period_start * 1000).toISOString()
            periodEnd = new Date(subscription.current_period_end * 1000).toISOString()
          } catch (e) {
            console.error("Invalid invoice payment timestamps:", e)
            break
          }
          
          // Check if we've already granted credits for this billing period
          const { data: existingRenewal } = await (supabase as any)
            .from("credit_transactions")
            .select("id")
            .eq("user_id", userId)
            .eq("type", "subscription_renewal")
            .eq("subscription_id", subRecord.id)
            .gte("created_at", periodStart)
            .lte("created_at", periodEnd)
            .single()
          
          if (existingRenewal) {
            console.log(`Credits already granted for this billing period (${periodStart} to ${periodEnd}), skipping`)
            break
          }
          
          // Get current user credits
          const { data: currentCredits } = await (supabase as any)
            .from("user_credits")
            .select("*")
            .eq("user_id", userId)
            .single()

          if (!currentCredits) {
            console.error(`User credits not found for user ${userId}, creating new record`)
            // Create user_credits record if it doesn't exist
            const { error: createError } = await (supabase as any)
              .from("user_credits")
              .insert({
                user_id: userId,
                balance: plan.monthly_credits,
                total_purchased: 0,
                total_used: 0,
                has_active_subscription: true,
                subscription_tier: tier,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
              })

            if (createError) {
              console.error("Error creating user_credits for monthly renewal:", createError)
            }

            // Record the transaction
            await (supabase as any)
              .from("credit_transactions")
              .insert({
                user_id: userId,
                type: "subscription_renewal",
                amount: plan.monthly_credits,
                balance_after: plan.monthly_credits,
                subscription_id: subRecord.id,
                usage_description: `Monthly ${tier} subscription renewal`,
                metadata: {
                  tier: tier,
                  period_start: periodStart,
                  period_end: periodEnd,
                  stripe_subscription_id: subscriptionId,
                  invoice_id: invoice.id
                },
                created_at: new Date().toISOString()
              })
          } else {
            // Update existing balance
            const newBalance = (currentCredits.balance || 0) + plan.monthly_credits
            
            const { error: updateError } = await (supabase as any)
              .from("user_credits")
              .update({
                balance: newBalance,
                updated_at: new Date().toISOString()
              })
              .eq("user_id", userId)

            if (updateError) {
              console.error("Error updating user credits for monthly renewal:", updateError)
            } else {
              console.log(`Monthly renewal: Updated user ${userId} balance to ${newBalance} (added ${plan.monthly_credits})`)
            }

            // Record the transaction
            await (supabase as any)
              .from("credit_transactions")
              .insert({
                user_id: userId,
                type: "subscription_renewal",
                amount: plan.monthly_credits,
                balance_after: newBalance,
                subscription_id: subRecord.id,
                usage_description: `Monthly ${tier} subscription renewal`,
                metadata: {
                  tier: tier,
                  period_start: periodStart,
                  period_end: periodEnd,
                  stripe_subscription_id: subscriptionId,
                  invoice_id: invoice.id
                },
                created_at: new Date().toISOString()
              })
          }

          // RPC function removed - we handle everything directly above
        } else {
          console.error(`Subscription record not found for Stripe ID: ${subscriptionId}`)
        }
        break
      }

      // Handle failed payments
      case "invoice.payment_failed": {
        const invoice = event.data.object as any
        const subscriptionId = invoice.subscription as string
        
        await (supabase as any)
          .from("user_subscriptions")
          .update({
            status: "past_due",
          })
          .eq("stripe_subscription_id", subscriptionId)

        console.log(`Payment failed for subscription: ${subscriptionId}`)
        break
      }

      // Handle regular credit purchases (moved to function)
      case "payment_intent.succeeded": {
        // Handled by checkout.session.completed for one-time purchases
        break
      }

      case "payment_intent.payment_failed": {
        const paymentIntent = event.data.object as Stripe.PaymentIntent
        console.error("Payment failed:", paymentIntent.id)

        // If this was an auto-refill charge, disable auto-refill to prevent repeated failures
        if (paymentIntent.metadata?.type === "auto_refill" && paymentIntent.metadata?.user_id) {
          await supabase
            .from("auto_refill_settings")
            .update({ enabled: false, updated_at: new Date().toISOString() })
            .eq("user_id", paymentIntent.metadata.user_id)

          console.log(`Auto-refill disabled for user ${paymentIntent.metadata.user_id} due to payment failure`)
        }
        break
      }

      default:
        console.log(`Unhandled event type: ${event.type}`)
    }

    // Mark event as processed
    await supabase
      .from("stripe_events")
      .update({
        processed: true,
        processed_at: new Date().toISOString(),
      })
      .eq("id", event.id)

    return NextResponse.json({ received: true })
  } catch (error) {
    // Webhook processing error occurred
    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 500 }
    )
  }
}