import { describe, expect, it } from "vitest";

import {
	CHANNEL_TO_GHL_SEND_TYPE,
	channelFromInboundType,
	isMessageChannel,
	MESSAGE_CHANNELS,
} from "./channels";

describe("channelFromInboundType", () => {
	it("maps the GHL webhook messageTypes to neutral channels", () => {
		expect(channelFromInboundType("SMS")).toBe("sms");
		expect(channelFromInboundType("Email")).toBe("email");
		expect(channelFromInboundType("WhatsApp")).toBe("whatsapp");
		expect(channelFromInboundType("IG")).toBe("ig");
		expect(channelFromInboundType("FB")).toBe("fb");
		expect(channelFromInboundType("GMB")).toBe("gmb");
		expect(channelFromInboundType("Custom")).toBe("custom");
	});

	it("normalizes the space form 'Live Chat' (webhook) to live_chat", () => {
		expect(channelFromInboundType("Live Chat")).toBe("live_chat");
		expect(channelFromInboundType("live_chat")).toBe("live_chat");
		expect(channelFromInboundType("LIVE CHAT")).toBe("live_chat");
	});

	it("accepts long-form aliases", () => {
		expect(channelFromInboundType("Instagram")).toBe("ig");
		expect(channelFromInboundType("Facebook")).toBe("fb");
	});

	it("returns null for channels we don't converse over or unknowns", () => {
		expect(channelFromInboundType("Call")).toBeNull();
		expect(channelFromInboundType("")).toBeNull();
		expect(channelFromInboundType(undefined)).toBeNull();
		expect(channelFromInboundType("Carrier Pigeon")).toBeNull();
	});
});

describe("CHANNEL_TO_GHL_SEND_TYPE", () => {
	it("round-trips inbound → neutral → GHL send type (Live Chat casing differs)", () => {
		expect(CHANNEL_TO_GHL_SEND_TYPE.live_chat).toBe("Live_Chat");
		expect(CHANNEL_TO_GHL_SEND_TYPE.sms).toBe("SMS");
		expect(CHANNEL_TO_GHL_SEND_TYPE.whatsapp).toBe("WhatsApp");
	});

	it("has a send type for every neutral channel", () => {
		for (const channel of MESSAGE_CHANNELS) {
			expect(CHANNEL_TO_GHL_SEND_TYPE[channel]).toBeTruthy();
		}
	});
});

describe("isMessageChannel", () => {
	it("guards known keys only", () => {
		expect(isMessageChannel("sms")).toBe(true);
		expect(isMessageChannel("email")).toBe(true);
		expect(isMessageChannel("Live Chat")).toBe(false);
		expect(isMessageChannel(42)).toBe(false);
	});
});
