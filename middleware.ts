import { updateSession } from "@/utils/supabase/middleware"
import { NextResponse, type NextRequest } from "next/server"
import { validateCsrfToken } from "./lib/csrf"
import { describeMode } from "./lib/oss-mode"
import { getClientIp, classifyBot } from "./lib/client-ip"
import { isScannerPath } from "./lib/scanner-paths"
import { locales, defaultLocale, type Locale } from "./i18n/config"

// One-shot mode log: emit `[coasty] mode=oss|production` on the first
// middleware invocation of the process so operators can see at a glance which
// path their deployment is running. Subsequent requests skip this — flag is
// scoped to the module, so a `vi.resetModules()` in tests makes it fire again
// (each test gets a fresh log).
let _modeLogged = false

// Bot-scanner probe paths. Returning 200 (the Next.js default for unknown
// pages, which renders not-found.tsx) signals "live target" to mass scanners
// and keeps us on automated retry lists. The pattern set + allowlist now
// lives in `lib/scanner-paths.ts` so it can be unit-tested in isolation and
// extended without touching middleware control flow. We short-circuit with
// 410 Gone (intentionally stronger than 404) so scanner toolchains drop us
// from their retry queues, and so analytics / autoscale signals are not
// polluted by 200-on-probe traffic.
function detectLocaleFromHeader(request: NextRequest): Locale {
  const acceptLanguage = request.headers.get("accept-language")
  if (!acceptLanguage) return defaultLocale

  const preferred = acceptLanguage
    .split(",")
    .map((part) => {
      const [lang, q] = part.trim().split(";q=")
      return { lang: lang.trim().split("-")[0].toLowerCase(), q: q ? parseFloat(q) : 1 }
    })
    .sort((a, b) => b.q - a.q)

  for (const { lang } of preferred) {
    if (locales.includes(lang as Locale)) {
      return lang as Locale
    }
  }
  return defaultLocale
}

export async function middleware(request: NextRequest) {
  // Boot-time mode log — once per process. Format is exactly
  // `[coasty] mode=oss` or `[coasty] mode=production` so log parsers can grep
  // for it cheaply. Tests rely on this exact format & one-shot semantics.
  if (!_modeLogged) {
    _modeLogged = true
    console.log(`[coasty] mode=${describeMode()}`)
  }

  // --- Per-request access logging: capture inputs at start ---
  // Capture cheap, sync facts up front so we can log even on early-return / throw.
  // Note: req.ip was removed in Next 15; rely on forwarding headers (Cloudflare, ALB).
  const t_start = performance.now()
  const method = request.method
  const path = request.nextUrl.pathname
  const ua = request.headers.get("user-agent")
  // Real client IP via Cloudflare/ALB-aware extraction. See lib/client-ip.ts
  // for precedence rules. Replaces the naive XFF split that was reporting
  // private hops (and 127.0.0.1) as the client IP.
  const ip = getClientIp(request.headers)
  const bot_class = classifyBot(ua)

  // activeLocale is computed inside the try block but we need it visible to the
  // logger in `finally`. Default it to defaultLocale so the log line is well-typed
  // even if we throw before computing the real value.
  let activeLocale: Locale | string = defaultLocale
  let response: NextResponse

  try {
    // Bot-scanner short-circuit — must run BEFORE updateSession so we don't
    // pay the Supabase auth round-trip on probe traffic, and BEFORE locale
    // routing so we don't leak signal via Set-Cookie / Content-Language on a
    // probe response. The finally block still logs the response for security
    // monitoring (the `[req]` access log line carries status=410, which is
    // distinct from any normal app response).
    //
    // We also emit a separate structured log line (`kind:"scanner_blocked"`)
    // so a CloudWatch Logs Insights query can group probe traffic by hour
    // without re-parsing UA strings. Only the pathname is logged, never the
    // full URL — attacker-controlled query strings echoed into a dashboard
    // can become a stored-XSS-by-log vector.
    if (isScannerPath(path)) {
      try {
        console.log(JSON.stringify({
          kind: "scanner_blocked",
          ts: new Date().toISOString(),
          path,
          ip,
          ua: ua?.substring(0, 200) ?? "",
          bot_class,
        }))
      } catch {
        // never let logging break the short-circuit
      }
      response = new NextResponse(null, {
        status: 410,
        headers: {
          // Belt-and-suspenders against any CDN/proxy that might cache and
          // hide future probes from our access log.
          "Cache-Control": "no-store",
          "X-Robots-Tag": "noindex, nofollow",
        },
      })
      return response
    }

    response = await updateSession(request)

    // Support ?hl=xx parameter for search engine crawlers (hreflang support)
    const hlParam = request.nextUrl.searchParams.get("hl")
    if (hlParam && locales.includes(hlParam as Locale)) {
      response.cookies.set("NEXT_LOCALE", hlParam, {
        path: "/",
        maxAge: 365 * 24 * 60 * 60,
        sameSite: "lax",
      })
    }

    // Auto-detect locale from Accept-Language if no cookie is set
    if (!request.cookies.get("NEXT_LOCALE")?.value && !hlParam) {
      const detected = detectLocaleFromHeader(request)
      if (detected !== defaultLocale) {
        response.cookies.set("NEXT_LOCALE", detected, {
          path: "/",
          maxAge: 365 * 24 * 60 * 60, // 1 year
          sameSite: "lax",
        })
      }
    }

    // Determine active locale for headers
    activeLocale = hlParam && locales.includes(hlParam as Locale)
      ? hlParam
      : request.cookies.get("NEXT_LOCALE")?.value || defaultLocale

    // Content-Language and Vary headers for SEO
    response.headers.set("Content-Language", activeLocale)
    response.headers.set("Vary", "Accept-Language, Cookie")

    // CSRF protection for state-changing requests
    if (["POST", "PUT", "PATCH", "DELETE"].includes(request.method)) {
      const csrfCookie = request.cookies.get("csrf_token")?.value
      const headerToken = request.headers.get("x-csrf-token")

      if (!csrfCookie || !headerToken || !(await validateCsrfToken(headerToken))) {
        response = new NextResponse("Invalid CSRF token", { status: 403 })
        return response
      }
    }

    // CSP for development and production
    const isDev = process.env.NODE_ENV === "development"

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseDomain = supabaseUrl ? new URL(supabaseUrl).origin : ""

    response.headers.set(
      "Content-Security-Policy",
      isDev
        ? `default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdnjs.cloudflare.com https://us-assets.i.posthog.com; frame-src 'self' https://www.youtube-nocookie.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: https: blob:; connect-src 'self' wss: https://api.openai.com https://api.mistral.ai https://api.supabase.com ${supabaseDomain} https://us.i.posthog.com https://us-assets.i.posthog.com https://api.github.com;`
        : `default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdnjs.cloudflare.com https://analytics.umami.is https://us-assets.i.posthog.com https://vercel.live; frame-src 'self' https://vercel.live https://www.youtube-nocookie.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: https: blob:; connect-src 'self' wss: https://api.openai.com https://api.mistral.ai https://api.supabase.com ${supabaseDomain} https://api-gateway.umami.dev https://us.i.posthog.com https://us-assets.i.posthog.com https://api.github.com;`
    )

    // Security headers
    response.headers.set("X-Frame-Options", "SAMEORIGIN")
    response.headers.set("X-Content-Type-Options", "nosniff")
    response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin")
    response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
    if (!isDev) {
      response.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
    }

    return response
  } finally {
    // --- Per-request access log: emit one JSON line per request to stdout ---
    // CloudWatch ingests Next.js standalone stdout line-by-line; one JSON object
    // per line is the friendliest format for Logs Insights.
    // Skip _next/* (static chunks) to keep ingestion volume bounded; the matcher
    // already excludes /api, favicon, common image extensions.
    if (!path.startsWith("/_next/") && path !== "/favicon.ico" && path !== "/robots.txt" && path !== "/sitemap.xml") {
      // Best-effort: never let a logging failure surface to the user.
      try {
        // `response!` is safe: either we assigned it before returning, or we
        // threw — in which case `finally` still runs but `response` may be
        // undefined. We narrow to handle that case.
        const status = (response! as NextResponse | undefined)?.status ?? 500
        console.log(JSON.stringify({
          type: "request",
          ts: new Date().toISOString(),
          method,
          path,
          status,
          duration_ms: Math.round(performance.now() - t_start),
          ua: ua?.substring(0, 200) ?? "",
          ip,
          bot_class,
          locale: activeLocale,
        }))
      } catch {
        // swallow logging errors; never break a real request
      }
    }
  }
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
}
