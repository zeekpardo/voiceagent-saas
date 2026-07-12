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

/** Process-wide debouncer shared by the inbound webhook. */
export const inboundDebouncer = new InboundDebouncer();

/** Await `ms` — small sleep helper for the quiet window (non-blocking). */
export function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
