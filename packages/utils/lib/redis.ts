/**
 * Shared, lazily-connected Redis client for cross-instance abuse-control state
 * (rate limiters, dedup/replay guards, the inbound debouncer).
 *
 * WHY THIS SHAPE:
 *  - `getRedis()` returns the singleton client when `REDIS_URL` is set, else
 *    `null`. Callers MUST treat `null` as "no shared store" and use their
 *    existing in-memory behavior. This is what preserves local dev / tests / CI,
 *    which have NO Redis: with `REDIS_URL` unset every consumer is byte-for-byte
 *    the previous per-instance implementation.
 *  - The client is LAZILY connected (`lazyConnect: true`): constructing it does
 *    NOT open a socket, so importing this module is side-effect-free and safe at
 *    build time and under the test runner. The first command triggers the
 *    connect.
 *  - It is tuned to FAIL FAST, not hang: a short connect/command timeout and a
 *    capped retry strategy mean a down/slow Redis rejects quickly so callers can
 *    fall back (fail-open) instead of stalling a request. `error` events are
 *    swallowed with a log so an unreachable Redis never crashes the process.
 *
 * This module is intentionally NOT re-exported from `@repo/utils` index — it is
 * server-only (pulls in the `ioredis` native-ish client) and must never land in
 * a client bundle. Import it via `@repo/utils/lib/redis`.
 */
import Redis from "ioredis";

// `undefined` = not yet resolved; `null` = resolved to "no Redis configured".
let client: Redis | null | undefined;

/**
 * The lazily-created shared Redis client, or `null` when `REDIS_URL` is unset.
 * Never throws and never connects at call time — the connection is opened on the
 * first actual command. Callers own the try/catch + fallback.
 */
export function getRedis(): Redis | null {
	if (client !== undefined) {
		return client;
	}

	const url = process.env.REDIS_URL?.trim();
	if (!url) {
		client = null;
		return null;
	}

	client = new Redis(url, {
		// Do NOT connect at construction — keeps import/build/test side-effect-free.
		lazyConnect: true,
		// Fail fast so a down Redis falls back instead of hanging a request.
		connectTimeout: 3000,
		commandTimeout: 1500,
		maxRetriesPerRequest: 1,
		// Cap reconnection backoff so a persistently-down Redis doesn't spin hot.
		retryStrategy(times) {
			if (times > 5) {
				return null; // stop retrying; a later command will lazily reconnect
			}
			return Math.min(times * 200, 2000);
		},
	});

	// An unreachable Redis must never crash the process. Log once-ish and let
	// individual command try/catch drive the fallback.
	client.on("error", (err: unknown) => {
		console.error("[redis] client error:", err instanceof Error ? err.message : err);
	});

	return client;
}

/** True when a shared Redis store is configured (i.e. `REDIS_URL` is set). */
export function hasRedis(): boolean {
	return !!process.env.REDIS_URL?.trim();
}
