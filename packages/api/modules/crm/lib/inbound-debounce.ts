/**
 * Rapid-burst debounce for inbound async messages. A texting contact often fires
 * several messages in a row ("hey" / "I wanted to ask" / "about the house"); we
 * want to treat that burst as ONE agent turn on the combined text rather than N
 * separate turns that each generate a reply.
 *
 * SERVERLESS CONSTRAINT & TRADEOFF (documented, intentional): the SaaS webhook
 * is a stateless Next.js route with no long-lived process or shared store. This
 * debounce is therefore an IN-PROCESS coalescer: each handler buffers its text
 * under the conversation key, waits a short quiet window, and only the LATEST
 * handler for that key dispatches (the earlier ones no-op — a newer one will
 * fire). Exactly-once within a process: the latest handler atomically drains the
 * buffer; a superseded handler sees it is no longer latest and drops out.
 *
 * Limits (acceptable for the current single-instance deployment; revisit with a
 * shared store — Redis/DB — if the route is scaled to multiple instances):
 *  - Buffer/latest state is per-process. A burst split across two instances by a
 *    load balancer could dispatch two turns (each with its own subset). It never
 *    DROPS a message and never double-dispatches the SAME message.
 *  - The handler holds the request open for the window (~5s). Keep the route's
 *    maxDuration comfortably above the window + turn latency.
 */

import { getRedis } from "@repo/utils/lib/redis";

/**
 * Quiet window (ms) a handler waits for a newer message before dispatching.
 * Override with `SMS_DEBOUNCE_WINDOW_MS`; defaults to 5000 (5s), a balance
 * between coalescing a natural burst and not feeling laggy.
 */
export const DEBOUNCE_WINDOW_MS = (() => {
	const raw = Number(process.env.SMS_DEBOUNCE_WINDOW_MS);
	return Number.isFinite(raw) && raw >= 0 ? raw : 5000;
})();

interface Buffer {
	/** Buffered message parts, oldest first. */
	parts: string[];
	/** The seq of the most recent enqueue for this key. */
	latestSeq: number;
}

/**
 * In-process burst coalescer. Testable without timers: enqueue returns a seq
 * token, isLatest reports whether that token is still the newest for the key,
 * and drain atomically returns + clears the combined text.
 */
export class InboundDebouncer {
	private readonly buffers = new Map<string, Buffer>();
	private seq = 0;

	/**
	 * Buffer `text` under `key`, returning a monotonically increasing seq token
	 * identifying this enqueue. The caller waits the quiet window, then checks
	 * isLatest(key, token).
	 */
	enqueue(key: string, text: string): number {
		const token = ++this.seq;
		const existing = this.buffers.get(key);
		if (existing) {
			existing.parts.push(text);
			existing.latestSeq = token;
		} else {
			this.buffers.set(key, { parts: [text], latestSeq: token });
		}
		return token;
	}

	/** True when `token` is the most recent enqueue for `key` (this handler wins). */
	isLatest(key: string, token: number): boolean {
		return this.buffers.get(key)?.latestSeq === token;
	}

	/**
	 * Atomically remove and return the buffered parts for `key`, joined into one
	 * turn input. Returns "" when nothing is buffered. Only the winning handler
	 * (isLatest === true) should call this.
	 */
	drain(key: string): string {
		const buffer = this.buffers.get(key);
		if (!buffer) return "";
		this.buffers.delete(key);
		return buffer.parts.join("\n");
	}

	/** Current buffered-key count (diagnostics/tests). */
	get size(): number {
		return this.buffers.size;
	}
}

/**
 * Cross-instance burst coalescer. Same enqueue / isLatest / drain contract as
 * `InboundDebouncer`, but async and backed by shared Redis when REDIS_URL is set
 * so a burst split across instances by a load balancer still coalesces to ONE
 * turn. With no REDIS_URL it delegates to an in-memory `InboundDebouncer`
 * UNCHANGED, preserving local dev / tests / CI behavior.
 *
 * FAIL-OPEN: if a Redis op throws we degrade to "no debouncing for this
 * message" — enqueue still returns a token, isLatest returns true so THIS
 * handler dispatches, and drain returns "" so the caller falls back to the
 * single message text (`drain(key) || text`). A Redis blip never DROPS a
 * message; at worst it skips coalescing.
 */
export interface SharedDebouncer {
	enqueue(key: string, text: string): Promise<number>;
	isLatest(key: string, token: number): Promise<boolean>;
	drain(key: string): Promise<string>;
}

// Keys live only for the quiet window plus turn-latency headroom, then expire.
const DEBOUNCE_TTL_MS = DEBOUNCE_WINDOW_MS + 60_000;

// Append text + bump this key's monotonic token + record it as latest, atomically,
// refreshing the TTL on every enqueue. Returns the new token.
const ENQUEUE_SCRIPT = `
local token = redis.call('INCR', KEYS[1])
redis.call('RPUSH', KEYS[2], ARGV[1])
redis.call('SET', KEYS[3], token)
redis.call('PEXPIRE', KEYS[1], ARGV[2])
redis.call('PEXPIRE', KEYS[2], ARGV[2])
redis.call('PEXPIRE', KEYS[3], ARGV[2])
return token
`;

// Atomically read + clear the buffered parts and the latest-marker. The seq
// counter (KEYS not touched here) is left to expire so tokens stay monotonic
// across the active window (never recycled under a still-live burst).
const DRAIN_SCRIPT = `
local parts = redis.call('LRANGE', KEYS[1], 0, -1)
redis.call('DEL', KEYS[1])
redis.call('DEL', KEYS[2])
return parts
`;

function createInboundDebouncer(): SharedDebouncer {
	const redis = getRedis();

	if (!redis) {
		const memory = new InboundDebouncer();
		return {
			enqueue: (key, text) => Promise.resolve(memory.enqueue(key, text)),
			isLatest: (key, token) => Promise.resolve(memory.isLatest(key, token)),
			drain: (key) => Promise.resolve(memory.drain(key)),
		};
	}

	const seqKey = (key: string) => `debounce:seq:${key}`;
	const partsKey = (key: string) => `debounce:parts:${key}`;
	const latestKey = (key: string) => `debounce:latest:${key}`;

	return {
		async enqueue(key, text) {
			try {
				return (await redis.eval(
					ENQUEUE_SCRIPT,
					3,
					seqKey(key),
					partsKey(key),
					latestKey(key),
					text,
					String(DEBOUNCE_TTL_MS),
				)) as number;
			} catch (error) {
				console.error(
					"[inbound-debounce] redis error on enqueue, failing open (no coalesce):",
					error instanceof Error ? error.message : error,
				);
				// A token that isLatest can't match a stored latest → this handler
				// still dispatches via the drain-fallback below.
				return -1;
			}
		},
		async isLatest(key, token) {
			if (token < 0) {
				return true; // enqueue failed open — let this handler dispatch.
			}
			try {
				const latest = await redis.get(latestKey(key));
				return latest !== null && Number(latest) === token;
			} catch (error) {
				console.error(
					"[inbound-debounce] redis error on isLatest, failing open (dispatch):",
					error instanceof Error ? error.message : error,
				);
				return true;
			}
		},
		async drain(key) {
			try {
				const parts = (await redis.eval(
					DRAIN_SCRIPT,
					2,
					partsKey(key),
					latestKey(key),
				)) as string[];
				return parts.join("\n");
			} catch (error) {
				console.error(
					"[inbound-debounce] redis error on drain, failing open (empty → caller uses raw text):",
					error instanceof Error ? error.message : error,
				);
				return "";
			}
		},
	};
}

/** Process-wide debouncer shared by the inbound webhook. */
export const inboundDebouncer = createInboundDebouncer();

/** Await `ms` — small sleep helper for the quiet window (non-blocking). */
export function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
