// @vitest-environment jsdom
/**
 * developer-usd-pricing.test.ts — unit tests for the developer-facing USD
 * conversion helpers in app/components/developers/developers-shared.tsx.
 *
 * The developer API wallet is denominated in USD cents. Costs are computed
 * internally in "credits" where 1 credit = 1 cent = $0.01. Developers must see
 * dollars everywhere, so these helpers do the single, exact conversion:
 *
 *   usdCents = round(credits * 1)   ;   usd = $ (usdCents / 100).toFixed(2)
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
  it("is 1 cent per credit (the source-of-truth rate)", () => {
    expect(API_CREDIT_USD_CENTS).toBe(1)
  })
})

describe("creditsToUsdCents", () => {
  it("converts credits to exact integer cents (credits * 1)", () => {
    expect(creditsToUsdCents(5)).toBe(5)
    expect(creditsToUsdCents(3)).toBe(3)
    expect(creditsToUsdCents(10)).toBe(10)
    expect(creditsToUsdCents(1234)).toBe(1234)
    expect(creditsToUsdCents(0)).toBe(0)
  })

  it("rounds fractional credits to the nearest cent", () => {
    // 4.4 * 1 = 4.4 -> 4 ; 4.6 * 1 = 4.6 -> 5
    expect(creditsToUsdCents(4.4)).toBe(4)
    expect(creditsToUsdCents(4.6)).toBe(5)
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
    expect(creditsToUsd(5)).toBe("$0.05")
    expect(creditsToUsd(3)).toBe("$0.03")
    expect(creditsToUsd(10)).toBe("$0.10")
    expect(creditsToUsd(1234)).toBe("$12.34")
    expect(creditsToUsd(0)).toBe("$0.00")
  })

  it("always renders exactly two decimal places", () => {
    expect(creditsToUsd(5)).toMatch(/^\$\d+\.\d{2}$/)
    expect(creditsToUsd(0)).toMatch(/^\$\d+\.\d{2}$/)
    expect(creditsToUsd(100)).toMatch(/^\$\d+\.\d{2}$/)
  })
})
