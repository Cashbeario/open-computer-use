/**
 * Scanner / secret-credential probe path classifier.
 *
 * Why this exists
 * ---------------
 * A 6-day production access-log audit counted 17,109 scanner probes, of which
 * 7,807 returned HTTP 200 because Next.js renders not-found.tsx with status
 * 200 by default. A 200 on `/.env`, `/wp-admin/`, or `/xmlrpc.php` tells every
 * mass scanner on the internet that the host is a live, exploitable target,
 * which:
 *   - pollutes analytics ("engagement" inflated by bots)
 *   - defeats rate-limit-by-status (no 4xx for the limiter to count)
 *   - masks future real compromise inside a sea of 200s
 *   - contributes to autoscale-out events on the frontend service
 *
 * The fix is a middleware short-circuit that returns 410 Gone (intentionally
 * stronger than 404; "this resource is gone and will never come back, stop
 * asking") with an empty body before any auth / locale / route resolution.
 * 410 was chosen over 403 / 404 because mass scanners use 410 as a "remove
 * from retry list" signal far more aggressively than they do 404.
 *
 * The pattern list and the allowlist live HERE (not inline in middleware.ts)
 * so that:
 *   1. The regex set is unit-testable in isolation (60+ cases below).
 *   2. Any new probe family added in the future has a single editing point.
 *   3. The `.well-known/` allowlist is a literal constant, not a comment that
 *      can drift out of sync with code review.
 *
 * Allowlist rationale
 * -------------------
 * `/.well-known/` (RFC 8615) hosts ACME challenges, security.txt,
 * change-password, apple-app-site-association, and assetlinks.json. Blocking
 * any of these breaks SSL cert renewal (= total site outage in 60-90 days),
 * macOS / iOS Sign in with Apple, and Android deep links. The allowlist is
 * checked FIRST, before any probe regex, so a path under `/.well-known/`
 * always slips through even if it incidentally matches a probe pattern.
 *
 * Static assets (`/_next/`, `/favicon.ico`, etc.) do not need an explicit
 * allowlist here because the Next.js middleware matcher already excludes
 * them. They are listed in the allowlist below as defense-in-depth for the
 * case where a future matcher edit broadens the surface.
 */

/**
 * Probe-path patterns. Each regex is anchored to a path-segment boundary
 * (`/` or start-of-string) so it cannot match the middle of a legitimate
 * route name. Patterns are checked in order; the first match wins.
 */
const SCANNER_PATH_PATTERNS: readonly RegExp[] = [
  // ---- Dotfile / secret-config probes ---------------------------------
  // Literal dotfiles: /.env, /.env.local, /.git/HEAD, /.aws/credentials,
  // /.ssh/id_rsa, /.htaccess, /.htpasswd, /.svn/, /.bzr/, /.hg/, /.DS_Store.
  // The trailing `(?:\/|$|\.)` keeps us from matching a real route segment
  // that happens to start with `.env` followed by other characters.
  /(?:^|\/)\.(env|git|aws|ssh|htaccess|htpasswd|svn|bzr|hg|DS_Store)(?:\/|$|\.)/i,
  // direnv config files (`.envrc`) — same threat model as `.env` (secrets).
  // Kept as a separate clause so the prior alternation stays anchored on
  // a clean trailing boundary.
  /(?:^|\/)\.envrc(?:\/|$)/i,

  // URL-encoded dotfile probes — scanners frequently encode `.` as `%2e`
  // to bypass naive filename filters. Match both `%2eenv` style and the
  // generic `/%2e` leading-byte case.
  /%2e(env|git|aws|ssh|htaccess|htpasswd)/i,
  /\/%2[eE]/,

  // ---- PHP / WordPress / Joomla / Drupal probes -----------------------
  // Coasty is a Next.js app. No legitimate route ever lives under any of
  // these prefixes, so a hit is unambiguous attack traffic.
  /\/(wp-admin|wp-content|wp-includes|wp-login|wp-config|xmlrpc\.php|wlwmanifest\.xml)/i,
  /\/(phpmyadmin|pma|adminer|admin\/login)/i,
  /\/(php-info|phpinfo|info\.php)/i,
  /\/(joomla|drupal|magento)/i,
  /\/eval-stdin\.php/i,
  /\/vendor\/phpunit/i,

  // ---- Backup / config file probes ------------------------------------
  // File-extension probes for accidentally exposed backups or config.
  // Anchored to end-of-path so we don't blow up on a legit route segment
  // that contains `.zip` in its body.
  /\.(bak|swp|backup|sql|tar\.gz|zip)$/i,
  /\/(config|configuration|database)\.(php|yml|yaml|json|xml)$/i,

  // ---- Path traversal -------------------------------------------------
  /\.\.\//,
  /%2e%2e%2f/i,
  /\/etc\/passwd/i,
  /%2[fF]etc%2[fF]passwd/i,

  // ---- CVE / vulnerability probes -------------------------------------
  // /cgi-bin   — classic CGI shell injection (Shellshock and friends).
  //              Matches both `/cgi-bin` (probe ping) and `/cgi-bin/...`.
  // /struts2   — Apache Struts RCE family
  // /owa/      — Exchange OWA login probing
  // /actuator  — Spring Boot management endpoints (`/actuator/env` leaks
  //              process env vars, `/actuator/health` confirms a target)
  // boaform / HNAP1 / GponForm / getuser — consumer-router exploit kits
  /\/cgi-bin(?:\/|$)/i,
  /\/struts2/i,
  /\/owa\//i,
  /\/actuator(?:\/|$)/i,
  /\/(boaform|HNAP1|getuser|GponForm)/i,
]

/**
 * Paths that must never be classified as scanner traffic, even if a probe
 * regex would otherwise match. Order: allowlist is checked FIRST.
 *
 * `/.well-known/` is the only one that is regex-tested today; static-asset
 * paths are excluded at the Next.js matcher level (see middleware.ts
 * `config.matcher`) but we keep the comment here as a documentation anchor
 * for future readers.
 */
const ALLOWLIST: readonly RegExp[] = [
  // RFC 8615 well-known URIs. Includes acme-challenge (LetsEncrypt),
  // security.txt, change-password, apple-app-site-association, and
  // assetlinks.json. Breaking any of these has cascading consequences
  // (cert expiry, sign-in failure, deep-link failure).
  /^\/\.well-known\//,
]

/**
 * Returns true if `pathname` looks like a known scanner / credential probe
 * and should be short-circuited to 410 Gone by the middleware.
 *
 * Inputs that return false (callers should let these flow normally):
 *   - empty string or `/`
 *   - any path under `/.well-known/`
 *   - any legitimate app route
 *
 * Behaviour notes:
 *   - Comparison is purely on the pathname; query strings are NOT examined.
 *     A request like `/?next=/.env` is legitimate, so we must not block it.
 *   - All regexes use the `i` flag where appropriate so `/WP-ADMIN/` and
 *     `/.ENV` match alongside their lowercase variants.
 *   - Null-byte injection (`/foo\x00.env`) does NOT bypass: the regexes
 *     anchor on `/` or string boundaries, and `\x00` is not a path
 *     separator in any of our patterns.
 */
export function isScannerPath(pathname: string): boolean {
  if (!pathname) return false
  if (ALLOWLIST.some((re) => re.test(pathname))) return false
  return SCANNER_PATH_PATTERNS.some((re) => re.test(pathname))
}
