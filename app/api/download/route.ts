import { NextResponse } from "next/server"
import https from "node:https"
import YAML from "yaml"

const UPDATES_BASE_URL = "https://updates.coasty.ai"

interface PlatformInfo {
  version: string
  filename: string
  sha512: string
  size: number
  releaseDate: string
  downloadUrl: string
}

interface ManifestFile {
  url: string
  sha512?: string
  size?: number
}

/** Fetch a URL using raw Node.js https — bypasses Next.js fetch cache entirely */
function httpsGet(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { "User-Agent": "Coasty/1.0" } }, (res) => {
      if (res.statusCode !== 200) {
        res.resume()
        return reject(new Error(`HTTP ${res.statusCode}`))
      }
      let body = ""
      res.setEncoding("utf8")
      res.on("data", (chunk) => (body += chunk))
      res.on("end", () => resolve(body))
      res.on("error", reject)
    }).on("error", reject)
  })
}

function buildPlatformInfo(
  file: ManifestFile,
  version: string,
  releaseDate: string,
): PlatformInfo {
  return {
    version,
    filename: file.url,
    sha512: file.sha512 ?? "",
    size: file.size ?? 0,
    releaseDate,
    downloadUrl: `${UPDATES_BASE_URL}/${encodeURIComponent(file.url)}`,
  }
}

async function fetchWindowsManifest(): Promise<PlatformInfo | null> {
  try {
    const text = await httpsGet(`${UPDATES_BASE_URL}/latest.yml?t=${Date.now()}`)
    const data = YAML.parse(text)
    const files: ManifestFile[] = data.files ?? []
    const exe = files.find((f) => f.url.endsWith(".exe")) ?? files[0]
    if (!exe?.url || !data.version) return null
    return buildPlatformInfo(exe, data.version, data.releaseDate ?? "")
  } catch (err) {
    console.error("Failed to fetch latest.yml:", err)
    return null
  }
}

/**
 * Parse latest-mac.yml. With the per-arch electron-builder config the
 * manifest's `files` array contains BOTH arm64 and x64 DMGs:
 *
 *   Coasty-Desktop-<v>-arm64.dmg   ← Apple Silicon (M1/M2/M3/M4)
 *   Coasty-Desktop-<v>-x64.dmg     ← Intel
 *
 * We pick each one by filename pattern so the download page can serve the
 * right artifact per user. The legacy `mac` slot keeps the first available
 * DMG so older callers and pre-per-arch releases keep working.
 */
async function fetchMacManifest(): Promise<{
  arm64: PlatformInfo | null
  x64: PlatformInfo | null
  generic: PlatformInfo | null
}> {
  try {
    const text = await httpsGet(`${UPDATES_BASE_URL}/latest-mac.yml?t=${Date.now()}`)
    const data = YAML.parse(text)
    const files: ManifestFile[] = data.files ?? []
    const version: string = data.version
    const releaseDate: string = data.releaseDate ?? ""
    if (!version) return { arm64: null, x64: null, generic: null }

    const dmgs = files.filter((f) => f.url.endsWith(".dmg"))
    // Match the explicit `-arm64` / `-x64` segment electron-builder emits.
    // Don't accept loose `arm64` / `x64` substrings — a future bundle named
    // `Coasty-Desktop-arm64-helper.dmg` shouldn't shadow the real artifact.
    const arm64File = dmgs.find((f) => /-arm64\.dmg$/i.test(f.url))
    const x64File = dmgs.find((f) => /-(x64|x86_64)\.dmg$/i.test(f.url))
    const arm64 = arm64File ? buildPlatformInfo(arm64File, version, releaseDate) : null
    const x64 = x64File ? buildPlatformInfo(x64File, version, releaseDate) : null

    // Generic slot: prefer arm64 (most new Macs since 2020 are Apple
    // Silicon); fall back to x64; fall back to the first DMG so single-arch
    // legacy builds still resolve.
    const generic = arm64 ?? x64 ??
      (dmgs[0] ? buildPlatformInfo(dmgs[0], version, releaseDate) : null)

    return { arm64, x64, generic }
  } catch (err) {
    console.error("Failed to fetch latest-mac.yml:", err)
    return { arm64: null, x64: null, generic: null }
  }
}

export const dynamic = "force-dynamic"

export async function GET() {
  const [windows, mac] = await Promise.all([
    fetchWindowsManifest(),
    fetchMacManifest(),
  ])

  return NextResponse.json(
    {
      windows,
      mac: mac.generic,
      macArm64: mac.arm64,
      macX64: mac.x64,
    },
    {
      headers: {
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "Pragma": "no-cache",
        "Expires": "0",
      },
    },
  )
}
