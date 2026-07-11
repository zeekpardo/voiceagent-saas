import { getSourceById, updateSourceConfig } from "@repo/database";

import { openSourceConfig, sealSourceConfig } from "../../sources/lib/config-crypto";
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
	// Decrypt the secret fields (accessToken/refreshToken) before handing the
	// config to the provider; re-encrypt on persist when tokens rotate.
	return registration.create(openSourceConfig(source.config as Record<string, string>), {
		// Rotated OAuth tokens survive the request.
		persist: async (config) => {
			await updateSourceConfig(sourceId, sealSourceConfig(config));
		},
	});
}

export { getCrmRegistration, listCrmProviders, registerCrmProvider } from "./registry";
