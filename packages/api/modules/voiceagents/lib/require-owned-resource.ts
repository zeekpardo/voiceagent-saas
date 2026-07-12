import { ORPCError } from "@orpc/server";
import { getAgentOrganizationId } from "@repo/database";

import { requireActiveOrganizationId } from "../../sources/lib/org";
import { gatewayFetch } from "./gateway";

/**
 * Tenant isolation for gateway-backed resources keyed by their own id (calls,
 * text conversations). The engine gateway is org-agnostic — every agent lives
 * under one project — so we resolve the resource's owning agent and check it
 * belongs to the caller's active organization (agent_organization ownership),
 * throwing NOT_FOUND otherwise. Mirrors requireOwnedAgent, which guards
 * resources keyed directly by agent id.
 */
async function assertOwnedAgent(
	session: { activeOrganizationId?: string | null },
	agentId: string,
	notFoundMessage: string,
): Promise<void> {
	const organizationId = requireActiveOrganizationId(session);
	const owner = await getAgentOrganizationId(agentId);
	if (owner !== organizationId) {
		throw new ORPCError("NOT_FOUND", { message: notFoundMessage });
	}
}

/** Throws NOT_FOUND unless the caller's active org owns the agent behind `callId`. */
export async function requireOwnedCall(
	session: { activeOrganizationId?: string | null },
	callId: string,
): Promise<void> {
	const call = await gatewayFetch<{ agent_id: string }>(
		"GET",
		`/v1/calls/${encodeURIComponent(callId)}`,
	);
	await assertOwnedAgent(session, call.agent_id, "Call not found");
}

/** Throws NOT_FOUND unless the caller's active org owns the agent behind `conversationId`. */
export async function requireOwnedConversation(
	session: { activeOrganizationId?: string | null },
	conversationId: string,
): Promise<void> {
	const conversation = await gatewayFetch<{ agent_id: string }>(
		"GET",
		`/v1/conversations/${encodeURIComponent(conversationId)}`,
	);
	await assertOwnedAgent(session, conversation.agent_id, "Conversation not found");
}
