import { describe, expect, it } from "vitest";

import { pickTextChannel } from "./text-conversation";
import { shouldTextFallback } from "./text-fallback-rule";

const enabled = { channels: { mode: "both", textFallback: true } };

describe("shouldTextFallback", () => {
	it("fires on a connect-failure outbound call when enabled with a text channel", () => {
		for (const endReason of ["no_answer", "failed", "busy", "canceled", "queue_expired"]) {
			expect(
				shouldTextFallback({
					endReason,
					direction: "outbound",
					config: enabled,
					mappingChannels: ["sms"],
				}),
			).toBe(true);
		}
	});

	it("never fires for inbound calls", () => {
		expect(
			shouldTextFallback({
				endReason: "no_answer",
				direction: "inbound",
				config: enabled,
				mappingChannels: ["sms"],
			}),
		).toBe(false);
	});

	it("does not fire for a normal completion / connected call", () => {
		expect(
			shouldTextFallback({
				endReason: "completed",
				direction: "outbound",
				config: enabled,
				mappingChannels: ["sms"],
			}),
		).toBe(false);
	});

	it("requires the textFallback flag", () => {
		expect(
			shouldTextFallback({
				endReason: "no_answer",
				direction: "outbound",
				config: { channels: { mode: "both", textFallback: false } },
				mappingChannels: ["sms"],
			}),
		).toBe(false);
	});

	it("does not fire for a voice-only agent", () => {
		expect(
			shouldTextFallback({
				endReason: "no_answer",
				direction: "outbound",
				config: { channels: { mode: "voice", textFallback: true } },
				mappingChannels: ["sms"],
			}),
		).toBe(false);
	});

	it("requires a text channel on the source mapping", () => {
		expect(
			shouldTextFallback({
				endReason: "no_answer",
				direction: "outbound",
				config: enabled,
				mappingChannels: [],
			}),
		).toBe(false);
	});

	it("treats a missing/opaque config as opted-out", () => {
		expect(
			shouldTextFallback({
				endReason: "no_answer",
				direction: "outbound",
				config: undefined,
				mappingChannels: ["sms"],
			}),
		).toBe(false);
	});
});

describe("pickTextChannel", () => {
	it("prefers sms when enabled", () => {
		expect(pickTextChannel(["email", "sms"])).toBe("sms");
	});

	it("falls back to the first text channel otherwise", () => {
		expect(pickTextChannel(["email", "whatsapp"])).toBe("email");
	});

	it("returns null when no text channel is enabled", () => {
		expect(pickTextChannel([])).toBeNull();
		expect(pickTextChannel(undefined)).toBeNull();
		expect(pickTextChannel(["not-a-channel"])).toBeNull();
	});
});
