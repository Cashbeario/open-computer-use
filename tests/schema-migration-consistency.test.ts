/**
 * Cross-file consistency check.  Asserts that supabase/schema.sql contains
 * the LATEST definition of every function that has a migration.  If
 * schema.sql lags a migration, this test fires.  That is the EXACT
 * regression vector for the 2026-05-26 22:57 UTC NEW-1 incident:
 * migration 015 fixed update_subscription_status, but supabase/schema.sql
 * still carried the pre-015 definition.  A later deploy that re-applied
 * the schema.sql snapshot undid migration 015 silently.
 *
 * Rule: for every function name redefined by any migration, the LATEST
 * migration that touches it must have an IDENTICAL RETURNS TABLE
 * signature in schema.sql.  We compare the OUT-column NAME LIST (lower-
 * cased, position-sensitive).  Type drift is not checked here — that
 * would create false positives for cosmetic timestamptz vs ``timestamp
 * with time zone`` differences.  Name drift is the failure shape that
 * actually produced 42702.
 *
 * Additional targeted assertion: update_subscription_status must declare
 * out_user_id (not user_id) in schema.sql.  This is hard-coded because
 * it IS the function that caused production downtime.
 *
 * Run: ``npx vitest run tests/schema-migration-consistency.test.ts``
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import {
  extractFunctionDefs,
  loadMigrations,
} from './lib/sql-parser'

const REPO_ROOT = path.resolve(__dirname, '..')
const SCHEMA_PATH = path.join(REPO_ROOT, 'supabase', 'schema.sql')
const MIGRATIONS_DIR = path.join(REPO_ROOT, 'supabase', 'migrations')
const SCHEMA_SQL = fs.readFileSync(SCHEMA_PATH, 'utf8')

// Build maps once for the suite.
const SCHEMA_FNS = extractFunctionDefs(SCHEMA_SQL, SCHEMA_PATH)
const SCHEMA_FN_BY_NAME = new Map(SCHEMA_FNS.map((fn) => [fn.name, fn]))

const MIGRATIONS = loadMigrations(MIGRATIONS_DIR)
// Map<fnName, {fn, file}>  — last write wins (i.e. latest migration).
const LATEST_MIGRATION_FN = new Map<
  string,
  { fn: ReturnType<typeof extractFunctionDefs>[number]; file: string }
>()
for (const { file, sql } of MIGRATIONS) {
  const fns = extractFunctionDefs(sql, file)
  for (const fn of fns) {
    LATEST_MIGRATION_FN.set(fn.name, { fn, file })
  }
}

describe('schema.sql ↔ migrations: RETURNS TABLE name consistency', () => {
  it('schema.sql defines update_subscription_status', () => {
    const fn = SCHEMA_FN_BY_NAME.get('update_subscription_status')
    expect(fn).toBeDefined()
    expect(fn!.outColumns.length).toBeGreaterThan(0)
  })

  it('the LATEST migration definition of update_subscription_status uses out_user_id', () => {
    // This is the post-015 / post-021 invariant.  If it drifts, the
    // ambiguous-user_id bug is back.
    const m = LATEST_MIGRATION_FN.get('update_subscription_status')
    expect(m).toBeDefined()
    expect(m!.fn.outColumns).toEqual([
      'out_user_id',
      'out_resolved_tier',
      'out_is_paid',
    ])
  })

  it('schema.sql update_subscription_status uses out_user_id (NOT pre-015 user_id)', () => {
    const fn = SCHEMA_FN_BY_NAME.get('update_subscription_status')!
    expect(fn.outColumns).toEqual([
      'out_user_id',
      'out_resolved_tier',
      'out_is_paid',
    ])
    // Negative assertion: the pre-fix names MUST NOT be present.
    expect(fn.outColumns).not.toContain('user_id')
    expect(fn.outColumns).not.toContain('resolved_tier')
    expect(fn.outColumns).not.toContain('is_paid')
  })

  it('schema.sql can_user_join_room uses out_chat_id (matches migration 015 / 021)', () => {
    const fn = SCHEMA_FN_BY_NAME.get('can_user_join_room')
    expect(fn).toBeDefined()
    expect(fn!.outColumns).toEqual(['out_chat_id', 'out_can_join', 'out_reason'])
  })

  it('for every migration-defined function with RETURNS TABLE, schema.sql matches the latest OUT-column name list', () => {
    const drift: { name: string; migration: string[]; schema: string[]; file: string }[] = []
    for (const [name, { fn: migFn, file }] of LATEST_MIGRATION_FN.entries()) {
      if (migFn.outColumns.length === 0) continue // scalar return — skip
      const schemaFn = SCHEMA_FN_BY_NAME.get(name)
      // Functions defined in a migration but not in schema.sql are a
      // legitimate state during the brief window between a migration
      // applying and the schema snapshot being regenerated.  We accept
      // that — what we CANNOT accept is schema.sql holding a STALE
      // definition with different column names.
      if (!schemaFn) continue
      const a = migFn.outColumns
      const b = schemaFn.outColumns
      const same = a.length === b.length && a.every((v, i) => v === b[i])
      if (!same) {
        drift.push({ name, migration: a, schema: b, file })
      }
    }
    if (drift.length > 0) {
      const lines = drift.map(
        (d) =>
          `  - ${d.name}: schema.sql=[${d.schema.join(',')}] but latest migration ${d.file}=[${d.migration.join(',')}]`
      )
      throw new Error(
        `schema.sql/migration RETURNS TABLE drift detected (NEW-1 regression class):\n${lines.join('\n')}`
      )
    }
    expect(drift).toEqual([])
  })

  it('the parameter list of schema.sql update_subscription_status matches the migration 6-arg signature', () => {
    // Migration 015/021 explicitly DROPs the 5-arg form and re-creates
    // the 6-arg form.  Schema.sql must match the 6-arg signature.
    const fn = SCHEMA_FN_BY_NAME.get('update_subscription_status')!
    const header = fn.raw.split(/\bAS\s+\$/i)[0]
    // The header should mention all 6 parameters.  We check by name.
    for (const p of [
      'p_stripe_subscription_id',
      'p_status',
      'p_period_start',
      'p_period_end',
      'p_cancel_at_period_end',
      'p_subscription_plan_id',
    ]) {
      expect(header.toLowerCase()).toContain(p)
    }
  })

  it('schema.sql does NOT set plpgsql.variable_conflict on update_subscription_status (Supabase 42501 constraint)', () => {
    // Supabase managed Postgres rejects `SET plpgsql.variable_conflict = ...`
    // at function-definition time with 42501 (permission denied; SUPERUSER
    // required). Migration 021 documents this explicitly in its preamble
    // and the canonical fix is the out_* OUT-param rename, not the GUC.
    // If this assertion ever flips, the function will fail to deploy on
    // Supabase — keep this in lockstep with migration 021.
    const fn = SCHEMA_FN_BY_NAME.get('update_subscription_status')!
    const header = fn.raw.split(/\bAS\s+\$/i)[0]
    expect(header.toLowerCase()).not.toContain('plpgsql.variable_conflict')
  })
})

describe('schema.sql ↔ migrations: regression-vector documentation', () => {
  it('migration 015 explicitly documents the NEW-1 incident in its preamble', () => {
    const m015Path = path.join(MIGRATIONS_DIR, '015_fix_ambiguous_user_id.sql')
    const sql = fs.readFileSync(m015Path, 'utf8')
    expect(sql).toMatch(/NEW-1/)
    expect(sql).toMatch(/42702/)
    expect(sql).toMatch(/ambiguous/i)
  })

  it('migration 021 exists and re-applies the 015 fix', () => {
    const m021Path = path.join(MIGRATIONS_DIR, '021_re_apply_ambiguous_user_id_fix.sql')
    expect(fs.existsSync(m021Path)).toBe(true)
    const sql = fs.readFileSync(m021Path, 'utf8')
    expect(sql).toMatch(/out_user_id/)
    expect(sql).toMatch(/2026-05-26/)
  })

  it('migration 021 includes a smoke test that replays the failing payload pattern', () => {
    const m021Path = path.join(MIGRATIONS_DIR, '021_re_apply_ambiguous_user_id_fix.sql')
    const sql = fs.readFileSync(m021Path, 'utf8')
    // The smoke DO block must include status='active' (the production
    // failure mode) AND status='canceled' (the second failure path).
    expect(sql).toMatch(/'active'/)
    expect(sql).toMatch(/'canceled'/)
  })
})
