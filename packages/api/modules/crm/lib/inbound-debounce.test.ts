import { describe, expect, it } from "vitest";

import { InboundDebouncer } from "./inbound-debounce";

describe("InboundDebouncer", () => {
	it("coalesces a rapid burst into ONE combined turn — only the latest wins", () => {
		const d = new InboundDebouncer();
		const key = "conv-1";

		// Three messages fire in a burst before any window elapses.
		const t1 = d.enqueue(key, "hey");
		const t2 = d.enqueue(key, "I wanted to ask");
		const t3 = d.enqueue(key, "about the house");

		// The two earlier handlers are superseded and must no-op.
		expect(d.isLatest(key, t1)).toBe(false);
		expect(d.isLatest(key, t2)).toBe(false);
		// The latest handler dispatches.
		expect(d.isLatest(key, t3)).toBe(true);

		// It drains the full combined text exactly once.
		expect(d.drain(key)).toBe("hey\nI wanted to ask\nabout the house");
	});

	it("draining clears the buffer (exactly-once dispatch)", () => {
		const d = new InboundDebouncer();
		d.enqueue("c", "one");
		expect(d.drain("c")).toBe("one");
		// Buffer is gone — a second drain yields nothing and there's no double-send.
		expect(d.drain("c")).toBe("");
		expect(d.size).toBe(0);
	});

	it("keeps separate conversations independent", () => {
		const d = new InboundDebouncer();
		const a = d.enqueue("a", "a1");
		const b = d.enqueue("b", "b1");
		// Enqueuing on b does not supersede a's handler.
		expect(d.isLatest("a", a)).toBe(true);
		expect(d.isLatest("b", b)).toBe(true);
		expect(d.drain("a")).toBe("a1");
		expect(d.drain("b")).toBe("b1");
	});

	it("a single message is its own latest handler", () => {
		const d = new InboundDebouncer();
		const t = d.enqueue("solo", "just one");
		expect(d.isLatest("solo", t)).toBe(true);
		expect(d.drain("solo")).toBe("just one");
	});
});
