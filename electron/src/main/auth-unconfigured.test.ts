/**
 * Fresh-clone boot contract: ElectronAuth with NO valid Supabase config.
 *
 * The regression this pins
 * ------------------------
 * A fresh clone has no electron/.env, so NEXT_PUBLIC_SUPABASE_URL /
 * NEXT_PUBLIC_SUPABASE_ANON_KEY are empty at startup. The real
 * `@supabase/supabase-js` `createClient('', '')` throws
 * "supabaseUrl is required." — and that throw used to fire unguarded inside
 * `app.whenReady()`, so the overlay window never appeared and the app sat as
 * a headless zombie process (the user saw nothing launch).
 *
 * This file mocks `createClient` to THROW the same way (the working mocks in
 * auth.test.ts / auth-fault-tolerance.test.ts mask the bug because they
 * always return a client regardless of args). The contract:
 *   - construction never throws -> the window can boot to the AuthScreen,
 *   - isConfigured() reports false,
 *   - auth flows reject with an actionable message naming electron/.env,
 *   - a stored session on disk doesn't crash unconfigured startup.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

// createClient throws exactly like the real SDK on empty creds. The arg
// check keeps the mock honest: a future caller that DOES pass creds would
// still get a (minimal) working client rather than a spurious throw.
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn((url: string, key: string) => {
    if (!url || !key) {
      throw new Error('supabaseUrl is required.')
    }
    return { auth: {} }
  }),
}))

vi.mock('electron', () => {
  const tmpRoot = path.join(os.tmpdir(), `auth-unconfig-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`)
  return {
    app: {
      getPath: () => {
        try { fs.mkdirSync(tmpRoot, { recursive: true }) } catch {}
        return tmpRoot
      },
      isPackaged: false,
    },
    shell: { openExternal: vi.fn() },
  }
})

import { ElectronAuth } from './auth'
import * as electron from 'electron'

function sessionPath(): string {
  return path.join((electron as any).app.getPath('userData'), '.session')
}

function makeValidSession() {
  return {
    access_token: 'access-' + Math.random().toString(36).slice(2, 8),
    refresh_token: 'refresh-' + Math.random().toString(36).slice(2, 8),
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: { id: 'user-test-001', email: 'test@coasty.ai', user_metadata: {} },
  }
}

beforeEach(() => {
  delete process.env.NEXT_PUBLIC_SUPABASE_URL
  delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  try { fs.unlinkSync(sessionPath()) } catch {}
})

afterEach(() => {
  try { fs.unlinkSync(sessionPath()) } catch {}
})

describe('ElectronAuth without Supabase env (fresh-clone boot)', () => {
  it('★ constructor does not throw — the window can still boot', () => {
    expect(() => new ElectronAuth()).not.toThrow()
  })

  it('isConfigured() reports false when the client could not be built', () => {
    const auth = new ElectronAuth()
    expect(auth.isConfigured()).toBe(false)
    expect(auth.isAuthenticated()).toBe(false)
  })

  it('★ sign-in flows reject with an actionable message naming electron/.env', async () => {
    const auth = new ElectronAuth()
    await expect(auth.signInWithGoogle()).rejects.toThrow(/electron\/\.env/)
    await expect(auth.signInWithEmail('a@b.c', 'pw')).rejects.toThrow(
      /NEXT_PUBLIC_SUPABASE_URL/,
    )
  })

  it('a stored session on disk does not crash unconfigured startup', () => {
    // loadStoredSession() would call this.supabase.auth.setSession(); the
    // throwing getter must be absorbed by its surrounding try/catch so the
    // app stays bootable even with a leftover .session file.
    fs.writeFileSync(sessionPath(), JSON.stringify(makeValidSession()), 'utf-8')
    expect(() => new ElectronAuth()).not.toThrow()
  })

  it('becomes configured once valid env is present', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test-project.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key'
    const auth = new ElectronAuth()
    expect(auth.isConfigured()).toBe(true)
  })
})
