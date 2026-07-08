import z from "zod";

import { protectedProcedure } from "../../../orpc/procedures";
import { gatewayFetch } from "../lib/gateway";

export interface GatewayCall {
	id: string;
	agent_id: string;
	direction: "inbound" | "outbound" | "web";
	status: string;
	from_number: string | null;
	to_number: string | null;
	summary: string | null;
	extracted: Record<string, string> | null;
	metadata: { crm_contact_id?: string; source?: string; source_id?: string } | null;
	started_at: string | null;
	ended_at: string | null;
	duration_seconds: number | null;
	end_reason: string | null;
	created_at: string;
}

export const listCalls = protectedProcedure
	.route({
		method: "GET",
		path: "/voiceagents/calls",
		tags: ["Voice Agents"],
		summary: "List calls",
	})
	.input(z.object({ agentId: z.string().optional(), limit: z.number().int().max(200).optional() }))
	.handler(async ({ input }) => {
		const params = new URLSearchParams();
		if (input.agentId) params.set("agent_id", input.agentId);
		params.set("limit", String(input.limit ?? 50));
		const { calls } = await gatewayFetch<{ calls: GatewayCall[] }>(
			"GET",
			`/v1/calls?${params.toString()}`,
		);
		return calls;
	});

export interface GatewayCallEvent {
	type: string;
	payload: Record<string, unknown>;
	created_at: string;
}

export const getCallEvents = protectedProcedure
	.route({
		method: "GET",
		path: "/voiceagents/calls/{id}/events",
		tags: ["Voice Agents"],
		summary: "Get a call's engine events",
	})
	.input(z.object({ id: z.string() }))
	.handler(async ({ input }) => {
		const { events } = await gatewayFetch<{ call_id: string; events: GatewayCallEvent[] }>(
			"GET",
			`/v1/calls/${encodeURIComponent(input.id)}/events`,
		);
		return events;
	});

export const getTranscript = protectedProcedure
	.route({
		method: "GET",
		path: "/voiceagents/calls/{id}/transcript",
		tags: ["Voice Agents"],
		summary: "Get a call transcript",
	})
	.input(z.object({ id: z.string() }))
	.handler(async ({ input }) =>
		gatewayFetch<{
			call_id: string;
			turns: { role: string; text: string; ts?: number }[];
			summary: string | null;
			extracted: Record<string, string> | null;
		}>("GET", `/v1/calls/${encodeURIComponent(input.id)}/transcript`),
	);
