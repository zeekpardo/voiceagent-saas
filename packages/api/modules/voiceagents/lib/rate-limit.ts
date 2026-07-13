/**
 * Rate limiting for the public widget-session and voice-call-trigger routes.
 *
 * Two implementations behind one result shape:
 *  - `createRateLimiter` — the ORIGINAL in-memory sliding-window limiter. State
 *    lives in one Node process's heap, so on a multi-instance deploy each
 *    instance limits independently (effective ceiling ≈ limit × instances).
 *  - `createSharedRateLimiter` — a Redis-backed fixed-window limiter (atomic
 *    INCR + EXPIRE) that is correct across instances. When `REDIS_URL` is unset
 *    it transparently DELEGATES to `createRateLimiter`, so local dev / tests /
 *    CI (no Redis) keep the exact previous per-instance behavior. Routes use the
 *    shared variant; its `check` is async.
 */
import { getRedis } from "@repo/utils/lib/redis";

export interface RateLimitResult {
	allowed: boolean;
	/** Seconds until the caller may retry (0 when allowed). For Retry-After. */
	retryAfterSeconds: number;
}

export interface RateLimiter {
	/** Records a hit for `key` and reports whether it is within the window limit. */
	check(key: string, now?: number): RateLimitResult;
	/** Clears all state (test helper). */
	reset(): void;
}

export function createRateLimiter(limit: number, windowMs: number): RateLimiter {
	const hits = new Map<string, number[]>();

	function prune(timestamps: number[], cutoff: number): number[] {
		// Timestamps are appended in order, so drop the leading expired ones.
		let i = 0;
		while (i < timestamps.length && timestamps[i]! <= cutoff) i++;
		return i === 0 ? timestamps : timestamps.slice(i);
	}

	// Periodic sweep so keys that stop being hit don't leak memory. unref() so
	// this timer never keeps the process (or a test runner) alive on its own.
	const sweep = setInterval(() => {
		const cutoff = Date.now() - windowMs;
		for (const [key, timestamps] of hits) {
			const kept = prune(timestamps, cutoff);
			if (kept.length === 0) hits.delete(key);
			else hits.set(key, kept);
		}
	}, windowMs);
	sweep.unref?.();

	return {
		check(key, now = Date.now()) {
			const cutoff = now - windowMs;
			const current = prune(hits.get(key) ?? [], cutoff);
			if (current.length >= limit) {
				const oldest = current[0]!;
				const retryAfterSeconds = Math.max(1, Math.ceil((oldest + windowMs - now) / 1000));
				hits.set(key, current);
				return { allowed: false, retryAfterSeconds };
			}
			current.push(now);
			hits.set(key, current);
			return { allowed: true, retryAfterSeconds: 0 };
		},
		reset() {
			hits.clear();
		},
	};
}

/** Cross-instance rate limiter. `check` is async because a Redis op is async. */
export interface SharedRateLimiter {
	/** Records a hit for `key` and reports whether it is within the window limit. */
	check(key: string): Promise<RateLimitResult>;
	/** Clears in-memory fallback state (test helper; no-op for Redis keys). */
	reset(): void;
}

/**
 * Atomically increment-and-expire a fixed-window counter, returning the
 * post-increment count and the key's remaining TTL (ms). A single Lua script so
 * the counter and its expiry are set together (no window that leaks a
 * never-expiring key). Recovers a TTL if one is somehow missing.
 */
const INCR_WINDOW_SCRIPT = `
local c = redis.call('INCR', KEYS[1])
local t = redis.call('PTTL', KEYS[1])
if c == 1 or t < 0 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
  t = tonumber(ARGV[1])
end
return {c, t}
`;

/**
 * A rate limiter backed by shared Redis when `REDIS_URL` is set, else the
 * in-memory `createRateLimiter` (literally the current code). `name` namespaces
 * the Redis keys so distinct limiters that key on the same value (e.g. a minute
 * and an hour limiter both keyed by token) never collide.
 *
 * FAIL-OPEN: if a Redis op throws at runtime (down/slow store), we log and ALLOW
 * the request rather than 500 or block legit traffic — availability > strictness.
 */
export function createSharedRateLimiter(
	name: string,
	limit: number,
	windowMs: number,
): SharedRateLimiter {
	const redis = getRedis();

	// No shared store configured → the exact previous in-memory behavior.
	if (!redis) {
		const memory = createRateLimiter(limit, windowMs);
		return {
			check(key) {
				return Promise.resolve(memory.check(key));
			},
			reset() {
				memory.reset();
			},
		};
	}

	const redisKey = (key: string) => `rl:${name}:${key}`;

	return {
		async check(key) {
			try {
				const [count, ttlMs] = (await redis.eval(
					INCR_WINDOW_SCRIPT,
					1,
					redisKey(key),
					String(windowMs),
				)) as [number, number];

				if (count <= limit) {
					return { allowed: true, retryAfterSeconds: 0 };
				}
				const retryAfterSeconds = Math.max(1, Math.ceil(ttlMs / 1000));
				return { allowed: false, retryAfterSeconds };
			} catch (error) {
				// Fail open: never block legit traffic on a Redis hiccup.
				console.error(
					`[rate-limit] redis error for ${name}, failing open:`,
					error instanceof Error ? error.message : error,
				);
				return { allowed: true, retryAfterSeconds: 0 };
			}
		},
		reset() {
			// Redis keys expire on their own; nothing process-local to clear.
		},
	};
}
