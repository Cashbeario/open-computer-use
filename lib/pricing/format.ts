/**
 * Canonical price-renderer helpers for Coasty subscription tiers.
 *
 * EVERY surface that displays a tier price should go through this module
 * — components, SEO descriptions, layout metadata, compare pages,
 * marketing copy.  The numeric source-of-truth is `lib/pricing/tiers.ts`
 * (the SUBSCRIPTION_TIERS array); these helpers are the renderer/formatter
 * layer on top so a price change is a one-line edit in tiers.ts that
 * propagates everywhere.
 *
 * Boost-package prices live in BOOST_PACKAGES; this file currently
 * focuses on subscription-tier prices (the high-traffic concern).
 *
 * Design rules:
 *  - All helpers are PURE — no I/O, no side effects, deterministic.
 *  - Fail fast on unknown tier ids (avoids silent "0.00" leaks).
 *  - Default to short-form ("/mo") since that's the most common surface;
 *    long-form ("/month") variants are explicit opt-in.
 *  - Enterprise (priceUSD === null) returns "Contact sales".
 *  - Free (priceUSD === 0) returns "$0" — call sites can override if they
 *    want to say "Free" instead.
 *
 * Snapshot tests in tests/pricing-format.test.ts pin the rendered output
 * for the current tier prices.  If a price changes, the snapshot fails
 * loudly so the diff is reviewable.
 */

import {
  SUBSCRIPTION_TIERS,
  type SubscriptionTier,
  type SubscriptionTierId,
} from "./tiers"

// ─── Internal lookups ──────────────────────────────────────────────────────

function tierOrThrow(id: SubscriptionTierId): SubscriptionTier {
  const t = SUBSCRIPTION_TIERS.find((t) => t.id === id)
  if (!t) {
    throw new Error(
      `[lib/pricing/format] Unknown tier id "${id}".  Valid ids: ${SUBSCRIPTION_TIERS.map((t) => t.id).join(", ")}`,
    )
  }
  return t
}

// ─── Primitive accessors ───────────────────────────────────────────────────

/**
 * Numeric monthly price in USD as a plain number.  Returns 0 for Free,
 * and 0 for Enterprise (which has `priceUSD: null` in tiers.ts — use
 * `isContactSales(tier)` to distinguish if you need to).
 *
 * Use for arithmetic (e.g., "saves $X vs PAYG", "annualized cost").
 * Use `priceDollar()` or `priceMonthly()` for display.
 */
export function priceUSD(id: SubscriptionTierId): number {
  return tierOrThrow(id).priceUSD ?? 0
}

/** True iff the tier has no numeric price (e.g., "Enterprise — contact sales"). */
export function isContactSales(id: SubscriptionTierId): boolean {
  return tierOrThrow(id).priceUSD === null
}

// ─── Display formatters ────────────────────────────────────────────────────

/**
 * Bare currency string with no period suffix: `"$19"`, `"$99"`, `"$0"`,
 * `"Contact sales"` for Enterprise.
 *
 * Use this when surrounding copy already supplies "/mo" or "/month" — e.g.,
 * inside a `${price} /month` template or as a standalone headline number.
 */
export function priceDollar(id: SubscriptionTierId): string {
  const tier = tierOrThrow(id)
  if (tier.priceUSD === null) return "Contact sales"
  return `$${tier.priceUSD}`
}

/**
 * Short monthly form: `"$19/mo"`, `"$99/mo"`, `"Contact sales"`.
 *
 * This is the most-common surface (cards, comparison strings, badges,
 * SEO og:descriptions).  When in doubt, use this one.
 */
export function priceMonthly(id: SubscriptionTierId): string {
  const tier = tierOrThrow(id)
  if (tier.priceUSD === null) return "Contact sales"
  return `$${tier.priceUSD}/mo`
}

/**
 * Long monthly form: `"$19/month"`, `"$99/month"`, `"Contact sales"`.
 *
 * Use in prose where "/mo" reads as overly informal (terms-of-service,
 * blog posts, formal marketing copy).
 */
export function priceMonthlyLong(id: SubscriptionTierId): string {
  const tier = tierOrThrow(id)
  if (tier.priceUSD === null) return "Contact sales"
  return `$${tier.priceUSD}/month`
}

/**
 * Combined name + price: `"Starter $19/mo"`, `"Unlimited $99/mo"`.
 *
 * Use in comparison tables, badges, and short marketing strings where
 * the price needs to be paired with the plan name in one token.
 */
export function priceWithName(id: SubscriptionTierId): string {
  const tier = tierOrThrow(id)
  return `${tier.name} ${priceMonthly(id)}`
}

/**
 * Plan + parenthesised long price: `"Starter Plan ($19/month)"`,
 * `"Unlimited Plan ($99/month)"`.
 *
 * Used in the terms-of-service page where formal "Plan" + parens style
 * reads better than the short comparison form.
 */
export function priceTermsForm(id: SubscriptionTierId): string {
  const tier = tierOrThrow(id)
  if (tier.priceUSD === null) return `${tier.name} Plan (contact sales)`
  return `${tier.name} Plan (${priceMonthlyLong(id)})`
}

// ─── Multi-tier composite formatters ───────────────────────────────────────

/**
 * Sorted list of currently-purchasable tiers, cheapest-first.  Excludes
 * enterprise (priceUSD === null).  Used as the base for range/list
 * helpers below.
 */
function purchasableSorted(): SubscriptionTier[] {
  return SUBSCRIPTION_TIERS
    .filter((t) => t.purchasable && t.priceUSD !== null)
    .slice()
    .sort((a, b) => (a.priceUSD ?? 0) - (b.priceUSD ?? 0))
}

/**
 * The canonical "compare-page boilerplate" string:
 *   `"$19/mo Starter — $99/mo Unlimited"`
 *
 * Renders the cheapest and most expensive currently-purchasable tiers
 * with their names and an em-dash separator.  This is the string the
 * 17+ competitor-comparison pages used to hardcode.
 *
 * If only one purchasable tier exists, returns that one alone
 * (`"$19/mo Starter"`).  If zero, returns an empty string (defensive
 * — should never happen in practice but avoids "undefined undefined").
 */
export function priceRange(): string {
  const tiers = purchasableSorted()
  if (tiers.length === 0) return ""
  if (tiers.length === 1) return `${priceMonthly(tiers[0].id)} ${tiers[0].name}`
  const lo = tiers[0]
  const hi = tiers[tiers.length - 1]
  return `${priceMonthly(lo.id)} ${lo.name} — ${priceMonthly(hi.id)} ${hi.name}`
}

/**
 * Compact list of all purchasable prices, cheapest-first:
 *   `"From $19/mo Starter or $99/mo Unlimited"` (2 tiers)
 *   `"From $19/mo Starter, $50/mo Plus, or $99/mo Unlimited"` (3+ tiers)
 *
 * Used in SEO descriptions where listing all purchase options is
 * preferable to the cheapest/most-expensive range.  Joins with "or"
 * before the last item; uses commas between earlier items.
 */
export function priceList(): string {
  const tiers = purchasableSorted()
  if (tiers.length === 0) return ""
  if (tiers.length === 1) {
    return `From ${priceMonthly(tiers[0].id)} ${tiers[0].name}`
  }
  if (tiers.length === 2) {
    return `From ${priceMonthly(tiers[0].id)} ${tiers[0].name} or ${priceMonthly(tiers[1].id)} ${tiers[1].name}`
  }
  const parts = tiers.map((t) => `${priceMonthly(t.id)} ${t.name}`)
  const last = parts.pop()!
  return `From ${parts.join(", ")}, or ${last}`
}

/**
 * Cheapest-purchasable tier — useful for "Starting at $X/mo" callouts.
 *
 * Returns the SubscriptionTier object so callers can access name + price
 * together.  Returns `null` if no purchasable tier exists.
 */
export function cheapestPurchasable(): SubscriptionTier | null {
  return purchasableSorted()[0] ?? null
}

/**
 * Most expensive purchasable tier (= the flagship).  Returns the tier
 * object; null if none exist.
 */
export function flagshipPurchasable(): SubscriptionTier | null {
  const t = purchasableSorted()
  return t[t.length - 1] ?? null
}

/**
 * "Starting at $19/mo" — short cheapest-tier callout.  Used in the
 * insufficient-credits modal and any "join now" CTA.
 */
export function startingAt(): string {
  const cheapest = cheapestPurchasable()
  if (!cheapest) return ""
  return `Starting at ${priceMonthly(cheapest.id)}`
}

/**
 * "Starting at $19/month with 200 credits included" — long-form
 * cheapest-tier callout including monthly credits.
 */
export function startingAtWithCredits(): string {
  const cheapest = cheapestPurchasable()
  if (!cheapest) return ""
  return `Starting at ${priceMonthlyLong(cheapest.id)} with ${cheapest.creditsPerMonth.toLocaleString()} credits included`
}

// ─── i18n variable bag ─────────────────────────────────────────────────────

/**
 * The complete set of price placeholders consumed by next-intl message
 * strings.  Pass to `t(key, i18nPriceVars())` for any key that contains
 * `{starterPrice}`, `{unlimitedPrice}`, etc.
 *
 * Returns ALL placeholder names so a caller can hand the whole object
 * to `t()` regardless of which placeholders the message actually uses
 * (next-intl silently drops unused placeholders).  Saves call sites
 * from having to know which placeholders each message contains.
 *
 * Placeholder catalogue — must stay in sync with
 * scripts/centralize-i18n-prices.mjs REPLACEMENTS table:
 *   {litePrice}            → "$9/mo"
 *   {starterPrice}         → "$19/mo"
 *   {starterPriceLong}     → "$19/month"
 *   {plusPrice}            → "$50/mo"
 *   {proPrice}             → "$100/mo"
 *   {unlimitedPrice}       → "$99/mo"
 *   {unlimitedPriceLong}   → "$99/month"
 */
export function i18nPriceVars(): Record<string, string> {
  return {
    litePrice:          priceMonthly("lite"),
    starterPrice:       priceMonthly("starter"),
    starterPriceLong:   priceMonthlyLong("starter"),
    plusPrice:          priceMonthly("plus"),
    proPrice:           priceMonthly("pro"),
    unlimitedPrice:     priceMonthly("unlimited"),
    unlimitedPriceLong: priceMonthlyLong("unlimited"),
  }
}
