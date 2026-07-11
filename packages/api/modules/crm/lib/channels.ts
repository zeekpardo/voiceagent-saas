/**
 * Neutral messaging-channel vocabulary for omni-channel agent conversations.
 *
 * The rest of the SaaS speaks these lowercase channel keys; only the GHL
 * provider knows the vendor's enums. Two boundaries need mapping:
 *  - INBOUND: the GHL InboundMessage webhook's `messageType` (note it uses
 *    "Live Chat" with a SPACE, unlike the send enum "Live_Chat") → neutral key.
 *  - OUTBOUND: neutral key → the GHL `POST /conversations/messages` `type` enum.
 *
 * Keep this vendor-neutral list stable — the chips UI, the per-source channel
 * config, and agent resolution all key off it.
 */

/** The channels an agent can monitor / reply on. */
export const MESSAGE_CHANNELS = [
	"sms",
	"email",
	"whatsapp",
	"ig",
	"fb",
	"live_chat",
	"gmb",
	"custom",
] as const;

export type MessageChannel = (typeof MESSAGE_CHANNELS)[number];

/** Type guard for an arbitrary string being a known neutral channel. */
export function isMessageChannel(value: unknown): value is MessageChannel {
	return typeof value === "string" && (MESSAGE_CHANNELS as readonly string[]).includes(value);
}

/** Human labels for the chips UI, in display order. */
export const MESSAGE_CHANNEL_LABELS: Record<MessageChannel, string> = {
	sms: "SMS",
	fb: "Facebook",
	ig: "Instagram",
	email: "Email",
	whatsapp: "WhatsApp",
	gmb: "Google Business",
	live_chat: "Live Chat",
	custom: "Custom",
};

/**
 * GHL InboundMessage webhook `messageType` → neutral channel. The webhook uses
 * space-and-mixed-case forms ("Live Chat", "SMS", "Email", …); we normalize
 * case/spaces/underscores so "Live Chat", "live_chat" and "LIVE_CHAT" all land
 * on `live_chat`. Returns null for channels we don't converse over (Call, etc.).
 */
export function channelFromInboundType(
	messageType: string | undefined | null,
): MessageChannel | null {
	if (!messageType) return null;
	const key = messageType
		.trim()
		.toLowerCase()
		.replace(/[\s-]+/g, "_");
	const map: Record<string, MessageChannel> = {
		sms: "sms",
		email: "email",
		whatsapp: "whatsapp",
		ig: "ig",
		instagram: "ig",
		fb: "fb",
		facebook: "fb",
		live_chat: "live_chat",
		livechat: "live_chat",
		gmb: "gmb",
		custom: "custom",
	};
	return map[key] ?? null;
}

/** GHL send `type` enum values, per the Conversations API. */
export type GhlSendType =
	| "SMS"
	| "Email"
	| "WhatsApp"
	| "IG"
	| "FB"
	| "Custom"
	| "Live_Chat"
	| "GMB";

/** Neutral channel → GHL `POST /conversations/messages` `type`. */
export const CHANNEL_TO_GHL_SEND_TYPE: Record<MessageChannel, GhlSendType> = {
	sms: "SMS",
	email: "Email",
	whatsapp: "WhatsApp",
	ig: "IG",
	fb: "FB",
	live_chat: "Live_Chat",
	gmb: "GMB",
	custom: "Custom",
};
