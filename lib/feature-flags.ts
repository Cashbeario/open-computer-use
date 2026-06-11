/**
 * Feature flags — central kill-switches for surfaces we want to keep in
 * the codebase but hide from users.
 *
 * Flip a flag here and redeploy; nothing else needs to change.
 */

/**
 * Gates the PUBLIC developer-API marketing surface:
 *   - Landing-nav "API" link → /api-docs
 *   - Mobile drawer "API" row
 *   - Guide "API" tab (/guide?tab=api)
 *   - /api-docs page (returns 404 when off)
 *   - /api-docs entry in sitemap.xml
 *
 * NOT gated by this flag anymore — driven by the runtime platform mode
 * (`usePlatformMode().mode === "developer"`, see lib/platform-mode-store.ts):
 *   - the in-app sidebar "Developer" section / "Developers" entry
 *   - the /developers dashboard page (always renders for authed users)
 * So flipping this flag affects only the public marketing pages, never the
 * per-user in-app developer dashboard.
 *
 * The backend `/api/developers` Next.js routes and the FastAPI public API
 * (/v1/*) are auth-gated and live regardless of this flag.
 */
export const DEVELOPERS_API_ENABLED = true

/**
 * Gates the sidebar platform-mode switcher (Consumer ↔ Developer) shown next
 * to the logo. Turning it off hides the switcher entirely; the user's
 * persisted mode is left untouched, so flipping it back on restores their
 * last choice.
 */
export const PLATFORM_MODE_SWITCHER_ENABLED = true

/**
 * Gates the "Data" view of the landing page (the synthetic computer-use
 * training-data pitch reached via the hero's audience toggle and the
 * ?view=data deep link). Independent of DEVELOPERS_API_ENABLED — the hero
 * toggle renders whenever more than one landing view is enabled.
 */
export const DATA_LANDING_ENABLED = true
