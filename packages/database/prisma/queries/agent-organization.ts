import { db } from "../client";

// ---------------------------------------------------------------- agent <-> organization ownership

export async function getAgentOrganizationId(agentId: string) {
	const row = await db.agentOrganization.findUnique({ where: { agentId } });
	return row?.organizationId ?? null;
}

export async function listOrganizationAgentIds(organizationId: string) {
	const rows = await db.agentOrganization.findMany({
		where: { organizationId },
		select: { agentId: true },
	});
	return rows.map((r) => r.agentId);
}

export async function assignAgentToOrganization(agentId: string, organizationId: string) {
	return db.agentOrganization.upsert({
		where: { agentId },
		create: { agentId, organizationId },
		update: { organizationId },
	});
}

export async function deleteAgentOrganization(agentId: string) {
	return db.agentOrganization.deleteMany({ where: { agentId } });
}
