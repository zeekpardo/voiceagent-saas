import {
	type AgentConfigInput,
	agentConfigInput,
	type GatewayAgent,
} from "@repo/api/modules/voiceagents/lib/schema";
import type { z } from "zod";

/**
 * react-hook-form + zodResolver types form fields by the schema's *input*
 * shape (pre-parse, so `.default()` fields are optional) rather than
 * `AgentConfigInput` (the post-parse output, where they're required). Every
 * section component takes `form: UseFormReturn<AgentFormValues>` so its
 * prop type matches what `useForm({ resolver: zodResolver(agentConfigInput) })`
 * actually infers.
 */
export type AgentFormValues = z.input<typeof agentConfigInput>;

/** Map a stored gateway config document back onto the form's shape. */
export function toFormValues(agent?: GatewayAgent): AgentConfigInput {
	const c = (agent?.config ?? {}) as Record<string, any>;
	// Blank name/instructions fail min(1) on the CREATE page — parse with
	// placeholders so zod still applies every default, then blank the two
	// fields (validation runs on submit via the zodResolver).
	const values = agentConfigInput.parse({
		name: c.name || "placeholder",
		description: c.description ?? "",
		instructions: c.instructions || "placeholder",
		guardrails: c.guardrails ?? "",
		prohibitedWords: Array.isArray(c.prohibitedWords) ? c.prohibitedWords.map(String) : [],
		greeting: c.greeting ?? "",
		language: c.language ?? "en",
		llm: c.llm,
		tts: c.tts ? { provider: c.tts.provider, voice: c.tts.voice, speed: c.tts.speed } : undefined,
		stt: c.stt?.model ? { model: c.stt.model } : undefined,
		turnDetection: c.turnDetection,
		timeouts: c.timeouts
			? {
					maxCallSeconds: c.timeouts.maxCallSeconds,
					silenceHangupSeconds: c.timeouts.silenceHangupSeconds,
				}
			: undefined,
		compliance: c.compliance
			? { aiDisclosure: c.compliance.aiDisclosure, disclosureText: c.compliance.disclosureText }
			: undefined,
		postCall: {
			summarize: c.postCall?.summarize ?? true,
			extract: Object.entries(c.postCall?.extract ?? {}).map(([field, instructions]) => ({
				field,
				instructions: String(instructions),
			})),
		},
	});
	if (!agent) {
		values.name = "";
		values.instructions = "";
	}
	return values;
}
