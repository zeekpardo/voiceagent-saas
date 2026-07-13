import { channelFromInboundType } from "@repo/api/modules/crm/lib/channels";
import { buildContactState, parseContactTags } from "@repo/api/modules/crm/lib/contact-state";
import {
	isTimestampFresh,
	seenWebhookIds,
	sentMessageIds,
	verifyGhlWebhookSignature,
} from "@repo/api/modules/crm/lib/ghl-webhook";
import { extractInboundContent } from "@repo/api/modules/crm/lib/inbound-content";
import {
	DEBOUNCE_WINDOW_MS,
	inboundDebouncer,
	sleep,
} from "@repo/api/modules/crm/lib/inbound-debounce";
import { resolveInboundAgent } from "@repo/api/modules/crm/lib/omnichannel";
import { AI_OFF_TAG, classifyOptOut, isOptedOut } from "@repo/api/modules/crm/lib/opt-out";
import {
	INTER_MESSAGE_DELAY_MS,
	sendPaced,
	splitOutboundMessages,
} from "@repo/api/modules/crm/lib/outbound-pacing";
import { resolveCrmProvider } from "@repo/api/modules/crm/lib/resolve";
import { readChannelMode } from "@repo/api/modules/voiceagents/lib/channel-mode";
import {
	findOrCreateConversation,
	postConversationMessage,
} from "@repo/api/modules/voiceagents/lib/conversations-client";
import { gatewayFetch } from "@repo/api/modules/voiceagents/lib/gateway";
import type { GatewayAgent } from "@repo/api/modules/voiceagents/lib/schema";
import { findSourceByLocationId, listSourceAgentSources } from "@repo/database";
import { errMessage } from "@repo/utils";

/**
 * The inbound debounce holds the request open for the quiet window (~5s) before
 * dispatching a turn; the turn + paced multi-message send add more. Give the
 * route generous headroom over the platform's default so a coalesced burst never
 * times out mid-turn.
 */
export const maxDuration = 60;

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
	/** Inbound MMS/media: an array of attachment URLs (images, files, …). */
	attachments?: unknown;
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
	if (payload.webhookId && (await seenWebhookIds.add(payload.webhookId))) {
		return ack({ skipped: "duplicate webhookId" });
	}

	// 5) Loop avoidance: skip echoes of messages WE sent.
	if (payload.messageId && (await sentMessageIds.has(payload.messageId))) {
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

	// Inbound MMS/media: an image-only message has an empty body but attachments.
	// Extract a media-aware turn text (placeholder + any caption) so an MMS still
	// produces a sensible, non-empty turn instead of erroring.
	const content = extractInboundContent({
		body: payload.body,
		attachments: payload.attachments,
	});
	const text = content.text;
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

		// 8a) STOP / opt-out compliance (regulatory — runs BEFORE any turn and is
		//     never debounced, so a STOP is honored immediately). On an opt-out
		//     keyword we flag the contact with the `ai off` tag (the existing
		//     opt-out convention) and do NOT reply — the carrier/CRM sends the
		//     compliance confirmation; a second message would double-text. On an
		//     opt-back-in keyword we clear the tag. Both stop here.
		const optOutIntent = classifyOptOut(payload.body ?? "");
		if (optOutIntent === "opt_out") {
			await provider.addContactTags(payload.contactId, [AI_OFF_TAG]).catch((err) => {
				console.error("[ghl-webhook] failed to tag opt-out:", errMessage(err));
			});
			return ack({ handled: true, optedOut: true, replied: false });
		}
		if (optOutIntent === "opt_in") {
			await provider.removeContactTags(payload.contactId, [AI_OFF_TAG]).catch((err) => {
				console.error("[ghl-webhook] failed to clear opt-out:", errMessage(err));
			});
			return ack({ handled: true, optedIn: true, replied: false });
		}

		// 8b) Gate every ordinary inbound: an already-opted-out contact (has the
		//     `ai off` tag) must NOT trigger an agent turn until they opt back in.
		if (isOptedOut(contactTagsCsv)) {
			return ack({ skipped: "contact opted out (ai off)", replied: false });
		}

		// 8c) Debounce rapid bursts: buffer this message under the conversation key,
		//     wait a short quiet window, and only dispatch if no NEWER inbound landed
		//     meanwhile (i.e. THIS handler is the latest). Superseded handlers no-op;
		//     the winner drains the combined buffered text and runs it as ONE turn.
		//     See inbound-debounce.ts for the serverless tradeoff/limits.
		const debounceKey = payload.conversationId;
		const debounceToken = await inboundDebouncer.enqueue(debounceKey, text);
		if (DEBOUNCE_WINDOW_MS > 0) await sleep(DEBOUNCE_WINDOW_MS);
		if (!(await inboundDebouncer.isLatest(debounceKey, debounceToken))) {
			return ack({ handled: true, debounced: true, replied: false });
		}
		const turnText = (await inboundDebouncer.drain(debounceKey)) || text;

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

		// 13) Run one turn on the (possibly coalesced) burst text.
		const turn = await postConversationMessage(conversation.id, turnText);
		const reply = (turn.reply ?? "").trim();
		if (!reply) {
			return ack({ handled: true, agentId, conversationId: conversation.id, replied: false });
		}

		// 14) Send the reply back on the SAME channel. A multi-part reply (blank-line
		//     separated — e.g. an announced-handoff bridge + greeting) goes out as
		//     several messages PACED ~1.2s apart so it reads human and stays ordered;
		//     a single-block reply is one immediate send. Email threads under the
		//     inbound message; subject echoes with a "Re: " prefix.
		const parts = splitOutboundMessages(reply);
		// Capture the (already-guarded) contactId so the send closure keeps its
		// narrowed `string` type.
		const contactId = payload.contactId;
		const emailExtras =
			channel === "email"
				? {
						subject: payload.subject ? ensureRePrefix(payload.subject) : undefined,
						replyToEmailMessageId: payload.emailMessageId,
						threadId: payload.threadId,
					}
				: undefined;
		const sends = await sendPaced(
			parts,
			(part) =>
				provider.sendConversationMessage!({
					contactId,
					channel,
					text: part,
					extras: emailExtras,
				}),
			INTER_MESSAGE_DELAY_MS,
			sleep,
		);

		// 15) Record our messageIds so their echoes (redelivery / OutboundMessage)
		//     are skipped by the loop guard.
		for (const sent of sends) if (sent.messageId) await sentMessageIds.add(sent.messageId);

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
		console.error("[ghl-webhook] inbound handling failed:", errMessage(err));
		return ack({ error: (err as Error).message });
	}
}

/** Prefix "Re: " unless the subject already carries one (case-insensitive). */
function ensureRePrefix(subject: string): string {
	return /^\s*re:/i.test(subject) ? subject : `Re: ${subject}`;
}
