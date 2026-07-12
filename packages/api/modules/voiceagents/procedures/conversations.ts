import z from "zod";

import { protectedProcedure } from "../../../orpc/procedures";
import { gatewayFetch } from "../lib/gateway";

/** One engine event on a room-less text conversation — same shape as
 * GatewayCallEvent (the AI-logs drawer renders both). */
export interface GatewayConversationEvent {
	type: string;
	payload: Record<string, unknown>;
	created_at: string;
}

export const getConversationEvents = protectedProcedure
	.route({
		method: "GET",
		path: "/voiceagents/conversations/{id}/events",
		tags: ["Voice Agents"],
		summary: "Get a conversation's engine events",
	})
	.input(z.object({ id: z.string() }))
	.handler(async ({ input }) => {
		const { events } = await gatewayFetch<{
			conversation_id: string;
			events: GatewayConversationEvent[];
		}>("GET", `/v1/conversations/${encodeURIComponent(input.id)}/events`);
		return events;
	});
