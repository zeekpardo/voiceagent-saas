import { listOrganizationAgentIds } from "@repo/database";
import z from "zod";

import { protectedProcedure } from "../../../orpc/procedures";
import { requireActiveOrganizationId } from "../../sources/lib/org";
import { gatewayFetch } from "../lib/gateway";
import { requireOwnedCall } from "../lib/require-owned-resource";

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
	.handler(async ({ input, context }) => {
		// Tenant isolation: the engine gateway is org-agnostic, so scope calls to the
		// agents the caller's active organization owns (same rule as listAgents).
		const organizationId = await requireActiveOrganizationId(context.session);
		const ownedAgentIds = await listOrganizationAgentIds(organizationId);
		const limit = input.limit ?? 50;

		const fetchForAgent = async (agentId: string): Promise<GatewayCall[]> => {
			const params = new URLSearchParams({ agent_id: agentId, limit: String(limit) });
			const { calls } = await gatewayFetch<{ calls: GatewayCall[] }>(
				"GET",
				`/v1/calls?${params.toString()}`,
			);
			return calls;
		};

		// A specific agent is only listable when the caller's org owns it.
		if (input.agentId) {
			if (!ownedAgentIds.includes(input.agentId)) {
				return [];
			}
			return fetchForAgent(input.agentId);
		}

		// All of the org's agents: the gateway filters by a single agent_id, so fan
		// out over the owned agents and merge newest-first.
		if (ownedAgentIds.length === 0) {
			return [];
		}
		const perAgent = await Promise.all(
			ownedAgentIds.map((id) => fetchForAgent(id).catch(() => [] as GatewayCall[])),
		);
		return perAgent
			.flat()
			.sort((a, b) => b.created_at.localeCompare(a.created_at))
			.slice(0, limit);
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
	.handler(async ({ input, context }) => {
		await requireOwnedCall(context.session, input.id);
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
	.handler(async ({ input, context }) => {
		await requireOwnedCall(context.session, input.id);
		return gatewayFetch<{
			call_id: string;
			turns: { role: string; text: string; ts?: number }[];
			summary: string | null;
			extracted: Record<string, string> | null;
		}>("GET", `/v1/calls/${encodeURIComponent(input.id)}/transcript`);
	});
