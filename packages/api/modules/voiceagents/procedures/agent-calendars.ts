import { getSoleEnabledAgentSource } from "@repo/database";
import z from "zod";

import { protectedProcedure } from "../../../orpc/procedures";
import type { CrmCalendar } from "../../crm/lib/provider";
import { GhlApiError } from "../../crm/lib/providers/ghl-client";
import { resolveCrmProvider } from "../../crm/lib/resolve";
import { requireOwnedAgent } from "../lib/require-owned-agent";

/**
 * An agent's bookable calendars, resolved via its sole enabled attached
 * Source ([] when zero or multiple — ambiguous, never guessed). Used by the
 * flow builder's booking-node calendar picker.
 */
export const listAgentCalendars = protectedProcedure
	.route({
		method: "GET",
		path: "/voiceagents/agents/{agentId}/calendars",
		tags: ["Voice Agents"],
		summary: "List an agent's CRM calendars (resolved via its sole attached source)",
	})
	.input(z.object({ agentId: z.string() }))
	.handler(async ({ input, context }): Promise<CrmCalendar[]> => {
		await requireOwnedAgent(context.session, input.agentId);
		const sole = await getSoleEnabledAgentSource(input.agentId);
		if (!sole) return [];
		const provider = await resolveCrmProvider(sole.sourceId);
		if (!provider) return [];
		try {
			return await provider.listCalendars();
		} catch (err) {
			if (err instanceof GhlApiError && (err.status === 401 || err.status === 403)) return [];
			throw err;
		}
	});
