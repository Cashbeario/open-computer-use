// @vitest-environment jsdom
/**
 * developer-usd-pricing.test.ts — unit tests for the developer-facing USD
 * conversion helpers in app/components/developers/developers-shared.tsx.
 *
 * The developer API wallet is denominated in USD cents. Costs are computed
 * internally in "credits" where 1 credit = 9 cents = $0.09. Developers must see
 * dollars everywhere, so these helpers do the single, exact conversion:
 *
 *   usdCents = round(credits * 9)   ;   usd = $ (usdCents / 100).toFixed(2)
 *
 * jsdom env: developers-shared.tsx is a "use client" module that pulls in
 * framer-motion / lucide / next-intl at import time; jsdom lets it load cleanly.
 */
import { describe, it, expect } from "vitest"
import {
  API_CREDIT_USD_CENTS,
  creditsToUsd,
  creditsToUsdCents,
  formatUsd,
} from "@/app/components/developers/developers-shared"

describe("API_CREDIT_USD_CENTS", () => {
  it("is 9 cents per credit (the source-of-truth rate)", () => {
    expect(API_CREDIT_USD_CENTS).toBe(9)
  })
})

describe("creditsToUsdCents", () => {
  it("converts credits to exact integer cents (credits * 9)", () => {
    expect(creditsToUsdCents(5)).toBe(45)
    expect(creditsToUsdCents(3)).toBe(27)
    expect(creditsToUsdCents(10)).toBe(90)
    expect(creditsToUsdCents(1234)).toBe(11106)
    expect(creditsToUsdCents(0)).toBe(0)
  })

  it("rounds fractional credits to the nearest cent", () => {
    // 4.7 * 9 = 42.3 -> 42 ; 4.8 * 9 = 43.2 -> 43
    expect(creditsToUsdCents(4.7)).toBe(42)
    expect(creditsToUsdCents(4.8)).toBe(43)
  })

  it("treats null/undefined as zero", () => {
    expect(creditsToUsdCents(undefined as unknown as number)).toBe(0)
    expect(creditsToUsdCents(null as unknown as number)).toBe(0)
  })
})

describe("formatUsd", () => {
  it("formats integer cents as $X.XX", () => {
    expect(formatUsd(45)).toBe("$0.45")
    expect(formatUsd(0)).toBe("$0.00")
    expect(formatUsd(90)).toBe("$0.90")
    expect(formatUsd(11106)).toBe("$111.06")
    expect(formatUsd(100)).toBe("$1.00")
  })
})

describe("creditsToUsd", () => {
  it("converts credits straight to a $X.XX string", () => {
    expect(creditsToUsd(5)).toBe("$0.45")
    expect(creditsToUsd(3)).toBe("$0.27")
    expect(creditsToUsd(10)).toBe("$0.90")
    expect(creditsToUsd(1234)).toBe("$111.06")
    expect(creditsToUsd(0)).toBe("$0.00")
  })

  it("always renders exactly two decimal places", () => {
    expect(creditsToUsd(5)).toMatch(/^\$\d+\.\d{2}$/)
    expect(creditsToUsd(0)).toMatch(/^\$\d+\.\d{2}$/)
    expect(creditsToUsd(100)).toMatch(/^\$\d+\.\d{2}$/)
  })
})
