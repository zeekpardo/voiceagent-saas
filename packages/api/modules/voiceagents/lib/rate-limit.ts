/**
 * Minimal in-memory sliding-window rate limiter for the public widget session
 * route. Keeps per-key hit timestamps in a Map and counts how many fall inside
 * the trailing window.
 *
 * CAVEAT — single-instance only: this state lives in one Node process's heap.
 * On a multi-instance deploy (several containers / serverless workers) each
 * instance limits independently, so the effective ceiling is roughly
 * limit × instances. That is acceptable as a first line of defence against
 * abuse, but before relying on it for hard quotas swap this for a shared store
 * (Redis INCR + EXPIRE, or a durable object) behind the same interface.
 */

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
