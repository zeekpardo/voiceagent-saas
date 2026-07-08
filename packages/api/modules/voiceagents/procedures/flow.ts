import z from "zod";

import { protectedProcedure } from "../../../orpc/procedures";
import { gatewayFetch } from "../lib/gateway";
import { requireOwnedAgent } from "../lib/require-owned-agent";
import type { GatewayAgent } from "../lib/schema";

/**
 * Flow agents (engine spec): a graph of small agents (nodes) wired by exits.
 * The canvas document is opaque to the engine — it rides along in the config
 * so the builder UI round-trips through agent versioning for free.
 */

export const flowInput = z.object({
	entry: z.string().min(1),
	nodes: z
		.array(
			z.object({
				id: z.string().min(1),
				name: z.string().optional(),
				// "router" nodes never speak — the engine evaluates router.condition
				// against the conversation and picks one exit. "statement" nodes speak
				// statement.say and immediately continue. Default kind is "agent".
				kind: z.enum(["agent", "router", "statement"]).optional(),
				router: z.object({ condition: z.string().min(1) }).optional(),
				statement: z.object({ say: z.string().min(1) }).optional(),
				instructions: z.string().min(1),
				entryInstructions: z.string().optional(),
				toolIds: z.array(z.string()),
				llm: z
					.object({
						model: z.string(),
						temperature: z.number().min(0).max(2).optional(),
						maxTokens: z.number().int().positive().optional(),
					})
					.optional(),
				exits: z.array(
					z.object({
						name: z.string().min(1),
						description: z.string().min(1),
						target: z.string().optional(),
					}),
				),
			}),
		)
		.min(1),
	// Global detect-and-jump scenarios — checked continuously from every agent
	// node; target is the flow node id the call jumps to.
	scenarios: z
		.array(
			z.object({
				name: z.string().min(1),
				description: z.string().min(1),
				target: z.string().min(1),
			}),
		)
		.optional(),
});

export type FlowInput = z.infer<typeof flowInput>;

export const saveFlow = protectedProcedure
	.route({
		method: "PATCH",
		path: "/voiceagents/agents/{id}/flow",
		tags: ["Voice Agents"],
		summary: "Save the agent's flow graph + canvas document",
	})
	.input(
		z.object({
			id: z.string(),
			flow: flowInput,
			canvas: z.unknown(),
			toolIds: z.array(z.string()),
		}),
	)
	.handler(async ({ input, context }) => {
		await requireOwnedAgent(context.session, input.id);
		return gatewayFetch<GatewayAgent>("PATCH", `/v1/agents/${encodeURIComponent(input.id)}`, {
			flow: input.flow,
			canvas: input.canvas,
			toolIds: input.toolIds,
		});
	});
