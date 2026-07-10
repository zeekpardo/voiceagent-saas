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
				// statement.say and immediately continue. "transfer" nodes announce,
				// play hold music, then continue with a new voice. Default is "agent".
				kind: z
					.enum(["agent", "router", "statement", "transfer", "set_field", "modify_tags"])
					.optional(),
				router: z.object({ condition: z.string().min(1) }).optional(),
				statement: z.object({ say: z.string().min(1) }).optional(),
				setField: z.object({ field: z.string().min(1), value: z.string() }).optional(),
				modifyTags: z
					.object({
						add: z.array(z.string().min(1)).default([]),
						remove: z.array(z.string().min(1)).default([]),
					})
					.optional(),
				transfer: z
					.object({
						say: z.string().optional(),
						holdSeconds: z.number().min(0).max(30),
						voice: z
							.object({
								provider: z.string().min(1),
								voice: z.string().min(1),
								speed: z.number().min(0.7).max(1.5).optional(),
							})
							.optional(),
					})
					.optional(),
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
				// Engine-verified data goals on an agent node; the engine takes the
				// primary exit once every required objective is met.
				objectives: z
					.array(
						z.object({
							key: z.string().min(1),
							description: z.string().min(1),
							field: z.string().optional(),
							options: z.array(z.string().min(1)).min(2).optional(),
							required: z.boolean().optional(),
							maxAttempts: z.number().int().min(1).max(10).optional(),
							sensitivity: z.number().min(0).max(100).optional(),
						}),
					)
					.optional(),
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
			// The Greeter node owns the connect-time greeting on the canvas; it
			// compiles into config.greeting so the engine speaks it at go-live.
			greeting: z.string().optional(),
		}),
	)
	.handler(async ({ input, context }) => {
		await requireOwnedAgent(context.session, input.id);
		return gatewayFetch<GatewayAgent>("PATCH", `/v1/agents/${encodeURIComponent(input.id)}`, {
			flow: input.flow,
			canvas: input.canvas,
			toolIds: input.toolIds,
			greeting: input.greeting ?? "",
		});
	});
