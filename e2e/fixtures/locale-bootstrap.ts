import type { BrowserContext, Route } from '@playwright/test'

/**
 * Locale + auth bootstrap for visual-fit / i18n-overflow tests.
 *
 * Single entry point used by `e2e/i18n-overflow.spec.ts`. Given a
 * BrowserContext and a target locale, it:
 *
 *   1. Sets the `NEXT_LOCALE` cookie on the context (matches the cookie
 *      the Next.js middleware reads in `middleware.ts` — same name, path
 *      `/`, sameSite `lax`) so the very first navigation lands in the
 *      requested language without round-tripping through the
 *      Accept-Language auto-detect path.
 *
 *   2. Installs the same client-side auth fakes that `auth-bypass.ts`
 *      installs on a single Page, but at the BrowserContext level so the
 *      init script + route handlers apply to every page opened from the
 *      context. The server-side bypass is already handled by
 *      `E2E_AUTH_BYPASS=1` on the webServer (see playwright.config.ts).
 *
 * This file intentionally inlines the auth-bypass logic rather than
 * re-exporting `installAuthBypass` because that helper takes a Page —
 * passing the context's pages through it would race the very first page
 * created, and `addInitScript` / `route` are first-class on
 * BrowserContext, so we can attach them once for the whole context.
 */

const FAKE_USER_ID = '00000000-0000-4000-8000-000000000001'
const FAKE_EMAIL = 'e2e@coasty.test'
const FAKE_DISPLAY_NAME = 'E2E Tester'
const FAKE_PROFILE_IMAGE =
  'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI2NCIgaGVpZ2h0PSI2NCIvPg=='

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://e2e.supabase.co'

function projectRefFromUrl(url: string): string {
  try {
    const host = new URL(url).hostname
    return host.split('.')[0] || 'e2e'
  } catch {
    return 'e2e'
  }
}

const SUPABASE_PROJECT_REF = projectRefFromUrl(SUPABASE_URL)
const SUPABASE_STORAGE_KEY = `sb-${SUPABASE_PROJECT_REF}-auth-token`

const FAKE_ACCESS_TOKEN = 'e2e.fake.access.token'
const FAKE_REFRESH_TOKEN = 'e2e.fake.refresh.token'

const fakeAuthUser = {
  id: FAKE_USER_ID,
  aud: 'authenticated',
  role: 'authenticated',
  email: FAKE_EMAIL,
  email_confirmed_at: '2026-01-01T00:00:00Z',
  phone: '',
  confirmed_at: '2026-01-01T00:00:00Z',
  last_sign_in_at: '2026-06-01T00:00:00Z',
  app_metadata: { provider: 'email', providers: ['email'] },
  user_metadata: {
    avatar_url: FAKE_PROFILE_IMAGE,
    email: FAKE_EMAIL,
    email_verified: true,
    full_name: FAKE_DISPLAY_NAME,
    name: FAKE_DISPLAY_NAME,
    picture: FAKE_PROFILE_IMAGE,
    provider_id: FAKE_USER_ID,
    sub: FAKE_USER_ID,
  },
  identities: [],
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-06-01T00:00:00Z',
}

const fakeUserProfile = {
  id: FAKE_USER_ID,
  email: FAKE_EMAIL,
  display_name: FAKE_DISPLAY_NAME,
  profile_image: FAKE_PROFILE_IMAGE,
  anonymous: false,
  created_at: '2026-01-01T00:00:00Z',
  daily_message_count: 0,
  daily_reset: '2026-06-03T00:00:00Z',
  daily_pro_message_count: 0,
  daily_pro_reset: '2026-06-03T00:00:00Z',
  favorite_models: [],
  message_count: 0,
  premium: true,
  last_active_at: '2026-06-03T00:00:00Z',
  system_prompt: null,
  onboarding_completed: true,
  role: 'admin',
  company: 'Coasty',
  website: 'https://coasty.ai',
  team_size: '1-10',
  referral_source: 'e2e',
  use_case: 'testing',
  preferences: {},
}

const fakeSupabaseSession = {
  access_token: FAKE_ACCESS_TOKEN,
  token_type: 'bearer',
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  refresh_token: FAKE_REFRESH_TOKEN,
  user: fakeAuthUser,
}

const jsonResponse = (route: Route, body: unknown, status = 200) =>
  route.fulfill({
    status,
    contentType: 'application/json',
    headers: { 'cache-control': 'no-store' },
    body: JSON.stringify(body),
  })

/**
 * Seed the `NEXT_LOCALE` cookie + client-side auth fakes on the given
 * BrowserContext. Call BEFORE `page.goto(...)` so the cookie is present on
 * the very first request and the init script / route handlers are in
 * place before any page hydrates.
 */
export async function seedLocaleAndAuth(
  context: BrowserContext,
  locale: string,
): Promise<void> {
  // 1. NEXT_LOCALE cookie — mirrors the shape middleware.ts writes.
  //    Cover both localhost and 127.0.0.1 so this works regardless of
  //    which baseURL host the test framework actually navigates to.
  //    Additionally seed `coasty_e2e_bypass=1` so the /connections page's
  //    per-request bypass guard accepts the session even when the dev
  //    server was started without `E2E_AUTH_BYPASS=1` (e.g. a reused
  //    `npm run dev` process outside Playwright's webServer config).
  //    Production is guarded by NODE_ENV inside the page itself.
  const yearFromNow = Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60
  await context.addCookies([
    {
      name: 'NEXT_LOCALE',
      value: locale,
      domain: 'localhost',
      path: '/',
      sameSite: 'Lax',
      expires: yearFromNow,
    },
    {
      name: 'NEXT_LOCALE',
      value: locale,
      domain: '127.0.0.1',
      path: '/',
      sameSite: 'Lax',
      expires: yearFromNow,
    },
    {
      name: 'coasty_e2e_bypass',
      value: '1',
      domain: 'localhost',
      path: '/',
      sameSite: 'Lax',
      expires: yearFromNow,
    },
    {
      name: 'coasty_e2e_bypass',
      value: '1',
      domain: '127.0.0.1',
      path: '/',
      sameSite: 'Lax',
      expires: yearFromNow,
    },
  ])

  // 2. Seed localStorage on every navigation so supabase-js sees a
  //    session synchronously on hydration. addInitScript on a context
  //    runs for every page opened from the context, before any page
  //    script.
  await context.addInitScript(
    ({ storageKey, session, profile }) => {
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(session))
        window.localStorage.setItem('coasty.user-profile', JSON.stringify(profile))
        window.localStorage.setItem('user-profile', JSON.stringify(profile))
      } catch {
        // localStorage may be unavailable in some contexts — best-effort.
      }
    },
    {
      storageKey: SUPABASE_STORAGE_KEY,
      session: fakeSupabaseSession,
      profile: fakeUserProfile,
    },
  )

  // 3. Mock Supabase auth endpoints at the context level. The
  //    supabase-js client calls `${SUPABASE_URL}/auth/v1/user` to
  //    validate the seeded session on hydration; returning the fake
  //    user keeps the session "valid".
  await context.route(/\/auth\/v1\/user(\?.*)?$/i, async (route) => {
    return jsonResponse(route, fakeAuthUser)
  })

  await context.route(/\/auth\/v1\/token(\?.*)?$/i, async (route) => {
    return jsonResponse(route, {
      ...fakeSupabaseSession,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
    })
  })

  await context.route(/\/auth\/v1\/logout(\?.*)?$/i, async (route) => {
    return jsonResponse(route, {})
  })

  // 4. Mock the app's own user-profile endpoints. Cover the canonical
  //    path plus common variants so any of them resolves.
  await context.route(/\/api\/user\/profile(\?.*)?$/i, async (route) => {
    return jsonResponse(route, fakeUserProfile)
  })
  await context.route(/\/api\/user(\?.*)?$/i, async (route) => {
    return jsonResponse(route, fakeUserProfile)
  })
  await context.route(/\/api\/me(\?.*)?$/i, async (route) => {
    return jsonResponse(route, fakeUserProfile)
  })

  // 5. Credits balance — the header pill calls this on mount; return a
  //    static value so the surface stays stable across screenshots.
  await context.route(/\/api\/billing\/credits\/balance(\?.*)?$/i, async (route) => {
    return jsonResponse(route, { balance: 1000, currency: 'credits' })
  })
}

// Re-exported for tests that want to assert against the fake identity.
export const FAKE_USER = {
  id: FAKE_USER_ID,
  email: FAKE_EMAIL,
  display_name: FAKE_DISPLAY_NAME,
  profile_image: FAKE_PROFILE_IMAGE,
  profile: fakeUserProfile,
  session: fakeSupabaseSession,
  authUser: fakeAuthUser,
}
