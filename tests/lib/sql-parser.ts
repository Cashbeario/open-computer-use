/**
 * Lightweight regex-based PL/pgSQL parser for the schema-regression test
 * suite that guards against the NEW-1 incident (PG 42702 "ambiguous
 * user_id" inside update_subscription_status).
 *
 * We deliberately do NOT depend on pgsql-parser or any other native parser:
 *   * pgsql-parser ships native bindings that break Windows CI.
 *   * Our threat model is narrow.  We only need to identify functions whose
 *     RETURNS TABLE columns shadow real table columns referenced unqualified
 *     in the function body.  A regex pass is sufficient and runs in <100ms
 *     even for the 4000+ line supabase/schema.sql snapshot.
 *
 * The parser intentionally tolerates:
 *   * Dollar-quoted bodies ($$, $foo$, $function$).
 *   * Quoted identifiers ("public"."update_subscription_status").
 *   * SQL comments in the body (-- ... and slash-star ... star-slash).
 *
 * It does NOT attempt to:
 *   * Resolve schema-qualified references vs RLS / search_path semantics.
 *   * Parse arbitrary expressions or detect every shadowing pattern.
 *     The conservative rule is: an OUT-table column whose bare name also
 *     appears as a table column AND as an unqualified identifier in the
 *     body is suspicious.
 */

import fs from 'node:fs'
import path from 'node:path'

export interface FunctionDef {
  /** The function name as it appears in CREATE FUNCTION (lowercased, unquoted). */
  name: string
  /** The full SQL block from CREATE through the closing dollar-quote. */
  raw: string
  /** Names of columns declared in the RETURNS TABLE (...) clause. Empty if scalar. */
  outColumns: string[]
  /** The function body (between the opening AS $$ and closing $$). */
  body: string
  /** Where in the source the function definition begins (1-indexed line). */
  startLine: number
  /** The source file the function was parsed from. */
  sourcePath: string
}

export interface TableDef {
  /** Lowercased, unqualified table name. */
  name: string
  /** Lowercased column names. */
  columns: string[]
}

/**
 * Strip SQL comments from a body so we don't false-positive on column names
 * that only appear inside a -- comment.
 */
export function stripSqlComments(sql: string): string {
  let out = sql
  // Block comments — non-greedy, multi-line.
  out = out.replace(/\/\*[\s\S]*?\*\//g, ' ')
  // Line comments — strip from -- to end of line.
  out = out.replace(/--[^\n]*/g, ' ')
  return out
}

/**
 * Unquote a PostgreSQL identifier.  Strips surrounding double quotes if
 * present and lowercases (PG folds unquoted identifiers to lowercase).
 */
function unquoteIdent(s: string): string {
  const t = s.trim()
  if (t.startsWith('"') && t.endsWith('"')) {
    return t.slice(1, -1).toLowerCase()
  }
  return t.toLowerCase()
}

/**
 * Find every CREATE [OR REPLACE] FUNCTION block and return its name plus
 * the full SQL text from CREATE through the matching dollar-quote close.
 */
export function extractFunctionDefs(sql: string, sourcePath: string): FunctionDef[] {
  const defs: FunctionDef[] = []

  // Match the start of every CREATE FUNCTION.  We capture the function
  // name (which may be schema-qualified and/or quoted).
  const fnStartRe =
    /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+((?:"[^"]+"|\w+)(?:\.(?:"[^"]+"|\w+))?)/gi

  let match: RegExpExecArray | null
  while ((match = fnStartRe.exec(sql)) !== null) {
    const startIdx = match.index
    const rawName = match[1]
    // Strip schema prefix if present.
    const namePart = rawName.includes('.') ? rawName.split('.').pop()! : rawName
    const fnName = unquoteIdent(namePart)

    // Find the opening dollar quote that starts the body.  Bodies look like:
    //   AS $$ ... $$  or  AS $foo$ ... $foo$
    const tailSql = sql.slice(startIdx)
    const asMatch = /\bAS\s+(\$[A-Za-z_]*\$)/i.exec(tailSql)
    if (!asMatch) continue

    const dollarTag = asMatch[1]
    const bodyStartInTail = asMatch.index + asMatch[0].length
    // Find the matching close tag.
    const closeIdx = tailSql.indexOf(dollarTag, bodyStartInTail)
    if (closeIdx === -1) continue

    const headerSql = tailSql.slice(0, asMatch.index)
    const body = tailSql.slice(bodyStartInTail, closeIdx)
    const fullRaw = tailSql.slice(0, closeIdx + dollarTag.length)

    // Extract RETURNS TABLE (...) columns if present.
    const outColumns = extractReturnsTableColumns(headerSql)

    // 1-indexed line where this CREATE FUNCTION begins.
    const startLine = sql.slice(0, startIdx).split('\n').length

    defs.push({
      name: fnName,
      raw: fullRaw,
      outColumns,
      body,
      startLine,
      sourcePath,
    })

    // Continue scanning AFTER this function's close so we never re-enter
    // a body we already consumed.
    fnStartRe.lastIndex = startIdx + fullRaw.length
  }

  return defs
}

/**
 * Given the SQL between `CREATE FUNCTION` and `AS $$`, find the RETURNS
 * TABLE (col_a type, col_b type, ...) clause and return col_a, col_b, ...
 * lowercased and unquoted.  Returns [] if RETURNS TABLE is absent (i.e.
 * scalar return type — these are NOT affected by the OUT-shadowing bug).
 */
export function extractReturnsTableColumns(headerSql: string): string[] {
  const m = /RETURNS\s+TABLE\s*\(/i.exec(headerSql)
  if (!m) return []
  // Walk parens from the opening paren to find the matching close.
  let depth = 0
  let i = m.index + m[0].length - 1 // points at '('
  const start = i + 1
  for (; i < headerSql.length; i++) {
    const ch = headerSql[i]
    if (ch === '(') depth++
    else if (ch === ')') {
      depth--
      if (depth === 0) break
    }
  }
  if (depth !== 0) return []
  const inner = headerSql.slice(start, i)

  // Split top-level commas only.  Column entries look like:
  //   "out_user_id" "uuid"
  //   out_resolved_tier text
  //   max_machines integer
  const cols: string[] = []
  let buf = ''
  let pdepth = 0
  for (const ch of inner) {
    if (ch === '(') pdepth++
    else if (ch === ')') pdepth--
    if (ch === ',' && pdepth === 0) {
      cols.push(buf.trim())
      buf = ''
    } else {
      buf += ch
    }
  }
  if (buf.trim()) cols.push(buf.trim())

  // For each entry, the first whitespace-separated (possibly quoted) token
  // is the column name.
  return cols
    .map((entry) => {
      const tokenMatch = /^\s*("[^"]+"|\w+)/.exec(entry)
      return tokenMatch ? unquoteIdent(tokenMatch[1]) : ''
    })
    .filter(Boolean)
}

/**
 * Parse CREATE TABLE statements and return {tableName: [columns]} pairs.
 * Tolerates quoted identifiers, schema prefixes, and IF NOT EXISTS.
 */
export function extractTableDefs(sql: string): TableDef[] {
  const tables: TableDef[] = []
  const tableRe =
    /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?((?:"[^"]+"|\w+)(?:\.(?:"[^"]+"|\w+))?)\s*\(/gi

  let match: RegExpExecArray | null
  while ((match = tableRe.exec(sql)) !== null) {
    const rawName = match[1]
    const namePart = rawName.includes('.') ? rawName.split('.').pop()! : rawName
    const tableName = unquoteIdent(namePart)

    // Walk parens to find the matching close.
    let depth = 1
    let i = match.index + match[0].length
    const start = i
    for (; i < sql.length && depth > 0; i++) {
      const ch = sql[i]
      if (ch === '(') depth++
      else if (ch === ')') depth--
    }
    if (depth !== 0) continue
    const inner = sql.slice(start, i - 1)

    // Extract column names from the top of each comma-separated entry,
    // skipping CONSTRAINT/CHECK/FOREIGN/PRIMARY/UNIQUE lines.
    const cols: string[] = []
    let buf = ''
    let pdepth = 0
    for (const ch of inner) {
      if (ch === '(') pdepth++
      else if (ch === ')') pdepth--
      if (ch === ',' && pdepth === 0) {
        addColumn(buf, cols)
        buf = ''
      } else {
        buf += ch
      }
    }
    if (buf.trim()) addColumn(buf, cols)

    tables.push({ name: tableName, columns: cols })
  }

  return tables
}

function addColumn(entry: string, out: string[]): void {
  const trimmed = entry.trim()
  // Skip non-column entries.
  if (/^(CONSTRAINT|CHECK|FOREIGN|PRIMARY|UNIQUE|EXCLUDE)\b/i.test(trimmed)) {
    return
  }
  const tokenMatch = /^("[^"]+"|\w+)/.exec(trimmed)
  if (!tokenMatch) return
  const name = unquoteIdent(tokenMatch[1])
  if (name) out.push(name)
}

export interface LintFinding {
  function: string
  outColumn: string
  reason: string
  sourcePath: string
  startLine: number
}

/**
 * The conservative shadowing linter.  For every function with a non-empty
 * RETURNS TABLE clause, flag any OUT column whose name:
 *   1. Is also a real table column on one of the tables the body
 *      INSERTs into or UPDATEs.
 *   2. Appears in the body inside one of the DANGEROUS unqualified
 *      contexts that PG resolves against the OUT-param namespace:
 *        * ON CONFLICT (col)               -- conflict-target list
 *        * WHERE col = ...                 -- bare predicate
 *        * RETURNING col                   -- bare returning
 *      We deliberately do NOT flag INSERT column lists
 *      ``INSERT INTO t (col1, col2)`` because those are resolved against
 *      the target table only and do NOT trigger 42702.  Likewise SET
 *      clauses inside UPDATE.  This matches the real production failure
 *      mode (migration 015 documents ON CONFLICT as the bite point).
 *
 * Functions with NO RETURNS TABLE clause (scalar return) are NOT flagged:
 * scalar functions can have DECLAREd locals that shadow columns, but the
 * variable_conflict=error footgun only fires for OUT params declared by
 * RETURNS TABLE.
 */
export function lintShadowing(
  fn: FunctionDef,
  knownTableColumns: Map<string, Set<string>>
): LintFinding[] {
  const findings: LintFinding[] = []
  if (fn.outColumns.length === 0) return findings

  const bodyNoComments = stripSqlComments(fn.body)

  // Tables the body writes to.  We collect names from INSERT INTO and
  // UPDATE statements (with optional public. prefix and optional quoting).
  const writtenTables = new Set<string>()
  const writeRe =
    /\b(?:INSERT\s+INTO|UPDATE)\s+(?:"?public"?\.)?("?[\w]+"?)/gi
  let writeMatch: RegExpExecArray | null
  while ((writeMatch = writeRe.exec(bodyNoComments)) !== null) {
    writtenTables.add(unquoteIdent(writeMatch[1]))
  }

  for (const col of fn.outColumns) {
    // out_*-prefixed columns are by construction collision-free against
    // any natural table column.  Skip them.
    if (col.startsWith('out_')) continue

    // Is this OUT column also a column on one of the tables the body
    // writes to?
    let shadowsRealColumn: string | null = null
    for (const t of writtenTables) {
      const tableCols = knownTableColumns.get(t)
      if (tableCols && tableCols.has(col)) {
        shadowsRealColumn = t
        break
      }
    }
    if (!shadowsRealColumn) continue

    if (!hasDangerousUnqualifiedReference(bodyNoComments, col)) continue

    findings.push({
      function: fn.name,
      outColumn: col,
      reason:
        `RETURNS TABLE column "${col}" shadows public.${shadowsRealColumn}.${col} ` +
        'and is referenced unqualified in a dangerous context (ON CONFLICT / ' +
        'bare WHERE / bare RETURNING).  PG 42702 risk; rename to ' +
        `"out_${col}" (see supabase/migrations/015_fix_ambiguous_user_id.sql).`,
      sourcePath: fn.sourcePath,
      startLine: fn.startLine,
    })
  }

  return findings
}

/**
 * True if the function body has the column name in one of the dangerous
 * contexts that PG resolves against the OUT-param namespace.
 *
 * Patterns checked:
 *   * ``ON CONFLICT (col)`` and ``ON CONFLICT (col1, col, col3)``
 *   * ``WHERE col = ...`` / ``WHERE col IN ...`` (no table-alias prefix)
 *   * ``AND col = ...`` / ``OR col = ...``  (same, predicate continuation)
 *   * ``RETURNING col`` (no alias prefix)
 */
export function hasDangerousUnqualifiedReference(
  body: string,
  col: string
): boolean {
  const c = escapeRegex(col)

  // ON CONFLICT (col)  or  ON CONFLICT (a, col, b)
  const onConflict = new RegExp(
    `ON\\s+CONFLICT\\s*\\(([^)]*)\\)`,
    'gi'
  )
  let m: RegExpExecArray | null
  while ((m = onConflict.exec(body)) !== null) {
    const inner = m[1]
    const tokens = inner.split(',').map((s) => s.trim().replace(/^"|"$/g, ''))
    if (tokens.some((t) => t.toLowerCase() === col)) return true
  }

  // WHERE col = ... | WHERE col IN ... | AND col = ... | OR col = ...
  const wherePred = new RegExp(
    `\\b(?:WHERE|AND|OR)\\s+${c}\\s*(?:=|IN\\b|IS\\b|<|>|!=|<>)`,
    'gi'
  )
  if (wherePred.test(body)) return true

  // RETURNING col   (NOT  RETURNING table.col)
  const returningRe = new RegExp(
    `\\bRETURNING\\s+(?!"?\\w+"?\\s*\\.)${c}\\b`,
    'gi'
  )
  if (returningRe.test(body)) return true

  return false
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Load all migration files in a directory, sorted by filename so that the
 * "latest" migration wins for cross-file comparison.
 */
export function loadMigrations(migrationsDir: string): { file: string; sql: string }[] {
  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
  return files.map((f) => ({
    file: f,
    sql: fs.readFileSync(path.join(migrationsDir, f), 'utf8'),
  }))
}

/**
 * Build a Map<table_name, Set<column_name>> from a schema.sql file.
 */
export function buildTableColumnMap(schemaSql: string): Map<string, Set<string>> {
  const tables = extractTableDefs(schemaSql)
  const map = new Map<string, Set<string>>()
  for (const t of tables) {
    map.set(t.name, new Set(t.columns))
  }
  return map
}
