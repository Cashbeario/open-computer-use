import { describe, it, expect } from "vitest"
import { isOptInCountry, OPT_IN_COUNTRIES } from "@/lib/consent/config"

describe("consent geo classification", () => {
  it("treats EU member states as opt-in (prior consent required)", () => {
    for (const c of ["DE", "FR", "IT", "ES", "NL", "PL", "IE", "SE"]) {
      expect(isOptInCountry(c)).toBe(true)
    }
  })

  it("treats UK, Switzerland, and EEA non-EU as opt-in", () => {
    for (const c of ["GB", "CH", "NO", "IS", "LI"]) {
      expect(isOptInCountry(c)).toBe(true)
    }
  })

  it("treats the US and other non-EEA countries as opt-out (no prior consent)", () => {
    for (const c of ["US", "CA", "BR", "IN", "JP", "AU", "MX", "ZA"]) {
      expect(isOptInCountry(c)).toBe(false)
    }
  })

  it("is case-insensitive on the country code", () => {
    expect(isOptInCountry("de")).toBe(true)
    expect(isOptInCountry("Gb")).toBe(true)
    expect(isOptInCountry("us")).toBe(false)
  })

  it("treats unknown/empty country as opt-out (lawful default outside EEA/UK)", () => {
    expect(isOptInCountry("")).toBe(false)
    expect(isOptInCountry(null)).toBe(false)
    expect(isOptInCountry(undefined)).toBe(false)
    expect(isOptInCountry("XX")).toBe(false)
  })

  it("covers all 27 EU members plus EEA + UK + CH (32 total)", () => {
    // 27 EU + 3 EEA (IS, LI, NO) + GB + CH = 32. Guards against accidental
    // deletions from the opt-in set.
    expect(OPT_IN_COUNTRIES.size).toBe(32)
  })
})
