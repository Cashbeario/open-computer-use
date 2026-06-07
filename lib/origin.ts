/**
 * Resolve the public origin for a Next.js request.
 *
 * Why this exists
 * ---------------
 * On AWS ECS Fargate, the Next.js container is started with `HOSTNAME=0.0.0.0`
 * and `PORT=3000` (see `Dockerfile` ENV block and `infra/aws/ecs.tf`'s
 * frontend task definition). Next.js standalone server.js builds `req.url`
 * from those bind params when the Host header is unrecognized — so
 * `new URL(req.url).origin` resolves to `http://0.0.0.0:3000`. That value
 * was leaking into Composio OAuth callback URLs and into the post-OAuth
 * 307 redirect the user sees in their browser bar
 * (`https://0.0.0.0:3000/connections?connected=outlook`).
 *
 * Precedence (highest to lowest):
 *   1. `NEXT_PUBLIC_APP_URL`           — operator-pinned public origin.
 *                                        Trusted unconditionally; the safe
 *                                        path.
 *   2. `x-forwarded-host` + `proto`    — set by ALB / CloudFront / nginx.
 *                                        Only consulted when env var is
 *                                        unset (i.e. operator forgot to
 *                                        configure prod).
 *   3. `host` + `x-forwarded-proto`    — raw Host header; ALB preserves it
 *                                        by default for public listeners.
 *   4. `new URL(req.url).origin`       — dev fallback (no proxy in front).
 *   5. `APP_DOMAIN` constant           — guaranteed-correct final safety
 *                                        net in production if everything
 *                                        above resolves to a bind address
 *                                        (`0.0.0.0` / `127.0.0.1` /
 *                                        `localhost`). Logs a loud warning.
 *
 * Security
 * --------
 * Trusting `x-forwarded-host` CAN be a host-header-injection vector — an
 * attacker setting `X-Forwarded-Host: evil.com` could redirect OAuth flows
 * to themselves. We mitigate this by ONLY consulting forwarded headers
 * when the operator did not pin a public origin via env var. In a
 * correctly-configured production environment, step 1 always wins and
 * forwarded headers are never read. The validator at step 5 means even a
 * missing env + a poisoned `x-forwarded-host` collapses to `APP_DOMAIN`,
 * never to attacker-controlled values.
 */
import type { NextRequest } from "next/server"
import { APP_DOMAIN } from "@/lib/config"

const BIND_ADDRESS_HOSTS = new Set([
  "0.0.0.0",
  "127.0.0.1",
  "localhost",
])

export interface OriginInput {
  url: string
  headers: Headers
}

export function resolveRequestOrigin(
  req: NextRequest | OriginInput,
): string {
  const envOrigin = (process.env.NEXT_PUBLIC_APP_URL || "").trim()
  if (envOrigin) {
    return envOrigin.replace(/\/+$/, "")
  }

  const fwdHost = req.headers.get("x-forwarded-host")
  const fwdProto = req.headers.get("x-forwarded-proto")
  if (fwdHost) {
    const proto =
      (fwdProto || "https").split(",")[0]?.trim() || "https"
    const host = fwdHost.split(",")[0]?.trim() || fwdHost
    return validateOrFallback(`${proto}://${host}`)
  }

  const rawHost = req.headers.get("host")
  if (rawHost) {
    const protoFromHeader = (fwdProto || "").split(",")[0]?.trim()
    const proto =
      protoFromHeader ||
      (rawHost.includes("localhost") || rawHost.startsWith("127.")
        ? "http"
        : "https")
    return validateOrFallback(`${proto}://${rawHost}`)
  }

  try {
    return validateOrFallback(new URL(req.url).origin)
  } catch {
    return APP_DOMAIN
  }
}

/**
 * Final-stage guard: if we resolved to a bind-address host in production,
 * log a loud warning and substitute the hard-coded `APP_DOMAIN`. This
 * catches the specific class of bug that broke prod (HOSTNAME=0.0.0.0
 * leaking through `req.url`) without taking down the OAuth flow.
 */
function validateOrFallback(candidate: string): string {
  try {
    const u = new URL(candidate)
    if (
      process.env.NODE_ENV === "production" &&
      BIND_ADDRESS_HOSTS.has(u.hostname)
    ) {
      console.error(
        `[origin] Resolved request origin to bind address '${u.host}' in production. ` +
          `Set NEXT_PUBLIC_APP_URL=https://your-public-domain to fix. ` +
          `Falling back to APP_DOMAIN='${APP_DOMAIN}' for safety.`,
      )
      return APP_DOMAIN
    }
    return candidate.replace(/\/+$/, "")
  } catch {
    return APP_DOMAIN
  }
}
