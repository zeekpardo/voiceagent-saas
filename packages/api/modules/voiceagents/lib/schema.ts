import z from "zod";

/**
 * The subset of the engine's AgentConfig the builder edits. The gateway
 * revalidates the full document; this schema drives the form + procedure IO.
 */
export const agentConfigInput = z.object({
	name: z.string().min(1).max(80),
	description: z.string().optional(),
	instructions: z.string().min(1),
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

/** UI list of extract fields ⇄ engine's Record<string,string>. */
export function toGatewayConfig(input: AgentConfigInput) {
	const { postCall, stt, ...rest } = input;
	return {
		...rest,
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
