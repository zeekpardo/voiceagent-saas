import { getAgentSource } from "@repo/database";

import { readChannelMode, readTextFallback } from "../../voiceagents/lib/channel-mode";
import { gatewayFetch } from "../../voiceagents/lib/gateway";
import type { GatewayAgent } from "../../voiceagents/lib/schema";
import { buildContactState, parseContactTags } from "./contact-state";
import { normalizePhone } from "./normalize";
import { resolveCrmProvider } from "./resolve";
import { resolveSourceIdForAgent } from "./resolve-source";
import type { CallCompletedEvent } from "./sync";
import { pickTextChannel, startTextConversation } from "./text-conversation";
import { FALLBACK_END_REASONS, shouldTextFallback } from "./text-fallback-rule";

export { shouldTextFallback } from "./text-fallback-rule";

/**
 * Voice-fail → text fallback. When an OUTBOUND voice call fails to connect and
 * the agent opts into it, we continue the SAME workflow as a text conversation
 * so the contact isn't dropped. Runs after CRM sync on the call.completed
 * webhook; fully fail-isolated (the webhook still 200s regardless). The pure
 * trigger gate lives in text-fallback-rule.ts (see shouldTextFallback).
 */

/** Default opener when the engine emits no greeting at conversation create. */
function defaultOpener(greeting: unknown): string {
	const g = typeof greeting === "string" ? greeting.trim() : "";
	if (g) return g;
	return "Hi! We just tried to reach you by phone but couldn’t connect — happy to help right here over text. How can we assist?";
}

export interface TextFallbackResult {
	skipped?: string;
	fallbackStarted?: boolean;
	conversationId?: string;
	channel?: string;
}

/**
 * Resolve the failed call's source + contact, verify the fallback conditions,
 * and start a text conversation continuing the same workflow. Idempotent via
 * the shared text-conversation helper (a stable external_ref dedupes a repeated
 * fallback). Returns a result note; the caller logs it and always 200s.
 */
export async function runTextFallback(event: CallCompletedEvent): Promise<TextFallbackResult> {
	if (!event.agent_id) return { skipped: "no agent_id on event" };
	// Hard rule: NEVER fall back for inbound calls (cheap guard before any IO).
	if (event.direction !== "outbound") return { skipped: "not an outbound call" };
	if (!event.end_reason || !FALLBACK_END_REASONS.has(event.end_reason)) {
		return { skipped: `end reason "${event.end_reason ?? "?"}" is not a connect failure` };
	}

	// Agent config: needs channels.textFallback + mode + greeting.
	const config = await gatewayFetch<GatewayAgent>(
		"GET",
		`/v1/agents/${encodeURIComponent(event.agent_id)}`,
	)
		.then((a) => a.config)
		.catch(() => undefined);
	if (!config) return { skipped: "could not load agent config" };
	if (!readTextFallback(config)) return { skipped: "text fallback disabled" };
	if (readChannelMode(config) === "voice") return { skipped: "agent is voice-only" };

	// Which source triggered the call (explicit metadata.source_id wins).
	const explicit = (event.metadata as { source_id?: string } | undefined)?.source_id;
	const sourceId = await resolveSourceIdForAgent({
		explicitSourceId: explicit,
		agentId: event.agent_id,
	});
	if (!sourceId) return { skipped: "could not resolve the call's source" };

	const mapping = await getAgentSource(event.agent_id, sourceId);
	if (!mapping || !mapping.enabled) return { skipped: "no enabled source mapping" };

	// Gate on the full pure condition (channels enabled etc.).
	if (
		!shouldTextFallback({
			endReason: event.end_reason,
			direction: event.direction,
			config,
			mappingChannels: mapping.channels,
		})
	) {
		return { skipped: "fallback conditions not met" };
	}

	const channel = pickTextChannel(mapping.channels);
	if (!channel) return { skipped: "no text channel enabled on the source" };

	const provider = await resolveCrmProvider(sourceId);
	if (!provider?.sendConversationMessage) {
		return { skipped: "source has no messaging-capable CRM connection" };
	}

	// Resolve the contact: metadata id wins; else match by the dialed number.
	let contactId = (event.metadata as { crm_contact_id?: string } | undefined)?.crm_contact_id;
	if (!contactId) {
		const phone = event.to_number;
		if (!phone || !/\d{7,}/.test(phone.replace(/[^\d]/g, ""))) {
			return { skipped: "no contact id and no dialable number to match" };
		}
		contactId = await provider
			.upsertContactByPhone(normalizePhone(phone))
			.then((c) => c.id)
			.catch(() => undefined);
	}
	if (!contactId) return { skipped: "could not resolve the contact" };

	// Context for the engine (best-effort, mirrors the outbound trigger).
	const account = await provider.getAccountContext().catch(() => ({}) as Record<string, string>);
	const contact = await provider
		.getContactContext(contactId)
		.catch(() => ({}) as Record<string, string>);
	const variables = { ...account, ...contact };
	const contactState = await buildContactState({
		sourceId,
		agentId: event.agent_id,
		contactId,
	}).catch(() => undefined);
	const contactTags = parseContactTags(contact.contact_tags);

	const result = await startTextConversation({
		provider,
		agentId: event.agent_id,
		sourceId,
		contactId,
		channel,
		// Stable per contact+source → a second failed call dedupes to one thread.
		externalRef: `voicefail:${sourceId}:${contactId}`,
		openerFallback: defaultOpener((config as { greeting?: unknown }).greeting),
		variables,
		contactState,
		...(contactTags ? { contactTags } : {}),
		metadata: { source: "voice_fail_fallback" },
	});

	if (result.skipped) return { skipped: result.skipped };
	if (!result.created) return { skipped: "fallback conversation already exists" };
	return { fallbackStarted: true, conversationId: result.conversationId, channel };
}
