import {
	PERSONA_PROMPT_MAX_CHARS,
	baselineVoiceRealism,
	composeInstructions,
	personaPrompt,
} from "@repo/api/modules/voiceagents/lib/persona-prompt";
import { agentConfigInput, toGatewayConfig } from "@repo/api/modules/voiceagents/lib/schema";
import { describe, expect, it } from "vitest";

const baseConfig = agentConfigInput.parse({
	name: "Test Agent",
	instructions: "Book the caller an appointment.",
});

describe("persona prompt compilation", () => {
	it("prepends persona blocks then baseline, in order, ahead of the base instructions", () => {
		const compiled = toGatewayConfig(baseConfig, {
			name: "Ava",
			styles: ["warm", "curious"],
			howToRespond: "Always confirm the appointment time twice.",
		});
		const text = compiled.instructions;

		// Every expected block is present...
		expect(text).toContain("## IDENTITY");
		expect(text).toContain("You are Ava");
		expect(text).toContain("## PERSONALITY");
		expect(text).toContain("## HOW TO RESPOND");
		expect(text).toContain("Always confirm the appointment time twice.");
		expect(text).toContain("## VOICE STYLE");
		expect(text).toContain("Book the caller an appointment.");

		// ...and in the required order: persona → baseline → base instructions.
		const iIdentity = text.indexOf("## IDENTITY");
		const iPersonality = text.indexOf("## PERSONALITY");
		const iHowTo = text.indexOf("## HOW TO RESPOND");
		const iVoice = text.indexOf("## VOICE STYLE");
		const iBase = text.indexOf("Book the caller an appointment.");
		expect(iIdentity).toBeLessThan(iPersonality);
		expect(iPersonality).toBeLessThan(iHowTo);
		expect(iHowTo).toBeLessThan(iVoice);
		expect(iVoice).toBeLessThan(iBase);
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

	it("composeInstructions returns only baseline + base when persona is null", () => {
		const text = composeInstructions("Say hello.", null);
		expect(text.startsWith(baselineVoiceRealism())).toBe(true);
		expect(text.endsWith("Say hello.")).toBe(true);
	});
});
