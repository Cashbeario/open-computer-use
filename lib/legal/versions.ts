/**
 * Single source of truth for the version of our legal documents.
 *
 * These constants are imported by (a) the public /terms and /privacy pages so
 * the displayed "effective date" can never drift from the recorded version,
 * and (b) the consent-recording paths (web /auth/callback and the backend
 * /api/me/consent endpoint) so every stored acceptance is tied to an exact
 * document version.
 *
 * When you materially change the Terms or Privacy Policy:
 *   1. Bump the relevant *_VERSION below (use the new "Last updated" date).
 *   2. Bump the matching constant in backend/app/api/routes/privacy.py
 *      (LEGAL_TERMS_VERSION / LEGAL_PRIVACY_VERSION) so web + Electron agree.
 *   3. Existing users will be re-prompted and a fresh consent row recorded the
 *      next time they accept (the consent table is keyed on user + versions).
 *
 * Versions are plain dates (YYYY-MM-DD) so they sort and read cleanly.
 */

export const TERMS_VERSION = "2026-06-10"
export const PRIVACY_VERSION = "2026-06-10"

/** Human-readable forms shown on the public legal pages. */
export const TERMS_EFFECTIVE_DATE = "June 10, 2026"
export const PRIVACY_LAST_UPDATED = "June 10, 2026"
