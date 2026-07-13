import {
	assignAgentToOrganization,
	deleteAgentOrganization,
	deleteAgentSources,
	listOrganizationAgentIds,
} from "@repo/database";
import z from "zod";

import { protectedProcedure } from "../../../orpc/procedures";
import { requireActiveOrganizationId } from "../../sources/lib/org";
import { gatewayFetch } from "../lib/gateway";
import { requireOwnedAgent } from "../lib/require-owned-agent";
import { resolvePersona } from "../lib/resolve-persona";
import { agentConfigInput, type GatewayAgent, toGatewayConfig } from "../lib/schema";

export const listAgents = protectedProcedure
	.route({
		method: "GET",
		path: "/voiceagents/agents",
		tags: ["Voice Agents"],
		summary: "List voice agents",
	})
	.handler(async ({ context }) => {
		const organizationId = await requireActiveOrganizationId(context.session);
		const [{ agents }, ownedIds] = await Promise.all([
			gatewayFetch<{ agents: GatewayAgent[] }>("GET", "/v1/agents"),
			listOrganizationAgentIds(organizationId),
		]);
		const owned = new Set(ownedIds);
		return agents.filter((agent) => owned.has(agent.id));
	});

export const getAgent = protectedProcedure
	.route({
		method: "GET",
		path: "/voiceagents/agents/{id}",
		tags: ["Voice Agents"],
		summary: "Get a voice agent",
	})
	.input(z.object({ id: z.string() }))
	.handler(async ({ input, context }) => {
		await requireOwnedAgent(context.session, input.id);
		return gatewayFetch<GatewayAgent>("GET", `/v1/agents/${encodeURIComponent(input.id)}`);
	});

export const createAgent = protectedProcedure
	.route({
		method: "POST",
		path: "/voiceagents/agents",
		tags: ["Voice Agents"],
		summary: "Create a voice agent",
	})
	.input(agentConfigInput)
	.handler(async ({ input, context }) => {
		const organizationId = await requireActiveOrganizationId(context.session);
		const persona = await resolvePersona(organizationId, input.personaId);
		const agent = await gatewayFetch<GatewayAgent>(
			"POST",
			"/v1/agents",
			toGatewayConfig(input, persona),
		);
		await assignAgentToOrganization(agent.id, organizationId);
		return agent;
	});

export const updateAgent = protectedProcedure
	.route({
		method: "PATCH",
		path: "/voiceagents/agents/{id}",
		tags: ["Voice Agents"],
		summary: "Update a voice agent (creates a new version)",
	})
	.input(z.object({ id: z.string(), config: agentConfigInput }))
	.handler(async ({ input, context }) => {
		const organizationId = await requireOwnedAgent(context.session, input.id);
		const persona = await resolvePersona(organizationId, input.config.personaId);
		return gatewayFetch<GatewayAgent>(
			"PATCH",
			`/v1/agents/${encodeURIComponent(input.id)}`,
			toGatewayConfig(input.config, persona),
		);
	});

export const deleteAgent = protectedProcedure
	.route({
		method: "DELETE",
		path: "/voiceagents/agents/{id}",
		tags: ["Voice Agents"],
		summary: "Delete a voice agent",
	})
	.input(z.object({ id: z.string() }))
	.handler(async ({ input, context }) => {
		await requireOwnedAgent(context.session, input.id);
		const result = await gatewayFetch<{ deleted: boolean }>(
			"DELETE",
			`/v1/agents/${encodeURIComponent(input.id)}`,
		);
		await Promise.all([deleteAgentOrganization(input.id), deleteAgentSources(input.id)]);
		return result;
	});
