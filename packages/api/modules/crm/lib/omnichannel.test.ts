import { describe, expect, it } from "vitest";

import { passesTagFilters, resolveInboundAgent, type RoutableAgentSource } from "./omnichannel";

describe("passesTagFilters", () => {
	it("passes when there are no filters", () => {
		expect(passesTagFilters([], "vip, hot")).toBe(true);
	});

	it("requires every 'is' condition to hold (case-insensitive)", () => {
		expect(passesTagFilters([{ tag: "VIP", mode: "is" }], "vip, hot")).toBe(true);
		expect(passesTagFilters([{ tag: "vip", mode: "is" }], "hot")).toBe(false);
	});

	it("excludes on an 'is_not' condition", () => {
		expect(passesTagFilters([{ tag: "ai off", mode: "is_not" }], "ai off")).toBe(false);
		expect(passesTagFilters([{ tag: "ai off", mode: "is_not" }], "vip")).toBe(true);
	});
});

describe("resolveInboundAgent", () => {
	const rows: RoutableAgentSource[] = [
		{ agentId: "agt_sms", enabled: true, channels: ["sms", "fb"], tagFilters: [] },
		{ agentId: "agt_email", enabled: true, channels: ["email"], tagFilters: [] },
		{ agentId: "agt_off", enabled: false, channels: ["whatsapp"], tagFilters: [] },
	];

	it("routes to the agent whose channels include the inbound channel", () => {
		expect(resolveInboundAgent({ rows, channel: "sms" })?.agentId).toBe("agt_sms");
		expect(resolveInboundAgent({ rows, channel: "fb" })?.agentId).toBe("agt_sms");
		expect(resolveInboundAgent({ rows, channel: "email" })?.agentId).toBe("agt_email");
	});

	it("ignores disabled mappings", () => {
		expect(resolveInboundAgent({ rows, channel: "whatsapp" })).toBeNull();
	});

	it("returns null when no agent monitors the channel", () => {
		expect(resolveInboundAgent({ rows, channel: "gmb" })).toBeNull();
	});

	it("applies the matched agent's tag filters", () => {
		const gated: RoutableAgentSource[] = [
			{
				agentId: "agt_gated",
				enabled: true,
				channels: ["sms"],
				tagFilters: [{ tag: "ai off", mode: "is_not" }],
			},
		];
		expect(
			resolveInboundAgent({ rows: gated, channel: "sms", contactTagsCsv: "vip" })?.agentId,
		).toBe("agt_gated");
		expect(
			resolveInboundAgent({ rows: gated, channel: "sms", contactTagsCsv: "ai off" }),
		).toBeNull();
	});

	it("picks the first qualifying row deterministically (one-per-channel invariant)", () => {
		// Two rows claim sms (shouldn't happen post-enforcement, but resolution
		// must still be deterministic): the first in order wins.
		const dup: RoutableAgentSource[] = [
			{ agentId: "agt_a", enabled: true, channels: ["sms"], tagFilters: [] },
			{ agentId: "agt_b", enabled: true, channels: ["sms"], tagFilters: [] },
		];
		expect(resolveInboundAgent({ rows: dup, channel: "sms" })?.agentId).toBe("agt_a");
	});
});
