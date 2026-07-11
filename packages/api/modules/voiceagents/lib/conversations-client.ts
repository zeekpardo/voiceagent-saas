import { gatewayFetch } from "./gateway";

/**
 * Thin client for the ENGINE's turn-based conversation API — the text-channel
 * analogue of the outbound-call dispatch. The SaaS owns all channel/CRM shaping
 * (see the omni-channel webhook); the engine only runs generic conversation
 * turns.
 *
 * Contract (as specified for the in-flight engine branch — if it drifts, only
 * this file changes):
 *   POST /v1/conversations                       → create (+ optional greeting)
 *   GET  /v1/conversations?external_ref=…         → resolve an existing one
 *   POST /v1/conversations/:id/messages { text } → run one turn
 */

export interface EngineConversation {
	id: string;
	external_ref?: string;
	group_ref?: string;
	status?: string;
	/** A greeting reply the engine may emit at creation time. */
	reply?: string;
	ended?: boolean;
	node_id?: string;
}

export interface EngineTurnResult {
	reply?: string;
	status?: string;
	node_id?: string;
	ended?: boolean;
}

export interface CreateConversationInput {
	agentId: string;
	/** Stable external key for find-or-create (we pass the CRM conversationId). */
	externalRef?: string;
	/** Groups related conversations (we pass the sourceId). */
	groupRef?: string;
	variables?: Record<string, string>;
	contactState?: unknown;
	contactTags?: string[];
	metadata?: Record<string, unknown>;
}

/** Create a conversation on the engine. */
export async function createConversation(
	input: CreateConversationInput,
): Promise<EngineConversation> {
	return gatewayFetch<EngineConversation>("POST", "/v1/conversations", {
		agent_id: input.agentId,
		...(input.externalRef ? { external_ref: input.externalRef } : {}),
		...(input.groupRef ? { group_ref: input.groupRef } : {}),
		...(input.variables ? { variables: input.variables } : {}),
		...(input.contactState ? { contactState: input.contactState } : {}),
		...(input.contactTags ? { contactTags: input.contactTags } : {}),
		...(input.metadata ? { metadata: input.metadata } : {}),
	});
}

/**
 * Resolve an existing conversation by external ref, or null when none exists.
 * The engine returns a list; we take the first match.
 */
export async function findConversationByExternalRef(
	externalRef: string,
): Promise<EngineConversation | null> {
	const res = await gatewayFetch<{ conversations?: EngineConversation[] } | EngineConversation[]>(
		"GET",
		`/v1/conversations?external_ref=${encodeURIComponent(externalRef)}`,
	);
	const list = Array.isArray(res) ? res : (res.conversations ?? []);
	return list[0] ?? null;
}

/**
 * Find-or-create by external ref. Prefers an existing conversation (so a live
 * thread keeps its state) and falls back to creating one, which may carry a
 * greeting reply.
 */
export async function findOrCreateConversation(
	input: CreateConversationInput & { externalRef: string },
): Promise<{ conversation: EngineConversation; created: boolean }> {
	const existing = await findConversationByExternalRef(input.externalRef);
	if (existing) return { conversation: existing, created: false };
	const conversation = await createConversation(input);
	return { conversation, created: true };
}

/** Run one conversation turn; returns the agent's reply and end/routing state. */
export async function postConversationMessage(
	conversationId: string,
	text: string,
): Promise<EngineTurnResult> {
	return gatewayFetch<EngineTurnResult>(
		"POST",
		`/v1/conversations/${encodeURIComponent(conversationId)}/messages`,
		{ text },
	);
}
