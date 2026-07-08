import { getCrmLiveToolsForSource, getSoleEnabledAgentSource } from "@repo/database";
import z from "zod";

import { protectedProcedure } from "../../../orpc/procedures";
import { LIVE_TOOL_DEFS } from "../../crm/lib/live-tools";
import { requireOwnedAgent } from "../lib/require-owned-agent";

/**
 * The CRM live-tools (update_contact, add_tag, move_stage, check_availability,
 * book_appointment) registered for this agent's Source — for the flow
 * builder to offer as attachable tools. Resolves via the agent's sole
 * enabled attached Source; agents monitoring zero or multiple Sources get []
 * here (ambiguous — never guessed), same as the CRM-sync resolution rule.
 */
export const listAgentLiveTools = protectedProcedure
	.route({
		method: "GET",
		path: "/voiceagents/agents/{agentId}/live-tools",
		tags: ["Voice Agents"],
		summary: "List an agent's CRM live-tools (resolved via its sole attached source)",
	})
	.input(z.object({ agentId: z.string() }))
	.handler(async ({ input, context }) => {
		await requireOwnedAgent(context.session, input.agentId);
		const sole = await getSoleEnabledAgentSource(input.agentId);
		if (!sole) return { tools: [] as { id: string; name: string; description: string }[] };

		const rows = await getCrmLiveToolsForSource(sole.sourceId);
		const byName = new Map(LIVE_TOOL_DEFS.map((d) => [d.name, d.description]));
		return {
			tools: rows.map((row) => ({
				id: row.toolId,
				name: row.name,
				description: byName.get(row.name) ?? row.name,
			})),
		};
	});
