import { describe, expect, it } from "vitest";

import { sendPaced, splitOutboundMessages } from "./outbound-pacing";

describe("splitOutboundMessages", () => {
	it("keeps a single-block reply as one message", () => {
		expect(splitOutboundMessages("Hi there, how can I help?")).toEqual([
			"Hi there, how can I help?",
		]);
	});

	it("splits a blank-line-separated reply into multiple messages", () => {
		expect(splitOutboundMessages("Let me connect you.\n\nHi! I'm Sam, how can I help?")).toEqual([
			"Let me connect you.",
			"Hi! I'm Sam, how can I help?",
		]);
	});

	it("does not split on single newlines and drops empties", () => {
		expect(splitOutboundMessages("line one\nline two")).toEqual(["line one\nline two"]);
		expect(splitOutboundMessages("\n\n  \n\n")).toEqual([]);
	});
});

describe("sendPaced", () => {
	it("sends in order and pauses ONLY between consecutive messages", async () => {
		const sent: string[] = [];
		const sleeps: number[] = [];
		await sendPaced(
			["a", "b", "c"],
			async (t) => {
				sent.push(t);
				return t;
			},
			1200,
			async (ms) => {
				sleeps.push(ms);
			},
		);
		expect(sent).toEqual(["a", "b", "c"]);
		// One gap fewer than the number of messages (not before first, not after last).
		expect(sleeps).toEqual([1200, 1200]);
	});

	it("never sleeps for a single message", async () => {
		const sleeps: number[] = [];
		await sendPaced(
			["only"],
			async (t) => t,
			1200,
			async (ms) => {
				sleeps.push(ms);
			},
		);
		expect(sleeps).toEqual([]);
	});

	it("returns each send result in order", async () => {
		const results = await sendPaced(["x", "y"], async (t) => `sent:${t}`, 0);
		expect(results).toEqual(["sent:x", "sent:y"]);
	});
});
