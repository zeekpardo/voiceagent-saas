import { findOrCreateConversation } from "../../voiceagents/lib/conversations-client";
import { isMessageChannel, type MessageChannel } from "./channels";
import type { CrmProvider } from "./provider";

/**
 * Shared "start a text conversation for a contact" pipeline, used by both the
 * text-only CRM trigger path and the voice-fail → text fallback consumer. The
 * SaaS owns all channel/CRM shaping (the engine only runs generic conversation
 * turns), so both entry points funnel through here.
 *
 * Idempotency: the caller supplies a STABLE `externalRef` (per contact+source),
 * so find-or-create dedupes — a repeated trigger or a double-fallback resolves
 * to the same engine conversation and we only send the opener on first create.
 */

/**
 * Which text channel to open on: prefer SMS when the source enables it, else the
 * first configured text channel. Returns null when the source has no text
 * channel enabled (caller should skip — there's nowhere to send).
 */
export function pickTextChannel(channels: unknown): MessageChannel | null {
	const list = Array.isArray(channels) ? channels.filter(isMessageChannel) : [];
	if (list.includes("sms")) return "sms";
	return list[0] ?? null;
}

export interface StartTextConversationInput {
	provider: CrmProvider;
	agentId: string;
	sourceId: string;
	contactId: string;
	/** The resolved send channel (see pickTextChannel). */
	channel: MessageChannel;
	/** Stable find-or-create key (per contact+source) — drives idempotency. */
	externalRef: string;
	/** Opener used when the engine returns no greeting reply at create time. */
	openerFallback: string;
	variables?: Record<string, string>;
	contactState?: unknown;
	contactTags?: string[];
	/** Extra metadata merged onto the engine conversation (e.g. `source`). */
	metadata?: Record<string, unknown>;
}

export interface StartTextConversationResult {
	conversationId: string;
	created: boolean;
	/** True only when a fresh conversation was created and the opener was sent. */
	sent: boolean;
	opener?: string;
	skipped?: string;
}

export async function startTextConversation(
	input: StartTextConversationInput,
): Promise<StartTextConversationResult> {
	if (!input.provider.sendConversationMessage) {
		return {
			conversationId: "",
			created: false,
			sent: false,
			skipped: "provider cannot send text",
		};
	}

	const { conversation, created } = await findOrCreateConversation({
		agentId: input.agentId,
		externalRef: input.externalRef,
		// Attribution: group related conversations under the source (matches usage).
		groupRef: input.sourceId,
		...(input.variables ? { variables: input.variables } : {}),
		...(input.contactState ? { contactState: input.contactState } : {}),
		...(input.contactTags ? { contactTags: input.contactTags } : {}),
		metadata: {
			source_id: input.sourceId,
			channel: input.channel,
			crm_contact_id: input.contactId,
			...input.metadata,
		},
	});

	// Existing thread → the contact already has a live fallback/text conversation;
	// don't send a second opener (this is the double-fallback / re-trigger guard).
	if (!created) {
		return { conversationId: conversation.id, created: false, sent: false };
	}

	const opener = (conversation.reply ?? "").trim() || input.openerFallback;
	await input.provider.sendConversationMessage({
		contactId: input.contactId,
		channel: input.channel,
		text: opener,
	});
	return { conversationId: conversation.id, created: true, sent: true, opener };
}
