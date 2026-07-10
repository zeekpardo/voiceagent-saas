import z from "zod";

import { composeInstructions, type PersonaPromptInput } from "./persona-prompt";

/**
 * The subset of the engine's AgentConfig the builder edits. The gateway
 * revalidates the full document; this schema drives the form + procedure IO.
 */
export const agentConfigInput = z.object({
	name: z.string().min(1).max(80),
	description: z.string().optional(),
	instructions: z.string().min(1),
	/** Optional persona attached to this agent. Metadata only — its effect is
	 *  compiled into `instructions` at save/publish (see toGatewayConfig); it
	 *  rides in the config doc so the form can round-trip the selection. The
	 *  engine ignores it. */
	personaId: z.string().nullish(),
	/** Job-specific limits on what the agent will discuss or do. Compiled into
	 *  `instructions` as the `## GUARDRAILS` block (on top of an always-on safety
	 *  baseline) at save/publish; also rides on the config doc as opaque metadata
	 *  so the form round-trips it, exactly like personaId. The engine treats it as
	 *  an opaque builder field. */
	guardrails: z.string().max(3000).nullish(),
	/** Words/phrases the agent must never say — enforced globally across all flow nodes. */
	prohibitedWords: z.array(z.string()).default([]),
	greeting: z.string().optional(),
	language: z.string().default("en"),
	llm: z
		.object({
			model: z.string().default("grok-4-fast"),
			temperature: z.number().min(0).max(2).default(0.4),
			maxTokens: z.number().int().positive().default(400),
		})
		.default({ model: "grok-4-fast", temperature: 0.4, maxTokens: 400 }),
	tts: z
		.object({
			provider: z.string().default("xai"),
			voice: z.string().default("ara"),
			/** Honored only by providers whose API supports it (Cartesia, ElevenLabs). */
			speed: z.number().min(0.7).max(1.5).default(1.0),
		})
		.default({ provider: "xai", voice: "ara", speed: 1.0 }),
	stt: z
		.object({
			/** LiveKit Inference model id; empty = engine default (xai/stt-1). */
			model: z.string().optional(),
		})
		.default({}),
	turnDetection: z
		.object({
			mode: z.enum(["vad", "semantic"]).default("semantic"),
			endpointingMs: z.number().int().min(100).max(3000).default(500),
			allowInterruptions: z.boolean().default(true),
			preemptiveGeneration: z.boolean().default(true),
		})
		.default({
			mode: "semantic",
			endpointingMs: 500,
			allowInterruptions: true,
			preemptiveGeneration: true,
		}),
	timeouts: z
		.object({
			maxCallSeconds: z.number().int().min(30).max(3600).default(900),
			silenceHangupSeconds: z.number().int().min(5).max(300).default(30),
		})
		.default({ maxCallSeconds: 900, silenceHangupSeconds: 30 }),
	compliance: z
		.object({
			aiDisclosure: z.boolean().default(true),
			disclosureText: z.string().optional(),
		})
		.default({ aiDisclosure: true }),
	postCall: z
		.object({
			summarize: z.boolean().default(true),
			extract: z
				.array(z.object({ field: z.string().min(1), instructions: z.string().min(1) }))
				.default([]),
		})
		.default({ summarize: true, extract: [] }),
});

export type AgentConfigInput = z.infer<typeof agentConfigInput>;

/**
 * The CRM live tools that perform the engine's automatic writes (contact-field
 * writes for set_field nodes + verified objectives; tag adds for modify_tags
 * nodes). The engine is CRM-agnostic — it resolves these tools by the ids the
 * config names rather than assuming fixed tool names — so we stamp them onto
 * every config we emit. CRM vocabulary belongs here in the SaaS, never in the
 * engine. Mirrors LIVE_TOOL_DEFS in modules/crm/lib/live-tools.ts.
 */
const FIELD_WRITE_TOOL_NAME = "update_contact";
const TAG_WRITE_TOOL_NAME = "add_tag";

/**
 * Reshape the builder config into the engine payload.
 *
 * `persona` (resolved from input.personaId by the caller — this function has no
 * DB access) plus the builder's `instructions` (the job's Goal) and `guardrails`
 * are compiled into the final `instructions`: composeInstructions assembles
 * persona → GOAL → GUARDRAILS → VOICE STYLE. The safety baseline and voice-style
 * block apply even when no persona/guardrails are attached. personaId and
 * guardrails stay on the config as opaque metadata for round-tripping (carried
 * by `...rest`); the engine only ever reads the resulting instruction text.
 */
export function toGatewayConfig(input: AgentConfigInput, persona?: PersonaPromptInput | null) {
	const { postCall, stt, instructions, ...rest } = input;
	return {
		...rest,
		instructions: composeInstructions(instructions, persona, input.guardrails),
		// Self-describing config: name the tools the engine invokes for its
		// automatic field/tag writes (objectives + set_field/modify_tags fallback).
		fieldWriteToolId: FIELD_WRITE_TOOL_NAME,
		tagWriteToolId: TAG_WRITE_TOOL_NAME,
		// Engine requires stt.model to be a string when present.
		...(stt.model ? { stt: { model: stt.model } } : {}),
		postCall: {
			summarize: postCall.summarize,
			extract:
				postCall.extract.length > 0
					? Object.fromEntries(postCall.extract.map((e) => [e.field, e.instructions]))
					: undefined,
		},
	};
}

export interface GatewayAgent {
	id: string;
	name: string;
	status: string;
	version: number;
	config: Record<string, unknown>;
	created_at: string;
	updated_at: string;
}
