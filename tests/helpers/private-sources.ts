/**
 * Presence probes for sources that are deliberately gitignored from the
 * PUBLIC repo: backend/** and the later supabase/migrations/*.sql files
 * (only migrations 001–006 were tracked before the ignore rule landed, so a
 * fresh public clone HAS the migrations directory but lacks the newer files
 * — probe individual files, never just the directory).
 *
 * In the maintainer tree every probe is true and the gated suites always
 * run; on a fresh public clone the dependent suites skip instead of dying
 * at collection. Set COASTY_SIMULATE_PUBLIC_CLONE=1 to exercise the skip
 * paths locally without touching the working tree.
 */
import { existsSync } from "node:fs"
import { join } from "node:path"

const ROOT = join(__dirname, "..", "..")
const SIMULATE = process.env.COASTY_SIMULATE_PUBLIC_CLONE === "1"

export const HAVE_BACKEND = !SIMULATE && existsSync(join(ROOT, "backend"))

export const haveMigration = (file: string): boolean =>
  !SIMULATE && existsSync(join(ROOT, "supabase", "migrations", file))

// scripts/coasty_api_test.py is an internal harness kept OUT of the public
// repo (it sits with the other untracked ops scripts). When it's absent, the
// harness-side drift tests skip instead of dying at collection; the
// maintainer tree always has it so they always run there.
export const HAVE_HARNESS =
  !SIMULATE && existsSync(join(ROOT, "scripts", "coasty_api_test.py"))
