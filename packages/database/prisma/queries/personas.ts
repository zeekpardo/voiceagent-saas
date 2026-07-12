import { db } from "../client";

// ---------------------------------------------------------------- personas (org-scoped identity/tone layer)

export async function listPersonas(organizationId: string) {
	return db.persona.findMany({
		where: { organizationId },
		orderBy: { createdAt: "desc" },
	});
}

export async function getPersona(id: string, organizationId: string) {
	return db.persona.findFirst({ where: { id, organizationId } });
}

/** Unscoped internal lookup — for trusted server flows that already hold a personaId. */
export async function getPersonaById(id: string) {
	return db.persona.findUnique({ where: { id } });
}

export async function createPersona(data: {
	organizationId: string;
	name: string;
	internalDescription?: string | null;
	avatarUrl?: string | null;
	themeColor?: string | null;
	styles?: string[];
	howToRespond?: string;
	guardrails?: string | null;
	ttsVoice?: string | null;
	llmModel?: string | null;
}) {
	return db.persona.create({ data });
}

export async function updatePersona(
	id: string,
	organizationId: string,
	data: {
		name?: string;
		internalDescription?: string | null;
		avatarUrl?: string | null;
		themeColor?: string | null;
		styles?: string[];
		howToRespond?: string;
		guardrails?: string | null;
		ttsVoice?: string | null;
		llmModel?: string | null;
	},
) {
	// Scope the write to the owning org: updateMany returns count, never leaks rows.
	const result = await db.persona.updateMany({ where: { id, organizationId }, data });
	if (result.count === 0) {
		return null;
	}
	return db.persona.findUnique({ where: { id } });
}

export async function deletePersona(id: string, organizationId: string) {
	return db.persona.deleteMany({ where: { id, organizationId } });
}
