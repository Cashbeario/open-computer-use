import { test, expect, Page, Locator } from "@playwright/test";
import {
  CONTRACT,
  LOCALES,
  VIEWPORTS,
  ContractEntry,
  ConstraintName,
  Locale,
  Viewport,
} from "./i18n-overflow.contract";
import { installComposioMock } from "./fixtures/composio-mock";
import { seedLocaleAndAuth } from "./fixtures/locale-bootstrap";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface Measurement {
  clientWidth: number;
  scrollWidth: number;
  clientHeight: number;
  scrollHeight: number;
  offsetWidth: number;
  offsetHeight: number;
  lineHeight: number;
  fontSize: number;
  computedTextContent: string;
  fontFamily: string;
  paddingLeft: string;
  paddingRight: string;
  paddingTop: string;
  paddingBottom: string;
  marginLeft: string;
  marginRight: string;
  borderLeftWidth: string;
  borderRightWidth: string;
  borderTopWidth: string;
  borderBottomWidth: string;
  computedDir: string;
  display: string;
  whiteSpace: string;
  width: number;
  height: number;
}

interface Failure {
  locale: Locale;
  viewport: Viewport;
  testid: string;
  constraint: string;
  measured: Measurement | Record<string, never>;
  message: string;
  /** Optional — contract entries don't have to provide a hint. */
  fixHint?: string;
  /** Optional — contract entries don't have to point at a source file. */
  file?: string;
  overflowPx?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// In-browser measurement function
// ─────────────────────────────────────────────────────────────────────────────

const measureFn = (el: Element): Measurement => {
  const cs = getComputedStyle(el);
  const rect = (el as HTMLElement).getBoundingClientRect();
  const fontSize = parseFloat(cs.fontSize) || 16;
  const lineHeightParsed = parseFloat(cs.lineHeight);
  const lineHeight = Number.isFinite(lineHeightParsed) && lineHeightParsed > 0
    ? lineHeightParsed
    : fontSize * 1.2;
  return {
    clientWidth: (el as HTMLElement).clientWidth,
    scrollWidth: (el as HTMLElement).scrollWidth,
    clientHeight: (el as HTMLElement).clientHeight,
    scrollHeight: (el as HTMLElement).scrollHeight,
    offsetWidth: (el as HTMLElement).offsetWidth,
    offsetHeight: (el as HTMLElement).offsetHeight,
    lineHeight,
    fontSize,
    computedTextContent: (el.textContent || "").trim(),
    fontFamily: cs.fontFamily,
    paddingLeft: cs.paddingLeft,
    paddingRight: cs.paddingRight,
    paddingTop: cs.paddingTop,
    paddingBottom: cs.paddingBottom,
    marginLeft: cs.marginLeft,
    marginRight: cs.marginRight,
    borderLeftWidth: cs.borderLeftWidth,
    borderRightWidth: cs.borderRightWidth,
    borderTopWidth: cs.borderTopWidth,
    borderBottomWidth: cs.borderBottomWidth,
    computedDir: getComputedStyle(document.documentElement).direction,
    display: cs.display,
    whiteSpace: cs.whiteSpace,
    width: rect.width,
    height: rect.height,
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// Contract filtering helpers
// ─────────────────────────────────────────────────────────────────────────────

const matchesViewport = (entry: ContractEntry, vp: Viewport): boolean =>
  entry.viewports === undefined ||
  entry.viewports === "all" ||
  entry.viewports.includes(vp);

const matchesLocale = (entry: ContractEntry, loc: Locale): boolean =>
  entry.locales === undefined ||
  entry.locales === "all" ||
  entry.locales.includes(loc);

// ─────────────────────────────────────────────────────────────────────────────
// Page preparation
// ─────────────────────────────────────────────────────────────────────────────

async function preparePage(page: Page, locale: Locale): Promise<void> {
  await installComposioMock(page);
  await seedLocaleAndAuth(page.context(), locale);
  await page.emulateMedia({ reducedMotion: "reduce" });
}

async function gotoConnections(page: Page): Promise<void> {
  // `commit` is the most lenient waitUntil — waits only for the navigation
  // to commit (response started). `domcontentloaded` / `load` / `networkidle`
  // are all unreliable in Next dev mode because streaming SSR keeps the
  // response body open with RSC payloads + HMR + telemetry, so the higher-
  // level events never fire within a 30s navigation budget on cold compile.
  // The waitForSelector below is the real readiness gate — we rely on the
  // page-title testid being visible to confirm hydration.
  await page.goto("/connections", { waitUntil: "commit", timeout: 60_000 });
  // The first navigation triggers Next dev's route compile (5-30s cold), and
  // dev's on-demand-entries can EVICT an idle route mid-run, forcing a fresh
  // compile on a later hit — so this cost is not strictly one-time. 90s gives
  // a cold compile + RSC-streamed first render of the title comfortable head-
  // room; 45s was tripping on slow/contended runs (see the per-test budget).
  await page.waitForSelector('[data-testid="connections-page-title"]', {
    state: "visible",
    timeout: 90_000,
  });
  await page.waitForFunction(() =>
    (document as Document & { fonts: { ready: Promise<unknown> } }).fonts.ready.then(() => true),
  );
  await page.waitForTimeout(200);
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-element measurement helper
// ─────────────────────────────────────────────────────────────────────────────

async function measureOverflow(
  locator: Locator,
): Promise<{ measurement: Measurement; overflowPx: number }> {
  const m: Measurement = await locator.evaluate(measureFn);
  return { measurement: m, overflowPx: m.scrollWidth - m.clientWidth };
}

// ─────────────────────────────────────────────────────────────────────────────
// Failure formatting
// ─────────────────────────────────────────────────────────────────────────────

function formatFailureMessage(f: Failure): string {
  const m = f.measured as Partial<Measurement>;
  const clientWidth = typeof m.clientWidth === "number" ? `${m.clientWidth.toFixed(1)}px` : "?";
  const clientHeight = typeof m.clientHeight === "number" ? `${m.clientHeight.toFixed(1)}px` : "?";
  const scrollWidth = typeof m.scrollWidth === "number" ? `${m.scrollWidth.toFixed(1)}px` : "?";
  const scrollHeight = typeof m.scrollHeight === "number" ? `${m.scrollHeight.toFixed(1)}px` : "?";
  const lineHeight = typeof m.lineHeight === "number" ? `${m.lineHeight.toFixed(1)}px` : "?";
  const text = (m.computedTextContent ?? "").slice(0, 80);
  const textLen = (m.computedTextContent ?? "").length;
  return [
    `FAIL: ${f.locale}@${f.viewport.split("x")[0]} — ${f.testid}`,
    `  File:        ${f.file}`,
    `  Constraint:  ${f.constraint}`,
    `  Container:   ${clientWidth} wide × ${clientHeight} tall`,
    `  Content:     ${scrollWidth} wide × ${scrollHeight} tall (line-height ${lineHeight})`,
    `  Text:        "${text}" (${textLen} chars)`,
    `  Font:        ${m.fontFamily ?? "?"}`,
    `  Dir:         ${m.computedDir ?? "?"}`,
    `  Message:     ${f.message}`,
    `  Hint:        ${f.fixHint}`,
    `  Screenshot:  test-results/${f.locale}-${f.viewport}-${f.testid}-clip.png`,
  ].join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// Constraint evaluation
// ─────────────────────────────────────────────────────────────────────────────

const nonzero = (v: string | undefined): boolean =>
  !!v && v !== "0px" && v !== "auto" && v !== "0";

function evaluateConstraint(
  constraint: string,
  m: Measurement,
  entry: ContractEntry,
  locale: Locale,
  viewport: Viewport,
): Failure | null {
  if (constraint === "must-fit") {
    if (m.scrollWidth > m.clientWidth + 0.5) {
      const overflowPx = m.scrollWidth - m.clientWidth;
      return {
        locale,
        viewport,
        testid: entry.testid,
        constraint,
        measured: m,
        overflowPx,
        message: `Horizontal overflow: scrollWidth=${m.scrollWidth.toFixed(1)}px > clientWidth=${m.clientWidth.toFixed(1)}px (${overflowPx.toFixed(1)}px overflow)`,
        fixHint: entry.fixHint,
        file: entry.file,
      };
    }
  } else if (constraint === "single-line") {
    // `nowrap` is a CSS guarantee the text physically cannot wrap to a new
    // line; any scrollHeight > lineHeight is a min-height artifact (e.g.
    // shadcn Button has `whitespace-nowrap` + `h-9`, so the 36px container
    // is taller than the 20px line-height without the text ever wrapping).
    // Without this short-circuit, every fixed-height button trips this
    // check with a "Multi-line" false positive.
    if (m.whiteSpace === "nowrap") return null;
    const verticalChrome =
      (parseFloat(m.paddingTop) || 0) +
      (parseFloat(m.paddingBottom) || 0) +
      (parseFloat(m.borderTopWidth) || 0) +
      (parseFloat(m.borderBottomWidth) || 0);
    const contentHeight = m.scrollHeight - verticalChrome;
    const threshold = m.lineHeight * 1.25;
    if (contentHeight > threshold) {
      return {
        locale,
        viewport,
        testid: entry.testid,
        constraint,
        measured: m,
        message: `Multi-line: contentHeight=${contentHeight.toFixed(1)}px (scrollHeight=${m.scrollHeight.toFixed(1)}px - chrome=${verticalChrome.toFixed(1)}px) > 1 line (${threshold.toFixed(1)}px threshold)`,
        fixHint: entry.fixHint,
        file: entry.file,
      };
    }
  } else if (constraint === "max-lines-2") {
    // Same rationale as single-line above — `nowrap` physically can't wrap,
    // so any height growth is min-height, not real wrap.
    if (m.whiteSpace === "nowrap") return null;
    const verticalChrome =
      (parseFloat(m.paddingTop) || 0) +
      (parseFloat(m.paddingBottom) || 0) +
      (parseFloat(m.borderTopWidth) || 0) +
      (parseFloat(m.borderBottomWidth) || 0);
    const contentHeight = m.scrollHeight - verticalChrome;
    const threshold = m.lineHeight * 2.25;
    if (contentHeight > threshold) {
      return {
        locale,
        viewport,
        testid: entry.testid,
        constraint,
        measured: m,
        message: `Too many lines: contentHeight=${contentHeight.toFixed(1)}px (scrollHeight=${m.scrollHeight.toFixed(1)}px - chrome=${verticalChrome.toFixed(1)}px) > 2 lines (${threshold.toFixed(1)}px threshold)`,
        fixHint: entry.fixHint,
        file: entry.file,
      };
    }
  } else if (constraint === "no-rtl-physical") {
    const issues: string[] = [];
    if (
      nonzero(m.paddingLeft) &&
      nonzero(m.paddingRight) &&
      m.paddingLeft !== m.paddingRight
    ) {
      issues.push(`asymmetric padding (left=${m.paddingLeft}, right=${m.paddingRight})`);
    }
    if (
      nonzero(m.marginLeft) &&
      nonzero(m.marginRight) &&
      m.marginLeft !== m.marginRight
    ) {
      issues.push(`asymmetric margin (left=${m.marginLeft}, right=${m.marginRight})`);
    }
    if (nonzero(m.borderLeftWidth) !== nonzero(m.borderRightWidth)) {
      issues.push(
        `asymmetric border (left=${m.borderLeftWidth}, right=${m.borderRightWidth})`,
      );
    }
    if (issues.length) {
      return {
        locale,
        viewport,
        testid: entry.testid,
        constraint,
        measured: m,
        message: `RTL physical-property issue: ${issues.join("; ")}`,
        fixHint: entry.fixHint,
        file: entry.file,
      };
    }
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Setup transitions — open dialogs when contract demands them
// ─────────────────────────────────────────────────────────────────────────────

async function applySetup(page: Page, setup: string | undefined): Promise<void> {
  if (!setup) return;
  if (setup === "open-connect-dialog") {
    const cta = page.locator('[data-testid="connections-new-connection-cta"]').first();
    if ((await cta.count()) > 0) {
      await cta.click();
      await page.waitForSelector('[data-testid="connect-dialog-title"]', {
        state: "visible",
        timeout: 10_000,
      });
      await page.waitForTimeout(200);
    }
    return;
  }
  if (setup === "open-account-dialog-integrations") {
    // The account dialog is URL-synced — landing on `/account?section=<id>`
    // opens it with the chosen tab pre-selected (see app/components/layout/
    // account-dialog.tsx URL sync logic). Cheaper + more deterministic than
    // hunting an avatar button + tab click sequence that varies by viewport.
    // The `commit` waitUntil avoids Next dev's streaming-RSC limbo.
    //
    // GUARDED: the dialog mounts from the global LayoutApp wrapper which
    // has its own auth requirement. The current E2E bypass is page-scoped
    // to /connections only — landing on /account renders a stub. We wrap
    // the heading-wait in try/catch so the loop continues; any entries
    // that needed this setup will simply fail their own "present" check
    // and (since they're marked `optional`) be skipped without aborting
    // the test. Keep the wait short to avoid burning 30s per locale.
    // The ENTIRE navigation is best-effort. /account is not auth-bypassed in
    // E2E (it renders a login stub, so the integrations dialog never mounts),
    // and Next dev's streaming RSC means `commit` can hang past the budget on a
    // cold compile. The page.goto MUST live inside the try/catch: a goto
    // timeout here would otherwise abort the whole test, even though every
    // dependent entry is `optional` and will skip via its own count===0 check.
    // Short timeout so we fail fast rather than burn 60s on a route that can
    // never satisfy this setup in the current bypass scope.
    try {
      await page.goto("/account?section=integrations", {
        waitUntil: "commit",
        timeout: 20_000,
      });
      await page.waitForSelector('[data-testid="settings-integrations-heading"]', {
        state: "visible",
        timeout: 5_000,
      });
      await page.waitForFunction(() =>
        (document as Document & { fonts: { ready: Promise<unknown> } }).fonts.ready.then(() => true),
      );
      await page.waitForTimeout(200);
    } catch {
      // Route slow / dialog not mounted — proceed; the optional entries that
      // needed this setup handle their own absence and are skipped.
    }
    return;
  }
}

// Determine if an entry needs a setup step (dialog vs. page-level).
function setupForEntry(entry: ContractEntry): string | undefined {
  // Contract entries can declare `setup` explicitly; honor that first so a
  // single source-of-truth lives in i18n-overflow.contract.ts.
  if (entry.setup) return entry.setup;
  // Fallback heuristic for legacy entries that don't carry a setup field.
  const connectDialogTestids = new Set([
    "connect-dialog-title",
    "connect-dialog-search",
    "chips-cat-all",
    "chips-cat-popular",
    "chips-cat-communication",
    "chips-cat-productivity",
    "chips-cat-calendar",
    "chips-cat-dev",
    "chips-cat-crm",
    "connect-dialog-powered-by",
    "connect-dialog-cancel",
  ]);
  if (connectDialogTestids.has(entry.testid)) return "open-connect-dialog";
  const accountDialogIntegrationsTestids = new Set([
    "settings-integrations-heading",
    "settings-integrations-manage-cta",
  ]);
  if (accountDialogIntegrationsTestids.has(entry.testid)) {
    return "open-account-dialog-integrations";
  }
  return undefined;
}

// ─────────────────────────────────────────────────────────────────────────────
// Test suite — outer parallel per viewport, inner sequential per locale
// ─────────────────────────────────────────────────────────────────────────────

for (const viewport of VIEWPORTS) {
  test.describe.parallel(`viewport ${viewport.name}`, () => {
    for (const locale of LOCALES) {
      test(`visual-fit: ${locale} @ ${viewport.name}`, async ({ page }) => {
        // 240s budget per test: covers Next dev's route compile (5-30s cold,
        // worse under load or after on-demand-entries eviction) for BOTH the
        // /connections page (90s selector wait) and the optional /account
        // setup, plus iterating ~30 contract entries with per-element selector
        // + measurement (~0.5-1s each). 180s was tripping when a slow cold
        // render of /connections ate most of the budget before the loop ran.
        test.setTimeout(240_000);

        await preparePage(page, locale);
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await gotoConnections(page);

        // RTL sanity check — once per page render.
        if (locale === "ar" || locale === "he") {
          const dir = await page.locator("html").getAttribute("dir");
          expect(dir, `<html dir> should be rtl for ${locale}`).toBe("rtl");
        }

        const failures: Failure[] = [];

        // Group entries by required setup so we open each dialog at most once.
        const grouped = new Map<string | undefined, ContractEntry[]>();
        for (const entry of CONTRACT) {
          if (!matchesViewport(entry, viewport.name)) continue;
          if (!matchesLocale(entry, locale)) continue;
          const setup = setupForEntry(entry);
          const arr = grouped.get(setup) ?? [];
          arr.push(entry);
          grouped.set(setup, arr);
        }

        // Process page-level entries first (no setup), then any dialog group.
        // Setup phases run in the order below; entries with a matching
        // setup field (see setupForEntry) are batched together so each
        // dialog/route transition happens exactly once per test.
        // open-account-dialog-integrations is last because it navigates
        // away from /connections to /account; any page-level or
        // connect-dialog entries must run before it.
        const orderedSetups: (string | undefined)[] = [
          undefined,
          "open-connect-dialog",
          "open-account-dialog-integrations",
        ];

        for (const setup of orderedSetups) {
          const entries = grouped.get(setup);
          if (!entries || entries.length === 0) continue;

          if (setup) {
            await applySetup(page, setup);
          }

          for (const entry of entries) {
            const sel = `[data-testid="${entry.testid}"]`;
            const loc = page.locator(sel).first();
            const count = await loc.count();

            if (count === 0) {
              if (entry.optional) continue;
              failures.push({
                locale,
                viewport: viewport.name,
                testid: entry.testid,
                constraint: "present",
                measured: {},
                message: `Required element not found (testid missing or component not rendered).`,
                fixHint: `Add data-testid="${entry.testid}" in ${entry.file}.`,
                file: entry.file,
              });
              continue;
            }

            const { measurement: m } = await measureOverflow(loc);

            // Skip invisible / zero-size elements (different bug class).
            if (m.display === "none" || m.width === 0 || m.height === 0) {
              continue;
            }

            // Resolve constraint(s): prefer entry.constraint, fall back to
            // entry.kind so legacy entries without an explicit `constraint`
            // still get a sensible default.
            const fallback: ConstraintName =
              entry.kind === "no-horizontal-overflow"
                ? "horizontal-overflow"
                : entry.kind === "no-wrap"
                  ? "single-line"
                  : "horizontal-overflow";
            const constraints: ConstraintName[] = Array.isArray(entry.constraint)
              ? entry.constraint
              : entry.constraint
                ? [entry.constraint]
                : [fallback];

            for (const c of constraints) {
              const failure = evaluateConstraint(c, m, entry, locale, viewport.name);
              if (failure) failures.push(failure);
            }
          }
        }

        if (failures.length) {
          // Per-element clipped screenshots for diagnosis.
          for (const f of failures) {
            await page
              .locator(`[data-testid="${f.testid}"]`)
              .first()
              .screenshot({
                path: `test-results/${locale}-${viewport.name}-${f.testid}-clip.png`,
              })
              .catch(() => {
                /* element may have been removed (dialog closed); ignore */
              });
          }
          // Full-page screenshot for context.
          await page.screenshot({
            path: `test-results/${locale}-${viewport.name}-page.png`,
            fullPage: true,
          });

          const report = failures.map(formatFailureMessage).join("\n\n");
          throw new Error(
            `\n${failures.length} visual-fit failure(s) for ${locale}@${viewport.name}:\n\n${report}`,
          );
        }
      });
    }
  });
}
