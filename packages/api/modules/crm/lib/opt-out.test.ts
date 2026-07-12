import { describe, expect, it } from "vitest";

import { AI_OFF_TAG, classifyOptOut, isOptedOut } from "./opt-out";

describe("classifyOptOut", () => {
	it("detects the standard opt-out keywords (case-insensitive, trimmed)", () => {
		for (const kw of [
			"STOP",
			"stop",
			"  Stop  ",
			"STOPALL",
			"UNSUBSCRIBE",
			"cancel",
			"END",
			"quit",
			"OPTOUT",
			"opt out",
			"opt-out",
			"REVOKE",
		]) {
			expect(classifyOptOut(kw)).toBe("opt_out");
		}
	});

	it("strips surrounding punctuation so 'STOP.' / 'STOP!' still opt out", () => {
		expect(classifyOptOut("STOP.")).toBe("opt_out");
		expect(classifyOptOut("stop!")).toBe("opt_out");
		expect(classifyOptOut("(unsubscribe)")).toBe("opt_out");
	});

	it("detects opt-BACK-in keywords", () => {
		expect(classifyOptOut("START")).toBe("opt_in");
		expect(classifyOptOut("unstop")).toBe("opt_in");
		expect(classifyOptOut("Yes")).toBe("opt_in");
	});

	it("only matches when the WHOLE message is a keyword", () => {
		expect(classifyOptOut("please stop texting me about the house")).toBeNull();
		expect(classifyOptOut("I want to cancel my appointment")).toBeNull();
		expect(classifyOptOut("yes please, tell me more")).toBeNull();
		expect(classifyOptOut("")).toBeNull();
		expect(classifyOptOut("   ")).toBeNull();
	});
});

describe("isOptedOut", () => {
	it("is true when the ai-off tag is present (case-insensitive CSV)", () => {
		expect(isOptedOut(`vip, ${AI_OFF_TAG}, hot`)).toBe(true);
		expect(isOptedOut("VIP, AI OFF")).toBe(true);
	});

	it("is false without the tag or with no tags", () => {
		expect(isOptedOut("vip, hot")).toBe(false);
		expect(isOptedOut("")).toBe(false);
		expect(isOptedOut(undefined)).toBe(false);
		expect(isOptedOut(null)).toBe(false);
	});
});
