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
