import { db } from "../client";

// ---------------------------------------------------------------- tool <-> organization ownership

export async function getToolOrganizationId(toolId: string) {
	const row = await db.toolOrganization.findUnique({ where: { toolId } });
	return row?.organizationId ?? null;
}

export async function listOrganizationToolIds(organizationId: string) {
	const rows = await db.toolOrganization.findMany({
		where: { organizationId },
		select: { toolId: true },
	});
	return rows.map((r) => r.toolId);
}

export async function assignToolToOrganization(toolId: string, organizationId: string) {
	return db.toolOrganization.upsert({
		where: { toolId },
		create: { toolId, organizationId },
		update: { organizationId },
	});
}

export async function deleteToolOrganization(toolId: string) {
	return db.toolOrganization.deleteMany({ where: { toolId } });
}
