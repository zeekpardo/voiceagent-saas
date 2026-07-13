import { getRedis } from "@repo/utils/lib/redis";

/**
 * Structural subset of Better Auth's `SecondaryStorage` (not re-exported from the
 * "better-auth" entrypoint in 1.6.22). Passed to the `secondaryStorage` option,
 * where it is validated structurally. `increment` is the optional atomic
 * primitive Better Auth's secondary-storage rate limiter uses when present.
 */
interface SecondaryStorage {
	get: (key: string) => Promise<string | null>;
	set: (key: string, value: string, ttl?: number) => Promise<void>;
	delete: (key: string) => Promise<void>;
	increment?: (key: string, ttl: number) => Promise<number>;
}

/**
 * Redis-backed Better Auth `secondaryStorage`, used ONLY to make auth-endpoint
 * rate limiting shared across instances (paired with `rateLimit.storage:
 * "secondary-storage"` in auth.ts).
 *
 * SESSIONS STAY IN POSTGRES. In better-auth 1.6.22, providing `secondaryStorage`
 * flips sessions to Redis-only UNLESS `session.storeSessionInDatabase: true` is
 * also set — which auth.ts does. With that flag the Prisma/Postgres row remains
 * the source of truth (reads fall back to the DB, revocation deletes the DB
 * row); Redis only holds an ancillary copy. See internal-adapter.mjs:
 * `if (secondaryStorage && !storeInDb)` gates the Redis-only session path.
 *
 * Returns `undefined` when `REDIS_URL` is unset, so auth.ts omits
 * `secondaryStorage` entirely and Better Auth keeps its default in-memory
 * rate-limit + Postgres sessions — preserving local dev / tests / CI unchanged.
 *
 * FAIL-OPEN: every op swallows Redis errors. `get` returns null (rate-limit
 * treats it as no prior count → allowed; a session read then falls back to
 * Postgres), `increment` returns 0 (≤ max → allowed), and set/delete no-op.
 * A Redis hiccup never 500s an auth request.
 */

// INCR then set expiry ONLY on creation (per the SecondaryStorage.increment
// contract: TTL applied on creation, never extended by later increments), so the
// counter expires a fixed window after it first appears.
const INCREMENT_SCRIPT = `
local c = redis.call('INCR', KEYS[1])
if c == 1 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
return c
`;

export function getRedisSecondaryStorage(): SecondaryStorage | undefined {
	const redis = getRedis();
	if (!redis) {
		return undefined;
	}

	return {
		async get(key) {
			try {
				return await redis.get(key);
			} catch (error) {
				console.error(
					"[auth-secondary-storage] redis get failed, failing open (null):",
					error instanceof Error ? error.message : error,
				);
				return null;
			}
		},
		async set(key, value, ttl) {
			try {
				if (ttl) {
					await redis.set(key, value, "EX", ttl);
				} else {
					await redis.set(key, value);
				}
			} catch (error) {
				console.error(
					"[auth-secondary-storage] redis set failed, failing open (no-op):",
					error instanceof Error ? error.message : error,
				);
			}
		},
		async delete(key) {
			try {
				await redis.del(key);
			} catch (error) {
				console.error(
					"[auth-secondary-storage] redis delete failed, failing open (no-op):",
					error instanceof Error ? error.message : error,
				);
			}
		},
		// Atomic counter for shared rate limiting. `ttl` is in SECONDS.
		async increment(key, ttl) {
			try {
				return (await redis.eval(INCREMENT_SCRIPT, 1, key, String(ttl))) as number;
			} catch (error) {
				console.error(
					"[auth-secondary-storage] redis increment failed, failing open (0 → allowed):",
					error instanceof Error ? error.message : error,
				);
				return 0;
			}
		},
	};
}
