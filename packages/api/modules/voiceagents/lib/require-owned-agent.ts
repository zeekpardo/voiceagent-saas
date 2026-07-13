import { ORPCError } from "@orpc/server";
import { getAgentOrganizationId } from "@repo/database";

import { requireActiveOrganizationId } from "../../sources/lib/org";

/** Verifies the caller's active organization owns agentId, throwing NOT_FOUND otherwise. */
export async function requireOwnedAgent(
	session: { activeOrganizationId?: string | null; userId: string },
	agentId: string,
): Promise<string> {
	const organizationId = await requireActiveOrganizationId(session);
	const owner = await getAgentOrganizationId(agentId);
	if (owner !== organizationId) {
		throw new ORPCError("NOT_FOUND", { message: "Agent not found" });
	}
	return organizationId;
}
