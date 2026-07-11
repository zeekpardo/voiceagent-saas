import { db } from "../client";

// ---------------------------------------------------------------- sources (org-scoped CRM connections)

export async function listSources(organizationId: string) {
	return db.source.findMany({
		where: { organizationId },
		include: { _count: { select: { agentSources: true } } },
		orderBy: { createdAt: "desc" },
	});
}

export async function getSource(id: string, organizationId: string) {
	return db.source.findFirst({ where: { id, organizationId } });
}

/** Unscoped internal lookup — for system flows (sync, live-tools) that already hold a trusted sourceId. */
export async function getSourceById(id: string) {
	return db.source.findUnique({ where: { id } });
}

export async function findSourceByLocation(organizationId: string, locationId: string) {
	const sources = await db.source.findMany({ where: { organizationId } });
	return (
		sources.find((s) => (s.config as Record<string, unknown>)?.locationId === locationId) ?? null
	);
}

export async function createSource(data: {
	organizationId: string;
	name: string;
	providerType: string;
	accountName?: string | null;
	address?: string | null;
	config: Record<string, string>;
}) {
	return db.source.create({ data });
}

export async function updateSourceConfig(id: string, config: Record<string, string>) {
	return db.source.update({ where: { id }, data: { config } });
}

export async function disconnectSource(id: string, organizationId: string) {
	return db.source.deleteMany({ where: { id, organizationId } });
}

// ---------------------------------------------------------------- source phone numbers (SaaS-owned number↔source mapping)

export async function listSourcePhoneNumbers(sourceId: string) {
	return db.sourcePhoneNumber.findMany({
		where: { sourceId },
		orderBy: { createdAt: "desc" },
	});
}

export async function getSourcePhoneNumber(id: string, sourceId: string) {
	return db.sourcePhoneNumber.findFirst({ where: { id, sourceId } });
}

export async function createSourcePhoneNumber(data: {
	sourceId: string;
	e164: string;
	providerRef?: string | null;
	label?: string | null;
	inboundAgentId?: string | null;
}) {
	return db.sourcePhoneNumber.create({ data });
}

export async function deleteSourcePhoneNumber(id: string, sourceId: string) {
	return db.sourcePhoneNumber.deleteMany({ where: { id, sourceId } });
}

// ---------------------------------------------------------------- agent <-> source attachments

export async function listAgentSources(agentId: string) {
	return db.voiceAgentSource.findMany({
		where: { agentId },
		include: { source: true },
		orderBy: { createdAt: "asc" },
	});
}

export async function listSourceAgentIds(sourceId: string) {
	return db.voiceAgentSource.findMany({ where: { sourceId }, select: { agentId: true } });
}

export async function getAgentSource(agentId: string, sourceId: string) {
	return db.voiceAgentSource.findUnique({
		where: { agentId_sourceId: { agentId, sourceId } },
		include: { source: true },
	});
}

/** When a call/tool-invocation carries no explicit sourceId, an agent with exactly
 * one enabled attached Source can still be resolved unambiguously. Returns null
 * when there's zero or more than one — ambiguous cases must not guess. */
export async function getSoleEnabledAgentSource(agentId: string) {
	const rows = await db.voiceAgentSource.findMany({
		where: { agentId, enabled: true },
		include: { source: true },
	});
	return rows.length === 1 ? rows[0] : null;
}

export async function attachSource(data: { agentId: string; sourceId: string }) {
	return db.voiceAgentSource.upsert({
		where: { agentId_sourceId: { agentId: data.agentId, sourceId: data.sourceId } },
		create: data,
		update: { enabled: true },
	});
}

export async function detachSource(agentId: string, sourceId: string) {
	return db.voiceAgentSource.deleteMany({ where: { agentId, sourceId } });
}

export async function deleteAgentSources(agentId: string) {
	return db.voiceAgentSource.deleteMany({ where: { agentId } });
}

export async function saveAgentSourceMapping(data: {
	agentId: string;
	sourceId: string;
	enabled?: boolean;
	fieldMappings: unknown;
	tagFilters?: unknown;
	tagRules: unknown;
	stageRules: unknown;
	writeNote: boolean;
	/** Omit (undefined) to leave untouched; null clears. */
	bookingCalendarId?: string | null;
	bookingCalendarName?: string | null;
}) {
	const { agentId, sourceId, tagFilters, ...rest } = data;
	const jsonFields = {
		fieldMappings: rest.fieldMappings as object[],
		tagRules: rest.tagRules as object[],
		stageRules: rest.stageRules as object[],
		...(tagFilters !== undefined ? { tagFilters: tagFilters as object[] } : {}),
	};
	return db.voiceAgentSource.upsert({
		where: { agentId_sourceId: { agentId, sourceId } },
		create: { agentId, sourceId, ...rest, ...jsonFields },
		update: { ...rest, ...jsonFields },
	});
}

// ---------------------------------------------------------------- live CRM tools (global names, per-call source resolution)

export async function getCrmLiveToolByName(name: string) {
	return db.crmLiveTool.findUnique({ where: { name } });
}

export async function upsertCrmLiveTool(data: {
	userId: string;
	name: string;
	toolId: string;
	secret: string;
}) {
	return db.crmLiveTool.upsert({
		where: { name: data.name },
		create: data,
		update: { userId: data.userId, toolId: data.toolId, secret: data.secret },
	});
}

export async function getCrmLiveTools() {
	return db.crmLiveTool.findMany({ orderBy: { createdAt: "asc" } });
}
