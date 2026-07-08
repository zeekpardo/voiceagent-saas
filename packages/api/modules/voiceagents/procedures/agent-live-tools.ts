import { getCrmLiveTools } from "@repo/database";
import z from "zod";

import { protectedProcedure } from "../../../orpc/procedures";
import { LIVE_TOOL_DEFS } from "../../crm/lib/live-tools";
import { requireOwnedAgent } from "../lib/require-owned-agent";

/**
 * The CRM live-tools (update_contact, add_tag, move_stage, check_availability,
 * book_appointment) — for the flow builder to offer as attachable tools.
 * Registrations are global; which Source a mid-call invocation acts on is
 * resolved per call (metadata.source_id → sole attached source).
 */
export const listAgentLiveTools = protectedProcedure
	.route({
		method: "GET",
		path: "/voiceagents/agents/{agentId}/live-tools",
		tags: ["Voice Agents"],
		summary: "List the CRM live-tools available to an agent",
	})
	.input(z.object({ agentId: z.string() }))
	.handler(async ({ input, context }) => {
		await requireOwnedAgent(context.session, input.agentId);
		const rows = await getCrmLiveTools();
		const byName = new Map(LIVE_TOOL_DEFS.map((d) => [d.name, d.description]));
		return {
			tools: rows.map((row) => ({
				id: row.toolId,
				name: row.name,
				description: byName.get(row.name) ?? row.name,
			})),
		};
	});
