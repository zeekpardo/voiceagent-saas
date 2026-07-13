import {
	PERSONA_PROMPT_MAX_CHARS,
	baselineVoiceRealism,
	composeInstructions,
	extractGoalFromComposite,
	guardrailsPrompt,
	personaPrompt,
} from "@repo/api/modules/voiceagents/lib/persona-prompt";
import { agentConfigInput, toGatewayConfig } from "@repo/api/modules/voiceagents/lib/schema";
import { describe, expect, it } from "vitest";

const baseConfig = agentConfigInput.parse({
	name: "Test Agent",
	goal: "Book the caller an appointment.",
});

describe("persona prompt compilation", () => {
	it("assembles persona → GOAL → GUARDRAILS → VOICE STYLE, in that order", () => {
		// Guardrails now come from the per-agent config, not the persona.
		const compiled = toGatewayConfig(
			{ ...baseConfig, guardrails: "Never quote exact pricing." },
			{
				name: "Ava",
				styles: ["warm", "curious"],
				howToRespond: "Always confirm the appointment time twice.",
			},
		);
		const text = compiled.instructions;

		// Every expected block is present...
		expect(text).toContain("## IDENTITY");
		expect(text).toContain("You are Ava");
		expect(text).toContain("## PERSONALITY");
		expect(text).toContain("## HOW TO RESPOND");
		expect(text).toContain("Always confirm the appointment time twice.");
		expect(text).toContain("## GOAL");
		// The job/goal text (base instructions) renders under the GOAL heading.
		expect(text).toContain("Book the caller an appointment.");
		expect(text).toContain("## GUARDRAILS");
		expect(text).toContain("Never quote exact pricing.");
		expect(text).toContain("## VOICE STYLE");

		// ...and in the required order: persona → GOAL (+ its base text) →
		// GUARDRAILS → VOICE STYLE.
		const iIdentity = text.indexOf("## IDENTITY");
		const iPersonality = text.indexOf("## PERSONALITY");
		const iHowTo = text.indexOf("## HOW TO RESPOND");
		const iGoal = text.indexOf("## GOAL");
		const iBase = text.indexOf("Book the caller an appointment.");
		const iGuardrails = text.indexOf("## GUARDRAILS");
		const iVoice = text.indexOf("## VOICE STYLE");
		expect(iIdentity).toBeLessThan(iPersonality);
		expect(iPersonality).toBeLessThan(iHowTo);
		expect(iHowTo).toBeLessThan(iGoal);
		expect(iGoal).toBeLessThan(iBase);
		expect(iBase).toBeLessThan(iGuardrails);
		expect(iGuardrails).toBeLessThan(iVoice);
	});

	it("always includes the guardrails safety baseline, even with no custom text", () => {
		const withoutCustom = guardrailsPrompt();
		expect(withoutCustom).toContain("## GUARDRAILS");
		expect(withoutCustom).toContain("general information only");
		expect(withoutCustom).toContain("never read back full card numbers");
		expect(withoutCustom).not.toContain("Additional limits for this job:");

		const withCustom = guardrailsPrompt("Never discuss competitors.");
		expect(withCustom).toContain("## GUARDRAILS");
		// Baseline still present ahead of the author's custom lines.
		expect(withCustom).toContain("general information only");
		expect(withCustom).toContain("Additional limits for this job:");
		expect(withCustom).toContain("Never discuss competitors.");
		expect(withCustom.indexOf("general information only")).toBeLessThan(
			withCustom.indexOf("Never discuss competitors."),
		);
	});

	it("compiles the guardrails baseline into every agent's instructions", () => {
		const compiled = toGatewayConfig(baseConfig, null);
		expect(compiled.instructions).toContain("## GUARDRAILS");
		expect(compiled.instructions).toContain("never read back full card numbers");
	});

	it("maps known style words to audible behaviors and identifies the persona by name", () => {
		const prompt = personaPrompt({
			name: "Ava",
			styles: ["professional"],
			howToRespond: "",
		});
		expect(prompt).toContain("You are Ava, a professional presence on the call.");
		expect(prompt).toContain("polished and composed");
	});

	it("applies the baseline voice-style block even when no persona is attached", () => {
		const compiled = toGatewayConfig(baseConfig, null);
		expect(compiled.instructions).toContain("## VOICE STYLE");
		expect(compiled.instructions).not.toContain("## IDENTITY");
		// The baseline encodes the user's specific complaints.
		expect(compiled.instructions.toLowerCase()).toContain("thank the caller at most once");
		expect(compiled.instructions).toContain("Use the caller's name sparingly");
		// Base instructions still ride at the end.
		expect(compiled.instructions).toContain("Book the caller an appointment.");
	});

	it("enforces the persona prompt cap by trimming the how-to section", () => {
		const prompt = personaPrompt({
			name: "Ava",
			styles: ["warm", "curious", "direct"],
			howToRespond: "x".repeat(5000),
		});
		expect(prompt.length).toBeLessThanOrEqual(PERSONA_PROMPT_MAX_CHARS);
		// The bounded blocks survive the trim.
		expect(prompt).toContain("## IDENTITY");
		expect(prompt).toContain("## PERSONALITY");
		expect(prompt).toContain("## HOW TO RESPOND");
	});

	it("caps at most three styles into personality behaviors", () => {
		const prompt = personaPrompt({
			name: "Ava",
			styles: ["warm", "curious", "direct", "calm"],
			howToRespond: "",
		});
		const bulletCount = (prompt.match(/^- /gm) ?? []).length;
		expect(bulletCount).toBe(3);
	});

	it("composeInstructions puts GOAL first and VOICE STYLE last when persona is null", () => {
		const text = composeInstructions("Say hello.", null);
		expect(text.startsWith("## GOAL\nSay hello.")).toBe(true);
		expect(text.endsWith(baselineVoiceRealism())).toBe(true);
		// Guardrails baseline sits between the goal and the voice style.
		expect(text).toContain("## GUARDRAILS");
	});

	it("stores the raw goal on the config alongside the composed instructions", () => {
		const compiled = toGatewayConfig(baseConfig, null);
		// Raw goal rides back for round-trip; composed text carries the section.
		expect(compiled.goal).toBe("Book the caller an appointment.");
		expect(compiled.instructions).toContain("## GOAL\nBook the caller an appointment.");
	});
});

describe("toGatewayConfig postCall", () => {
	it("defaults to summary-only with no extract", () => {
		const compiled = toGatewayConfig(baseConfig, null);
		expect(compiled.postCall.summarize).toBe(true);
		// The form no longer manages extract — new saves never build it.
		expect("extract" in compiled.postCall).toBe(false);
	});

	it("round-trips summaryField onto the gateway config", () => {
		const compiled = toGatewayConfig(
			agentConfigInput.parse({
				name: "Test Agent",
				goal: "Book the caller an appointment.",
				postCall: { summarize: true, summaryField: "contact.call_summary" },
			}),
			null,
		);
		expect(compiled.postCall.summaryField).toBe("contact.call_summary");
	});

	it("omits summaryField when none is configured", () => {
		const compiled = toGatewayConfig(baseConfig, null);
		expect(compiled.postCall.summaryField).toBeUndefined();
	});
});

describe("toGatewayConfig responseStyle (persona is the sole HOW TO RESPOND source)", () => {
	it("sources HOW TO RESPOND from the persona ONLY and DROPS the per-agent responseStyle", () => {
		const compiled = toGatewayConfig(
			agentConfigInput.parse({
				name: "Test Agent",
				goal: "Book the caller an appointment.",
				responseStyle: "Keep it warm and vary your phrasing.",
			}),
			{ name: "Ava", styles: ["warm"], howToRespond: "Confirm the time twice." },
		);
		// No longer rides RAW on the config, and the engine's RESPONSE STYLE block
		// is never emitted (we stop sending config.responseStyle).
		expect((compiled as { responseStyle?: string }).responseStyle).toBeUndefined();
		expect(compiled.instructions).not.toContain("## RESPONSE STYLE");
		// With a persona attached, HOW TO RESPOND is the persona's howToRespond ONLY.
		// The per-agent responseStyle is NOT appended — so a Phase 2-migrated agent
		// (persona.howToRespond == old responseStyle) renders that tone text ONCE.
		expect(compiled.instructions).toContain("## HOW TO RESPOND");
		expect(compiled.instructions).toContain("Confirm the time twice.");
		expect(compiled.instructions).not.toContain("Keep it warm and vary your phrasing.");
	});

	it("renders migrated tone text exactly once (no persona/per-agent duplication)", () => {
		// Phase 2 migration COPIES the agent's responseStyle onto persona.howToRespond.
		// If both were still appended, this identical text would appear twice.
		const migratedTone = "Keep it warm and vary your phrasing so replies never sound scripted.";
		const compiled = toGatewayConfig(
			agentConfigInput.parse({
				name: "Test Agent",
				goal: "Book the caller an appointment.",
				responseStyle: migratedTone,
			}),
			{ name: "Ava", styles: ["warm"], howToRespond: migratedTone },
		);
		const occurrences = compiled.instructions.split(migratedTone).length - 1;
		expect(occurrences).toBe(1);
	});

	it("emits a HOW TO RESPOND block from responseStyle even without a persona", () => {
		const compiled = toGatewayConfig(
			agentConfigInput.parse({
				name: "Test Agent",
				goal: "Book the caller an appointment.",
				responseStyle: "Keep it warm and vary your phrasing.",
			}),
			null,
		);
		expect((compiled as { responseStyle?: string }).responseStyle).toBeUndefined();
		expect(compiled.instructions).toContain("## HOW TO RESPOND");
		expect(compiled.instructions).toContain("Keep it warm and vary your phrasing.");
		// No persona → no identity/personality, just the standalone tone directive.
		expect(compiled.instructions).not.toContain("## IDENTITY");
	});

	it("emits no HOW TO RESPOND block when neither persona nor responseStyle is set", () => {
		const compiled = toGatewayConfig(baseConfig, null);
		expect((compiled as { responseStyle?: string }).responseStyle).toBeUndefined();
		expect(compiled.instructions).not.toContain("## HOW TO RESPOND");
	});
});

describe("toGatewayConfig guardrails (per-agent config is the sole source of truth)", () => {
	it("sources GUARDRAILS from the per-agent config, not the persona", () => {
		const compiled = toGatewayConfig(
			{ ...baseConfig, guardrails: "Never share pricing over the phone." },
			{ name: "Ava", styles: ["warm"], howToRespond: "" },
		);
		expect(compiled.instructions).toContain("## GUARDRAILS");
		expect(compiled.instructions).toContain("Never share pricing over the phone.");
	});

	it("renders the per-agent guardrails even when a persona is attached", () => {
		const compiled = toGatewayConfig(
			{ ...baseConfig, guardrails: "No competitor talk." },
			{ name: "Ava", styles: ["warm"], howToRespond: "" },
		);
		// The persona no longer contributes guardrails — the per-agent field wins.
		expect(compiled.instructions).toContain("No competitor talk.");
	});

	it("renders the per-agent guardrails text exactly once", () => {
		const rules = "Never share exact pricing over the phone.";
		const compiled = toGatewayConfig(
			{ ...baseConfig, guardrails: rules },
			{ name: "Ava", styles: ["warm"], howToRespond: "" },
		);
		const occurrences = compiled.instructions.split(rules).length - 1;
		expect(occurrences).toBe(1);
	});

	it("uses the per-agent guardrails when NO persona is attached (unchanged)", () => {
		const compiled = toGatewayConfig({ ...baseConfig, guardrails: "No competitor talk." }, null);
		expect(compiled.instructions).toContain("No competitor talk.");
	});
});

describe("toGatewayConfig voice/model (agent's own tts/llm is authoritative)", () => {
	const persona = { name: "Ava", styles: ["warm"], howToRespond: "" };

	it("passes the agent's own tts/llm through verbatim (persona contributes none)", () => {
		const input = agentConfigInput.parse({
			name: "A",
			goal: "Help the caller.",
			channels: { mode: "voice" },
			tts: { provider: "deepgram", voice: "aura-2-thalia-en" },
			llm: { model: "openai/gpt-5" },
		});
		const compiled = toGatewayConfig(input, persona);
		expect(compiled.tts.provider).toBe("deepgram");
		expect(compiled.tts.voice).toBe("aura-2-thalia-en");
		expect(compiled.llm.model).toBe("openai/gpt-5");
	});

	it("leaves the agent's default tts/llm untouched by the persona", () => {
		const input = agentConfigInput.parse({
			name: "A",
			goal: "Help the caller.",
			channels: { mode: "voice" },
		});
		const compiled = toGatewayConfig(input, persona);
		expect(compiled.tts.provider).toBe("xai");
		expect(compiled.tts.voice).toBe("ara");
		expect(compiled.llm.model).toBe("grok-4-fast");
	});
});

describe("extractGoalFromComposite", () => {
	const persona = {
		name: "Ava",
		styles: ["warm", "curious"],
		howToRespond: "Confirm the time twice.",
	};
	const goal = "Book the caller an appointment.";

	it("returns clean raw text unchanged (no headers)", () => {
		expect(extractGoalFromComposite(goal)).toBe(goal);
		expect(extractGoalFromComposite("  Just help the caller.  ")).toBe("Just help the caller.");
	});

	it("returns empty string for empty/blank input", () => {
		expect(extractGoalFromComposite("")).toBe("");
		expect(extractGoalFromComposite("   \n  ")).toBe("");
		expect(extractGoalFromComposite(null)).toBe("");
		expect(extractGoalFromComposite(undefined)).toBe("");
	});

	it("extracts the goal body from a single composite (with and without persona)", () => {
		expect(extractGoalFromComposite(composeInstructions(goal, null))).toBe(goal);
		expect(extractGoalFromComposite(composeInstructions(goal, persona, "No pricing."))).toBe(goal);
	});

	it("returns '' when the composite has no GOAL block (goal was empty)", () => {
		const composite = composeInstructions("", persona);
		expect(composite).not.toContain("## GOAL");
		expect(extractGoalFromComposite(composite)).toBe("");
	});

	it("recovers the original goal from a 5x-compounded composite (takes the innermost GOAL)", () => {
		// Simulate the historical bug: each save re-composed from the PREVIOUS
		// composite (loaded back into the goal field), nesting the ## GOAL blocks.
		let text = goal;
		for (let i = 0; i < 5; i++) {
			text = composeInstructions(text, persona, "No pricing.");
		}
		expect((text.match(/## GOAL/g) ?? []).length).toBe(5);
		expect(extractGoalFromComposite(text)).toBe(goal);
	});

	it("is idempotent: compose(extract(compose(goal))) does not grow", () => {
		const c1 = composeInstructions(goal, persona, "No pricing.");
		const derived = extractGoalFromComposite(c1);
		expect(derived).toBe(goal);
		const c2 = composeInstructions(derived, persona, "No pricing.");
		expect(c2).toBe(c1);
		// And a full round-trip through the gateway funnel is byte-stable.
		const cfg1 = toGatewayConfig({ ...baseConfig, guardrails: "No pricing." }, persona);
		const reload = extractGoalFromComposite(cfg1.instructions);
		const cfg2 = toGatewayConfig(
			{ ...baseConfig, goal: reload, guardrails: "No pricing." },
			persona,
		);
		expect(cfg2.instructions).toBe(cfg1.instructions);
	});
});
