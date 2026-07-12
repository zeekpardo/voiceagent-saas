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
				// play hold music, then continue with a new voice. "handoff" nodes hand
				// the live call off to a different published agent (one-way, carrying
				// context). "stop_responding" nodes park the contact — the agent stops
				// responding but the session keeps listening (never hangs up on its own;
				// scenarios can re-engage). Default is "agent".
				kind: z
					.enum([
						"agent",
						"router",
						"statement",
						"transfer",
						"set_field",
						"modify_tags",
						"handoff",
						"stop_responding",
					])
					.optional(),
				router: z.object({ condition: z.string().min(1) }).optional(),
				statement: z
					.object({ say: z.string().min(1), generate: z.boolean().optional() })
					.optional(),
				setField: z.object({ field: z.string().min(1), value: z.string() }).optional(),
				modifyTags: z
					.object({
						add: z.array(z.string().min(1)).default([]),
						remove: z.array(z.string().min(1)).default([]),
					})
					.optional(),
				transfer: z
					.object({
						// "simulated" (default) is the in-session hand-off — no SIP trunk
						// required. "warm" dials `target` and merges once answered. "cold"
						// blind-forwards the caller's SIP leg to `target`.
						mode: z.enum(["simulated", "warm", "cold"]).optional(),
						// Phone number or SIP URI — required for warm and cold.
						target: z.string().optional(),
						// How long to ring `target` before giving up — warm only.
						waitSeconds: z.number().min(1).max(120).optional(),
						say: z.string().optional(),
						// Hold-music duration — simulated only.
						holdSeconds: z.number().min(0).max(30).optional(),
						voice: z
							.object({
								provider: z.string().min(1),
								voice: z.string().min(1),
								speed: z.number().min(0.7).max(1.5).optional(),
							})
							.optional(),
					})
					.optional(),
				// handoff-only: the target published agent id the live call is handed to.
				handoffAgentId: z.string().min(1).optional(),
				// handoff-only: optional announcement (source agent's voice) + hold music
				// before the target agent takes over. Voice-channel only.
				handoff: z
					.object({
						say: z.string().optional(),
						// When true, `say` is a direction the source agent generates the
						// announcement from (caller's language + persona/style).
						generate: z.boolean().optional(),
						// Hold-music duration. Engine default 3 when unset; 0 disables music.
						holdSeconds: z.number().min(0).max(30).optional(),
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
							// Engine defaults this true. When true, the engine may silently
							// auto-complete the objective from contactState (e.g. carried
							// over from a prior agent in a handoff) with no CRM write and no
							// question asked. Authors default this off in the builder so a
							// handoff specialist re-asks/re-verifies unless explicitly opted in.
							skipIfKnown: z.boolean().optional(),
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
			// When true, config.greeting is a direction the engine generates the
			// opener from rather than a verbatim line. Default false = verbatim.
			greetingGenerate: z.boolean().optional(),
		}),
	)
	.handler(async ({ input, context }) => {
		await requireOwnedAgent(context.session, input.id);
		return gatewayFetch<GatewayAgent>("PATCH", `/v1/agents/${encodeURIComponent(input.id)}`, {
			flow: input.flow,
			canvas: input.canvas,
			toolIds: input.toolIds,
			greeting: input.greeting ?? "",
			greetingGenerate: input.greetingGenerate ?? false,
		});
	});
