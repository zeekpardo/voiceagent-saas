import { listSourceAgentIds } from "@repo/database";
import z from "zod";

import { protectedProcedure } from "../../../orpc/procedures";
import { requireOwnedSource } from "../lib/require-owned-source";

/** Ids of the agents currently attached to a source — used by the Website
 * Widget tab to hint which agents are already wired up to this source. */
export const listSourceAgents = protectedProcedure
	.route({
		method: "GET",
		path: "/sources/{sourceId}/agents",
		tags: ["Sources"],
		summary: "List the agent ids attached to a source",
	})
	.input(z.object({ sourceId: z.string() }))
	.handler(async ({ input, context }) => {
		await requireOwnedSource(context.session, input.sourceId);
		const rows = await listSourceAgentIds(input.sourceId);
		return rows.map((row) => row.agentId);
	});
