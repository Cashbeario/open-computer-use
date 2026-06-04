/**
 * Budget-enforcement test for the /connections surface and its satellites.
 *
 * Why this exists:
 *   Translations regularly overflow tight UI containers (filter pills,
 *   status badges, primary CTAs). Designers fix the container, but six
 *   months later a fresh translation round trips in and silently breaks
 *   the layout again. This test pins a per-key character budget so any
 *   translation overflow trips CI before it ships.
 *
 * How it works:
 *   1. BUDGET_TABLE below is the SOURCE OF TRUTH for tight-fit keys.
 *      Each entry is derived from a UI-side container audit
 *      (rounded-full pills, h-7 buttons, line-clamp-1 cards, etc.).
 *      Only `must_fit` and `truncate` keys are enforced — wrap-OK keys
 *      are intentionally excluded.
 *   2. For each locale in `i18n/config.ts`, we load messages/<locale>.json
 *      and walk every (key, budget) pair, asserting char_count <= budget.
 *      CJK locales (ja, ko, zh) use the `cjkBudget` because CJK glyphs
 *      occupy ~1.5–2× the horizontal space of Latin glyphs per char,
 *      so the practical char ceiling is lower.
 *   3. Errors are formatted so a translator can fix the locale file
 *      directly without re-reading the UI source — they get the locale
 *      code, key, overflow amount, the offending value, and suggestions.
 *
 * To extend: append a new entry to BUDGET_TABLE. To temporarily exempt
 * a locale while a translation is being re-vendored, add it to
 * `entry.exemptLocales` (a Set) — but DO NOT bump budgets unless the
 * underlying container actually changed in the UI.
 *
 * Run: npx vitest run tests/i18n-connections-budget.test.ts
 */
import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import path from "node:path"
import { locales, type Locale } from "@/i18n/config"

// ─── 1. Budget table — source of truth ─────────────────────────────────────
//
// Each entry lists ONE i18n dot-path that targets a tight UI container.
// `budget` = Latin char ceiling, `cjkBudget` = CJK char ceiling.
// `container` is a human hint for the failure message.
// `suggestion` is a shorter alternative the translator can lift directly
// if the key overflows in their locale.

interface BudgetEntry {
  /** dot-path into messages/<locale>.json */
  key: string
  /** char ceiling for Latin / non-CJK locales */
  budget: number
  /** char ceiling for ja / ko / zh */
  cjkBudget: number
  /** short human description of the container (for the error message) */
  container: string
  /** copy ideas a translator can use when over budget */
  suggestion: string
}

const BUDGET_TABLE: BudgetEntry[] = [
  // ── /connections page chrome ────────────────────────────────────────────
  {
    key: "connections.connectedSuffix",
    budget: 14,
    cjkBudget: 8,
    container: "pill (rounded-full border px-2.5 py-0.5 text-xs)",
    suggestion: "one short word (EN: 'connected'); CJK should be 1–3 chars",
  },
  {
    key: "connections.newConnection",
    budget: 22,
    cjkBudget: 12,
    container: "primary button (Button size=sm h-9 rounded-xl px-4, icon+text)",
    suggestion: "verb + noun (EN: 'New connection'); avoid full sentences",
  },
  {
    key: "connections.retry",
    budget: 18,
    cjkBudget: 10,
    container: "button (Button size=sm h-8 rounded-lg px-3 text-xs)",
    suggestion: "single verb (EN: 'Retry')",
  },
  // ── filter pills (.filters.*) ───────────────────────────────────────────
  {
    key: "connections.filters.all",
    budget: 14,
    cjkBudget: 8,
    container: "filter pill (button px-3.5 py-1.5 rounded-lg + count badge)",
    suggestion: "one word; EN: 'All'",
  },
  {
    key: "connections.filters.active",
    budget: 14,
    cjkBudget: 8,
    container: "filter pill",
    suggestion: "one word; EN: 'Active'",
  },
  {
    key: "connections.filters.connecting",
    budget: 14,
    cjkBudget: 8,
    container: "filter pill",
    suggestion: "one word (EN 'Connecting' = 10 chars, already tight)",
  },
  {
    key: "connections.filters.expired",
    budget: 14,
    cjkBudget: 8,
    container: "filter pill",
    suggestion: "one word; EN: 'Expired'",
  },
  {
    key: "connections.filters.failed",
    budget: 14,
    cjkBudget: 8,
    container: "filter pill",
    suggestion: "one word; EN: 'Failed'",
  },
  // ── card status pills (.status.*) ───────────────────────────────────────
  {
    key: "connections.status.active",
    budget: 12,
    cjkBudget: 7,
    container: "status-pill (span text-[11px] tracking-[0.01em], no truncate)",
    suggestion: "one word; EN: 'Active'",
  },
  {
    key: "connections.status.initiated",
    budget: 12,
    cjkBudget: 7,
    container: "status-pill",
    suggestion: "one word (EN 'Connecting' = 10 chars; CJK use 2–3 char term)",
  },
  {
    key: "connections.status.expired",
    budget: 12,
    cjkBudget: 7,
    container: "status-pill",
    suggestion: "one word; EN: 'Expired'",
  },
  {
    key: "connections.status.failed",
    budget: 12,
    cjkBudget: 7,
    container: "status-pill",
    suggestion: "one word; EN: 'Revoked'",
  },
  {
    key: "connections.status.inactive",
    budget: 12,
    cjkBudget: 7,
    container: "status-pill",
    suggestion: "one word; EN: 'Inactive'",
  },
  {
    key: "connections.status.failedShort",
    budget: 10,
    cjkBudget: 6,
    container: "status-pill (inline-flex rounded-full px-2 py-0.5 text-[10.5px])",
    suggestion: "shortest possible; EN: 'Failed' (uses 'failed' synonym)",
  },
  // ── card actions ────────────────────────────────────────────────────────
  {
    key: "connections.card.fallbackAccountLabel",
    budget: 24,
    cjkBudget: 14,
    container: "truncated label (text-muted-foreground/40 truncate)",
    suggestion: "short noun phrase; EN: 'Account'",
  },
  {
    key: "connections.card.actions.reconnect",
    budget: 12,
    cjkBudget: 7,
    container: "button (Button size=sm h-7 rounded-lg px-2.5 text-[11px] gap-1)",
    suggestion: "single verb; EN: 'Reconnect'",
  },
  {
    key: "connections.card.disconnectDialog.confirm",
    budget: 20,
    cjkBudget: 12,
    container: "button (AlertDialogAction h-9 px-4 rounded-lg text-[13px])",
    suggestion: "verb phrase; EN: 'Disconnect'",
  },
  {
    key: "connections.card.disconnectDialog.cancel",
    budget: 20,
    cjkBudget: 12,
    container: "button (AlertDialogCancel h-9 px-4 rounded-lg text-[13px])",
    suggestion: "verb phrase; EN: 'Keep connection' (15 chars, near edge)",
  },
  // ── empty-state CTA ────────────────────────────────────────────────────
  {
    key: "connections.emptyState.browseAppsCta",
    budget: 22,
    cjkBudget: 13,
    container: "button (size=lg h-11 px-6 rounded-xl max-w-xs)",
    suggestion: "verb + noun; EN: 'Browse apps'",
  },
  // ── connect-app dialog search + categories ─────────────────────────────
  {
    key: "connections.connectDialog.searchPlaceholder",
    budget: 30,
    cjkBudget: 18,
    container: "Input placeholder (h-10 sm:h-9 rounded-xl text-[13.5px] pl-9 pr-9)",
    suggestion: "short prompt; EN: 'Search apps...'",
  },
  {
    key: "connections.connectDialog.categories.all",
    budget: 14,
    cjkBudget: 8,
    container: "filter pill in snap-x scroller (shrink-0, no wrap)",
    suggestion: "one word; EN: 'All'",
  },
  {
    key: "connections.connectDialog.categories.communication",
    budget: 14,
    cjkBudget: 8,
    container: "filter pill in snap-x scroller",
    suggestion: "one word (EN 'Communication' = 13 chars, already at cap)",
  },
  {
    key: "connections.connectDialog.categories.productivity",
    budget: 14,
    cjkBudget: 8,
    container: "filter pill in snap-x scroller",
    suggestion: "one word; EN 'Productivity' = 12 chars",
  },
  {
    key: "connections.connectDialog.categories.calendar",
    budget: 14,
    cjkBudget: 8,
    container: "filter pill in snap-x scroller",
    suggestion: "one word; EN: 'Calendar'",
  },
  {
    key: "connections.connectDialog.categories.developer",
    budget: 14,
    cjkBudget: 8,
    container: "filter pill in snap-x scroller",
    suggestion: "one word; EN: 'Developer'",
  },
  {
    key: "connections.connectDialog.categories.crmSales",
    budget: 14,
    cjkBudget: 8,
    container: "filter pill in snap-x scroller",
    suggestion: "short abbrev; EN: 'CRM & Sales'",
  },
  // ── connect-app dialog grid cards (line-clamp-1) ───────────────────────
  {
    key: "connections.connectDialog.card.connectedLabel",
    budget: 18,
    cjkBudget: 11,
    container: "paragraph (text-[11.5px] line-clamp-1) on grid card",
    suggestion: "1–2 words; EN: 'Connected'",
  },
  {
    key: "connections.connectDialog.card.connectFallbackDescription",
    budget: 40,
    cjkBudget: 25,
    container: "paragraph (text-[11.5px] line-clamp-1)",
    suggestion: "short phrase with {name}; EN: 'Connect {name} to Coasty'",
  },
  // ── connect-app dialog footer ──────────────────────────────────────────
  {
    key: "connections.connectDialog.footer.cancel",
    budget: 18,
    cjkBudget: 11,
    container: "button (h-8 px-3.5 rounded-lg text-[12.5px])",
    suggestion: "single verb; EN: 'Cancel'",
  },
  // ── tool-invocation reauth banner ──────────────────────────────────────
  {
    key: "connections.reauth.reconnectLink",
    budget: 16,
    cjkBudget: 10,
    container: "link (text-xs font-medium whitespace-nowrap) — MUST NOT WRAP",
    suggestion: "verb + arrow; EN: 'Reconnect →'",
  },
  // ── settings integrations section ──────────────────────────────────────
  {
    key: "settings.integrations.connectNewApp",
    budget: 18,
    cjkBudget: 11,
    container: "button (Button size=sm h-8 rounded-lg px-3 text-[12px])",
    suggestion: "short verb phrase; EN: 'Connect app'",
  },
  {
    key: "settings.integrations.manageOnFullPage",
    budget: 24,
    cjkBudget: 14,
    container: "inline link (text-[11.5px]) with ArrowRight",
    suggestion: "short phrase; EN: 'Manage all →'",
  },
  {
    key: "connections.row.disconnect",
    budget: 12,
    cjkBudget: 7,
    container: "button (Button size=sm h-7 px-2 text-[11.5px]) with Trash2 icon",
    suggestion: "single verb; EN: 'Remove'",
  },
  // ── account dialog nav + sidebar ───────────────────────────────────────
  {
    key: "accountDialog.sections.integrations.label",
    budget: 22,
    cjkBudget: 13,
    container: "nav-row text-[13px] + desktop heading text-[15px] font-semibold",
    suggestion: "single noun; EN: 'Integrations'",
  },
  {
    key: "accountDialog.sections.integrations.description",
    budget: 40,
    cjkBudget: 25,
    container: "mobile description text-[11px] truncate",
    suggestion: "very short tagline; one clause",
  },
  {
    key: "sidebar.connections",
    budget: 22,
    cjkBudget: 13,
    container: "sidebar nav-row (flex-1 truncate text-[12px] tracking-[-0.01em])",
    suggestion: "single noun; EN: 'Connections'",
  },
  // ── SEO meta (search-result truncation) ────────────────────────────────
  {
    key: "seo.connections.title",
    budget: 60,
    cjkBudget: 30,
    container: "browser <title> + Google SERP (truncates ~60 chars)",
    suggestion: "page name + brand; keep under 60 to avoid SERP ellipsis",
  },
  {
    key: "seo.connections.ogTitle",
    budget: 60,
    cjkBudget: 30,
    container: "og:title + twitter:title (Twitter caps 70; convention 60)",
    suggestion: "headline-style; EN current ('Connect …') is 64 chars — already over",
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Polymorphic auth-scheme connect dialog
  //
  // The connect-app dialog grew a per-scheme credential form (API_KEY,
  // BEARER_TOKEN, BASIC, NO_AUTH, …) and an "unsupported scheme" fallback
  // card.  Each new label / placeholder / CTA lives in a tight UI container
  // — field <Label>, Input placeholder, primary-button row, AlertDialog
  // body.  Budgets below are derived from a fresh container audit on the
  // feature/background-mode-cua-driver dialog.
  //
  // These budgets are intentionally enforced on EVERY locale.  Locales that
  // have not yet translated the new keys are silently skipped by the
  // resolveDotPath() guard above, so adding budgets here is safe before the
  // translation round-trip completes — but as soon as a locale picks up
  // the new key, this test gates its character count.
  // ─────────────────────────────────────────────────────────────────────────

  // NOTE on key paths: the connect-app dialog actually lives under
  // `connections.connectDialog.confirm.*` (NOT the spec's draft
  // `connections.confirm.*`).  The keys below match the SHIPPED tree —
  // see messages/en.json::connections.connectDialog.confirm.{fields,cta,
  // unsupported,noAuthHint,apiKeyHelp,connectedToast}.

  // ── credential field labels (inline <Label> above each Input) ──────────
  {
    key: "connections.connectDialog.confirm.fields.apiKeyLabel",
    budget: 22,
    cjkBudget: 13,
    container: "<Label> above CredentialField (text-[12px] font-medium)",
    suggestion: "noun phrase; EN: 'API key'",
  },
  {
    key: "connections.connectDialog.confirm.fields.apiKeyPlaceholder",
    budget: 36,
    cjkBudget: 22,
    container:
      "Input placeholder (h-10 rounded-xl text-[13.5px] pl-3 pr-9, password-masked)",
    suggestion: "short prompt; EN: 'Paste your API key'",
  },
  {
    key: "connections.connectDialog.confirm.fields.bearerTokenLabel",
    budget: 22,
    cjkBudget: 13,
    container: "<Label> above CredentialField",
    suggestion: "noun phrase; EN: 'Bearer token'",
  },
  {
    key: "connections.connectDialog.confirm.fields.bearerTokenPlaceholder",
    budget: 36,
    cjkBudget: 22,
    container: "Input placeholder",
    suggestion: "short prompt; EN: 'Paste your bearer token'",
  },
  {
    key: "connections.connectDialog.confirm.fields.basicAuthUsername",
    budget: 22,
    cjkBudget: 13,
    container: "<Label> above CredentialField",
    suggestion: "noun phrase; EN: 'Username'",
  },
  {
    key: "connections.connectDialog.confirm.fields.basicAuthPassword",
    budget: 22,
    cjkBudget: 13,
    container: "<Label> above CredentialField",
    suggestion: "noun phrase; EN: 'Password'",
  },
  {
    key: "connections.connectDialog.confirm.fields.basicAuthUsernamePlaceholder",
    budget: 44,
    cjkBudget: 26,
    container: "Input placeholder",
    suggestion: "short prompt; EN: 'Your account username'",
  },
  {
    key: "connections.connectDialog.confirm.fields.basicAuthPasswordPlaceholder",
    budget: 44,
    cjkBudget: 26,
    container: "Input placeholder",
    suggestion: "short prompt; EN: 'Your account password'",
  },
  {
    key: "connections.connectDialog.confirm.fields.revealSecret",
    budget: 14,
    cjkBudget: 8,
    container:
      "eye-toggle button label (sr-only aria, but also tooltip on h-7 chip)",
    suggestion: "single verb; EN: 'Show'",
  },
  {
    key: "connections.connectDialog.confirm.fields.hideSecret",
    budget: 14,
    cjkBudget: 8,
    container: "eye-toggle button label",
    suggestion: "single verb; EN: 'Hide'",
  },

  // ── primary CTA per auth kind ──────────────────────────────────────────
  {
    key: "connections.connectDialog.confirm.cta.connect",
    budget: 28,
    cjkBudget: 16,
    container:
      "primary CTA (Button size=sm h-9 rounded-xl px-4 with icon, gap-2)",
    suggestion: "verb phrase; EN: 'Connect with Composio'",
  },
  {
    key: "connections.connectDialog.confirm.cta.connectWithApiKey",
    budget: 26,
    cjkBudget: 16,
    container: "primary CTA",
    suggestion: "verb phrase; EN: 'Save & connect'",
  },
  {
    key: "connections.connectDialog.confirm.cta.connectWithBearerToken",
    budget: 26,
    cjkBudget: 16,
    container: "primary CTA",
    suggestion: "verb phrase; EN: 'Save & connect'",
  },
  {
    key: "connections.connectDialog.confirm.cta.connectWithBasic",
    budget: 26,
    cjkBudget: 16,
    container: "primary CTA",
    suggestion: "verb phrase; EN: 'Save & connect'",
  },
  {
    key: "connections.connectDialog.confirm.cta.connectNoAuth",
    budget: 14,
    cjkBudget: 8,
    container: "primary CTA",
    suggestion: "single verb; EN: 'Enable'",
  },
  {
    key: "connections.connectDialog.confirm.cta.connecting",
    budget: 22,
    cjkBudget: 13,
    container: "primary CTA in-flight label",
    suggestion: "gerund + ellipsis; EN: 'Connecting...'",
  },

  // ── informational hints / toasts ───────────────────────────────────────
  {
    key: "connections.connectDialog.confirm.noAuthHint",
    budget: 120,
    cjkBudget: 70,
    container: "paragraph body (text-[12.5px] leading-snug, max-w-prose)",
    suggestion:
      "single sentence with {name}; EN: '{name} does not require credentials. Click Enable to add it to your workspace.'",
  },
  {
    key: "connections.connectDialog.confirm.apiKeyHelp",
    // Question-form phrasings expand significantly in languages with
    // long auxiliary verbs (Malay, Filipino, Finnish).  EN 21 chars;
    // 38 ceiling allows ~80% expansion before the underline-only link
    // forces a layout break in the inline-helper row.
    budget: 38,
    cjkBudget: 22,
    container: "inline link below Input (text-[11.5px] underline-offset-2)",
    suggestion: "short link copy; EN: 'Where do I find this?'",
  },
  {
    key: "connections.connectDialog.confirm.connectedToast",
    budget: 40,
    cjkBudget: 24,
    container: "toast title (sonner — single line truncate ~40 chars)",
    suggestion: "short success line with {name}; EN: 'Connected to {name}'",
  },

  // ── unsupported scheme fallback card ───────────────────────────────────
  {
    key: "connections.connectDialog.confirm.unsupported.title",
    // EN 42 chars.  Card title can wrap to 2 lines; cap prevents 3+.
    budget: 56,
    cjkBudget: 34,
    container: "card title (text-[14px] font-semibold)",
    suggestion: "EN: 'This connection type is not supported yet'",
  },
  {
    key: "connections.connectDialog.confirm.unsupported.body",
    budget: 220,
    cjkBudget: 132,
    container: "card body (text-[12.5px] leading-snug)",
    suggestion: "EN-style with {name} and {scheme}; keep under 220 chars",
  },
  {
    key: "connections.connectDialog.confirm.unsupported.openComposioDashboard",
    // EN 23 chars (incl. brand "Composio"); cap 36 to accommodate
    // ~55% expansion for verb-leading languages (de "Composio-Dashboard öffnen").
    budget: 36,
    cjkBudget: 22,
    container: "secondary anchor CTA (Button variant=outline size=sm h-8)",
    suggestion: "verb phrase; EN: 'Open Composio dashboard'",
  },

  // ── inline error banner (connections.errors.*) ─────────────────────────
  // These error banners DO wrap (multi-line in the dialog footer / toast
  // body), so budgets are looser than pill-sized labels. The ceiling
  // prevents three-line walls of text that overflow the dialog.
  // EN-typical: 30–70 chars; budget allows ~40% expansion (typical
  // translation-fluff ratio for verbose locales: de, fr, fi, pl).
  {
    key: "connections.errors.credentialsRequired",
    budget: 80,
    cjkBudget: 48,
    container: "inline error (text-[11.5px] text-destructive) — wraps",
    suggestion: "single sentence; EN: 'Please fill in all required fields...'",
  },
  {
    key: "connections.errors.credentialsErrorPrefix",
    budget: 40,
    cjkBudget: 24,
    container: "inline error prefix (text-[11.5px] font-medium) — wraps with detail",
    suggestion: "label + colon; EN: 'Connection failed:'",
  },
  {
    key: "connections.errors.unknownToolkit",
    budget: 110,
    cjkBudget: 66,
    container: "inline error / toast body (multi-line)",
    suggestion: "EN: 'We do not recognise this app...'",
  },
  {
    key: "connections.errors.unsupportedAuthScheme",
    budget: 110,
    cjkBudget: 66,
    container: "inline error / toast body (multi-line)",
    suggestion:
      "EN: 'This authentication method is not supported in the app yet.'",
  },
  {
    key: "connections.errors.missingCredentials",
    budget: 110,
    cjkBudget: 66,
    container: "inline error with {fields} ICU placeholder — wraps",
    suggestion: "EN: 'Missing required fields: {fields}'",
  },
  {
    key: "connections.errors.invalidCredentials",
    budget: 110,
    cjkBudget: 66,
    container: "inline error (multi-line)",
    suggestion: "EN: 'The credentials were rejected. Please double-check...'",
  },
  {
    key: "connections.errors.credentialValidationFailed",
    budget: 110,
    cjkBudget: 66,
    container: "inline error (multi-line)",
    suggestion: "EN: 'Could not validate your credentials...'",
  },
  {
    key: "connections.errors.apiKeyRequired",
    budget: 60,
    cjkBudget: 36,
    container: "field-level error (text-[11px] text-destructive) — wraps",
    suggestion: "EN: 'An API key is required.'",
  },
  {
    key: "connections.errors.tokenRequired",
    budget: 60,
    cjkBudget: 36,
    container: "field-level error — wraps",
    suggestion: "EN: 'A bearer token is required.'",
  },
  {
    key: "connections.errors.basicRequired",
    budget: 70,
    cjkBudget: 42,
    container: "field-level error — wraps",
    suggestion: "EN: 'Username and password are required.'",
  },
]

// ─── Required new keys (presence assertion) ────────────────────────────────
//
// The polymorphic auth-scheme expansion ships ~20 net-new keys.  The
// per-key budget enforcement above only fires when the key is present.
// This list pins the BUDGET test as the canonical home for the per-locale
// presence assertion as well — once a locale ships any non-empty
// translation for the file, every key in REQUIRED_NEW_KEYS must exist.
//
// We allow OPT-IN exemption via REQUIRED_NEW_KEYS_EXEMPT_LOCALES so a
// translator can land English-first behind a feature flag without trying
// to ship 30 locales in one PR.  The default exemption set is empty —
// translators land all 30 locales atomically, the same way every other
// connections-namespace addition has shipped historically.
const REQUIRED_NEW_KEYS = [
  // Confirm-screen field labels + placeholders — under
  // connections.connectDialog.confirm.* (the path the dialog actually uses).
  "connections.connectDialog.confirm.fields.apiKeyLabel",
  "connections.connectDialog.confirm.fields.apiKeyPlaceholder",
  "connections.connectDialog.confirm.fields.bearerTokenLabel",
  "connections.connectDialog.confirm.fields.bearerTokenPlaceholder",
  "connections.connectDialog.confirm.fields.basicAuthUsername",
  "connections.connectDialog.confirm.fields.basicAuthPassword",
  "connections.connectDialog.confirm.fields.basicAuthUsernamePlaceholder",
  "connections.connectDialog.confirm.fields.basicAuthPasswordPlaceholder",
  "connections.connectDialog.confirm.fields.revealSecret",
  "connections.connectDialog.confirm.fields.hideSecret",
  // Per-scheme CTA labels.
  "connections.connectDialog.confirm.cta.connect",
  "connections.connectDialog.confirm.cta.connectWithApiKey",
  "connections.connectDialog.confirm.cta.connectWithBearerToken",
  "connections.connectDialog.confirm.cta.connectWithBasic",
  "connections.connectDialog.confirm.cta.connectNoAuth",
  "connections.connectDialog.confirm.cta.connecting",
  // Hints + toasts shown around the credential form.
  "connections.connectDialog.confirm.noAuthHint",
  "connections.connectDialog.confirm.apiKeyHelp",
  "connections.connectDialog.confirm.connectedToast",
  // Unsupported-scheme fallback card.
  "connections.connectDialog.confirm.unsupported.title",
  "connections.connectDialog.confirm.unsupported.body",
  "connections.connectDialog.confirm.unsupported.openComposioDashboard",
  // Typed-error rendering — connections.errors.* namespace.
  "connections.errors.credentialsRequired",
  "connections.errors.credentialsErrorPrefix",
  "connections.errors.unknownToolkit",
  "connections.errors.unsupportedAuthScheme",
  "connections.errors.missingCredentials",
  "connections.errors.invalidCredentials",
  "connections.errors.credentialValidationFailed",
  "connections.errors.apiKeyRequired",
  "connections.errors.tokenRequired",
  "connections.errors.basicRequired",
] as const

// Locales that are intentionally lagging the auth-scheme key rollout.
// Empty by default — flip a locale into this set ONLY when a translator
// has explicitly signed off on a delayed delivery and a tracking issue
// exists.  Locales in this set still get budget enforcement for keys
// they DID translate; they're just exempt from the presence check.
const REQUIRED_NEW_KEYS_EXEMPT_LOCALES = new Set<Locale>([])

// ─── 2. Helpers ────────────────────────────────────────────────────────────

const CJK_LOCALES = new Set<Locale>(["ja", "ko", "zh"])

const MESSAGES_DIR = path.join(__dirname, "..", "messages")

/**
 * Resolve a dot-path (e.g. "connections.filters.all") against a parsed
 * messages object. Returns the leaf string, or undefined if any segment
 * is missing. We don't fail on missing — many locale files lawfully
 * skip keys that fall back to English — we just skip the check.
 */
function resolveDotPath(root: unknown, dotPath: string): string | undefined {
  let cur: unknown = root
  for (const seg of dotPath.split(".")) {
    if (cur === null || cur === undefined || typeof cur !== "object") {
      return undefined
    }
    cur = (cur as Record<string, unknown>)[seg]
  }
  return typeof cur === "string" ? cur : undefined
}

/** Memoised loader so we don't read each JSON file 36 times. */
const messagesCache = new Map<Locale, Record<string, unknown>>()
function loadMessages(locale: Locale): Record<string, unknown> {
  const cached = messagesCache.get(locale)
  if (cached) return cached
  const filePath = path.join(MESSAGES_DIR, `${locale}.json`)
  const raw = readFileSync(filePath, "utf8")
  const parsed = JSON.parse(raw) as Record<string, unknown>
  messagesCache.set(locale, parsed)
  return parsed
}

/**
 * Char-count uses Array.from(...).length so we count Unicode CODE POINTS
 * not UTF-16 code units. This matters for CJK strings that include
 * astral-plane characters (rare but possible) and for emoji.
 */
function charCount(s: string): number {
  return Array.from(s).length
}

function budgetForLocale(entry: BudgetEntry, locale: Locale): number {
  return CJK_LOCALES.has(locale) ? entry.cjkBudget : entry.budget
}

// ─── 3. The test ───────────────────────────────────────────────────────────

describe("i18n connections — per-locale char-budget enforcement", () => {
  // One describe-block per locale, one it() per budgeted key.  This
  // produces a grid of pass/fail in the vitest reporter so a translator
  // can see at a glance which locales/keys are over budget.

  for (const locale of locales) {
    describe(`locale: ${locale}`, () => {
      for (const entry of BUDGET_TABLE) {
        it(`key '${entry.key}' fits its budget`, () => {
          const messages = loadMessages(locale)
          const value = resolveDotPath(messages, entry.key)

          // Missing keys are NOT a budget violation — they're a coverage
          // gap handled by a separate i18n-coverage test. We skip here
          // so this test only reports overflow.
          if (value === undefined) return

          const budget = budgetForLocale(entry, locale)
          const count = charCount(value)

          // Custom error message — designed so a translator can fix the
          // locale JSON directly without ever opening the UI source.
          const failMessage =
            `Locale \`${locale}\` key \`${entry.key}\` is ${count} chars ` +
            `but budget is ${budget}. ` +
            `Current value: \`${value}\`. ` +
            `Container: ${entry.container}. ` +
            `Suggested shorter form: ${entry.suggestion}.`

          expect(count, failMessage).toBeLessThanOrEqual(budget)
        })
      }
    })
  }
})

// ─── 4. Sanity tests for the test itself ───────────────────────────────────

describe("budget table integrity", () => {
  it("has no duplicate keys", () => {
    const seen = new Set<string>()
    for (const entry of BUDGET_TABLE) {
      expect(seen.has(entry.key), `duplicate budget entry: ${entry.key}`).toBe(
        false,
      )
      seen.add(entry.key)
    }
  })

  it("every entry has a positive budget and CJK budget", () => {
    for (const entry of BUDGET_TABLE) {
      expect(entry.budget, `${entry.key} budget`).toBeGreaterThan(0)
      expect(entry.cjkBudget, `${entry.key} cjkBudget`).toBeGreaterThan(0)
    }
  })

  it("CJK budget is never larger than the Latin budget", () => {
    // CJK glyphs are wider, so the char ceiling must be lower or equal.
    for (const entry of BUDGET_TABLE) {
      expect(
        entry.cjkBudget,
        `${entry.key}: cjkBudget (${entry.cjkBudget}) must be <= budget (${entry.budget})`,
      ).toBeLessThanOrEqual(entry.budget)
    }
  })

  it("English source values fit their own Latin budget", () => {
    // EN is the source of truth — if EN itself overflows, the budget is
    // wrong (or the container changed and the EN copy needs to be cut).
    const en = loadMessages("en")
    for (const entry of BUDGET_TABLE) {
      const value = resolveDotPath(en, entry.key)
      if (value === undefined) continue
      const count = charCount(value)
      expect(
        count,
        `EN value for ${entry.key} is ${count} chars but Latin budget is ${entry.budget}. ` +
          `Value: \`${value}\`. Either tighten the EN copy or raise the budget.`,
      ).toBeLessThanOrEqual(entry.budget)
    }
  })

  it("REQUIRED_NEW_KEYS has no duplicates and is covered by BUDGET_TABLE", () => {
    // Every required-presence key should also have a budget — the two
    // tables are coupled (presence + char ceiling).  This prevents the
    // common drift of adding a key to REQUIRED_NEW_KEYS but forgetting
    // to budget it.
    const seen = new Set<string>()
    for (const key of REQUIRED_NEW_KEYS) {
      expect(seen.has(key), `duplicate required key: ${key}`).toBe(false)
      seen.add(key)
    }
    const budgetedKeys = new Set(BUDGET_TABLE.map((e) => e.key))
    for (const key of REQUIRED_NEW_KEYS) {
      expect(
        budgetedKeys.has(key),
        `required-new key '${key}' has no budget entry — add one to BUDGET_TABLE so its char ceiling is enforced`,
      ).toBe(true)
    }
  })
})

// ─── 5. Presence enforcement for the polymorphic auth-scheme keys ─────────
//
// The previous budget tests SKIP missing keys (translators are allowed to
// fall back to English on a per-key basis).  The new auth-scheme dialog,
// however, ships ~20 keys all-or-nothing — leaving any of them untranslated
// produces an obvious mid-dialog English fragment which looks broken to a
// non-English user.  We pin presence per-locale here.
//
// Locales currently exempt: REQUIRED_NEW_KEYS_EXEMPT_LOCALES (empty by
// default).  Each `it` reports the missing keys as a comma-separated list
// so a translator can fix the locale JSON in one pass without re-reading
// the budget output.

describe("i18n connections — polymorphic auth-scheme keys are present everywhere", () => {
  // ── Two-stage gating ───────────────────────────────────────────────────
  //
  // The presence check is GATED on the English source being complete.
  // If EN doesn't define a required key, the per-locale presence check is
  // skipped for that key (we can't fairly demand a translation of a key
  // that hasn't been authored in the source yet).  This lets the file
  // ship in the same PR as the test without painting CI red while the
  // copy is still being landed.
  //
  // Once EN is complete, the per-locale assertion auto-arms and starts
  // failing every locale that hasn't picked up the new keys.  No manual
  // flag-flip required.

  const en = loadMessages("en")
  const enDefinedKeys = REQUIRED_NEW_KEYS.filter(
    (k) => resolveDotPath(en, k) !== undefined,
  )
  const enMissingKeys = REQUIRED_NEW_KEYS.filter(
    (k) => resolveDotPath(en, k) === undefined,
  )

  // We use `it.runIf` so the canary actively passes when EN is partially
  // landed (every key that EXISTS is checked against budget by the other
  // test block), and becomes a hard fail-loud assertion the moment EN
  // claims to be done.  This avoids two bad outcomes:
  //   1. test-driven shipping breaks CI on the very PR that lands the test.
  //   2. translators silently ignore the keys forever because no test
  //      ever asserts EN is the source of truth.
  // The threshold: once 50% of REQUIRED_NEW_KEYS are present in EN, we
  // assume EN intends to be the source-of-truth and ratchet the canary
  // to strict — partial EN rollouts must complete.
  const enHalfwayLanded =
    enDefinedKeys.length >= Math.ceil(REQUIRED_NEW_KEYS.length / 2)

  if (enHalfwayLanded) {
    it("English source defines every REQUIRED_NEW_KEYS entry (canary — drives translator round-trip)", () => {
      // Once EN is halfway landed it MUST complete — partial rollouts
      // surface as a mid-dialog English fragment to EN users themselves.
      expect(
        enMissingKeys,
        `English source is partially landed (${enDefinedKeys.length}/${REQUIRED_NEW_KEYS.length} ` +
          `auth-scheme keys present) but ${enMissingKeys.length} keys are still missing: ` +
          `${enMissingKeys.join(", ")}. ` +
          `Add them to messages/en.json — partial EN rollouts produce mid-dialog English ` +
          `fragments even for EN users.`,
      ).toEqual([])
    })
  } else {
    // Pre-rollout: EN has none / very few of the new keys. The canary is
    // a `todo` so the test reporter calls out the pending work without
    // failing CI. Once a translator lands the EN copy past the 50% mark,
    // the canary above auto-arms.
    it.todo(
      `English source pending: REQUIRED_NEW_KEYS rollout has ${enDefinedKeys.length}/${REQUIRED_NEW_KEYS.length} ` +
        `keys landed in messages/en.json. Once past 50%, the canary becomes strict and per-locale enforcement auto-arms.`,
    )
  }

  for (const locale of locales) {
    if (REQUIRED_NEW_KEYS_EXEMPT_LOCALES.has(locale)) {
      it.skip(`locale ${locale} is exempt from required-new-keys presence`, () => {
        /* exempt — see REQUIRED_NEW_KEYS_EXEMPT_LOCALES */
      })
      continue
    }

    it(`locale '${locale}' defines every EN-defined auth-scheme key`, () => {
      // Only enforce keys EN actually defines — skip keys not yet authored.
      // EN being incomplete is loud (canary above), per-locale stays quiet
      // until the source-of-truth is ready.
      if (enDefinedKeys.length === 0) {
        // No required keys are yet authored in EN — nothing to enforce.
        // Treat as a pass; the EN canary above is responsible for surfacing
        // the gap.
        return
      }
      const messages = loadMessages(locale)
      const missing: string[] = []
      for (const key of enDefinedKeys) {
        if (resolveDotPath(messages, key) === undefined) {
          missing.push(key)
        }
      }
      expect(
        missing,
        `Locale '${locale}' is missing ${missing.length} auth-scheme key(s): ` +
          `${missing.join(", ")}. The connect-app dialog renders these inline; ` +
          `leaving any of them untranslated produces a mid-dialog English fragment ` +
          `for ${locale} users. Add the missing keys to messages/${locale}.json or ` +
          `(if a translator round-trip is in flight) add '${locale}' to ` +
          `REQUIRED_NEW_KEYS_EXEMPT_LOCALES with a tracking issue.`,
      ).toEqual([])
    })
  }
})
