import {
	PERSONA_PROMPT_MAX_CHARS,
	baselineVoiceRealism,
	composeInstructions,
	guardrailsPrompt,
	personaPrompt,
} from "@repo/api/modules/voiceagents/lib/persona-prompt";
import { agentConfigInput, toGatewayConfig } from "@repo/api/modules/voiceagents/lib/schema";
import { describe, expect, it } from "vitest";

const baseConfig = agentConfigInput.parse({
	name: "Test Agent",
	instructions: "Book the caller an appointment.",
});

describe("persona prompt compilation", () => {
	it("assembles persona → GOAL → GUARDRAILS → VOICE STYLE, in that order", () => {
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
});
