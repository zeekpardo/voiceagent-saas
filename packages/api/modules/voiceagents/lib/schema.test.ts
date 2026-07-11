import { describe, expect, it } from "vitest";

import {
	allowedSessionChannels,
	isChannelAllowed,
	readChannelMode,
	readTextFallback,
} from "./channel-mode";
import { agentConfigInput, toGatewayConfig } from "./schema";

describe("agentConfigInput channels", () => {
	it("defaults to mode 'both' + textFallback false", () => {
		const parsed = agentConfigInput.parse({ name: "Agent" });
		expect(parsed.channels).toEqual({ mode: "both", textFallback: false });
	});

	it("round-trips an explicit channels selection", () => {
		const parsed = agentConfigInput.parse({
			name: "Agent",
			channels: { mode: "text", textFallback: true },
		});
		expect(parsed.channels).toEqual({ mode: "text", textFallback: true });
	});

	it("rejects an unknown mode", () => {
		expect(() =>
			agentConfigInput.parse({ name: "Agent", channels: { mode: "carrier-pigeon" } }),
		).toThrow();
	});

	it("passes channels through toGatewayConfig onto the engine config", () => {
		const input = agentConfigInput.parse({
			name: "Agent",
			channels: { mode: "voice", textFallback: false },
		});
		const gateway = toGatewayConfig(input);
		expect(gateway.channels).toEqual({ mode: "voice", textFallback: false });
	});
});

describe("channel-mode helpers", () => {
	it("readChannelMode normalizes an agent config (defaults to both)", () => {
		expect(readChannelMode({ channels: { mode: "voice" } })).toBe("voice");
		expect(readChannelMode({ channels: { mode: "text" } })).toBe("text");
		expect(readChannelMode({ channels: { mode: "both" } })).toBe("both");
		expect(readChannelMode({ channels: {} })).toBe("both");
		expect(readChannelMode(undefined)).toBe("both");
		expect(readChannelMode({ channels: { mode: "nonsense" } })).toBe("both");
	});

	it("readTextFallback reads the flag (defaults false)", () => {
		expect(readTextFallback({ channels: { textFallback: true } })).toBe(true);
		expect(readTextFallback({ channels: { textFallback: false } })).toBe(false);
		expect(readTextFallback(undefined)).toBe(false);
	});

	it("allowedSessionChannels maps mode → channels", () => {
		expect(allowedSessionChannels("both")).toEqual(["voice", "text"]);
		expect(allowedSessionChannels("voice")).toEqual(["voice"]);
		expect(allowedSessionChannels("text")).toEqual(["text"]);
	});

	it("isChannelAllowed gates per mode", () => {
		expect(isChannelAllowed("both", "voice")).toBe(true);
		expect(isChannelAllowed("both", "text")).toBe(true);
		expect(isChannelAllowed("voice", "text")).toBe(false);
		expect(isChannelAllowed("text", "voice")).toBe(false);
	});
});
