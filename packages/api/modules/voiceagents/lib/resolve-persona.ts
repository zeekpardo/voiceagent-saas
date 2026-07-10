import { getPersona } from "@repo/database";

import type { PersonaPromptInput } from "./persona-prompt";

/**
 * Resolve an (org-scoped) personaId into the fields prompt compilation needs.
 *
 * Returns null when there is no personaId or the persona no longer exists /
 * isn't owned by the org. That is intentional: deleting a persona in use is
 * allowed — the next save/publish simply compiles without it (existing agents
 * keep their last-compiled prompt until they are re-published).
 */
export async function resolvePersona(
	organizationId: string,
	personaId: string | null | undefined,
): Promise<PersonaPromptInput | null> {
	if (!personaId) {
		return null;
	}
	const persona = await getPersona(personaId, organizationId);
	if (!persona) {
		return null;
	}
	return { name: persona.name, styles: persona.styles, howToRespond: persona.howToRespond };
}
