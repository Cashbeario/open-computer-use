"use client"

/**
 * PricingSection — minimal editorial pricing.
 *
 * Five plans in a single calm row. One consistent card chrome across all
 * tiers; the highlighted plan is differentiated only by a slightly stronger
 * border and a filled CTA. No scale-ups, no badges, no shimmer, no gauge
 * bars — just price, plan, three checks, button.
 *
 * One calm container fade brings the whole grid in on viewport entry.
 */

import { motion } from "framer-motion"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { ArrowRight, Check } from "lucide-react"
import { cn } from "@/lib/utils"
import { LandingSectionHeader } from "../section-shell"
import { VISIBLE_TIERS, type SubscriptionTierId } from "@/lib/pricing/tiers"

const EASE = [0.22, 1, 0.36, 1] as const

// Numeric data sourced from `lib/pricing/tiers.ts` (canonical). Names,
// descriptions, and CTAs come from i18n via `t("pricing.plans.<key>.*")`.
// Enterprise is filtered out — landing surfaces only the five purchasable
// tiers; enterprise is a footer/contact-sales play, not a card.
type PlanRow = {
  key: SubscriptionTierId
  /** Pre-formatted price string ("$0", "$19", "$100") for display */
  price: string
  credits: number
  machines: number
  swarm: number
  highlighted: boolean
}

const PLAN_DATA: PlanRow[] = VISIBLE_TIERS
  .filter((tier) => tier.id !== "enterprise")
  .map((tier) => ({
    key: tier.id,
    price: `$${tier.priceUSD ?? 0}`,
    credits: tier.creditsPerMonth,
    machines: tier.machinesIncluded,
    swarm: tier.swarmAgentsLimit,
    highlighted: tier.highlighted,
  }))

export function PricingSection({
  isMobile,
  // Reused on the standalone /pricing page, where the page hero already
  // carries the title and the "view detailed comparison" link would point
  // at the current page. Both default to the landing's behaviour.
  showHeader = true,
  hideComparisonLink = false,
}: {
  isMobile: boolean
  showHeader?: boolean
  hideComparisonLink?: boolean
}) {
  const t = useTranslations()
  const tc = useTranslations("common")

  return (
    <section
      id="pricing"
      className="relative py-20 sm:py-24 lg:py-32 px-8 sm:px-10 lg:px-12"
    >
      <div className="max-w-6xl w-full mx-auto">
        {showHeader && (
          <LandingSectionHeader
            title={t("pricing.title")}
            subtitle={t("pricing.subtitle")}
            isMobile={isMobile}
          />
        )}

        {/* One calm container fade for the whole grid — no per-card ladders.
            Unconditional initial/whileInView (matches benchmark/demo/faq): an
            isMobile-gated `initial` is captured by framer once at mount, and
            once isMobile flips true the paired `whileInView={undefined}` leaves
            the grid stranded at opacity 0 on iOS. See tests/lib/mobile-compat. */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0, margin: "0px 0px -80px 0px" }}
          transition={{ duration: 0.4, ease: EASE }}
          className={cn(
            "relative grid gap-3 sm:gap-4 mx-auto",
            // Layout adapts to PLAN_DATA.length so the grid stays legible
            // whether we ship 2, 3, 4, or 5 cards.  See lib/pricing/tiers.ts
            // PURCHASABLE_TIERS — toggle a tier's `purchasable` to add/remove.
            isMobile
              ? "grid-cols-1 max-w-md"
              : PLAN_DATA.length <= 2
                ? "grid-cols-1 sm:grid-cols-2 max-w-3xl"
                : PLAN_DATA.length === 3
                  ? "grid-cols-1 sm:grid-cols-3 max-w-4xl"
                  : PLAN_DATA.length === 4
                    ? "grid-cols-2 lg:grid-cols-4 max-w-5xl"
                    : cn(
                        "grid-cols-2 lg:grid-cols-3 xl:grid-cols-5",
                        // Narrow mode (parent has data-narrow because a video
                        // card is featured): drop from 5-col to 2-col so each
                        // pricing card stays ~340px and the price + feature
                        // list stay legible. Without this override the cards
                        // collapse to ~145px and the price text crashes into
                        // the feature checks.
                        "group-data-[narrow]/feat:grid-cols-1 group-data-[narrow]/feat:lg:grid-cols-2 group-data-[narrow]/feat:xl:grid-cols-2",
                        "group-data-[narrow]/feat:max-w-2xl group-data-[narrow]/feat:mx-auto",
                      ),
          )}
        >
          {PLAN_DATA.map((plan) => {
            const vmLabel =
              plan.machines === 0
                ? t("pricing.vmTemporary")
                : plan.key === "lite"
                  ? t("pricing.vmDeletedAfterInactivity")
                  : plan.machines > 1
                    ? t("pricing.vmAlwaysOnPlural", { count: plan.machines })
                    : t("pricing.vmAlwaysOn", { count: plan.machines })

            return (
              <PlanCard
                key={plan.key}
                plan={plan}
                creditsLabel={
                  plan.key === "unlimited"
                    ? t("pricing.unlimitedCredits")
                    : plan.credits > 0
                      ? tc("creditsPerMonth", { count: plan.credits.toLocaleString() })
                      : "Pay-as-you-go credits"
                }
                vmLabel={vmLabel}
                swarmLabel={
                  // Three cases so the grammar reads right at every count:
                  //  0  → "Single agent at a time"  (free — no swarm mode)
                  //  1  → "1 concurrent agent"      (kept for any future
                  //                                   tier capped at 1;
                  //                                   currently unused)
                  //  2+ → "N agents in parallel"    (paid swarm tiers,
                  //                                   incl. Unlimited at 5)
                  plan.swarm === 0
                    ? "Single agent at a time"
                    : plan.swarm === 1
                      ? "1 concurrent agent"
                      : plan.key === "unlimited"
                        ? `${plan.swarm} concurrent agents`
                        : tc("agentsInParallel", { count: plan.swarm })
                }
                ctaLabel={
                  plan.price === "$0"
                    ? tc("startFree")
                    : t(`pricing.plans.${plan.key}.cta`)
                }
                ctaHref={plan.price === "$0" ? "/auth" : "/pricing"}
                planName={t(`pricing.plans.${plan.key}.name`)}
                planDescription={t(`pricing.plans.${plan.key}.description`)}
                monthLabel={tc("month")}
              />
            )
          })}
        </motion.div>

        {/* Editorial outro — single quiet line of copy. Hidden on the
            standalone /pricing page (where it would link to itself) via
            the hideComparisonLink prop. */}
        {!hideComparisonLink && (
          <div className="mt-14 flex flex-col items-center gap-4">
            <Link
              href="/pricing"
              className="group inline-flex items-center gap-1.5 text-[12px] text-foreground/55 hover:text-foreground transition-colors"
            >
              <span>View detailed comparison</span>
              <ArrowRight className="h-3 w-3 transition-transform duration-300 group-hover:translate-x-0.5" />
            </Link>
          </div>
        )}
      </div>
    </section>
  )
}

// ── Card ──────────────────────────────────────────────────────────────────

function PlanCard({
  plan,
  creditsLabel,
  vmLabel,
  swarmLabel,
  ctaLabel,
  ctaHref,
  planName,
  planDescription,
  monthLabel,
}: {
  plan: (typeof PLAN_DATA)[number]
  creditsLabel: string
  vmLabel: string
  swarmLabel: string
  ctaLabel: string
  ctaHref: string
  planName: string
  planDescription: string
  monthLabel: string
}) {
  // Parse the integer out of "$0" / "$100" for display.
  const price = parseInt(plan.price.replace(/[^0-9]/g, ""), 10) || 0

  const isFree = plan.key === "free"
  const isHighlighted = plan.highlighted
  const isUnlimited = plan.key === "unlimited"

  return (
    <div
      className={cn(
        "group relative rounded-2xl flex flex-col min-w-0",
        "transition-colors duration-300",
        "p-5 sm:p-6",
        // Shared grey card base across the whole landing page.
        "bg-card/40",
        // Unlimited is the flagship — its distinction is carried by a stronger
        // foreground border and a filled CTA, not by a tinted wash, badge, or
        // glow. Typography and weight do the differentiating work.
        isUnlimited
          ? "border border-foreground/45"
          : isHighlighted
            ? "border border-foreground/25"
            : "border border-foreground/10 hover:border-foreground/20",
      )}
    >
      {/* Plan name */}
      <h3 className="font-semibold text-foreground tracking-tight text-base mb-1">
        {planName}
      </h3>

      {/* Description — quiet 1–2 line subtitle */}
      <p className="text-[12.5px] leading-snug text-muted-foreground/65 line-clamp-2 mb-6 min-h-[2.4em]">
        {planDescription}
      </p>

      {/* Price */}
      <div className="mb-5">
        <div className="flex items-baseline gap-0.5">
          <span className="text-foreground/55 text-2xl font-semibold tracking-[-0.04em]">$</span>
          <span className="text-5xl font-semibold tracking-[-0.04em] tabular-nums text-foreground leading-none">
            {price}
          </span>
          <span className="ml-1 text-foreground/45 text-sm">/{monthLabel}</span>
        </div>
        <div className="mt-2 font-mono text-[9.5px] uppercase tracking-[0.22em] text-foreground/35">
          {isFree ? "No credit card" : "Billed monthly"}
        </div>
      </div>

      {/* Hairline */}
      <div className="h-px bg-foreground/8 mb-5" />

      {/* Three feature lines — each is a quiet check + label */}
      <ul className="space-y-2.5 mb-6">
        <FeatureLine label={creditsLabel} dim={plan.credits === 0} />
        <FeatureLine label={vmLabel} />
        <FeatureLine label={swarmLabel} dim={plan.swarm === 0} />
      </ul>

      {/* Spacer pushes CTA to a uniform bottom across the row */}
      <div className="flex-1" />

      {/* CTA */}
      <Link
        href={ctaHref}
        className={cn(
          "relative inline-flex items-center justify-center gap-1.5 w-full rounded-full px-4 py-2.5",
          "text-sm font-medium transition-colors duration-200 border",
          isUnlimited || isHighlighted
            ? "bg-foreground text-background border-foreground hover:bg-foreground/90"
            : "bg-transparent text-foreground border-foreground/15 hover:border-foreground/35 hover:bg-foreground/[0.025]",
        )}
      >
        <span>{ctaLabel}</span>
        <ArrowRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
      </Link>
    </div>
  )
}

// ── Feature line ──────────────────────────────────────────────────────────

function FeatureLine({
  label,
  dim = false,
}: {
  label: string
  dim?: boolean
}) {
  return (
    <li
      className={cn(
        "flex items-start gap-2 text-[12.5px] leading-snug",
        dim ? "text-foreground/40" : "text-foreground/75",
      )}
    >
      <Check
        className={cn(
          "h-3 w-3 mt-[3px] shrink-0",
          dim ? "text-foreground/25" : "text-foreground/55",
        )}
        strokeWidth={2.4}
      />
      <span>{label}</span>
    </li>
  )
}
