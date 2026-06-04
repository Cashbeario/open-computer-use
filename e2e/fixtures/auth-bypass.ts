import type { Page, Route } from '@playwright/test'

/**
 * Client-side auth bypass for visual-fit / i18n-overflow tests.
 *
 * The /connections page is gated by `supabase.auth.getUser()` in
 * `app/connections/page.tsx` — if that resolves to no user, the server
 * redirects to `/auth` and we never reach the markup we want to measure.
 *
 * The PRIMARY bypass path is the 5-line patch documented in the build spec
 * (§F.2): when `E2E_AUTH_BYPASS=1` and `NODE_ENV !== 'production'`, the page
 * skips the auth check entirely. The Playwright config sets that env on the
 * webServer, so server-side gating is satisfied.
 *
 * This file handles the CLIENT-side half: anywhere in the React tree that
 * reads `useUser()` (sidebar profile row, account menus, settings dialogs)
 * still wants a real `UserProfile` object — without it, those components
 * either crash or render skeleton states that pollute screenshots.
 *
 * `installAuthBypass` does three things:
 *   1. Seeds a fake Supabase session in localStorage so the supabase-js
 *      client picks it up synchronously on hydration.
 *   2. Mocks `${SUPABASE_URL}/auth/v1/user` to return a fake auth user.
 *   3. Mocks `/api/user/profile` and any common variants used by the
 *      frontend user store to return a fully-populated `UserProfile`
 *      matching the shape in `lib/user/types.ts` + `users` row in
 *      `app/types/database.types.ts`.
 *
 * All values are deterministic — same fixtures every run.
 */

const FAKE_USER_ID = '00000000-0000-4000-8000-000000000001'
const FAKE_EMAIL = 'e2e@coasty.test'
const FAKE_DISPLAY_NAME = 'E2E Tester'
const FAKE_PROFILE_IMAGE =
  'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI2NCIgaGVpZ2h0PSI2NCIvPg=='

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://e2e.supabase.co'

// Extract the project ref from the Supabase URL so the localStorage key
// (`sb-<ref>-auth-token`) matches what supabase-js writes/reads.
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

// Fake access/refresh tokens. supabase-js only validates structural
// presence in the storage cell — the server never sees these because we
// also mock `/auth/v1/user`.
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

// Matches `UserProfile` from `lib/user/types.ts` which is
// `Tables<"users">` plus `profile_image`, `display_name`, and an optional
// `preferences` blob.
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
 * Install client-side auth fakes on the given page. Must be called BEFORE
 * `page.goto(...)` so the init script runs before any app code hydrates
 * and the route handlers intercept the first user/profile fetch.
 */
export async function installAuthBypass(page: Page): Promise<void> {
  // 0. Seed the server-side bypass cookie so a reused dev server (one not
  //    booted with E2E_AUTH_BYPASS=1) still skips the Supabase auth check
  //    in `app/connections/page.tsx`. Production is guarded by NODE_ENV.
  //    Seeded for both the configured base URL host and localhost as a
  //    defensive fallback so any dev port mapping still picks it up.
  const cookieTargets = new Set<string>([
    'http://localhost:3000',
    'http://127.0.0.1:3000',
  ])
  try {
    const base = process.env.PLAYWRIGHT_BASE_URL
    if (base) cookieTargets.add(base)
  } catch {
    // env access can throw in restricted runtimes — best-effort.
  }
  await page.context().addCookies(
    Array.from(cookieTargets).map((url) => ({
      name: 'coasty_e2e_bypass',
      value: '1',
      url,
      sameSite: 'Lax' as const,
    })),
  )

  // 1. Seed localStorage on every navigation so supabase-js sees a session
  //    on hydration. addInitScript runs before any page script.
  await page.addInitScript(
    ({ storageKey, session, profile }) => {
      try {
        // Supabase stores the session as JSON under this key.
        window.localStorage.setItem(storageKey, JSON.stringify(session))
        // Some app code caches the profile separately to avoid a round-trip
        // on first render. Seed both common keys defensively.
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

  // 2. Mock Supabase auth endpoints. The supabase-js client calls
  //    `${SUPABASE_URL}/auth/v1/user` to validate the seeded session on
  //    hydration; returning the fake user keeps the session "valid".
  await page.route(/\/auth\/v1\/user(\?.*)?$/i, async (route) => {
    if (route.request().method() === 'GET') {
      return jsonResponse(route, fakeAuthUser)
    }
    return jsonResponse(route, fakeAuthUser)
  })

  // Token refresh — supabase-js fires this when expires_at is near. Return
  // the same fake session with a fresh expiry so the client never blanks.
  await page.route(/\/auth\/v1\/token(\?.*)?$/i, async (route) => {
    return jsonResponse(route, {
      ...fakeSupabaseSession,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
    })
  })

  // Sign-out — return success but don't actually invalidate anything.
  await page.route(/\/auth\/v1\/logout(\?.*)?$/i, async (route) => {
    return jsonResponse(route, {})
  })

  // 3. Mock the app's own user-profile endpoints. We cover the canonical
  //    path plus a couple of common variants so any of them resolves.
  await page.route(/\/api\/user\/profile(\?.*)?$/i, async (route) => {
    return jsonResponse(route, fakeUserProfile)
  })
  await page.route(/\/api\/user(\?.*)?$/i, async (route) => {
    if (route.request().method() === 'GET') {
      return jsonResponse(route, fakeUserProfile)
    }
    return jsonResponse(route, fakeUserProfile)
  })
  await page.route(/\/api\/me(\?.*)?$/i, async (route) => {
    return jsonResponse(route, fakeUserProfile)
  })

  // Credits balance — the layout/header sometimes shows a balance pill;
  // returning a static value keeps that surface stable in screenshots.
  await page.route(/\/api\/billing\/credits\/balance(\?.*)?$/i, async (route) => {
    return jsonResponse(route, { balance: 1000, currency: 'credits' })
  })
}

// Re-exported for tests that want to assert against the fake identity
// (e.g. "the avatar should say E2E").
export const FAKE_USER = {
  id: FAKE_USER_ID,
  email: FAKE_EMAIL,
  display_name: FAKE_DISPLAY_NAME,
  profile_image: FAKE_PROFILE_IMAGE,
  profile: fakeUserProfile,
  session: fakeSupabaseSession,
  authUser: fakeAuthUser,
}
