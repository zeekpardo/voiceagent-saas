import { extractGoalFromComposite } from "@repo/api/modules/voiceagents/lib/persona-prompt";
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
	// Prefer the raw `goal` when present; fall back to un-nesting it from the
	// composed `instructions` for agents saved before goal/instructions were
	// split (legacy load path — see extractGoalFromComposite).
	const goal =
		typeof c.goal === "string" && c.goal.length > 0
			? c.goal
			: extractGoalFromComposite(typeof c.instructions === "string" ? c.instructions : "");
	// A blank name fails min(1) on the CREATE page — parse with a placeholder so
	// zod still applies every default, then blank name below (validation runs on
	// submit via the zodResolver). `goal` is nullish, so it needs no placeholder.
	const values = agentConfigInput.parse({
		name: c.name || "placeholder",
		description: c.description ?? "",
		goal,
		guardrails: c.guardrails ?? "",
		prohibitedWords: Array.isArray(c.prohibitedWords) ? c.prohibitedWords.map(String) : [],
		// Preserved verbatim so any full-config submit (job/settings/preferences
		// forms) round-trips the Job Flow Variable definitions without clobbering
		// them — the Variables panel is the only editor, but every save carries them.
		customVariables: Array.isArray(c.customVariables) ? c.customVariables : [],
		greeting: c.greeting ?? "",
		language: c.language ?? "en",
		channels: {
			mode: c.channels?.mode === "voice" || c.channels?.mode === "text" ? c.channels.mode : "both",
			textFallback: typeof c.channels?.textFallback === "boolean" ? c.channels.textFallback : false,
		},
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
			summaryField: typeof c.postCall?.summaryField === "string" ? c.postCall.summaryField : null,
			writeNote: typeof c.postCall?.writeNote === "boolean" ? c.postCall.writeNote : true,
		},
	});
	if (!agent) {
		values.name = "";
		values.goal = "";
	}
	return values;
}
