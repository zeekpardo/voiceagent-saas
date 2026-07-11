import { listSources } from "@repo/database";
import z from "zod";

import { protectedProcedure } from "../../../orpc/procedures";
import {
	type ContactFieldOption,
	customValueFieldOptions,
	dedupeFieldOptions,
	listContactFields,
	locationFieldOptions,
	standardContactFieldOptions,
} from "../../crm/lib/field-mapping";
import { resolveCrmProvider } from "../../crm/lib/resolve";
import { resolveSourceIdForAgent } from "../../crm/lib/resolve-source";
import { requireActiveOrganizationId } from "../../sources/lib/org";
import { requireOwnedAgent } from "../lib/require-owned-agent";

/**
 * THE single source of truth for the builder's field dropdowns: every contact
 * field (standard catalog + this sub-account's CRM custom fields) plus the fixed
 * LOCATION catalog, CloseBot-style. One procedure so nothing drifts between the
 * flow editors, mappings, mentions, and set-field pickers.
 *
 * Source resolution: an explicit agent resolves to its sole enabled Source
 * (resolveSourceIdForAgent); otherwise the org's first connected Source. When no
 * Source resolves — or the CRM errors — we still return the standard contact
 * catalog and the location catalog (never a 500). Ordering: contact standard →
 * contact custom → location.
 */

/** Contact fields for a resolved source, failure-isolated to standard-only. */
async function contactFieldsForSource(sourceId: string | null): Promise<ContactFieldOption[]> {
	if (!sourceId) return standardContactFieldOptions();
	try {
		const provider = await resolveCrmProvider(sourceId);
		if (!provider) return standardContactFieldOptions();
		return await listContactFields(provider);
	} catch (err) {
		console.warn("[contact-fields] CRM custom fields unavailable; standard-only:", err);
		return standardContactFieldOptions();
	}
}

/** This source's location-level Custom Values, failure-isolated to none. */
async function customValueFieldsForSource(sourceId: string | null): Promise<ContactFieldOption[]> {
	if (!sourceId) return [];
	try {
		const provider = await resolveCrmProvider(sourceId);
		if (!provider) return [];
		return await customValueFieldOptions(provider);
	} catch (err) {
		console.warn("[contact-fields] CRM custom values unavailable:", err);
		return [];
	}
}

export const listContactFieldOptionsProcedure = protectedProcedure
	.route({
		method: "GET",
		path: "/voiceagents/contact-fields",
		tags: ["Voice Agents"],
		summary: "List all builder fields (contact standard + custom, plus location) for an agent/org",
	})
	.input(z.object({ agentId: z.string().optional() }))
	.handler(async ({ input, context }) => {
		let sourceId: string | null = null;
		if (input.agentId) {
			await requireOwnedAgent(context.session, input.agentId);
			sourceId = await resolveSourceIdForAgent({ agentId: input.agentId });
		} else {
			const organizationId = requireActiveOrganizationId(context.session);
			const sources = await listSources(organizationId);
			sourceId = sources[0]?.id ?? null;
		}

		const [contact, customValues] = await Promise.all([
			contactFieldsForSource(sourceId),
			customValueFieldsForSource(sourceId),
		]);
		const fields = dedupeFieldOptions([...contact, ...locationFieldOptions(), ...customValues]);
		return { fields };
	});
