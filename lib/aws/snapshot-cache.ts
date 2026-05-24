/**
 * In-process snapshot-lookup cache for `findLatestUserSnapshotInfo`.
 *
 * Why this exists
 * ---------------
 * Production audit (84h window) found that 9 polling users issued 12,839
 * serial `DescribeImages` calls — 3,668 calls/day, hourly peaks 663-830.
 * The top user `c95920ee` alone did 2,577 serial calls. This pattern was
 * the primary contributor to Monday's 6-hour p99 latency incident on the
 * `findLatestUserSnapshotInfo` path.
 *
 * The polling hot-path is dominated by repeated calls from the same Next.js
 * replica process for the same user_id within seconds, so a per-process
 * cache plus a singleflight dedup map captures the lion's share of the
 * savings without taking on a new external dependency.
 *
 * Why not Redis
 * -------------
 * The coasty.ai Next.js frontend has no Redis client wired in. Existing
 * "lock-like" primitives in this code path (see `cross-replica-lock.ts`)
 * use Postgres unique-constraint inserts, not Redis. Adding a Redis
 * client + connection-pool for a cache that already gets ~95% of its
 * hit ratio from in-process reuse (because polling is per-replica anyway)
 * trades a hard correctness problem for a soft hit-rate gain. We chose the
 * boring option: a Map keyed by user_id with TTL + singleflight.
 *
 * Cache strategy
 * --------------
 *  - Cache-aside: read cache → on miss, call loader → on success, set cache.
 *  - Positive TTL: 600 s (10 min). Snapshots are created at most a handful of
 *    times per user per day, so 10 min of staleness is acceptable.
 *  - Negative TTL: 60 s. New snapshots arrive bursty; a short null TTL means
 *    we re-check AWS soon after the user's first snapshot lands.
 *  - Singleflight dedup: a per-user inflight Promise map ensures 50
 *    concurrent calls for the same user_id collapse into exactly ONE
 *    loader invocation. This is the most important production-correctness
 *    piece because the polling hotspot is exactly this pattern.
 *  - Fail-open: cache read/write failures (corruption, OOM safety, future
 *    Redis backend) MUST NOT fail the request. Loader errors propagate.
 *
 * Observability
 * -------------
 * Emits two log lines suitable for a CloudWatch metric filter:
 *   `[snapshot-cache] hit user=<8charprefix>`
 *   `[snapshot-cache] miss user=<8charprefix> duration_ms=<N>`
 * Hits are logged at debug level (high volume), misses at info level
 * (low volume — by design, after the cache is warm).
 */

export interface SnapshotInfo {
  amiId: string;
  createdAt: string;
}

interface CacheEntry {
  /** `null` represents a cached "no snapshot exists" result. */
  value: SnapshotInfo | null;
  /** Absolute epoch-ms at which this entry becomes stale. */
  expiresAt: number;
}

/** Default TTL when a snapshot was found. 10 minutes. */
export const POSITIVE_TTL_MS = 600_000;
/** Default TTL when no snapshot was found. 60 seconds. */
export const NEGATIVE_TTL_MS = 60_000;

/**
 * The cache is a module-level singleton intentionally — the AwsEc2Service
 * itself is a singleton (see `getAwsEc2Service`), and we want the cache
 * to span all callers within a single Next.js process.
 */
const cache = new Map<string, CacheEntry>();

/**
 * Inflight Promise dedup. Separate from the response cache because it
 * tracks "AWS call in progress for user X right now" rather than
 * "successful AWS result for user X". Cleared when the underlying loader
 * resolves OR rejects.
 */
const inflight = new Map<string, Promise<SnapshotInfo | null>>();

/**
 * Sanitize a user_id for use as a cache key. We accept the same character
 * classes a UUID/email/oauth-sub can produce. Anything outside that gets
 * replaced with `_` so a malformed input can't crash the cache layer or
 * (when this becomes a Redis-backed cache later) trigger key-syntax
 * problems with `MSET`/`KEYS` patterns.
 */
function sanitizeUserId(userId: string): string {
  return userId.replace(/[^A-Za-z0-9._@\-]/g, "_");
}

function cacheKey(userId: string): string {
  return `snapshot:user:${sanitizeUserId(userId)}`;
}

function userPrefix(userId: string): string {
  // Match the `userId.substring(0, 8)` pattern used elsewhere in
  // ec2-service.ts for log-line correlation across the codebase.
  return userId.substring(0, 8);
}

/**
 * Read the cache. Returns `undefined` on a true miss, or a `{ value }`
 * wrapper to disambiguate a cached `null` from "not cached".
 */
function readCache(userId: string): { value: SnapshotInfo | null } | undefined {
  const key = cacheKey(userId);
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt <= Date.now()) {
    cache.delete(key);
    return undefined;
  }
  return { value: entry.value };
}

function writeCache(
  userId: string,
  value: SnapshotInfo | null,
  ttlMs: number,
): void {
  const key = cacheKey(userId);
  cache.set(key, { value, expiresAt: Date.now() + ttlMs });
}

/**
 * Drop any cached entry for `userId`. Called after a new snapshot is
 * created via `CreateImage` so the next read can't serve stale data for
 * up to 10 minutes.
 *
 * Inflight requests are intentionally NOT cancelled — the in-progress
 * AWS call may already have observed the new image (CreateImage is
 * eventually consistent against DescribeImages, with a brief window),
 * and cancelling it would force a redundant re-call. The cache entry
 * the inflight promise writes on completion is allowed to land; the
 * next caller after that will get the now-current state.
 */
export function invalidate(userId: string): void {
  cache.delete(cacheKey(userId));
}

/**
 * For tests: blow away the entire cache and inflight map. Production
 * callers should use `invalidate(userId)` instead.
 */
export function _resetForTests(): void {
  cache.clear();
  inflight.clear();
}

/**
 * Cache-aside read for the snapshot lookup. On miss, calls `loader` and
 * caches its result (including `null`). Singleflight: concurrent callers
 * for the same `userId` share one loader invocation.
 *
 * Loader errors propagate to ALL waiters AND are NOT cached. This is
 * intentional — a transient AWS error should not poison the cache for
 * 10 minutes. The next caller after the error retries.
 */
export async function getOrLoad(
  userId: string,
  loader: () => Promise<SnapshotInfo | null>,
  opts: { positiveTtlMs?: number; negativeTtlMs?: number } = {},
): Promise<SnapshotInfo | null> {
  const positiveTtl = opts.positiveTtlMs ?? POSITIVE_TTL_MS;
  const negativeTtl = opts.negativeTtlMs ?? NEGATIVE_TTL_MS;

  // 1. Cache hit short-circuit. Wrapped in try/catch for fail-open even
  //    though Map.get can't throw today; a future Redis backend can.
  try {
    const hit = readCache(userId);
    if (hit !== undefined) {
      console.debug(`[snapshot-cache] hit user=${userPrefix(userId)}`);
      return hit.value;
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(
      `[snapshot-cache] read failed for user=${userPrefix(userId)} (${msg}); falling through to loader`,
    );
  }

  // 2. Singleflight: if another caller is already loading this user's
  //    snapshot, await their Promise instead of issuing a parallel call.
  const existing = inflight.get(userId);
  if (existing) return existing;

  // 3. First caller: kick off the loader, register it for dedup, write
  //    the result on success, ALWAYS clear the inflight entry on settle.
  const startedAt = Date.now();
  const promise = (async () => {
    const result = await loader();
    try {
      writeCache(
        userId,
        result,
        result === null ? negativeTtl : positiveTtl,
      );
    } catch (err: unknown) {
      // Cache writes must never fail the request. Log + carry on.
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(
        `[snapshot-cache] write failed for user=${userPrefix(userId)} (${msg})`,
      );
    }
    const durationMs = Date.now() - startedAt;
    console.log(
      `[snapshot-cache] miss user=${userPrefix(userId)} duration_ms=${durationMs}`,
    );
    return result;
  })();

  inflight.set(userId, promise);
  try {
    return await promise;
  } finally {
    // Always release the inflight slot whether the loader succeeded or
    // threw. Skipping this on throw would prevent retries (the next
    // caller would await a long-rejected promise forever in the worst
    // case where it was already consumed).
    inflight.delete(userId);
  }
}
