import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Hoisted mocks ─────────────────────────────────────────────────────

// We don't need real `electron` — only the Tray type is used, and only as
// a type. Provide a stub so importing `electron` at runtime doesn't crash.
vi.mock('electron', () => ({}))

// ── Imports ───────────────────────────────────────────────────────────

import {
  performFullShutdown,
  isShutdownInProgress,
  __resetShutdownForTests,
  type ShutdownDeps,
} from './app-shutdown'

// ── Test helpers ──────────────────────────────────────────────────────

function makeFakeWsBridge(overrides: Partial<{ disconnect: () => void }> = {}) {
  return {
    disconnect: vi.fn(),
    ...overrides,
  } as any
}

function makeFakeAuth(overrides: Partial<{ dispose: () => void }> = {}) {
  return {
    dispose: vi.fn(),
    ...overrides,
  } as any
}

function makeFakeTray(overrides: Partial<{ isDestroyed: () => boolean; destroy: () => void }> = {}) {
  return {
    isDestroyed: vi.fn(() => false),
    destroy: vi.fn(),
    ...overrides,
  } as any
}

function makeDeps(partial: Partial<ShutdownDeps> = {}): ShutdownDeps {
  return {
    wsBridge: makeFakeWsBridge(),
    auth: makeFakeAuth(),
    tray: makeFakeTray(),
    ...partial,
  }
}

// ── Tests ─────────────────────────────────────────────────────────────

describe('performFullShutdown', () => {
  beforeEach(() => {
    __resetShutdownForTests()
    vi.clearAllMocks()
  })

  describe('resource teardown', () => {
    it('disconnects the ws bridge', () => {
      const deps = makeDeps()
      performFullShutdown(deps)
      expect(deps.wsBridge!.disconnect).toHaveBeenCalledTimes(1)
    })

    it('disposes the auth manager', () => {
      const deps = makeDeps()
      performFullShutdown(deps)
      expect(deps.auth!.dispose).toHaveBeenCalledTimes(1)
    })

    it('destroys the tray', () => {
      const deps = makeDeps()
      performFullShutdown(deps)
      expect(deps.tray!.destroy).toHaveBeenCalledTimes(1)
    })

    it('tears down every resource in a single call', () => {
      const deps = makeDeps()
      performFullShutdown(deps)

      expect(deps.wsBridge!.disconnect).toHaveBeenCalled()
      expect(deps.auth!.dispose).toHaveBeenCalled()
      expect(deps.tray!.destroy).toHaveBeenCalled()
    })
  })

  describe('idempotency', () => {
    it('only tears down resources on the first call', () => {
      const deps = makeDeps()
      performFullShutdown(deps)
      performFullShutdown(deps)
      performFullShutdown(deps)

      expect(deps.wsBridge!.disconnect).toHaveBeenCalledTimes(1)
      expect(deps.auth!.dispose).toHaveBeenCalledTimes(1)
      expect(deps.tray!.destroy).toHaveBeenCalledTimes(1)
    })

    it('reports shutdown in progress after the first call', () => {
      expect(isShutdownInProgress()).toBe(false)
      performFullShutdown(makeDeps())
      expect(isShutdownInProgress()).toBe(true)
    })

    it('__resetShutdownForTests clears the in-progress flag', () => {
      performFullShutdown(makeDeps())
      expect(isShutdownInProgress()).toBe(true)
      __resetShutdownForTests()
      expect(isShutdownInProgress()).toBe(false)
    })

    it('after reset, the next call tears down again', () => {
      const deps1 = makeDeps()
      performFullShutdown(deps1)
      expect(deps1.wsBridge!.disconnect).toHaveBeenCalledTimes(1)

      __resetShutdownForTests()

      const deps2 = makeDeps()
      performFullShutdown(deps2)
      expect(deps2.wsBridge!.disconnect).toHaveBeenCalledTimes(1)
      expect(deps2.auth!.dispose).toHaveBeenCalledTimes(1)
    })
  })

  describe('null / missing dependencies', () => {
    it('handles a null wsBridge', () => {
      const deps = makeDeps({ wsBridge: null })
      expect(() => performFullShutdown(deps)).not.toThrow()
      expect(deps.auth!.dispose).toHaveBeenCalled()
      expect(deps.tray!.destroy).toHaveBeenCalled()
    })

    it('handles a null auth', () => {
      const deps = makeDeps({ auth: null })
      expect(() => performFullShutdown(deps)).not.toThrow()
      expect(deps.wsBridge!.disconnect).toHaveBeenCalled()
      expect(deps.tray!.destroy).toHaveBeenCalled()
    })

    it('handles a null tray', () => {
      const deps = makeDeps({ tray: null })
      expect(() => performFullShutdown(deps)).not.toThrow()
      expect(deps.wsBridge!.disconnect).toHaveBeenCalled()
      expect(deps.auth!.dispose).toHaveBeenCalled()
    })

    it('handles all deps null at once', () => {
      expect(() => {
        performFullShutdown({ wsBridge: null, auth: null, tray: null })
      }).not.toThrow()
      expect(isShutdownInProgress()).toBe(true)
    })
  })

  describe('tray edge cases', () => {
    it('skips destroy() when tray is already destroyed', () => {
      const destroy = vi.fn()
      const deps = makeDeps({
        tray: makeFakeTray({
          isDestroyed: vi.fn(() => true),
          destroy,
        }),
      })
      performFullShutdown(deps)
      expect(destroy).not.toHaveBeenCalled()
    })

    it('continues if tray.destroy throws', () => {
      const deps = makeDeps({
        tray: makeFakeTray({
          destroy: vi.fn(() => { throw new Error('tray already gone') }),
        }),
      })
      expect(() => performFullShutdown(deps)).not.toThrow()
      expect(deps.wsBridge!.disconnect).toHaveBeenCalled()
      expect(deps.auth!.dispose).toHaveBeenCalled()
    })
  })

  describe('error isolation', () => {
    it('ws bridge throwing does not prevent other deps from being torn down', () => {
      const deps = makeDeps({
        wsBridge: makeFakeWsBridge({
          disconnect: vi.fn(() => { throw new Error('socket already closed') }),
        }),
      })
      expect(() => performFullShutdown(deps)).not.toThrow()

      // Everything after ws still ran
      expect(deps.auth!.dispose).toHaveBeenCalled()
      expect(deps.tray!.destroy).toHaveBeenCalled()
    })

    it('auth.dispose throwing still tears down tray', () => {
      const deps = makeDeps({
        auth: makeFakeAuth({
          dispose: vi.fn(() => { throw new Error('boom') }),
        }),
      })
      expect(() => performFullShutdown(deps)).not.toThrow()

      expect(deps.wsBridge!.disconnect).toHaveBeenCalled()
      expect(deps.tray!.destroy).toHaveBeenCalled()
    })

    it('multiple deps throwing are all absorbed', () => {
      const deps = makeDeps({
        wsBridge: makeFakeWsBridge({ disconnect: vi.fn(() => { throw new Error('b') }) }),
        auth: makeFakeAuth({ dispose: vi.fn(() => { throw new Error('c') }) }),
        tray: makeFakeTray({ destroy: vi.fn(() => { throw new Error('d') }) }),
      })

      expect(() => performFullShutdown(deps)).not.toThrow()

      expect(deps.wsBridge!.disconnect).toHaveBeenCalled()
      expect(deps.auth!.dispose).toHaveBeenCalled()
      expect(deps.tray!.destroy).toHaveBeenCalled()
    })
  })

  describe('teardown order', () => {
    it('tears down in the documented order: ws → auth → tray', () => {
      const calls: string[] = []
      const deps = makeDeps({
        wsBridge: makeFakeWsBridge({
          disconnect: vi.fn(() => { calls.push('ws') }),
        }),
        auth: makeFakeAuth({
          dispose: vi.fn(() => { calls.push('auth') }),
        }),
        tray: makeFakeTray({
          destroy: vi.fn(() => { calls.push('tray') }),
        }),
      })

      performFullShutdown(deps)

      expect(calls).toEqual(['ws', 'auth', 'tray'])
    })
  })
})
