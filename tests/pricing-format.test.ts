/**
 * Tests for lib/pricing/format — the centralised price-renderer helpers.
 *
 * Two layers of guarantee:
 *  1. CONTRACT tests pin the API shape (what each helper returns for
 *     each tier id).  These catch typos / accidental rename regressions.
 *  2. SNAPSHOT tests pin the CURRENT prices verbatim.  If anyone edits
 *     SUBSCRIPTION_TIERS prices in tiers.ts, these tests fail loudly —
 *     forcing a manual review of the diff (so a price change can't
 *     ship silently).
 *
 * Run: npx vitest run tests/pricing-format.test.ts
 */
import { describe, it, expect } from "vitest"
import {
  priceUSD,
  isContactSales,
  priceDollar,
  priceMonthly,
  priceMonthlyLong,
  priceWithName,
  priceTermsForm,
  priceRange,
  priceList,
  cheapestPurchasable,
  flagshipPurchasable,
  startingAt,
  startingAtWithCredits,
} from "@/lib/pricing/format"

// ─── 1. Primitive accessors ────────────────────────────────────────────────

describe("priceUSD", () => {
  it("returns the numeric monthly USD price for each tier", () => {
    expect(priceUSD("free")).toBe(0)
    expect(priceUSD("lite")).toBe(9)
    expect(priceUSD("starter")).toBe(19)
    expect(priceUSD("plus")).toBe(50)
    expect(priceUSD("pro")).toBe(100)
    expect(priceUSD("unlimited")).toBe(99)
    // Enterprise has priceUSD: null in tiers.ts — coalesces to 0 for arithmetic.
    expect(priceUSD("enterprise")).toBe(0)
  })

  it("throws on unknown tier id", () => {
    // @ts-expect-error — testing runtime guard against typo'd ids
    expect(() => priceUSD("bogus-tier")).toThrow(/Unknown tier id/)
  })
})

describe("isContactSales", () => {
  it("returns true only for enterprise (the priceUSD: null tier)", () => {
    expect(isContactSales("enterprise")).toBe(true)
    expect(isContactSales("free")).toBe(false)
    expect(isContactSales("starter")).toBe(false)
    expect(isContactSales("plus")).toBe(false)
    expect(isContactSales("unlimited")).toBe(false)
  })
})

// ─── 2. Display formatters ─────────────────────────────────────────────────

describe("priceDollar", () => {
  it("formats with $-prefix, no period suffix", () => {
    expect(priceDollar("free")).toBe("$0")
    expect(priceDollar("starter")).toBe("$19")
    expect(priceDollar("plus")).toBe("$50")
    expect(priceDollar("unlimited")).toBe("$99")
  })
  it("returns 'Contact sales' for enterprise", () => {
    expect(priceDollar("enterprise")).toBe("Contact sales")
  })
})

describe("priceMonthly", () => {
  it("returns the short /mo form", () => {
    expect(priceMonthly("starter")).toBe("$19/mo")
    expect(priceMonthly("plus")).toBe("$50/mo")
    expect(priceMonthly("unlimited")).toBe("$99/mo")
  })
  it("returns 'Contact sales' for enterprise", () => {
    expect(priceMonthly("enterprise")).toBe("Contact sales")
  })
})

describe("priceMonthlyLong", () => {
  it("returns the long /month form", () => {
    expect(priceMonthlyLong("starter")).toBe("$19/month")
    expect(priceMonthlyLong("unlimited")).toBe("$99/month")
  })
  it("returns 'Contact sales' for enterprise", () => {
    expect(priceMonthlyLong("enterprise")).toBe("Contact sales")
  })
})

describe("priceWithName", () => {
  it("combines plan name + monthly price", () => {
    expect(priceWithName("starter")).toBe("Starter $19/mo")
    expect(priceWithName("plus")).toBe("Plus $50/mo")
    expect(priceWithName("unlimited")).toBe("Unlimited $99/mo")
  })
  it("graceful for enterprise", () => {
    expect(priceWithName("enterprise")).toBe("Enterprise Contact sales")
  })
})

describe("priceTermsForm", () => {
  it("produces the terms-of-service phrasing", () => {
    expect(priceTermsForm("starter")).toBe("Starter Plan ($19/month)")
    expect(priceTermsForm("unlimited")).toBe("Unlimited Plan ($99/month)")
  })
  it("uses 'contact sales' parenthetical for enterprise", () => {
    expect(priceTermsForm("enterprise")).toBe("Enterprise Plan (contact sales)")
  })
})

// ─── 3. Composite formatters ──────────────────────────────────────────────

describe("priceRange", () => {
  // Pins the canonical compare-page boilerplate.  The 17+ competitor
  // pages used to hardcode this exact string; centralising it here means
  // a price change updates them all at once.
  it("returns 'cheapest — most expensive' for current live tiers", () => {
    // Current live: Starter ($19), Plus ($50), Unlimited ($99).
    // Range is cheapest ↔ most expensive — so Starter → Unlimited.
    expect(priceRange()).toBe("$19/mo Starter — $99/mo Unlimited")
  })

  it("includes em-dash separator (not hyphen)", () => {
    // The em-dash ('—' —) is intentional — typographically correct
    // for ranges and matches the existing compare-page copy style.
    expect(priceRange()).toContain("—")
    expect(priceRange()).not.toContain(" - ") // double-dash hyphen guard
  })
})

describe("priceList", () => {
  it("returns 'From X, Y, or Z' joining all purchasable tiers", () => {
    // Three live tiers → comma-separated with 'or' before the last.
    expect(priceList()).toBe(
      "From $19/mo Starter, $50/mo Plus, or $99/mo Unlimited",
    )
  })
})

describe("cheapestPurchasable + flagshipPurchasable", () => {
  it("identifies the cheapest live tier as Starter", () => {
    const c = cheapestPurchasable()
    expect(c).not.toBeNull()
    expect(c?.id).toBe("starter")
    expect(c?.priceUSD).toBe(19)
  })

  it("identifies the most-expensive live tier as Unlimited", () => {
    const f = flagshipPurchasable()
    expect(f).not.toBeNull()
    expect(f?.id).toBe("unlimited")
    expect(f?.priceUSD).toBe(99)
  })
})

describe("startingAt + startingAtWithCredits", () => {
  it("startingAt uses the cheapest purchasable tier", () => {
    expect(startingAt()).toBe("Starting at $19/mo")
  })

  it("startingAtWithCredits adds the monthly credit count in long form", () => {
    expect(startingAtWithCredits()).toBe(
      "Starting at $19/month with 200 credits included",
    )
  })
})

// ─── 4. Snapshot guard — alerts on any price change ──────────────────────

describe("price snapshot — alerts on any tier price change", () => {
  // If any of these assertions fail, a price changed in tiers.ts.  Update
  // the assertion AND verify every consumer surface (compare pages, SEO
  // descriptions, terms, etc.) renders correctly with the new price.

  it("Starter is $19/mo", () => {
    expect(priceMonthly("starter")).toBe("$19/mo")
  })

  it("Plus is $50/mo", () => {
    expect(priceMonthly("plus")).toBe("$50/mo")
  })

  it("Unlimited is $99/mo", () => {
    expect(priceMonthly("unlimited")).toBe("$99/mo")
  })

  it("All seven canonical tier ids are accepted (no missing fields)", () => {
    // Smoke test that the helper handles every defined tier without
    // throwing — catches a missing `priceUSD` on a tier object.
    const ids: import("@/lib/pricing/tiers").SubscriptionTierId[] = [
      "free", "lite", "starter", "plus", "pro", "unlimited", "enterprise",
    ]
    for (const id of ids) {
      expect(typeof priceDollar(id)).toBe("string")
      expect(priceDollar(id).length).toBeGreaterThan(0)
    }
  })
})
