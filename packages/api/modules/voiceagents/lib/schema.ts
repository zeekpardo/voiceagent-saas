import z from "zod";

import { composeInstructions, type PersonaPromptInput } from "./persona-prompt";

/**
 * The subset of the engine's AgentConfig the builder edits. The gateway
 * revalidates the full document; this schema drives the form + procedure IO.
 */
export const agentConfigInput = z.object({
	name: z.string().min(1).max(80),
	description: z.string().optional(),
	/** The job's overarching objective — the LEAN goal text the builder edits in
	 *  the Job panel / create form. Composed into the engine's `instructions`
	 *  (the `## GOAL` block) at save/publish by toGatewayConfig; also rides RAW on
	 *  the config doc (like personaId/guardrails) so the form round-trips it
	 *  without re-wrapping the previous composite. */
	goal: z.string().max(2000).nullish(),
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
	/**
	 * Agent-level custom variable DEFINITIONS (CloseBot "Job Flow Variables"):
	 * a name usable as {{name}} / @-mention in the flow, an optional description,
	 * and an optional default value. VALUES are overridden per-source
	 * (VoiceAgentSource.variableValues) and merged into the runtime `variables`
	 * map at dispatch (see mergeCustomVariables). Rides RAW on the config doc so
	 * the builder round-trips it; the engine interpolates the resolved values via
	 * the runtime variables map, never these definitions directly. Names are
	 * lowercase snake_case identifiers (normalized in the builder UI).
	 */
	customVariables: z
		.array(
			z.object({
				name: z.string().min(1).max(64),
				description: z.string().max(200).optional(),
				default: z.string().max(2000).optional(),
			}),
		)
		.default([]),
	greeting: z.string().optional(),
	/** When true, `greeting` is a direction the engine generates the opener from
	 * (via AI) rather than a verbatim line. Default false/absent = verbatim. */
	greetingGenerate: z.boolean().optional(),
	language: z.string().default("en"),
	/**
	 * Channel preferences for this agent (engine slot already merged):
	 * - `mode`: which channels the agent handles — "voice" only, "text" only, or
	 *   "both" (default). Enforced at every entry point (CRM trigger, omni-channel
	 *   inbound resolution, widget/test sessions).
	 * - `textFallback`: when an OUTBOUND voice call fails to connect, automatically
	 *   continue the same workflow as a text conversation on the source's text
	 *   channel. Not applicable when mode is "text" (there's no voice call to fail).
	 * Rides on the config doc; the engine reads `mode` to run text-vs-voice, while
	 * the fallback is a SaaS-side behavior (see the voice-webhook consumer).
	 */
	channels: z
		.object({
			mode: z.enum(["voice", "text", "both"]).default("both"),
			textFallback: z.boolean().default(false),
		})
		.default({ mode: "both", textFallback: false }),
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
			/**
			 * Optional CRM contact-field KEY (e.g. "contact.call_summary") the SaaS
			 * writes the call summary to after the call. Rides through toGatewayConfig
			 * onto the engine config so it round-trips; the engine never reads it —
			 * syncCallToCrm (crm/lib/sync.ts) does the write. The old per-field
			 * `extract` editor was removed: objective nodes now capture + write fields
			 * live during the call, so post-call re-extraction is redundant.
			 */
			summaryField: z.string().nullish(),
			/**
			 * Per-agent: post a CRM timeline note (summary + captured values) to the
			 * contact after the call. Moved here from the per-source
			 * VoiceAgentSource.writeNote so it's one agent-level toggle alongside the
			 * other post-call outputs. syncCallToCrm reads this and falls back to the
			 * per-source value only when it's undefined (agent never re-saved). Rides
			 * on the config as a SaaS-side sync flag — the engine never reads it.
			 */
			writeNote: z.boolean().default(true),
		})
		.default({ summarize: true, writeNote: true }),
});

export type AgentConfigInput = z.infer<typeof agentConfigInput>;

/** A single Job Flow Variable definition (name + optional description/default). */
export type CustomVariableDef = AgentConfigInput["customVariables"][number];

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
 * DB access) plus the builder's raw `goal` and `guardrails` are compiled into
 * the final `instructions`: composeInstructions assembles persona → GOAL →
 * GUARDRAILS → VOICE STYLE. The safety baseline and voice-style block apply even
 * when no persona/guardrails are attached.
 *
 * CRITICAL: we compose FROM `input.goal` (the raw lean text), never from a
 * previously composed value — and the raw `goal` rides back onto the config
 * alongside personaId/guardrails so the builder round-trips the raw text without
 * re-wrapping. The engine only ever reads the resulting `instructions`.
 */
export function toGatewayConfig(input: AgentConfigInput, persona?: PersonaPromptInput | null) {
	const { postCall, stt, goal, ...rest } = input;
	const rawGoal = goal ?? "";
	return {
		...rest,
		goal: rawGoal,
		instructions: composeInstructions(rawGoal, persona, input.guardrails),
		// Self-describing config: name the tools the engine invokes for its
		// automatic field/tag writes (objectives + set_field/modify_tags fallback).
		fieldWriteToolId: FIELD_WRITE_TOOL_NAME,
		tagWriteToolId: TAG_WRITE_TOOL_NAME,
		// Engine requires stt.model to be a string when present.
		...(stt.model ? { stt: { model: stt.model } } : {}),
		// The form no longer manages `extract` — objective nodes capture + write
		// fields live during the call, so new saves are summary-only. summaryField
		// rides through as a SaaS-side sync target (the engine never reads it).
		postCall: {
			summarize: postCall.summarize,
			summaryField: postCall.summaryField ?? undefined,
			writeNote: postCall.writeNote,
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
