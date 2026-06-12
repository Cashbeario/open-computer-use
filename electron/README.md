# Coasty Desktop (Electron)

A cross-platform desktop overlay that executes AI agent commands directly on your local machine instead of in a remote VM. It runs as a frameless, always-on-top pill that expands into a chat panel, and connects to the Coasty backend over a persistent WebSocket bridge.

## What it is

The main process (`src/main/`) is organized into focused modules:

- `index.ts`: app entry, window creation, system tray, IPC registration
- `auth.ts`: Google OAuth via Supabase, with a local HTTP server handling the callback
- `ws-bridge.ts`: persistent WebSocket to the backend `/api/electron/ws` with auto-reconnect and heartbeat
- `window-manager.ts`: window modes (auth, compact pill, expanded chat), animation, opacity, screenshot hiding
- `local-executor.ts`: command dispatch registry mapping 50+ backend command names to local handlers
- `desktop-automation.ts`: platform-specific mouse, keyboard, scroll, and drag operations
- `browser-automation.ts`: Puppeteer-core control of installed Chrome, Edge, or Brave
- `terminal.ts`: session-based shell execution (PowerShell on Windows, bash on Unix)
- `file-ops.ts`: file system operations (read, write, edit, append, delete, list)
- `screenshot.ts`: desktop capture via Electron's `desktopCapturer`
- `permissions.ts`: macOS Screen Recording and Accessibility permission checks
- `auto-updater.ts`: auto-update lifecycle

The renderer (`src/renderer/`) is a React 19 UI with Zustand stores, and the preload bridge (`src/preload/`) exposes the `window.coasty` API.

## Develop

```bash
cd electron
npm install
npm run dev
```

`npm run dev` launches the overlay window with hot reload. Without an `.env` file the app starts on the auth screen with a visible "Supabase is not configured" state: the UI runs, but sign-in cannot work until you configure the environment below.

### Environment

To actually sign in and chat, copy the example file and fill it in:

```bash
cp .env.example .env
```

| Variable | Default | Purpose |
| --- | --- | --- |
| `COASTY_BACKEND_URL` | `http://localhost:8001` | FastAPI backend the overlay connects to. The backend is not part of this public repo, so signing in and chatting requires a running instance. |
| `NEXT_PUBLIC_SUPABASE_URL` | (none) | Supabase project URL, same value as the web app. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | (none) | Supabase anon key, same value as the web app. |

**Build-time injection caveat:** these values are baked in at build time by electron-vite's `define` config. They are not read at runtime, so restart `npm run dev` (and rebuild before packaging) after changing `.env`.

## Test

Unit tests use Vitest and need no environment configuration or credentials:

```bash
npm test
npm run test:watch
```

End-to-end tests use Playwright and need a build first:

```bash
npm run build
npm run test:e2e
# or both in one step:
npm run test:e2e:build
```

## Package

```bash
npm run package        # current platform
npm run package:win    # Windows NSIS installer
npm run package:mac    # macOS DMG + ZIP
npm run package:linux  # Linux AppImage
```

On a clean machine these produce an **unsigned** installer, which is expected. Code signing is opt-in: maintainers with signing credentials use the sign-and-build scripts (`npm run package:win:signed` runs `sign-and-build.ps1`, `npm run package:mac:signed` runs `sign-and-build.sh`). macOS notarization is likewise maintainers-only.

## Platform notes

- **Windows:** transparent frameless windows can lose always-on-top status, so `window-manager.ts` includes a hide, apply bounds, show workaround with timed retries. Desktop automation uses PowerShell with user32.dll P/Invoke.
- **macOS:** desktop automation requires the Screen Recording and Accessibility permissions (System Settings > Privacy & Security). The app checks both via `permissions.ts` and offers deep links to the right settings panes.
- **Linux:** desktop automation requires `xdotool` and window management requires `wmctrl` at runtime, for example `sudo apt install xdotool wmctrl`.
