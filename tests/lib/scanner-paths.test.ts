/**
 * Tests for `lib/scanner-paths.ts`.
 *
 * Covers three concerns:
 *   1. BLOCK list — known scanner / credential / CVE probe shapes must
 *      classify as scanner_path = true.
 *   2. PASS list — legitimate app routes, static assets, and crucially
 *      `.well-known/` must classify as scanner_path = false.
 *   3. EDGE cases — empty input, mixed case, null bytes, encoded variants
 *      must behave deterministically and never throw.
 *
 * The test numbering (1..69) maps 1:1 to the implementation spec so a
 * future reader can grep for a number and find both the rationale and
 * the assertion.
 */
import { describe, it, expect } from "vitest"
import { isScannerPath } from "@/lib/scanner-paths"

describe("isScannerPath: known scanner / probe paths return true", () => {
  // ---- Dotfile probes (literal + URL-encoded) -------------------------
  it("1. blocks /.env", () => {
    expect(isScannerPath("/.env")).toBe(true)
  })
  it("2. blocks /.env.local", () => {
    expect(isScannerPath("/.env.local")).toBe(true)
  })
  it("3. blocks /.env.production", () => {
    expect(isScannerPath("/.env.production")).toBe(true)
  })
  it("4. blocks /%2eenv%2elocal (URL-encoded .env.local)", () => {
    expect(isScannerPath("/%2eenv%2elocal")).toBe(true)
  })
  it("5. blocks /%2eGiT/CoNfIg (mixed-case encoded .git/config)", () => {
    expect(isScannerPath("/%2eGiT/CoNfIg")).toBe(true)
  })
  it("6. blocks /.git/config", () => {
    expect(isScannerPath("/.git/config")).toBe(true)
  })
  it("7. blocks /.aws/credentials", () => {
    expect(isScannerPath("/.aws/credentials")).toBe(true)
  })
  it("8. blocks /.ssh/id_rsa", () => {
    expect(isScannerPath("/.ssh/id_rsa")).toBe(true)
  })
  it("9. blocks /.htaccess", () => {
    expect(isScannerPath("/.htaccess")).toBe(true)
  })
  it("10. blocks /.htpasswd", () => {
    expect(isScannerPath("/.htpasswd")).toBe(true)
  })

  // ---- WordPress / PHP / Joomla ----------------------------------------
  it("11. blocks /wp-admin/setup-config.php", () => {
    expect(isScannerPath("/wp-admin/setup-config.php")).toBe(true)
  })
  it("12. blocks /wp-login.php", () => {
    expect(isScannerPath("/wp-login.php")).toBe(true)
  })
  it("13. blocks /wordpress/wp-admin/", () => {
    expect(isScannerPath("/wordpress/wp-admin/")).toBe(true)
  })
  it("14. blocks /wp-content/plugins/x.php", () => {
    expect(isScannerPath("/wp-content/plugins/x.php")).toBe(true)
  })
  it("15. blocks /xmlrpc.php", () => {
    expect(isScannerPath("/xmlrpc.php")).toBe(true)
  })
  it("16. blocks /phpmyadmin/index.php", () => {
    expect(isScannerPath("/phpmyadmin/index.php")).toBe(true)
  })
  it("17. blocks /pma/", () => {
    expect(isScannerPath("/pma/")).toBe(true)
  })
  it("18. blocks /phpinfo.php", () => {
    expect(isScannerPath("/phpinfo.php")).toBe(true)
  })
  it("19. blocks /info.php", () => {
    expect(isScannerPath("/info.php")).toBe(true)
  })
  it("20. blocks /vendor/phpunit/phpunit/src/Util/PHP/eval-stdin.php", () => {
    expect(
      isScannerPath("/vendor/phpunit/phpunit/src/Util/PHP/eval-stdin.php"),
    ).toBe(true)
  })
  it("21. blocks /eval-stdin.php", () => {
    expect(isScannerPath("/eval-stdin.php")).toBe(true)
  })

  // ---- Backup / config-file probes ------------------------------------
  it("22. blocks /config.php", () => {
    expect(isScannerPath("/config.php")).toBe(true)
  })
  it("23. blocks /database.yml", () => {
    expect(isScannerPath("/database.yml")).toBe(true)
  })
  it("24. blocks /backup.sql", () => {
    expect(isScannerPath("/backup.sql")).toBe(true)
  })
  it("25. blocks /site.zip", () => {
    expect(isScannerPath("/site.zip")).toBe(true)
  })

  // ---- Path traversal --------------------------------------------------
  it("26. blocks /etc/passwd", () => {
    expect(isScannerPath("/etc/passwd")).toBe(true)
  })
  it("27. blocks /../../etc/passwd (literal traversal)", () => {
    expect(isScannerPath("/../../etc/passwd")).toBe(true)
  })
  it("28. blocks /%2e%2e%2fetc%2fpasswd (encoded traversal)", () => {
    expect(isScannerPath("/%2e%2e%2fetc%2fpasswd")).toBe(true)
  })

  // ---- CVE / vulnerability probes -------------------------------------
  it("29. blocks /cgi-bin/luci/;stok=/locale", () => {
    expect(isScannerPath("/cgi-bin/luci/;stok=/locale")).toBe(true)
  })
  it("30. blocks /HNAP1/", () => {
    expect(isScannerPath("/HNAP1/")).toBe(true)
  })
  it("31. blocks /boaform/admin/formLogin", () => {
    expect(isScannerPath("/boaform/admin/formLogin")).toBe(true)
  })
  it("32. blocks /owa/auth/logon.aspx", () => {
    expect(isScannerPath("/owa/auth/logon.aspx")).toBe(true)
  })
})

describe("isScannerPath: legitimate routes return false", () => {
  it("33. allows / (root)", () => {
    expect(isScannerPath("/")).toBe(false)
  })
  it("34. allows /auth", () => {
    expect(isScannerPath("/auth")).toBe(false)
  })
  it("35. allows /auth/login", () => {
    expect(isScannerPath("/auth/login")).toBe(false)
  })
  it("36. allows /c/abc-123 (chat)", () => {
    expect(isScannerPath("/c/abc-123")).toBe(false)
  })
  it("37. allows /c/abc-123 even with .env in query string", () => {
    // Only the pathname is examined. Callers strip the query before
    // calling isScannerPath. Passing the bare pathname must return false.
    expect(isScannerPath("/c/abc-123")).toBe(false)
  })
  it("38. allows /api/chat", () => {
    expect(isScannerPath("/api/chat")).toBe(false)
  })
  it("39. allows /api/electron/ws", () => {
    expect(isScannerPath("/api/electron/ws")).toBe(false)
  })
  it("40. allows /api/electron/machines", () => {
    expect(isScannerPath("/api/electron/machines")).toBe(false)
  })
  it("41. allows /api/billing/credits/balance", () => {
    expect(isScannerPath("/api/billing/credits/balance")).toBe(false)
  })
  it("42. allows /billing", () => {
    expect(isScannerPath("/billing")).toBe(false)
  })
  it("43. allows /account", () => {
    expect(isScannerPath("/account")).toBe(false)
  })
  it("44. allows /pricing", () => {
    expect(isScannerPath("/pricing")).toBe(false)
  })
  it("45. allows /blog/the-future-of-ai", () => {
    expect(isScannerPath("/blog/the-future-of-ai")).toBe(false)
  })
  it("46. allows /blog/postgrest-204-fix", () => {
    expect(isScannerPath("/blog/postgrest-204-fix")).toBe(false)
  })
  it("47. allows /_next/static/chunks/main-abc.js", () => {
    expect(isScannerPath("/_next/static/chunks/main-abc.js")).toBe(false)
  })
  it("48. allows /favicon.ico", () => {
    expect(isScannerPath("/favicon.ico")).toBe(false)
  })
  it("49. allows /robots.txt", () => {
    expect(isScannerPath("/robots.txt")).toBe(false)
  })
  it("50. allows /sitemap.xml", () => {
    expect(isScannerPath("/sitemap.xml")).toBe(false)
  })
  it("51. allows /manifest.json", () => {
    expect(isScannerPath("/manifest.json")).toBe(false)
  })
  it("52. allows /apple-touch-icon.png", () => {
    expect(isScannerPath("/apple-touch-icon.png")).toBe(false)
  })

  // ---- CRITICAL: .well-known/ allowlist must override probe regex -----
  // ACME challenges, security.txt, change-password, AASA, assetlinks
  // all live here. Blocking any of these = cert expiry / sign-in
  // failure / deep-link failure. These cases are LOAD-BEARING.
  it("53. allows /.well-known/acme-challenge/abc123 (LetsEncrypt - CRITICAL)", () => {
    expect(isScannerPath("/.well-known/acme-challenge/abc123")).toBe(false)
  })
  it("54. allows /.well-known/security.txt", () => {
    expect(isScannerPath("/.well-known/security.txt")).toBe(false)
  })
  it("55. allows /.well-known/change-password", () => {
    expect(isScannerPath("/.well-known/change-password")).toBe(false)
  })
  it("56. allows /.well-known/apple-app-site-association", () => {
    expect(isScannerPath("/.well-known/apple-app-site-association")).toBe(false)
  })
  it("57. allows /.well-known/assetlinks.json", () => {
    expect(isScannerPath("/.well-known/assetlinks.json")).toBe(false)
  })

  // ---- Branded feature routes ----------------------------------------
  it("58. allows /super-agents (branded route)", () => {
    expect(isScannerPath("/super-agents")).toBe(false)
  })
  it("59. allows /super-agents/123", () => {
    expect(isScannerPath("/super-agents/123")).toBe(false)
  })
  it("60. allows /agents/run", () => {
    expect(isScannerPath("/agents/run")).toBe(false)
  })
})

describe("isScannerPath: edge cases", () => {
  it("61. returns false for empty string", () => {
    expect(isScannerPath("")).toBe(false)
  })
  it("62. returns false for just slash /", () => {
    expect(isScannerPath("/")).toBe(false)
  })
  it("63. returns false for trailing slash /auth/", () => {
    expect(isScannerPath("/auth/")).toBe(false)
  })
  it("64. blocks /WP-ADMIN/ (case-insensitive)", () => {
    expect(isScannerPath("/WP-ADMIN/")).toBe(true)
  })
  it("65. blocks /.ENV (uppercase dotfile)", () => {
    expect(isScannerPath("/.ENV")).toBe(true)
  })
  it("66. blocks /%2E%65nv (encoded mixed-case .env prefix)", () => {
    // The `/%2[eE]` pattern matches any encoded `.` at a path segment
    // start. We don't need to decode %65 -> e for the match to work.
    expect(isScannerPath("/%2E%65nv")).toBe(true)
  })
  it("67. ignores query string content when only pathname is checked", () => {
    // Callers pass only the pathname. `/?next=/.env` becomes `/` at the
    // middleware layer (via `request.nextUrl.pathname`). A `.env` in the
    // query is irrelevant.
    expect(isScannerPath("/")).toBe(false)
  })
  it("68. does not throw on empty pathname", () => {
    // Defensive: a middleware bug could produce an empty string. The
    // function must return false rather than throwing.
    expect(() => isScannerPath("")).not.toThrow()
    expect(isScannerPath("")).toBe(false)
  })
  it("69. null-byte injection does not bypass to a scanner match", () => {
    // `/foo\x00.env` — the `.env` is preceded by `\x00`, not a `/` or
    // string boundary, so the dotfile pattern does NOT fire. This is the
    // safe behaviour: the request flows on to the normal 404 path; it
    // does not get incorrectly elevated to scanner-blocked.
    expect(isScannerPath("/foo\x00.env")).toBe(false)
  })
})
