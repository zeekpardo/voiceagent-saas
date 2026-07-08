import z from "zod";

import { protectedProcedure } from "../../../orpc/procedures";
import { createTriggerToken } from "../../crm/lib/trigger-token";
import { requireOwnedSource } from "../../sources/lib/require-owned-source";
import { requireOwnedAgent } from "../lib/require-owned-agent";

/**
 * The copy-paste webhook URL for a CRM workflow automation: POSTing a
 * contact payload to it places an outbound call with this agent, tagged as
 * having come from this Source. One URL per (agent, source) attachment —
 * an agent monitoring multiple sub-accounts gets a distinct URL for each,
 * so each workflow's calls resolve to the right location's CRM.
 */
export const getTriggerUrl = protectedProcedure
	.route({
		method: "GET",
		path: "/voiceagents/agents/{agentId}/sources/{sourceId}/trigger-url",
		tags: ["Voice Agents"],
		summary: "Get the workflow trigger URL for an (agent, source) pair",
	})
	.input(z.object({ agentId: z.string(), sourceId: z.string() }))
	.handler(async ({ input, context }) => {
		await requireOwnedAgent(context.session, input.agentId);
		await requireOwnedSource(context.session, input.sourceId);
		const base = (process.env.NEXT_PUBLIC_SAAS_URL ?? "http://localhost:3000").replace(/\/$/, "");
		const token = createTriggerToken(input.agentId, input.sourceId);
		return { url: `${base}/api/triggers/voice-call/${token}` };
	});
