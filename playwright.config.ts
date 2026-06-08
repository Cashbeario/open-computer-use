import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for the visual-fit / i18n-overflow test stack.
 *
 * - Boots the Next.js dev server on :3000 automatically (reuses an existing
 *   one when running locally, fresh boot in CI).
 * - Single chromium project — CJK + RTL coverage is driven by the spec, not
 *   by additional browser projects.
 * - The /connections page checks `E2E_AUTH_BYPASS === '1'` (only honored when
 *   NODE_ENV !== 'production') so tests skip the Supabase auth gate.
 */
export default defineConfig({
  testDir: './e2e',
  // 240s per-test budget — Next dev mode compiles each new route on first hit
  // (5-30s cold, worse under load / after on-demand-entries eviction) and the
  // visual-fit tests then iterate ~30 selectors with measurement per render.
  // 60s defaults trip mid-loop on perfectly healthy renders. The per-test
  // setTimeout() inside i18n-overflow.spec.ts is the source of truth.
  timeout: 240_000,
  expect: { timeout: 5_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
  ],
  outputDir: 'test-results',
  use: {
    baseURL: 'http://localhost:3000',
    headless: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    // actionTimeout left short so individual selector misses still fail
    // fast; navigationTimeout raised because Next dev's RSC streaming means
    // `commit` waitUntil can take 30-45s on the very first compile.
    actionTimeout: 10_000,
    navigationTimeout: 60_000,
    locale: 'en-US',
    timezoneId: 'UTC',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      NODE_ENV: 'development',
      E2E_AUTH_BYPASS: '1',
    },
  },
});
