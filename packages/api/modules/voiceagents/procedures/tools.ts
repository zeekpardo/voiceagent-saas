import z from "zod";

import { protectedProcedure } from "../../../orpc/procedures";
import { gatewayFetch } from "../lib/gateway";
import { requireOwnedAgent } from "../lib/require-owned-agent";

/**
 * Tools-as-webhooks (engine spec §8): register HTTP endpoints the agent can
 * call mid-conversation. The engine signs invocations with the per-tool
 * secret (returned once at creation); the endpoint returns { result } which
 * is fed back into the agent's reply.
 */

export interface GatewayTool {
	id: string;
	name: string;
	description: string;
	json_schema: Record<string, unknown>;
	endpoint_url: string;
	timeout_ms: number;
	enabled: boolean;
	created_at: string;
}

const toolParameter = z.object({
	name: z
		.string()
		.min(1)
		.regex(/^[a-zA-Z0-9_]+$/, "letters, digits and _ only"),
	type: z.enum(["string", "number", "boolean"]),
	description: z.string().min(1),
	required: z.boolean().default(true),
});

function toJsonSchema(params: z.infer<typeof toolParameter>[]) {
	return {
		type: "object",
		properties: Object.fromEntries(
			params.map((p) => [p.name, { type: p.type, description: p.description }]),
		),
		required: params.filter((p) => p.required).map((p) => p.name),
	};
}

export const listTools = protectedProcedure
	.route({ method: "GET", path: "/voiceagents/tools", tags: ["Voice Agents"], summary: "List tools" })
	.handler(async () => {
		const { tools } = await gatewayFetch<{ tools: GatewayTool[] }>("GET", "/v1/tools");
		return tools;
	});

export const createTool = protectedProcedure
	.route({
		method: "POST",
		path: "/voiceagents/tools",
		tags: ["Voice Agents"],
		summary: "Register a tool webhook",
	})
	.input(
		z.object({
			name: z
				.string()
				.min(1)
				.max(64)
				.regex(/^[a-zA-Z0-9_-]+$/, "letters, digits, _ and - only"),
			description: z.string().min(1),
			endpointUrl: z.string().url(),
			timeoutMs: z.number().int().min(500).max(30_000).default(4000),
			parameters: z.array(toolParameter).default([]),
		}),
	)
	.handler(async ({ input }) =>
		// The signing secret comes back exactly once — surface it to the UI.
		gatewayFetch<GatewayTool & { secret: string }>("POST", "/v1/tools", {
			name: input.name,
			description: input.description,
			json_schema: toJsonSchema(input.parameters),
			endpoint_url: input.endpointUrl,
			timeout_ms: input.timeoutMs,
		}),
	);

export const deleteTool = protectedProcedure
	.route({
		method: "DELETE",
		path: "/voiceagents/tools/{id}",
		tags: ["Voice Agents"],
		summary: "Delete a tool",
	})
	.input(z.object({ id: z.string() }))
	.handler(async ({ input }) =>
		gatewayFetch<{ deleted: boolean }>("DELETE", `/v1/tools/${encodeURIComponent(input.id)}`),
	);

/** Attach/detach tools on an agent (partial config patch — bumps the version). */
export const setAgentTools = protectedProcedure
	.route({
		method: "PUT",
		path: "/voiceagents/agents/{id}/tools",
		tags: ["Voice Agents"],
		summary: "Set the tools an agent may call",
	})
	.input(z.object({ id: z.string(), toolIds: z.array(z.string()) }))
	.handler(async ({ input, context }) => {
		await requireOwnedAgent(context.session, input.id);
		return gatewayFetch<{ id: string; version: number }>(
			"PATCH",
			`/v1/agents/${encodeURIComponent(input.id)}`,
			{ toolIds: input.toolIds },
		);
	});
