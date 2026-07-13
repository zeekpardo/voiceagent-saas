import { getAgentSource, getSoleEnabledAgentSource } from "@repo/database";

/**
 * Which Source an agent-scoped operation acts on. Shared by everything that
 * has to pick a sub-account for an agent that may be attached to more than
 * one: live CRM tool calls and post-call sync.
 *
 * Rule: an explicit sourceId is honored ONLY when it is an ATTACHED source of
 * this agent (a VoiceAgentSource row exists). This binds a caller-supplied
 * source_id (stamped into call metadata) to the agent that produced the call —
 * the engine gateway is org-agnostic, so without this a forged/mismatched
 * source_id could target another organization's sub-account. When there is no
 * explicit source, an agent with exactly one ENABLED attached Source resolves
 * unambiguously; anything else (zero, or more than one) is ambiguous and must
 * not be guessed, so callers get `null` back and must refuse/skip.
 *
 * `explicitSourceId` is treated as absent when it's an empty string, not just
 * when it's null/undefined.
 */
export async function resolveSourceIdForAgent(params: {
	explicitSourceId?: string | null;
	agentId?: string | null;
}): Promise<string | null> {
	const { explicitSourceId, agentId } = params;
	if (typeof explicitSourceId === "string" && explicitSourceId) {
		// An explicit source must be attached to this agent — never trusted verbatim.
		if (!agentId) return null;
		const attached = await getAgentSource(agentId, explicitSourceId);
		return attached ? explicitSourceId : null;
	}
	if (!agentId) return null;
	const sole = await getSoleEnabledAgentSource(agentId);
	return sole?.sourceId ?? null;
}
