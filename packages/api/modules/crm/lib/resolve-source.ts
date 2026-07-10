import { getSoleEnabledAgentSource } from "@repo/database";

/**
 * Which Source an agent-scoped operation acts on. Shared by everything that
 * has to pick a sub-account for an agent that may be attached to more than
 * one: live CRM tool calls, post-call sync, and the inbox's contact matcher.
 *
 * Rule: an explicit sourceId always wins (stamped at call creation, passed
 * by a caller that already knows which Source it means). Otherwise, an
 * agent with exactly one ENABLED attached Source resolves unambiguously —
 * anything else (zero, or more than one) is ambiguous and must not be
 * guessed; acting on the wrong sub-account would bleed data across
 * locations, so callers get `null` back and must refuse/skip rather than
 * pick one.
 *
 * `explicitSourceId` is treated as absent when it's an empty string, not
 * just when it's null/undefined — a caller that forwards `""` (e.g. an
 * unset form field) means "no explicit source", not "source is the empty
 * string".
 */
export async function resolveSourceIdForAgent(params: {
	explicitSourceId?: string | null;
	agentId?: string | null;
}): Promise<string | null> {
	const { explicitSourceId, agentId } = params;
	if (typeof explicitSourceId === "string" && explicitSourceId) return explicitSourceId;
	if (!agentId) return null;
	const sole = await getSoleEnabledAgentSource(agentId);
	return sole?.sourceId ?? null;
}
