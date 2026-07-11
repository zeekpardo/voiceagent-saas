import { describe, expect, it } from "vitest";

import { createRateLimiter } from "./rate-limit";

describe("createRateLimiter", () => {
	it("allows up to the limit within the window, then 429s", () => {
		const limiter = createRateLimiter(3, 1000);
		const now = 10_000;
		expect(limiter.check("k", now).allowed).toBe(true);
		expect(limiter.check("k", now).allowed).toBe(true);
		expect(limiter.check("k", now).allowed).toBe(true);
		const blocked = limiter.check("k", now);
		expect(blocked.allowed).toBe(false);
		expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
	});

	it("reports a Retry-After that counts down to the oldest hit expiring", () => {
		const limiter = createRateLimiter(1, 10_000);
		limiter.check("k", 0);
		const blocked = limiter.check("k", 3_000); // 7s left in the window
		expect(blocked.allowed).toBe(false);
		expect(blocked.retryAfterSeconds).toBe(7);
	});

	it("frees capacity once hits fall out of the window", () => {
		const limiter = createRateLimiter(2, 1000);
		limiter.check("k", 0);
		limiter.check("k", 500);
		expect(limiter.check("k", 900).allowed).toBe(false); // both still in window
		// Advance past the first hit's expiry (>1000ms after t=0).
		expect(limiter.check("k", 1600).allowed).toBe(true);
	});

	it("tracks keys independently", () => {
		const limiter = createRateLimiter(1, 1000);
		expect(limiter.check("a", 0).allowed).toBe(true);
		expect(limiter.check("a", 0).allowed).toBe(false);
		expect(limiter.check("b", 0).allowed).toBe(true);
	});

	it("reset clears all state", () => {
		const limiter = createRateLimiter(1, 1000);
		limiter.check("a", 0);
		limiter.reset();
		expect(limiter.check("a", 0).allowed).toBe(true);
	});
});
