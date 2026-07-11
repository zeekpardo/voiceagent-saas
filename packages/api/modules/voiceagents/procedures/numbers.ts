import z from "zod";

import { protectedProcedure } from "../../../orpc/procedures";
import { gatewayFetch } from "../lib/gateway";
import { requireOwnedAgent } from "../lib/require-owned-agent";

export interface GatewayNumber {
	id: string;
	e164: string;
	provider_ref: string;
	inbound_agent_id: string | null;
	/** Name of the routed agent, resolved server-side by the gateway. Null when
	 * unassigned or the agent no longer exists. */
	inbound_agent_name: string | null;
	created_at: string;
}

export const listNumbers = protectedProcedure
	.route({
		method: "GET",
		path: "/voiceagents/numbers",
		tags: ["Voice Agents"],
		summary: "List phone numbers",
	})
	.handler(async () => {
		const { numbers } = await gatewayFetch<{ numbers: GatewayNumber[] }>("GET", "/v1/numbers");
		return numbers;
	});

export const setNumberAgent = protectedProcedure
	.route({
		method: "PATCH",
		path: "/voiceagents/numbers/{id}",
		tags: ["Voice Agents"],
		summary: "Route a phone number to an agent (or unassign it)",
	})
	.input(z.object({ id: z.string(), agentId: z.string().nullable() }))
	.handler(async ({ input, context }) => {
		if (input.agentId) {
			await requireOwnedAgent(context.session, input.agentId);
		}
		return gatewayFetch<GatewayNumber>("PATCH", `/v1/numbers/${encodeURIComponent(input.id)}`, {
			inbound_agent_id: input.agentId,
		});
	});
