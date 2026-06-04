/**
 * Visual-fit / i18n-overflow contract for the /connections surface.
 *
 * Each CONTRACT entry encodes a single must-fit assertion: locate the element
 * by data-testid, then check it against the chosen `kind` of constraint at
 * the configured viewports and locales.
 *
 * Builders: add a new entry here whenever a translated string is rendered
 * into a fixed-width container (button, pill, chip, dialog header, etc.).
 */

export type ViewportName = "360" | "768" | "1280";

export type OverflowKind =
  | "no-horizontal-overflow"
  | "no-wrap"
  | "fits-in-parent";

export type SetupAction =
  | "open-connect-dialog"
  | "open-account-dialog-integrations";

/**
 * Granular constraints the spec runner knows how to evaluate. `kind` and
 * `constraint` overlap on purpose — `kind` exists as the legacy/contract-
 * facing field; `constraint` is the spec-facing one and supports an array
 * so a single entry can be checked for multiple invariants in one pass.
 */
export type ConstraintName =
  | "horizontal-overflow"
  | "single-line"
  | "max-lines-2"
  | "no-rtl-physical"
  | "present";

export interface OverflowContractEntry {
  /** Friendly name shown in test output. */
  name: string;
  /** data-testid selector. */
  testid: string;
  /** Route to navigate to (relative). Use "/connections" for most. */
  route: string;
  /** Constraint kind (legacy / contract-facing). */
  kind: OverflowKind;
  /**
   * Spec-facing constraint(s). When present, the runner uses these instead
   * of `kind`. May be a single name or an array (the runner iterates).
   */
  constraint?: ConstraintName | ConstraintName[];
  /**
   * Viewports to assert at. `"all"` (or omitted) = every viewport in the
   * test matrix. An array narrows to just those.
   */
  viewports?: "all" | ViewportName[];
  /**
   * Locales to assert against. `"all"` (or omitted) = every locale in the
   * test matrix. An array narrows to just those.
   */
  locales?: "all" | string[];
  /** Optional setup function — e.g. open the connect dialog before measuring. */
  setup?: SetupAction;
  /**
   * Source file the testid lives in. Surfaced in failure messages so a dev
   * gets a direct file pointer.
   */
  file?: string;
  /**
   * Human-readable hint shown alongside a failure — e.g. "shorten translation"
   * or "allow flex-wrap on the parent row".
   */
  fixHint?: string;
  /**
   * When true, missing element is treated as a skip not a failure. Use for
   * elements that only render in specific app states (e.g. error notices).
   */
  optional?: boolean;
  /** Skip reasons for documented exemptions. */
  skip?: string;
}

export const VIEWPORT_SIZES: Record<
  ViewportName,
  { width: number; height: number }
> = {
  "360": { width: 360, height: 640 },
  "768": { width: 768, height: 1024 },
  "1280": { width: 1280, height: 800 },
};

export const TEST_LOCALES: string[] = [
  "en",
  "ar",
  "he",
  "de",
  "fi",
  "hu",
  "zh",
  "ja",
  "ko",
];

// ─── Aliased exports (spec-friendly names) ─────────────────────────────────
// The spec imports LOCALES / VIEWPORTS / ContractEntry / Locale / Viewport;
// the canonical names above stay (TEST_LOCALES / VIEWPORT_SIZES /
// OverflowContractEntry / ViewportName) so other test suites can use the
// descriptive forms. These re-exports keep both naming conventions valid.

export type Locale = (typeof TEST_LOCALES)[number];
export type Viewport = ViewportName;
export type ContractEntry = OverflowContractEntry;

export const LOCALES: Locale[] = TEST_LOCALES;

export const VIEWPORTS: ReadonlyArray<{
  name: ViewportName;
  width: number;
  height: number;
}> = (Object.keys(VIEWPORT_SIZES) as ViewportName[]).map((name) => ({
  name,
  ...VIEWPORT_SIZES[name],
}));

export const CONTRACT: OverflowContractEntry[] = [
  // ── Page chrome ──
  {
    name: "Sidebar Connections nav link",
    testid: "sidebar-nav-connections",
    route: "/connections",
    kind: "no-horizontal-overflow",
    viewports: ["768", "1280"],
    optional: true,
    skip:
      "The link lives inside a collapsible Resources group whose open state " +
      "depends on localStorage (`coasty:sidebar:resources-open`) and an " +
      "isItemActive(pathname) heuristic, plus the outer sidebar rail collapses " +
      "to icon-only based on a separate `sidebar_state` cookie. Asserting it " +
      "automatically requires explicit setup (expand sidebar, open Resources) " +
      "that varies by responsive breakpoint. Visual-fit at @768/@1280 is " +
      "covered by manual review until a deterministic setup helper lands.",
  },
  {
    name: "Connections page H1 title",
    testid: "connections-page-title",
    route: "/connections",
    kind: "no-wrap",
  },
  {
    name: "Connections page subtitle",
    testid: "connections-page-subtitle",
    route: "/connections",
    kind: "fits-in-parent",
  },
  {
    name: "Refresh icon button",
    testid: "connections-refresh-button",
    route: "/connections",
    kind: "no-horizontal-overflow",
  },
  {
    name: "New connection CTA",
    testid: "connections-new-connection-cta",
    route: "/connections",
    kind: "no-wrap",
  },

  // ── Filter pills (must-fit; tight horizontal scroll) ──
  {
    name: "Filter pill: All",
    testid: "filter-pill-all",
    route: "/connections",
    kind: "no-wrap",
  },
  {
    name: "Filter pill: Active",
    testid: "filter-pill-active",
    route: "/connections",
    kind: "no-wrap",
  },
  {
    name: "Filter pill: Connecting (INITIATED)",
    testid: "filter-pill-connecting",
    route: "/connections",
    kind: "no-wrap",
  },
  {
    name: "Filter pill: Expired",
    testid: "filter-pill-expired",
    route: "/connections",
    kind: "no-wrap",
  },
  {
    name: "Filter pill: Failed",
    testid: "filter-pill-failed",
    route: "/connections",
    kind: "no-wrap",
  },

  // ── Empty state ──
  // All four are `optional` because the empty state only renders when there
  // are zero connections. The default fixture (`MOCK_CONNECTIONS`) seeds 3
  // connections so the page is in its populated form, and these testids
  // legitimately won't be in the DOM. A future "empty-state" test suite
  // can install a zero-connection mock and assert these without optional.
  {
    name: "Empty state headline",
    testid: "connections-empty-headline",
    route: "/connections",
    kind: "fits-in-parent",
    optional: true,
    skip: "Only renders in empty state (zero connections); default fixture is populated.",
  },
  {
    name: "Empty state subheadline",
    testid: "connections-empty-subheadline",
    route: "/connections",
    kind: "no-horizontal-overflow",
    optional: true,
    skip: "Only renders in empty state (zero connections); default fixture is populated.",
  },
  {
    name: "Empty state Browse apps CTA",
    testid: "connections-empty-browse-apps-cta",
    route: "/connections",
    kind: "no-wrap",
    optional: true,
    skip: "Only renders in empty state (zero connections); default fixture is populated.",
  },
  {
    name: "Empty state eyebrow (Popular integrations)",
    testid: "connections-empty-eyebrow",
    route: "/connections",
    kind: "no-horizontal-overflow",
    optional: true,
    skip: "Only renders in empty state (zero connections); default fixture is populated.",
  },

  // ── Connection card actions ──
  {
    name: "Status pill: ACTIVE",
    testid: "status-pill-active",
    route: "/connections",
    kind: "no-wrap",
    skip: "Optional — only present when at least one ACTIVE connection exists (mixed state).",
  },
  {
    name: "Status pill: EXPIRED",
    testid: "status-pill-expired",
    route: "/connections",
    kind: "no-wrap",
    skip: "Optional — only present in mixed state with an EXPIRED connection.",
  },
  {
    name: "Card inline Reconnect button",
    testid: "card-action-reconnect",
    route: "/connections",
    kind: "no-wrap",
    skip: "Optional — only present when a card is EXPIRED or FAILED.",
  },

  // ── Connect dialog ──
  {
    name: "Connect dialog title",
    testid: "connect-dialog-title",
    route: "/connections",
    kind: "no-horizontal-overflow",
    setup: "open-connect-dialog",
  },
  {
    name: "Connect dialog search input placeholder",
    testid: "connect-dialog-search",
    route: "/connections",
    kind: "no-horizontal-overflow",
    setup: "open-connect-dialog",
  },
  {
    name: "Category chip: All",
    testid: "chips-cat-all",
    route: "/connections",
    kind: "no-wrap",
    setup: "open-connect-dialog",
  },
  {
    name: "Category chip: Popular",
    testid: "chips-cat-popular",
    route: "/connections",
    kind: "no-wrap",
    setup: "open-connect-dialog",
  },
  {
    name: "Category chip: Communication",
    testid: "chips-cat-communication",
    route: "/connections",
    kind: "no-wrap",
    setup: "open-connect-dialog",
  },
  {
    name: "Category chip: Productivity",
    testid: "chips-cat-productivity",
    route: "/connections",
    kind: "no-wrap",
    setup: "open-connect-dialog",
  },
  {
    name: "Category chip: Calendar",
    testid: "chips-cat-calendar",
    route: "/connections",
    kind: "no-wrap",
    setup: "open-connect-dialog",
  },
  {
    name: "Category chip: Developer",
    testid: "chips-cat-dev",
    route: "/connections",
    kind: "no-wrap",
    setup: "open-connect-dialog",
  },
  {
    name: "Category chip: CRM",
    testid: "chips-cat-crm",
    route: "/connections",
    kind: "no-wrap",
    setup: "open-connect-dialog",
  },
  {
    name: "Connect dialog Powered by Composio footer",
    testid: "connect-dialog-powered-by",
    route: "/connections",
    kind: "no-wrap",
    setup: "open-connect-dialog",
  },
  {
    name: "Connect dialog Cancel button",
    testid: "connect-dialog-cancel",
    route: "/connections",
    kind: "no-wrap",
    setup: "open-connect-dialog",
  },

  // ── Settings integrations tab ──
  // Both entries are `optional` because the account dialog mounts from the
  // global LayoutApp wrapper which has its own auth requirement. The current
  // E2E auth bypass is scoped to app/connections/page.tsx only — navigating
  // to /account?section=integrations renders a stub page without the dialog.
  // Resolving requires either (a) a global E2E bypass (layout-level or
  // middleware-level guard), or (b) seeding a real Supabase test session.
  // Both are larger design decisions outside the visual-fit invariant scope.
  {
    name: "Settings integrations H3 heading",
    testid: "settings-integrations-heading",
    route: "/connections",
    kind: "no-wrap",
    viewports: ["768", "1280"],
    setup: "open-account-dialog-integrations",
    optional: true,
    skip:
      "Account dialog needs global auth context (LayoutApp). E2E bypass is " +
      "page-scoped to /connections only. Re-enable when a global bypass or " +
      "test-session seed lands.",
  },
  {
    name: "Settings integrations Manage on full page CTA",
    testid: "settings-integrations-manage-cta",
    route: "/connections",
    kind: "no-wrap",
    viewports: ["768", "1280"],
    setup: "open-account-dialog-integrations",
    optional: true,
    skip:
      "Account dialog needs global auth context (LayoutApp). E2E bypass is " +
      "page-scoped to /connections only. Re-enable when a global bypass or " +
      "test-session seed lands.",
  },
];
