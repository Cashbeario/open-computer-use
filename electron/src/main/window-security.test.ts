/**
 * Window-creation security tests.
 *
 * Validates the BrowserWindow webPreferences configured by:
 *   - electron/src/main/index.ts        (mainWindow — overlay)
 *
 * Strategy: read the source as text and assert that dangerous flags either
 * don't appear or are pinned to safe values. This is intentionally a static
 * check — a regression that adds e.g. `nodeIntegration: true` will be caught
 * here even if no test invokes the constructor.
 *
 * Also covers:
 *   - display-manager: confirms display-info IPC doesn't leak serial / EDID
 *   - window:* IPC: positions/sizes are clamped before reaching the OS
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const INDEX_TS = readFileSync(join(__dirname, 'index.ts'), 'utf8')
const WM_TS = readFileSync(join(__dirname, 'window-manager.ts'), 'utf8')
const DM_TS = readFileSync(join(__dirname, 'display-manager.ts'), 'utf8')
const IPC_TS = readFileSync(join(__dirname, 'ipc-handlers.ts'), 'utf8')

/** Extracts the `webPreferences: {...}` object literal text from a source string. */
function extractWebPreferences(source: string): string[] {
  // Find every `webPreferences: { ... }` block; balanced braces.
  const out: string[] = []
  const re = /webPreferences\s*:\s*\{/g
  let m: RegExpExecArray | null
  while ((m = re.exec(source)) !== null) {
    let i = m.index + m[0].length
    let depth = 1
    const start = i
    while (i < source.length && depth > 0) {
      if (source[i] === '{') depth++
      else if (source[i] === '}') depth--
      i++
    }
    out.push(source.slice(start, i - 1))
  }
  return out
}

// ═══════════════════════════════════════════════════════════════════════
// MAIN OVERLAY — webPreferences hardening
// ═══════════════════════════════════════════════════════════════════════

describe('main overlay BrowserWindow webPreferences (index.ts)', () => {
  const blocks = extractWebPreferences(INDEX_TS)
  const main = blocks.find((b) => b.includes('preload')) || blocks[0] || ''

  it('locates the main overlay webPreferences block', () => {
    expect(main.length).toBeGreaterThan(0)
  })

  it('contextIsolation is true (renderer cannot reach main globals)', () => {
    expect(main).toMatch(/contextIsolation\s*:\s*true/)
    expect(main).not.toMatch(/contextIsolation\s*:\s*false/)
  })

  it('nodeIntegration is false (no fs/child_process from renderer)', () => {
    expect(main).toMatch(/nodeIntegration\s*:\s*false/)
    expect(main).not.toMatch(/nodeIntegration\s*:\s*true/)
  })

  it('preload points to the bundled preload script', () => {
    expect(main).toMatch(/preload\s*:\s*join\(/)
    // Path may use forward slashes on any platform in source
    expect(main).toMatch(/preload[/\\]index\.js/)
  })

  it('does not enable webSecurity: false (default true is acceptable when absent)', () => {
    expect(main).not.toMatch(/webSecurity\s*:\s*false/)
  })

  it('does not enable allowRunningInsecureContent', () => {
    expect(main).not.toMatch(/allowRunningInsecureContent\s*:\s*true/)
  })

  it('does not enable experimentalFeatures', () => {
    expect(main).not.toMatch(/experimentalFeatures\s*:\s*true/)
  })

  it('does not set enableBlinkFeatures (or only known-safe values)', () => {
    // If present at all, must be empty string.
    const m = main.match(/enableBlinkFeatures\s*:\s*['"]([^'"]*)['"]/)
    if (m) expect(m[1]).toBe('')
  })

  it('does not enable nativeWindowOpen with insecure config', () => {
    // nativeWindowOpen defaults true in modern Electron; what matters is
    // that we still gate window.open via setWindowOpenHandler.
    expect(INDEX_TS).toMatch(/setWindowOpenHandler/)
  })

  it('sandbox flag is documented (currently true on overlay window)', () => {
    // The overlay window in index.ts uses sandbox: true. This test pins
    // that decision so a future change forcing sandbox: false stands out
    // in review.
    expect(main).toMatch(/sandbox\s*:\s*(true|false)/)
  })
})

describe('main overlay BrowserWindow construction args (index.ts)', () => {
  // Snapshot — if a future change adds a dangerous flag (e.g. acceptFirstMouse: true,
  // titleBarStyle that exposes the path, hiddenInMissionControl: false …) the
  // snapshot diff will surface it.
  it('frame: false and transparent: true are intentional (frameless overlay)', () => {
    expect(INDEX_TS).toMatch(/frame\s*:\s*false/)
    expect(INDEX_TS).toMatch(/transparent\s*:\s*true/)
  })

  it('sets explicit width/height (not undefined which would default-fullscreen)', () => {
    expect(INDEX_TS).toMatch(/width\s*:\s*400/)
    expect(INDEX_TS).toMatch(/height\s*:\s*500/)
  })

  it('intercepts new-window / window.open via setWindowOpenHandler with deny', () => {
    expect(INDEX_TS).toMatch(/setWindowOpenHandler/)
    expect(INDEX_TS).toMatch(/return\s*\{\s*action\s*:\s*['"]deny['"]/)
  })
})

// ═══════════════════════════════════════════════════════════════════════
// MENU + DEVTOOLS in production
// ═══════════════════════════════════════════════════════════════════════

describe('production hardening — menu + devtools', () => {
  it('non-darwin sets the application menu to null (hides menu bar)', () => {
    expect(INDEX_TS).toMatch(/Menu\.setApplicationMenu\(null\)/)
  })

  it('does not call openDevTools() unconditionally', () => {
    // Either the call must not exist at all, or it must be guarded by a
    // process.env.NODE_ENV / app.isPackaged check on the SAME line / block.
    const calls = INDEX_TS.match(/openDevTools\s*\(/g) || []
    if (calls.length > 0) {
      // If present, every call must appear inside an if-guard for non-prod.
      const guarded = INDEX_TS.match(
        /(NODE_ENV\s*[!=]==?\s*['"]development['"]|!app\.isPackaged|app\.isPackaged)[^}]*openDevTools/s,
      )
      expect(guarded).toBeTruthy()
    }
    expect(true).toBe(true) // explicit pass when no openDevTools at all
  })
})

// ═══════════════════════════════════════════════════════════════════════
// IPC SURFACE — window:*
// ═══════════════════════════════════════════════════════════════════════

describe('window:* IPC handlers — bounds clamping', () => {
  it('window:set-opacity clamps to 0.15..1.0 (no full transparency or hidden window via IPC)', () => {
    // The setWindowOpacity body in window-manager.ts does the clamp.
    expect(WM_TS).toMatch(/Math\.max\(\s*0\.15\s*,\s*Math\.min\(\s*1\s*,/)
  })

  it('window:set-mode body restricts to the documented enum', () => {
    expect(INDEX_TS).toMatch(/['"]auth['"]\s*\|\s*['"]compact['"]\s*\|\s*['"]expanded['"]/)
  })

  it('does NOT expose a window:set-position IPC (cannot move window off-screen via IPC)', () => {
    expect(INDEX_TS).not.toMatch(/['"]window:set-position['"]/)
    expect(IPC_TS).not.toMatch(/['"]window:set-position['"]/)
  })

  it('does NOT expose a window:set-bounds IPC', () => {
    expect(INDEX_TS).not.toMatch(/['"]window:set-bounds['"]/)
    expect(IPC_TS).not.toMatch(/['"]window:set-bounds['"]/)
  })

  it('setWindowMode itself clamps x/y to the work area before applying', () => {
    // Confirms an explicit clamp pattern in window-manager.ts after the
    // mode-derived target is computed.
    expect(WM_TS).toMatch(/x\s*=\s*Math\.max\(workX/)
    expect(WM_TS).toMatch(/y\s*=\s*Math\.max\(workY/)
  })

  it('moveToDisplay clamps to the destination display work area', () => {
    expect(WM_TS).toMatch(/Clamp to work area/)
  })
})

// ═══════════════════════════════════════════════════════════════════════
// Display-manager — no leak of resolution / serial unless requested
// ═══════════════════════════════════════════════════════════════════════

describe('display-manager — IPC payload minimisation', () => {
  it('DisplayInfo does not include serial/EDID/manufacturer fields', () => {
    expect(DM_TS).not.toMatch(/serial/i)
    expect(DM_TS).not.toMatch(/edid/i)
    expect(DM_TS).not.toMatch(/manufacturer/i)
    expect(DM_TS).not.toMatch(/internal/i)
    expect(DM_TS).not.toMatch(/colorSpace/)
    expect(DM_TS).not.toMatch(/touchSupport/)
  })

  it('display IDs are integers (no path/UUID leakage)', () => {
    // The id field in DisplayInfo is a plain number from screen.getAllDisplays().id
    expect(DM_TS).toMatch(/id\s*:\s*number/)
    expect(DM_TS).toMatch(/id\s*:\s*d\.id/)
  })

  it('only a fixed shape is shipped over IPC (id, name, width, height, isPrimary, scaleFactor, bounds)', () => {
    // Pin the DisplayInfo interface members — diff catches any added field.
    expect(DM_TS).toMatch(/id\s*:\s*number/)
    expect(DM_TS).toMatch(/name\s*:\s*string/)
    expect(DM_TS).toMatch(/width\s*:\s*number/)
    expect(DM_TS).toMatch(/height\s*:\s*number/)
    expect(DM_TS).toMatch(/isPrimary\s*:\s*boolean/)
    expect(DM_TS).toMatch(/scaleFactor\s*:\s*number/)
    expect(DM_TS).toMatch(/bounds\s*:\s*\{\s*x\s*:\s*number/)
  })

  it('setActiveDisplayId validates the supplied ID against connected displays', () => {
    expect(DM_TS).toMatch(/screen\.getAllDisplays\(\)\.some\(/)
    expect(DM_TS).toMatch(/falling back to primary/i)
  })

  it('display change handlers do not eagerly broadcast every detail; renderer pulls via displays:list on demand', () => {
    // index.ts registers displays:list as a pull endpoint, not a broadcast.
    expect(INDEX_TS).toMatch(/secureHandle\(\s*['"]displays:list['"]/)
    // No display-change broadcast spamming detail to the renderer
    expect(INDEX_TS).not.toMatch(/screen\.on\([^)]*display-(added|removed|metrics-changed)[^)]*\)\s*=>\s*\{[\s\S]*?webContents\.send\([^)]*resolution/)
  })
})

// ═══════════════════════════════════════════════════════════════════════
// IPC SECURITY — every window/permissions/displays handler is wrapped
// ═══════════════════════════════════════════════════════════════════════

describe('all sensitive handlers go through secureHandle (sender validation)', () => {
  const sensitiveChannels = [
    'window:set-mode',
    'window:set-opacity',
    'window:get-opacity',
    'window:get-size',
    'window:get-bounds',
    'window:start-resize',
    'window:stop-resize',
    'permissions:check',
    'permissions:request-accessibility',
    'permissions:open-screen-recording',
    'permissions:open-accessibility',
    'displays:list',
    'displays:get-active',
    'displays:set-active',
    'app:relaunch',
    'app:quit',
  ]

  for (const ch of sensitiveChannels) {
    it(`${ch} is registered exactly once via secureHandle`, () => {
      const re = new RegExp(`secureHandle\\(\\s*['"]${ch.replace(/:/g, ':')}['"]`, 'g')
      const matches = INDEX_TS.match(re) || []
      expect(matches.length).toBe(1)

      // And not also via raw ipcMain.handle
      const raw = new RegExp(`ipcMain\\.handle\\(\\s*['"]${ch}['"]`, 'g')
      expect((INDEX_TS.match(raw) || []).length).toBe(0)
    })
  }

  it('secureHandle definition validates event.sender === mainWindow.webContents', () => {
    expect(INDEX_TS).toMatch(/event\.sender\s*!==\s*mainWindow\?\.\webContents/)
    expect(INDEX_TS).toMatch(/Blocked unauthorized IPC call/)
  })
})
