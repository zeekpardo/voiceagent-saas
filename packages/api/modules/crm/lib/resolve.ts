import { getSourceById, updateSourceConfig } from "@repo/database";

import type { CrmProvider } from "./provider";
import { getCrmRegistration } from "./registry";
// Importing provider modules registers them (side effect) — the one line to
// add per future CRM (hubspot.ts, pipedrive.ts, …).
import "./providers/gohighlevel";

/** Resolve a Source as a live CRM provider, or null. Internal — callers that
 * take a sourceId from user input must verify org ownership first. */
export async function resolveCrmProvider(sourceId: string): Promise<CrmProvider | null> {
	const source = await getSourceById(sourceId);
	if (!source) return null;
	const registration = getCrmRegistration(source.providerType);
	if (!registration) return null;
	return registration.create(source.config as Record<string, string>, {
		// Rotated OAuth tokens survive the request.
		persist: async (config) => {
			await updateSourceConfig(sourceId, config);
		},
	});
}

export { getCrmRegistration, listCrmProviders, registerCrmProvider } from "./registry";
