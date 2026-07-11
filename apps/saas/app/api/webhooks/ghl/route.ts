import { channelFromInboundType } from "@repo/api/modules/crm/lib/channels";
import { buildContactState, parseContactTags } from "@repo/api/modules/crm/lib/contact-state";
import {
	isTimestampFresh,
	seenWebhookIds,
	sentMessageIds,
	verifyGhlWebhookSignature,
} from "@repo/api/modules/crm/lib/ghl-webhook";
import { resolveInboundAgent } from "@repo/api/modules/crm/lib/omnichannel";
import { resolveCrmProvider } from "@repo/api/modules/crm/lib/resolve";
import { readChannelMode } from "@repo/api/modules/voiceagents/lib/channel-mode";
import {
	findOrCreateConversation,
	postConversationMessage,
} from "@repo/api/modules/voiceagents/lib/conversations-client";
import { gatewayFetch } from "@repo/api/modules/voiceagents/lib/gateway";
import type { GatewayAgent } from "@repo/api/modules/voiceagents/lib/schema";
import { findSourceByLocationId, listSourceAgentSources } from "@repo/database";

/**
 * GoHighLevel marketplace InboundMessage webhook (app-level — configured ONCE
 * on the marketplace app, fires for ALL installed locations; we route by
 * payload.locationId). Verified against GHL's published public key over the RAW
 * body.
 *
 * Pipeline: verify signature → drop replays (stale timestamp) + duplicates
 * (webhookId) + our own echoes (messageId) → keep only inbound InboundMessage →
 * resolve Source by locationId → pick the agent whose channel chips + tag
 * filters match → find-or-create the engine conversation → run one turn → send
 * the reply back on the SAME channel.
 *
 * Failure isolation: after a valid signature, EVERY downstream error 200s with
 * `received: true` + an error note. A non-2xx makes GHL retry with backoff, and
 * a CRM/engine hiccup must not trigger a retry storm.
 *
 * This static route wins over the /api/[[...rest]] catch-all.
 */

interface InboundMessagePayload {
	type?: string;
	locationId?: string;
	contactId?: string;
	conversationId?: string;
	messageId?: string;
	messageType?: string;
	body?: string;
	direction?: string;
	dateAdded?: string;
	timestamp?: string | number;
	webhookId?: string;
	// Email extras:
	emailMessageId?: string;
	threadId?: string;
	subject?: string;
	[key: string]: unknown;
}

function ack(extra: Record<string, unknown> = {}): Response {
	return Response.json({ received: true, ...extra });
}

export async function POST(req: Request): Promise<Response> {
	const raw = await req.text();

	// 1) Signature over the RAW body — reject (401) on failure so a genuinely
	//    unsigned/forged request is refused (GHL will not retry a 401 forever).
	if (!verifyGhlWebhookSignature(raw, req.headers.get("x-wh-signature"))) {
		return Response.json({ error: "invalid signature" }, { status: 401 });
	}

	let payload: InboundMessagePayload;
	try {
		payload = JSON.parse(raw) as InboundMessagePayload;
	} catch {
		return ack({ skipped: "unparseable body" });
	}

	// 2) Only inbound InboundMessage events drive a turn (loop avoidance: ignore
	//    OutboundMessage and any non-inbound direction).
	if (payload.type !== "InboundMessage" || payload.direction !== "inbound") {
		return ack({ skipped: "not an inbound message" });
	}

	// 3) Replay guard: stale events are dropped.
	if (!isTimestampFresh(payload.timestamp ?? payload.dateAdded)) {
		return ack({ skipped: "stale timestamp" });
	}

	// 4) De-dupe redelivered webhooks.
	if (payload.webhookId && seenWebhookIds.add(payload.webhookId)) {
		return ack({ skipped: "duplicate webhookId" });
	}

	// 5) Loop avoidance: skip echoes of messages WE sent.
	if (payload.messageId && sentMessageIds.has(payload.messageId)) {
		return ack({ skipped: "own message echo" });
	}

	// 6) Normalize the channel; skip kinds we don't converse over (Call, …).
	const channel = channelFromInboundType(payload.messageType);
	if (!channel) {
		return ack({ skipped: `unsupported channel: ${payload.messageType ?? "unknown"}` });
	}

	if (!payload.locationId || !payload.contactId || !payload.conversationId) {
		return ack({ skipped: "missing locationId/contactId/conversationId" });
	}
	const text = (payload.body ?? "").trim();
	if (!text) {
		return ack({ skipped: "empty message body" });
	}

	try {
		// 7) Resolve the Source for this location (app-level webhook → global
		//    lookup by locationId).
		const source = await findSourceByLocationId(payload.locationId);
		if (!source) {
			return ack({ skipped: `no source for location ${payload.locationId}` });
		}

		const provider = await resolveCrmProvider(source.id);
		if (!provider?.sendConversationMessage) {
			return ack({ skipped: "source has no messaging-capable CRM connection" });
		}

		// 8) Contact context (also yields tags for the filter gate) — best-effort.
		const contactContext = await provider
			.getContactContext(payload.contactId)
			.catch(() => ({}) as Record<string, string>);
		const contactTagsCsv = contactContext.contact_tags;

		// 9) Pick the ONE agent monitoring this channel on this source whose tag
		//    filters the contact passes. Resolve each candidate's channel-mode
		//    (best-effort) so voice-only agents are skipped by resolveInboundAgent.
		const rows = await listSourceAgentSources(source.id);
		const modeByAgent = new Map(
			await Promise.all(
				rows.map(async (r): Promise<[string, "voice" | "text" | "both"]> => {
					const config = await gatewayFetch<GatewayAgent>(
						"GET",
						`/v1/agents/${encodeURIComponent(r.agentId)}`,
					)
						.then((a) => a.config)
						.catch(() => undefined);
					return [r.agentId, readChannelMode(config)];
				}),
			),
		);
		const match = resolveInboundAgent({
			rows: rows.map((r) => ({
				agentId: r.agentId,
				enabled: r.enabled,
				channels: r.channels,
				tagFilters: r.tagFilters,
				mode: modeByAgent.get(r.agentId),
			})),
			channel,
			contactTagsCsv,
		});
		if (!match) {
			return ack({ skipped: `no agent monitors ${channel} on this source` });
		}
		const agentId = match.agentId;

		// 10) Variables + known-contact snapshot for the engine (mirrors the
		//     outbound trigger). All best-effort — never blocks the turn.
		const account = await provider.getAccountContext().catch(() => ({}) as Record<string, string>);
		const variables = { ...account, ...contactContext };
		const contactState = await buildContactState({
			sourceId: source.id,
			agentId,
			contactId: payload.contactId,
		}).catch(() => undefined);
		const contactTags = parseContactTags(contactTagsCsv);

		// 11) Find-or-create the engine conversation (external_ref pins it to the
		//     GHL conversation so the thread keeps its state across messages).
		const { conversation } = await findOrCreateConversation({
			agentId,
			externalRef: payload.conversationId,
			groupRef: source.id,
			variables,
			contactState,
			contactTags,
			metadata: {
				source: "ghl_conversation",
				source_id: source.id,
				channel,
				location_id: payload.locationId,
				crm_contact_id: payload.contactId,
			},
		});

		// 12) Live-chat typing indicator — best-effort, non-blocking.
		if (channel === "live_chat") {
			void provider
				.sendTypingIndicator?.({ conversationId: payload.conversationId, isTyping: true })
				.catch(() => {});
		}

		// 13) Run one turn.
		const turn = await postConversationMessage(conversation.id, text);
		const reply = (turn.reply ?? "").trim();
		if (!reply) {
			return ack({ handled: true, agentId, conversationId: conversation.id, replied: false });
		}

		// 14) Send the reply back on the SAME channel. Email threads under the
		//     inbound message; subject echoes with a "Re: " prefix.
		const sent = await provider.sendConversationMessage({
			contactId: payload.contactId,
			channel,
			text: reply,
			extras:
				channel === "email"
					? {
							subject: payload.subject ? ensureRePrefix(payload.subject) : undefined,
							replyToEmailMessageId: payload.emailMessageId,
							threadId: payload.threadId,
						}
					: undefined,
		});

		// 15) Record our messageId so its echo (redelivery / OutboundMessage) is
		//     skipped by the loop guard.
		if (sent.messageId) sentMessageIds.add(sent.messageId);

		return ack({
			handled: true,
			agentId,
			conversationId: conversation.id,
			channel,
			replied: true,
			ended: turn.ended ?? false,
		});
	} catch (err) {
		// Never make GHL retry on our own downstream failure — log and 200.
		console.error("[ghl-webhook] inbound handling failed:", err);
		return ack({ error: (err as Error).message });
	}
}

/** Prefix "Re: " unless the subject already carries one (case-insensitive). */
function ensureRePrefix(subject: string): string {
	return /^\s*re:/i.test(subject) ? subject : `Re: ${subject}`;
}
