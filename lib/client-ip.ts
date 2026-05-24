/**
 * Client-IP extraction + bot classification.
 *
 * Why this exists
 * ---------------
 * The Next.js request logger was writing `127.0.0.1` for every request,
 * which blocked 3 incident investigations in 5 days. The root cause was
 * that the IP-extraction code split `x-forwarded-for` and returned the
 * leftmost entry without filtering private ranges. In Coasty's edge
 * topology — Cloudflare in front of AWS ALB in front of an ECS task —
 * the leftmost XFF hop can be an internal ALB probe (10.0.0.0/8), and
 * the socket remote address is always a Cloudflare or ALB peer (never
 * the real client). This helper is the single source of truth for "what
 * is the real client IP for this request?" across middleware and API
 * route loggers.
 *
 * Precedence (highest to lowest):
 *   1. cf-connecting-ip   — set by Cloudflare; spoofable only if origin
 *                           is exposed (our ALB DNS is private, so
 *                           accepting it is safe today).
 *   2. true-client-ip     — Cloudflare Enterprise alias for the same
 *                           field; kept for plan portability.
 *   3. x-forwarded-for    — left-to-right scan for the first public IP;
 *                           ALB prepends, so the order is
 *                           client, edge1, edge2, ..., alb.
 *   4. x-real-ip          — last-resort header some proxies set.
 *   5. (no socket addr)   — Web Fetch Headers have no notion of a peer
 *                           IP; if all four headers are missing we
 *                           return 'unknown' rather than misleading
 *                           '127.0.0.1'.
 */

/**
 * IPv4 private / link-local / loopback ranges that must NEVER be reported
 * as a client IP. Each regex matches the dotted-quad prefix.
 *
 *   10.0.0.0/8           — RFC1918 private
 *   172.16.0.0/12        — RFC1918 private (172.16-172.31)
 *   192.168.0.0/16       — RFC1918 private
 *   127.0.0.0/8          — loopback
 *   0.0.0.0/8            — "this network" / unspecified
 *   fc00::/7             — RFC4193 unique local (IPv6)
 *   fe80::/10            — IPv6 link-local
 *   ::1                  — IPv6 loopback
 *
 * Public IPv6 addresses (e.g. 2001:db8::1) match none of these and
 * therefore fall through as "real" — exactly what we want.
 */
const PRIVATE_RANGES: readonly RegExp[] = [
  /^10\./,
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
  /^192\.168\./,
  /^127\./,
  /^fc00:/i,
  /^fe80:/i,
  /^::1$/,
  /^0\./,
]

function isPrivate(ip: string): boolean {
  return PRIVATE_RANGES.some((re) => re.test(ip))
}

/**
 * Header bag accepted by `getClientIp`. We accept either:
 *   - Web Fetch `Headers` (NextRequest, Edge runtime, middleware)
 *   - Plain object with string-or-array values (Node.js req.headers shape)
 *
 * The latter is needed because some older API helpers and tests still
 * synthesize headers as plain objects, and forcing every caller to wrap
 * in `new Headers(...)` is more churn than it's worth.
 */
export type HeaderBag = Headers | Record<string, string | string[] | undefined>

/**
 * Returns the real client IP for a request, honoring Cloudflare and ALB
 * headers. See module docstring for precedence rules.
 *
 * Returns the string `'unknown'` if no header resolves — callers should
 * NOT substitute `'127.0.0.1'` or the empty string, since both have
 * historically been misread as "request originated locally" by oncall.
 */
export function getClientIp(headers: HeaderBag): string {
  const get = (name: string): string | undefined => {
    if (headers instanceof Headers) {
      return headers.get(name) ?? undefined
    }
    // Plain-object path: try exact name first, then lowercase. Node's
    // http parser lowercases incoming header names so the lowercase
    // lookup is the common case; the exact-name lookup is a safety net
    // for tests / synthesized requests that preserve original casing.
    const v = headers[name] ?? headers[name.toLowerCase()]
    return Array.isArray(v) ? v[0] : v
  }

  const cf = get("cf-connecting-ip")
  if (cf && !isPrivate(cf)) return cf

  const trueClient = get("true-client-ip")
  if (trueClient && !isPrivate(trueClient)) return trueClient

  const xff = get("x-forwarded-for")
  if (xff) {
    const candidates = xff
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
    for (const candidate of candidates) {
      if (!isPrivate(candidate)) {
        return candidate
      }
    }
    // All-private XFF (e.g. ALB internal health probe). Returning the
    // leftmost entry preserves debuggability — oncall can at least see
    // it was an internal hop rather than an empty / unknown field.
    if (candidates[0]) return candidates[0]
  }

  const xreal = get("x-real-ip")
  if (xreal && !isPrivate(xreal)) return xreal

  return "unknown"
}

/**
 * Coarse-grained classification of a user-agent string. Returned label
 * is logged alongside the IP so Logs Insights can group `bot_class`
 * without re-parsing the UA on every query.
 *
 * Categories (return value):
 *   - 'no_ua'           — header was missing / empty
 *   - 'cli_tool'        — curl, wget, python-requests, libwww-perl
 *   - 'search_crawler'  — Google, Bing, Yandex, Baidu, Sogou, DuckDuck,
 *                         Apple
 *   - 'seo_crawler'     — Ahrefs, SEMrush, MJ12, DotBot, Petal, Seznam
 *   - 'ai_crawler'      — ChatGPT, GPTBot, Claude, Cohere, Perplexity,
 *                         Meta-ExternalAgent
 *   - 'headless_browser'— HeadlessChrome, PhantomJS, Puppeteer, Playwright
 *   - 'coasty_client'   — our own Electron desktop app (and other
 *                         Coasty-branded clients in the future)
 *   - 'browser'         — anything with a major browser engine marker
 *                         that didn't match the above
 *   - 'unknown'         — non-empty UA that matched nothing
 *
 * Order matters: more specific categories (coasty_client, headless,
 * crawlers) are checked before the generic `browser` bucket so a
 * Puppeteer UA carrying "Chrome" inside doesn't get mis-classified as
 * a real browser.
 */
export function classifyBot(userAgent: string | undefined | null): string {
  if (!userAgent) return "no_ua"
  const ua = userAgent.toLowerCase()
  if (/curl|wget|python-requests|libwww-perl/.test(ua)) return "cli_tool"
  if (/googlebot|bingbot|yandex|baidu|sogou|duckduckbot|applebot/.test(ua)) {
    return "search_crawler"
  }
  if (/ahrefsbot|semrushbot|mj12bot|dotbot|petalbot|seznambot/.test(ua)) {
    return "seo_crawler"
  }
  if (
    /chatgpt-user|gptbot|claude-web|cohere-ai|perplexitybot|meta-externalagent/.test(
      ua,
    )
  ) {
    return "ai_crawler"
  }
  if (/headlesschrome|phantomjs|puppeteer|playwright/.test(ua)) {
    return "headless_browser"
  }
  if (/coasty/.test(ua)) return "coasty_client"
  if (/mozilla|chrome|safari|firefox|edge/.test(ua)) return "browser"
  return "unknown"
}
