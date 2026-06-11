/**
 * Geo-aware analytics consent configuration.
 *
 * Two regimes:
 *   - OPT-IN (EU/EEA + UK + Switzerland): the ePrivacy Directive / UK PECR
 *     require PRIOR opt-in before non-essential cookies or analytics fire. For
 *     these visitors analytics stay OFF until the user accepts the banner.
 *   - OPT-OUT (US and everywhere else): analytics may run by default; the user
 *     can opt out via Global Privacy Control or the in-app privacy settings
 *     (CCPA/CPRA is an opt-out regime). No blocking banner is shown.
 *
 * Country is provided by the edge (Cloudflare `cf-ipcountry` / Vercel
 * `x-vercel-ip-country`) and written to the readable `coasty_geo` cookie by
 * middleware so the client can branch without a network round-trip. Unknown
 * country falls through to OPT-OUT (the lawful default outside the EEA/UK).
 */

// ISO 3166-1 alpha-2, uppercase.
export const OPT_IN_COUNTRIES: ReadonlySet<string> = new Set([
  // EU member states
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR",
  "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK",
  "SI", "ES", "SE",
  // EEA (non-EU)
  "IS", "LI", "NO",
  // UK + Switzerland (PECR / revFADP align with the opt-in posture)
  "GB", "CH",
])

/** Readable cookie set by middleware carrying the edge-detected country. */
export const GEO_COOKIE = "coasty_geo"

/**
 * localStorage key for the user's explicit choice. Versioned: bump the suffix
 * after a material change to what analytics collect to re-prompt everyone.
 */
export const CONSENT_STORAGE_KEY = "coasty_consent_v1"

export type ConsentDecision = "granted" | "denied"

export function isOptInCountry(country: string | null | undefined): boolean {
  if (!country) return false
  return OPT_IN_COUNTRIES.has(country.toUpperCase())
}
