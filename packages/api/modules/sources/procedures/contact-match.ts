import z from "zod";

import { protectedProcedure } from "../../../orpc/procedures";
import { gatewayFetch } from "../../voiceagents/lib/gateway";
import type { CrmProvider } from "../../crm/lib/provider";
import { resolveCrmProvider } from "../../crm/lib/resolve";
import { resolveSourceIdForAgent } from "../../crm/lib/resolve-source";

/**
 * Resolve a call to its CRM contact for the inbox: by explicit contact id
 * when the call already carries one, otherwise by a LOOKUP-ONLY phone match
 * (never creates contacts). When a phone match lands and a callId is given,
 * the link is persisted onto the gateway call's metadata best-effort, so
 * historical calls auto-connect as they're viewed.
 *
 * Which Source's CRM to check: explicit sourceId wins; otherwise, when the
 * agent has exactly one enabled attached Source, that one is used
 * unambiguously. Agents monitoring multiple Sources must pass sourceId
 * explicitly (resolved from the call's metadata.source_id).
 */

interface MatchedContact {
	id: string;
	name: string | null;
	url: string | null;
}

/** Display name via the provider's contact context — null on any failure. */
async function contactName(provider: CrmProvider, contactId: string): Promise<string | null> {
	try {
		const ctx = await provider.getContactContext(contactId);
		const joined = [ctx.contact_first_name, ctx.contact_last_name].filter(Boolean).join(" ");
		return ctx.contact_full_name ?? (joined || null);
	} catch (err) {
		console.warn("[sources] contact name lookup failed:", err);
		return null;
	}
}

export const matchContact = protectedProcedure
	.route({
		method: "POST",
		path: "/sources/match-contact",
		tags: ["Sources"],
		summary: "Match a call to a CRM contact",
	})
	.input(
		z.object({
			phone: z.string().optional(),
			contactId: z.string().optional(),
			callId: z.string().optional(),
			sourceId: z.string().optional(),
			agentId: z.string().optional(),
		}),
	)
	.handler(async ({ input }): Promise<{ contact: MatchedContact | null }> => {
		const sourceId = await resolveSourceIdForAgent({
			explicitSourceId: input.sourceId,
			agentId: input.agentId,
		});
		if (!sourceId) return { contact: null };

		const provider = await resolveCrmProvider(sourceId);
		if (!provider) return { contact: null };

		if (input.contactId) {
			return {
				contact: {
					id: input.contactId,
					name: await contactName(provider, input.contactId),
					url: provider.contactUrl(input.contactId),
				},
			};
		}

		if (input.phone) {
			let found: { id: string; name: string | null } | null = null;
			try {
				found = await provider.findContactByPhone(input.phone);
			} catch (err) {
				console.warn("[sources] contact phone match failed:", err);
			}
			if (!found) return { contact: null };

			// Best-effort: persist the link so this call never needs re-matching.
			if (input.callId) {
				await gatewayFetch("PATCH", `/v1/calls/${encodeURIComponent(input.callId)}/metadata`, {
					metadata: { crm_contact_id: found.id },
				}).catch(console.warn);
			}

			return {
				contact: { id: found.id, name: found.name, url: provider.contactUrl(found.id) },
			};
		}

		return { contact: null };
	});
