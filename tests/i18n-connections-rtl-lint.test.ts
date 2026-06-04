/**
 * i18n-connections-rtl-lint.test.ts — LTR-class drift guard for the Composio
 * UI surface.
 *
 * The Composio "connections" surface (app/connections/**, the integrations
 * settings panel, and the composio_* branches of tool-invocation.tsx) is one
 * of the few areas of Coasty that renders inside Arabic / Hebrew / Persian
 * locales with the RTL writing direction enabled. Tailwind's directional
 * utilities (ml-*, pl-*, left-*, text-left, rounded-l-*) hardcode a physical
 * side and so they do NOT flip under `dir="rtl"` — they leave content
 * jammed against the wrong edge once a user switches locale.
 *
 * The constraint map for this branch flagged the surfaces below as having
 * regressed at least once. This test exists so the next regression fails CI
 * instead of shipping. Whenever an LTR-only Tailwind class shows up in one
 * of the lint-scoped files, the test prints the offending line plus the
 * logical-property replacement (ml-4 → ms-4, rounded-l-xl → rounded-s-xl,
 * etc.).
 *
 * Escape hatch
 * ------------
 * Rare cases (e.g. a chevron icon that is intentionally LTR because the
 * underlying glyph already encodes "next") can opt out by appending the
 * comment `// i18n-lint: ltr-ok (icon is intentionally LTR)` to the same
 * source line. The exemption must be on the SAME line as the violation —
 * the linter only looks back one line so it cannot be hidden in a JSDoc.
 *
 * Conventions
 * -----------
 *   - node fs + a literal regex per pattern (mirrors llms-pricing-drift)
 *   - REPO_ROOT computed via path.resolve(__dirname, "..")  (same idiom)
 *   - one `it()` per (file, pattern) tuple so failures are surgical and
 *     vitest's "1 failed" output points at the exact rule
 *   - no JSX, no React imports, no jsdom — pure text-grep test
 *
 * Run: `npx vitest run tests/i18n-connections-rtl-lint.test.ts`
 */
import { describe, it, expect } from "vitest"
import { readFileSync, readdirSync, statSync } from "node:fs"
import path from "node:path"

// ───────────────────────────────────────────────────────────────────────────
// Repo paths
// ───────────────────────────────────────────────────────────────────────────

const REPO_ROOT = path.resolve(__dirname, "..")

/**
 * Recursively collect every .tsx file under `dir`, returning repo-relative
 * paths with forward slashes (so failure messages are stable across OSes).
 */
function collectTsxFiles(dir: string): string[] {
  const out: string[] = []
  const stack: string[] = [dir]
  while (stack.length) {
    const cur = stack.pop()!
    let entries: string[]
    try {
      entries = readdirSync(cur)
    } catch {
      // Directory may not exist yet on a fresh branch — that's fine, the
      // FILES_UNDER_LINT explicit list below still gets exercised.
      continue
    }
    for (const entry of entries) {
      const full = path.join(cur, entry)
      const st = statSync(full)
      if (st.isDirectory()) {
        stack.push(full)
      } else if (st.isFile() && full.endsWith(".tsx")) {
        out.push(full)
      }
    }
  }
  return out
}

// ───────────────────────────────────────────────────────────────────────────
// FILES_UNDER_LINT — every Composio UI surface flagged by the constraint map
// ───────────────────────────────────────────────────────────────────────────
//
// Each entry is either:
//   { kind: "all", path }      — lint every line in the file
//   { kind: "match", path, predicate } — lint only lines whose
//       surrounding context matches the predicate (used for
//       tool-invocation.tsx where only the composio_* branches matter)
//
// New Composio surfaces (e.g. a future /connections/[slug] page) get picked
// up automatically by the recursive glob over app/connections.

type FileScope =
  | { kind: "all"; path: string; label: string }
  | { kind: "match"; path: string; label: string; predicate: (block: string) => boolean }

const CONNECTIONS_DIR = path.join(REPO_ROOT, "app", "connections")
const connectionsFiles: FileScope[] = collectTsxFiles(CONNECTIONS_DIR).map((p) => ({
  kind: "all" as const,
  path: p,
  label: path.relative(REPO_ROOT, p).replace(/\\/g, "/"),
}))

const FILES_UNDER_LINT: FileScope[] = [
  // 1. The entire /connections route tree.
  ...connectionsFiles,

  // 2. The settings → integrations panel that hosts the Composio section.
  {
    kind: "all",
    label: "app/components/layout/settings/integrations/composio-section.tsx",
    path: path.join(
      REPO_ROOT,
      "app",
      "components",
      "layout",
      "settings",
      "integrations",
      "composio-section.tsx",
    ),
  },

  // 3. Chat tool-invocation surface — only the composio_* branches, NOT
  //    the browser / terminal / file / vm branches (those don't render in
  //    user-locale-translated UI; they render in fixed English diagnostic
  //    text). The predicate gates this by requiring the violating line's
  //    ±20-line context window to mention "composio".
  {
    kind: "match",
    label: "app/components/chat/tool-invocation.tsx (composio_ branches only)",
    path: path.join(
      REPO_ROOT,
      "app",
      "components",
      "chat",
      "tool-invocation.tsx",
    ),
    predicate: (block) => /composio/i.test(block),
  },
]

// ───────────────────────────────────────────────────────────────────────────
// FORBIDDEN_CLASS_PATTERNS — every LTR-only Tailwind class we ban
// ───────────────────────────────────────────────────────────────────────────
//
// Each pattern targets the class as it appears INSIDE a className attribute:
// preceded by a word boundary (start of string, whitespace, `"`, `'`, `\``).
// The negative lookbehind on `-` lets `ml-` match `ml-4` but not `vml-4`.
//
// `suggestion` is the logical-property Tailwind utility that ships in
// tailwindcss ≥ 3.3 and respects `dir="rtl"` automatically.

type Pattern = {
  name: string
  regex: RegExp
  suggestion: string
}

// `(?<![\w-])` = not preceded by a word char or hyphen (so `ml-4` matches
// but `html-4` and `xml-4` do not).
// We anchor each regex on the literal class prefix, then require a non-class
// terminator (whitespace, end-quote, end-of-line, end-of-template-literal).

const FORBIDDEN_CLASS_PATTERNS: Pattern[] = [
  {
    name: "ml-<n>",
    regex: /(?<![\w-])ml-\d/,
    suggestion: "use ms-<n> (margin-inline-start) — flips under dir=rtl",
  },
  {
    name: "mr-<n>",
    regex: /(?<![\w-])mr-\d/,
    suggestion: "use me-<n> (margin-inline-end) — flips under dir=rtl",
  },
  {
    name: "pl-<n>",
    regex: /(?<![\w-])pl-\d/,
    suggestion: "use ps-<n> (padding-inline-start) — flips under dir=rtl",
  },
  {
    name: "pr-<n>",
    regex: /(?<![\w-])pr-\d/,
    suggestion: "use pe-<n> (padding-inline-end) — flips under dir=rtl",
  },
  {
    name: "left-<n>",
    regex: /(?<![\w-])left-\d/,
    suggestion: "use start-<n> (inset-inline-start) — flips under dir=rtl",
  },
  {
    name: "right-<n>",
    regex: /(?<![\w-])right-\d/,
    suggestion: "use end-<n> (inset-inline-end) — flips under dir=rtl",
  },
  {
    name: "text-left",
    regex: /(?<![\w-])text-left(?![\w-])/,
    suggestion: "use text-start — aligns to inline-start (LTR: left, RTL: right)",
  },
  {
    name: "text-right",
    regex: /(?<![\w-])text-right(?![\w-])/,
    suggestion: "use text-end — aligns to inline-end (LTR: right, RTL: left)",
  },
  {
    name: "rounded-l-*",
    regex: /(?<![\w-])rounded-l-/,
    suggestion: "use rounded-s-<size> (border-start-*-radius) — flips under dir=rtl",
  },
  {
    name: "rounded-r-*",
    regex: /(?<![\w-])rounded-r-/,
    suggestion: "use rounded-e-<size> (border-end-*-radius) — flips under dir=rtl",
  },
  {
    name: "rounded-tl-*",
    regex: /(?<![\w-])rounded-tl-/,
    suggestion: "use rounded-ss-<size> (border-start-start-radius) — flips under dir=rtl",
  },
  {
    name: "rounded-tr-*",
    regex: /(?<![\w-])rounded-tr-/,
    suggestion: "use rounded-se-<size> (border-start-end-radius) — flips under dir=rtl",
  },
  {
    name: "rounded-bl-*",
    regex: /(?<![\w-])rounded-bl-/,
    suggestion: "use rounded-es-<size> (border-end-start-radius) — flips under dir=rtl",
  },
  {
    name: "rounded-br-*",
    regex: /(?<![\w-])rounded-br-/,
    suggestion: "use rounded-ee-<size> (border-end-end-radius) — flips under dir=rtl",
  },
]

// Per-line escape hatch. Must appear on the SAME line as the violating
// class; the reason in parens is informational but encouraged.
const EXEMPTION_TOKEN = "i18n-lint: ltr-ok"

// Logical-property replacement table — included in every failure message so
// the developer doesn't have to look it up.
const REPLACEMENT_TABLE = [
  "  ml-<n>       → ms-<n>       (margin-inline-start)",
  "  mr-<n>       → me-<n>       (margin-inline-end)",
  "  pl-<n>       → ps-<n>       (padding-inline-start)",
  "  pr-<n>       → pe-<n>       (padding-inline-end)",
  "  left-<n>     → start-<n>    (inset-inline-start)",
  "  right-<n>    → end-<n>      (inset-inline-end)",
  "  text-left    → text-start",
  "  text-right   → text-end",
  "  rounded-l-*  → rounded-s-*  (border-start-*-radius)",
  "  rounded-r-*  → rounded-e-*  (border-end-*-radius)",
  "  rounded-tl-* → rounded-ss-* (border-start-start-radius)",
  "  rounded-tr-* → rounded-se-* (border-start-end-radius)",
  "  rounded-bl-* → rounded-es-* (border-end-start-radius)",
  "  rounded-br-* → rounded-ee-* (border-end-end-radius)",
  "",
  "Per-line exemption (rare — e.g. an intentionally LTR icon):",
  `  <className…>  // ${EXEMPTION_TOKEN} (icon is intentionally LTR)`,
].join("\n")

// ───────────────────────────────────────────────────────────────────────────
// Lint engine
// ───────────────────────────────────────────────────────────────────────────

/**
 * Scan a single file for occurrences of `pattern`. Returns one record per
 * offending line. Lines bearing the EXEMPTION_TOKEN are silently skipped.
 * For `match`-scoped files, the predicate is evaluated over a ±20-line
 * context window around each candidate violation so only the relevant
 * branch trips the rule.
 */
function scanFile(scope: FileScope, pattern: Pattern): Array<{
  lineNumber: number
  lineContent: string
}> {
  let source: string
  try {
    source = readFileSync(scope.path, "utf8")
  } catch {
    // Missing file is reported by a separate "file exists" assertion below
    // so we don't double-fail here.
    return []
  }
  const lines = source.split(/\r?\n/)
  const hits: Array<{ lineNumber: number; lineContent: string }> = []

  const CONTEXT = 20

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (!pattern.regex.test(line)) continue
    if (line.includes(EXEMPTION_TOKEN)) continue

    if (scope.kind === "match") {
      const from = Math.max(0, i - CONTEXT)
      const to = Math.min(lines.length, i + CONTEXT + 1)
      const block = lines.slice(from, to).join("\n")
      if (!scope.predicate(block)) continue
    }

    hits.push({ lineNumber: i + 1, lineContent: line })
  }
  return hits
}

function formatFailure(
  scope: FileScope,
  pattern: Pattern,
  hits: Array<{ lineNumber: number; lineContent: string }>,
): string {
  const header =
    `Found ${hits.length} LTR-only Tailwind class${hits.length === 1 ? "" : "es"} ` +
    `matching ${pattern.name} in ${scope.label}.`
  const offenders = hits
    .map(
      (h) =>
        `  ${scope.label}:${h.lineNumber}\n    ${h.lineContent.trim()}`,
    )
    .join("\n")
  const suggestion = `Suggested fix: ${pattern.suggestion}`
  return (
    `${header}\n` +
    `${offenders}\n\n` +
    `${suggestion}\n\n` +
    `Logical-property replacement table:\n` +
    `${REPLACEMENT_TABLE}\n`
  )
}

// ───────────────────────────────────────────────────────────────────────────
// Tests — one per (file, pattern) tuple
// ───────────────────────────────────────────────────────────────────────────

describe("i18n RTL lint — Composio UI surface", () => {
  it("collected at least one Composio UI file to lint", () => {
    // Sanity guard. If app/connections is removed or the integrations panel
    // moves, this test should fail loudly rather than silently passing zero
    // assertions.
    expect(
      FILES_UNDER_LINT.length,
      "FILES_UNDER_LINT collected zero files — did app/connections/ or " +
        "the integrations settings panel move? Update the lint scope.",
    ).toBeGreaterThan(0)
  })

  for (const scope of FILES_UNDER_LINT) {
    describe(scope.label, () => {
      it("source file exists on disk", () => {
        // readFileSync would have thrown inside scanFile but we surface the
        // missing-file case here so the failure message is obvious.
        expect(
          () => readFileSync(scope.path, "utf8"),
          `Expected ${scope.label} to exist — adjust FILES_UNDER_LINT if it moved.`,
        ).not.toThrow()
      })

      for (const pattern of FORBIDDEN_CLASS_PATTERNS) {
        it(`is free of ${pattern.name}`, () => {
          const hits = scanFile(scope, pattern)
          if (hits.length === 0) {
            // Express the positive assertion so vitest counts it as a real
            // expectation, not an empty test.
            expect(hits).toEqual([])
            return
          }
          // Use expect with a custom message so the developer sees the
          // file:line + suggested replacement inline in the failure.
          expect(hits, formatFailure(scope, pattern, hits)).toEqual([])
        })
      }
    })
  }
})
