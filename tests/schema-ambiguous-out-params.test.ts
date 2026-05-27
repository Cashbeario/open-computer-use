/**
 * Static schema analyzer.  Parses every CREATE FUNCTION block in
 * supabase/schema.sql plus every supabase/migrations/*.sql and identifies
 * the failure mode that produced the 2026-05-26 22:57 UTC NEW-1 incident:
 * a RETURNS TABLE column whose name shadows a real table column referenced
 * inside the function body (e.g. user_id, chat_id, id).
 *
 * The rule is conservative: any RETURNS TABLE column whose name matches a
 * real column on a table that the body INSERTs into or UPDATEs, AND which
 * is also referenced unqualified in the body, must be prefixed with
 * `out_`.  Otherwise plpgsql's variable_conflict=error will raise 42702
 * at PLAN time (the exact production failure).
 *
 * This test catches the regression vector for NEW-1: if supabase/schema.sql
 * ever drifts back to the pre-015 definition (RETURNS TABLE (user_id ...)),
 * this linter fires in CI BEFORE the schema.sql snapshot is deployed.
 *
 * Run: ``npx vitest run tests/schema-ambiguous-out-params.test.ts``
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import {
  buildTableColumnMap,
  extractFunctionDefs,
  extractReturnsTableColumns,
  extractTableDefs,
  lintShadowing,
  loadMigrations,
  stripSqlComments,
} from './lib/sql-parser'

const REPO_ROOT = path.resolve(__dirname, '..')
const SCHEMA_PATH = path.join(REPO_ROOT, 'supabase', 'schema.sql')
const MIGRATIONS_DIR = path.join(REPO_ROOT, 'supabase', 'migrations')

// Real schema.sql is the source of truth for table column names.  We use
// it for ALL fixture linting so the rules match production semantics.
const SCHEMA_SQL = fs.readFileSync(SCHEMA_PATH, 'utf8')
const TABLE_COLUMNS = buildTableColumnMap(SCHEMA_SQL)

// ---------------------------------------------------------------------------
// Sanity: the table extractor must find the tables the linter cares about.
// If schema.sql is restructured and these go missing, the linter would
// silently stop catching real shadowing bugs.
// ---------------------------------------------------------------------------
describe('SQL parser: table column extraction', () => {
  it('extracts user_credits.user_id', () => {
    expect(TABLE_COLUMNS.get('user_credits')?.has('user_id')).toBe(true)
  })

  it('extracts user_subscriptions.user_id', () => {
    expect(TABLE_COLUMNS.get('user_subscriptions')?.has('user_id')).toBe(true)
  })

  it('extracts machine_limits.user_id', () => {
    expect(TABLE_COLUMNS.get('machine_limits')?.has('user_id')).toBe(true)
  })

  it('extracts chat_participants.chat_id and chat_participants.user_id', () => {
    expect(TABLE_COLUMNS.get('chat_participants')?.has('chat_id')).toBe(true)
    expect(TABLE_COLUMNS.get('chat_participants')?.has('user_id')).toBe(true)
  })

  it('extracts chats.id', () => {
    expect(TABLE_COLUMNS.get('chats')?.has('id')).toBe(true)
  })

  it('extracts stripe_customers.user_id', () => {
    expect(TABLE_COLUMNS.get('stripe_customers')?.has('user_id')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Fixtures.  Each represents a function in isolation so we can prove the
// linter detects (or correctly ignores) each pattern WITHOUT mutating
// schema.sql or any migration file.
// ---------------------------------------------------------------------------

/** PRE-015 definition of update_subscription_status — the actual failing
 * shape from the 2026-05-26 incident.  RETURNS TABLE (user_id, ...) and
 * body has unqualified ON CONFLICT (user_id) writes.  Linter MUST flag. */
const FIXTURE_PRE015_UPDATE_SUBSCRIPTION_STATUS = `
CREATE OR REPLACE FUNCTION public.update_subscription_status(
    p_stripe_subscription_id text,
    p_status                  text,
    p_period_start            timestamptz DEFAULT NULL,
    p_period_end              timestamptz DEFAULT NULL,
    p_cancel_at_period_end    boolean     DEFAULT NULL,
    p_subscription_plan_id    uuid        DEFAULT NULL
) RETURNS TABLE (
    user_id           uuid,
    resolved_tier     text,
    is_paid           boolean
)
    LANGUAGE plpgsql
    SECURITY DEFINER
AS $$
DECLARE
    v_user_id   uuid;
BEGIN
    UPDATE public.user_subscriptions
    SET    status = p_status
    WHERE  stripe_subscription_id = p_stripe_subscription_id
    RETURNING user_subscriptions.user_id INTO v_user_id;

    UPDATE public.user_credits
    SET    has_active_subscription = true
    WHERE  user_id = v_user_id;

    INSERT INTO public.machine_limits (user_id, tier)
    VALUES (v_user_id, 'free')
    ON CONFLICT (user_id) DO UPDATE SET tier = EXCLUDED.tier;

    RETURN QUERY SELECT v_user_id, 'free'::text, false;
END;
$$;
`

/** POST-015 definition of update_subscription_status.  Linter must PASS. */
const FIXTURE_POST015_UPDATE_SUBSCRIPTION_STATUS = `
CREATE OR REPLACE FUNCTION public.update_subscription_status(
    p_stripe_subscription_id text,
    p_status                  text
) RETURNS TABLE (
    out_user_id       uuid,
    out_resolved_tier text,
    out_is_paid       boolean
)
    LANGUAGE plpgsql
    SECURITY DEFINER
AS $$
DECLARE
    v_user_id   uuid;
BEGIN
    UPDATE public.user_subscriptions
    SET    status = p_status
    WHERE  stripe_subscription_id = p_stripe_subscription_id
    RETURNING user_subscriptions.user_id INTO v_user_id;

    INSERT INTO public.machine_limits (user_id, tier)
    VALUES (v_user_id, 'free')
    ON CONFLICT (user_id) DO UPDATE SET tier = EXCLUDED.tier;

    RETURN QUERY SELECT v_user_id, 'free'::text, false;
END;
$$;
`

/** POST-015 can_user_join_room with out_chat_id.  Linter must PASS. */
const FIXTURE_POST015_CAN_USER_JOIN_ROOM = `
CREATE FUNCTION public.can_user_join_room(
    p_invite_code text,
    p_user_id uuid
) RETURNS TABLE(
    out_chat_id uuid,
    out_can_join boolean,
    out_reason text
)
    LANGUAGE plpgsql
AS $$
DECLARE
    v_invitation RECORD;
BEGIN
    IF EXISTS (
        SELECT 1
        FROM   public.chat_participants cp
        WHERE  cp.chat_id = v_invitation.chat_id
          AND  cp.user_id = p_user_id
    ) THEN
        RETURN QUERY SELECT v_invitation.chat_id, false, 'dup';
        RETURN;
    END IF;
    RETURN QUERY SELECT v_invitation.chat_id, true, 'ok';
END;
$$;
`

/** Handcrafted bad fixture: RETURNS TABLE (id uuid) over public.chats. */
const FIXTURE_HANDCRAFTED_BAD = `
CREATE OR REPLACE FUNCTION public.upsert_chat_dangerous(p_title text)
RETURNS TABLE (id uuid, title text)
LANGUAGE plpgsql
AS $$
BEGIN
    INSERT INTO public.chats (title)
    VALUES (p_title)
    ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title;

    RETURN QUERY SELECT chats.id, chats.title FROM public.chats;
END;
$$;
`

/** Scalar return + DECLAREd local var shadowing a column — NOT the
 * OUT-shadowing class.  Linter MUST NOT flag this. */
const FIXTURE_SCALAR_RETURN_OK = `
CREATE OR REPLACE FUNCTION public.scalar_returner(p_user_id uuid)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
    v_tier text;
BEGIN
    SELECT subscription_tier INTO v_tier
    FROM   public.user_credits
    WHERE  user_id = p_user_id;

    RETURN COALESCE(v_tier, 'free');
END;
$$;
`

/** Body uses bare user_id but ONLY in a context fully qualified by a
 * table alias (cp.user_id).  The conservative linter must NOT flag this
 * because there's no truly unqualified reference. */
const FIXTURE_FULLY_QUALIFIED_OK = `
CREATE OR REPLACE FUNCTION public.fully_qualified_ok(p_user_id uuid)
RETURNS TABLE (out_user_id uuid, out_tier text)
LANGUAGE plpgsql
AS $$
BEGIN
    UPDATE public.user_credits AS uc
    SET    subscription_tier = 'free'
    WHERE  uc.user_id = p_user_id;
    RETURN QUERY SELECT p_user_id, 'free'::text;
END;
$$;
`

// ---------------------------------------------------------------------------
// Fixture-based linter assertions
// ---------------------------------------------------------------------------
describe('Static shadowing linter: fixture-based', () => {
  function lintOne(sql: string) {
    const fns = extractFunctionDefs(sql, '<fixture>')
    expect(fns.length).toBeGreaterThan(0)
    return fns.flatMap((fn) => lintShadowing(fn, TABLE_COLUMNS))
  }

  it('FLAGS the pre-015 update_subscription_status (RETURNS TABLE(user_id ...))', () => {
    const findings = lintOne(FIXTURE_PRE015_UPDATE_SUBSCRIPTION_STATUS)
    // Must catch at minimum the user_id shadow.
    expect(findings.length).toBeGreaterThan(0)
    const userIdHit = findings.find((f) => f.outColumn === 'user_id')
    expect(userIdHit).toBeDefined()
    expect(userIdHit!.function).toBe('update_subscription_status')
    expect(userIdHit!.reason).toMatch(/42702/)
  })

  it('PASSES the post-015 update_subscription_status (RETURNS TABLE(out_user_id ...))', () => {
    const findings = lintOne(FIXTURE_POST015_UPDATE_SUBSCRIPTION_STATUS)
    expect(findings).toEqual([])
  })

  it('PASSES the post-015 can_user_join_room (RETURNS TABLE(out_chat_id ...))', () => {
    const findings = lintOne(FIXTURE_POST015_CAN_USER_JOIN_ROOM)
    expect(findings).toEqual([])
  })

  it('FLAGS a handcrafted RETURNS TABLE(id uuid) over public.chats with ON CONFLICT(id)', () => {
    const findings = lintOne(FIXTURE_HANDCRAFTED_BAD)
    expect(findings.length).toBeGreaterThan(0)
    const idHit = findings.find((f) => f.outColumn === 'id')
    expect(idHit).toBeDefined()
    expect(idHit!.function).toBe('upsert_chat_dangerous')
  })

  it('PASSES a scalar-return function even with DECLAREd shadow variables', () => {
    const findings = lintOne(FIXTURE_SCALAR_RETURN_OK)
    expect(findings).toEqual([])
  })

  it('PASSES a function whose body fully qualifies every column reference', () => {
    const findings = lintOne(FIXTURE_FULLY_QUALIFIED_OK)
    expect(findings).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Real-file assertions: schema.sql + every migration must pass the linter.
// If Agent A has NOT yet fixed schema.sql, this test fails — that's by
// design.  The linter ITSELF is correct in either state.
// ---------------------------------------------------------------------------
describe('Static shadowing linter: real schema.sql + migrations', () => {
  it('supabase/schema.sql passes the shadowing linter', () => {
    const fns = extractFunctionDefs(SCHEMA_SQL, SCHEMA_PATH)
    const findings = fns.flatMap((fn) => lintShadowing(fn, TABLE_COLUMNS))
    if (findings.length > 0) {
      // Surface the first finding clearly so CI failures are debuggable.
      const f = findings[0]
      throw new Error(
        `[schema.sql] OUT-param shadowing detected (NEW-1 regression class):\n` +
          `  function:   ${f.function}\n` +
          `  out column: ${f.outColumn}\n` +
          `  at line:    ${f.startLine}\n` +
          `  reason:     ${f.reason}\n` +
          `Total findings: ${findings.length}`
      )
    }
    expect(findings).toEqual([])
  })

  it('the LATEST definition of every function across migrations passes the linter', () => {
    // Migrations are applied in filename-sort order.  A function may be
    // redefined many times; only the LATEST definition is what actually
    // runs in prod.  Migration 011 deliberately ships the bug that 015
    // and 021 fix — auditing 011 in isolation would always fail.  The
    // right invariant is: after all migrations apply, the live function
    // is collision-free.
    const migrations = loadMigrations(MIGRATIONS_DIR)
    const latestByName = new Map<
      string,
      { fn: ReturnType<typeof extractFunctionDefs>[number]; file: string }
    >()
    for (const { file, sql } of migrations) {
      const fns = extractFunctionDefs(sql, file)
      for (const fn of fns) {
        latestByName.set(fn.name, { fn, file })
      }
    }

    const findings = [...latestByName.values()].flatMap(({ fn }) =>
      lintShadowing(fn, TABLE_COLUMNS)
    )
    if (findings.length > 0) {
      const f = findings[0]
      throw new Error(
        `[migrations / latest] OUT-param shadowing detected:\n` +
          `  file:       ${f.sourcePath}\n` +
          `  function:   ${f.function}\n` +
          `  out column: ${f.outColumn}\n` +
          `  reason:     ${f.reason}`
      )
    }
    expect(findings).toEqual([])
  })

  it('LEGACY migration 011 was buggy on purpose (sanity check the linter is alive)', () => {
    // Defence-in-depth: ensures the linter CAN detect the historical bug.
    // If this stops finding it, the linter has been weakened and the
    // real-schema asserts above are silently passing for the wrong reason.
    const m011Path = path.join(MIGRATIONS_DIR, '011_unify_tier_vocabulary.sql')
    const sql = fs.readFileSync(m011Path, 'utf8')
    const fns = extractFunctionDefs(sql, m011Path)
    const updateSub = fns.find((fn) => fn.name === 'update_subscription_status')
    expect(updateSub).toBeDefined()
    const findings = lintShadowing(updateSub!, TABLE_COLUMNS)
    expect(findings.length).toBeGreaterThan(0)
    expect(findings.some((f) => f.outColumn === 'user_id')).toBe(true)
  })

  it('linter runs in under 10s even on the full repo', () => {
    const start = Date.now()
    const migrations = loadMigrations(MIGRATIONS_DIR)
    for (const { sql } of migrations) {
      const fns = extractFunctionDefs(sql, '')
      for (const fn of fns) lintShadowing(fn, TABLE_COLUMNS)
    }
    const fns = extractFunctionDefs(SCHEMA_SQL, SCHEMA_PATH)
    for (const fn of fns) lintShadowing(fn, TABLE_COLUMNS)
    const elapsedMs = Date.now() - start
    expect(elapsedMs).toBeLessThan(10_000)
  })
})

// ---------------------------------------------------------------------------
// Parser unit tests.  Guard the building blocks the linter relies on.
// ---------------------------------------------------------------------------
describe('SQL parser: extractReturnsTableColumns', () => {
  it('extracts unquoted columns', () => {
    const header =
      'CREATE FUNCTION foo() RETURNS TABLE (a int, b text, c uuid) AS '
    expect(extractReturnsTableColumns(header)).toEqual(['a', 'b', 'c'])
  })

  it('extracts quoted columns', () => {
    const header =
      'CREATE FUNCTION foo() RETURNS TABLE ("out_user_id" "uuid", "out_resolved_tier" "text") AS '
    expect(extractReturnsTableColumns(header)).toEqual([
      'out_user_id',
      'out_resolved_tier',
    ])
  })

  it('returns [] for scalar RETURNS', () => {
    expect(extractReturnsTableColumns('RETURNS text AS')).toEqual([])
  })
})

describe('SQL parser: extractFunctionDefs', () => {
  it('parses a single dollar-quoted function', () => {
    const fns = extractFunctionDefs(
      FIXTURE_POST015_UPDATE_SUBSCRIPTION_STATUS,
      '<test>'
    )
    expect(fns).toHaveLength(1)
    expect(fns[0].name).toBe('update_subscription_status')
    expect(fns[0].outColumns).toEqual([
      'out_user_id',
      'out_resolved_tier',
      'out_is_paid',
    ])
    expect(fns[0].body).toContain('UPDATE public.user_subscriptions')
  })

  it('parses tagged dollar-quoted bodies ($foo$ ... $foo$)', () => {
    const sql = `
CREATE OR REPLACE FUNCTION public.tagged() RETURNS text
LANGUAGE plpgsql AS $foo$
BEGIN
    RETURN 'hi';
END;
$foo$;
`
    const fns = extractFunctionDefs(sql, '<test>')
    expect(fns).toHaveLength(1)
    expect(fns[0].name).toBe('tagged')
    expect(fns[0].body).toContain("RETURN 'hi'")
  })

  it('parses schema-qualified quoted names', () => {
    const sql = `
CREATE OR REPLACE FUNCTION "public"."update_subscription_status"() RETURNS text
LANGUAGE plpgsql AS $$ BEGIN RETURN 'ok'; END; $$;
`
    const fns = extractFunctionDefs(sql, '<test>')
    expect(fns).toHaveLength(1)
    expect(fns[0].name).toBe('update_subscription_status')
  })
})

describe('SQL parser: stripSqlComments', () => {
  it('strips -- line comments', () => {
    expect(stripSqlComments('SELECT 1; -- foo bar\nSELECT 2;')).not.toMatch(
      /foo bar/
    )
  })

  it('strips block comments', () => {
    expect(stripSqlComments('SELECT /* user_id */ 1;')).not.toMatch(/user_id/)
  })
})

describe('SQL parser: extractTableDefs', () => {
  it('extracts columns from a quoted-identifier CREATE TABLE', () => {
    const sql = `
CREATE TABLE IF NOT EXISTS "public"."t" (
    "id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    CONSTRAINT t_pk PRIMARY KEY ("id")
);
`
    const tables = extractTableDefs(sql)
    expect(tables).toHaveLength(1)
    expect(tables[0].name).toBe('t')
    expect(tables[0].columns).toEqual(['id', 'user_id'])
  })
})
