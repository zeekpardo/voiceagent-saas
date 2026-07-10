/**
 * Persona → prompt compilation.
 *
 * Personas are a reusable identity/tone/behavior layer (the CloseBot-style
 * "persona" adapted for voice). They compile into the agent's global
 * instruction text — the engine has NO persona concept, it just runs the
 * resulting prompt. Two pieces are produced:
 *
 *   1. `baselineVoiceRealism()` — a `## VOICE STYLE` block applied to EVERY
 *      compiled agent (persona attached or not). It implements LiveKit's
 *      prompting-guide advice plus the specific complaints that motivated this
 *      work: agents that thank the caller constantly and repeat the caller's
 *      name every reply. It is prescriptive and short, with bad/good examples.
 *   2. `personaPrompt(persona)` — the `## IDENTITY` / `## PERSONALITY` /
 *      `## HOW TO RESPOND` blocks derived from a persona, capped in size.
 *
 * `composeInstructions()` prepends persona + baseline to the base instructions
 * in the order the engine should receive them.
 */

/** The persona fields prompt compilation reads. A subset of the DB row so both
 *  the procedures and tests (and the UI) can build one without the full model. */
export interface PersonaPromptInput {
	name: string;
	styles: string[];
	howToRespond: string;
}

/** Total persona prompt is capped so it never crowds out the flow's own
 *  instructions. The `## HOW TO RESPOND` free-text section is trimmed first. */
export const PERSONA_PROMPT_MAX_CHARS = 1500;

/**
 * The `## VOICE STYLE` block stamped onto every compiled agent. Not subject to
 * the persona cap — it is small and always applies, even with no persona.
 */
export function baselineVoiceRealism(): string {
	return `## VOICE STYLE
You are speaking out loud on a phone call. Everything you say is converted to speech, so talk the way real people talk.

- Plain spoken words only. No markdown, bullet points, numbered lists, headings, emojis, or symbols — they get read aloud literally.
- Keep replies short: one to three sentences, and ask only one question at a time.
- Spell out numbers, money, emails, and phone numbers as words so they are spoken correctly. Say "four oh two, five five five, one two one two" rather than "402-555-1212", and "jane at acme dot com" rather than "jane@acme.com".
- Never open two turns in a row the same way. Rotate your openers and acknowledgments — do not begin reply after reply with "Great", "Sure", "Okay", "Got it", or "Perfect".
- Thank the caller at most once per topic, and never twice in a row.
  Bad: "Thanks! ... Thank you for that. ... Thanks again!"
  Good: thank them once, when it genuinely fits, then just move on.
- Use the caller's name sparingly: at most once early in the call, and after that only when it truly serves the moment. Never use it as filler at the start or end of a reply.
  Bad: "Hi John! ... Sure thing, John. ... Thanks, John!"
  Good: "Hi, thanks for calling. ... Sure, I can help with that. ... You're all set."
- Vary how you begin your sentences; avoid repeating the same phrase or structure turn after turn.
- Refer back to what was said earlier loosely and in your own words rather than quoting it verbatim.`;
}

/** Common tone words → 1-2 lines describing the trait as an AUDIBLE behavior
 *  (LiveKit guidance: personality should shape how the agent sounds, not be
 *  announced). Unknown words fall back to a generic line. */
const STYLE_BEHAVIORS: Record<string, string> = {
	friendly: "Be warm and approachable, and sound genuinely glad to help.",
	professional: "Stay polished and composed; keep it competent and to the point.",
	warm: "Let real warmth into your tone; sound caring rather than scripted.",
	direct: "Get to the point and say what you mean without hedging or padding.",
	curious: "Show genuine interest and ask thoughtful follow-up questions.",
	calm: "Keep an even, unhurried pace and project steadiness.",
	confident: "Speak with easy assurance; sound sure of what you are saying.",
	empathetic: "Acknowledge how the caller feels before moving things forward.",
	playful: "Allow a light, easy humor to surface when the moment fits.",
	concise: "Say things in as few words as the moment allows.",
	patient: "Give the caller room; never rush them or talk over them.",
	enthusiastic: "Let real energy come through, without tipping into hype.",
};

function styleBehavior(style: string): string {
	const key = style.trim().toLowerCase();
	return STYLE_BEHAVIORS[key] ?? `Let a ${key} quality come through in how you sound.`;
}

/** Build the "You are {name}, ..." identity descriptor from the style words. */
function identityLine(name: string, styles: string[]): string {
	const clean = styles.map((s) => s.trim().toLowerCase()).filter(Boolean);
	if (clean.length === 0) {
		return `You are ${name}, the voice on this call.`;
	}
	return `You are ${name}, a ${joinNaturally(clean)} presence on the call.`;
}

function joinNaturally(items: string[]): string {
	if (items.length <= 1) {
		return items.join("");
	}
	if (items.length === 2) {
		return `${items[0]} and ${items[1]}`;
	}
	return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/**
 * Compile a persona into its `## IDENTITY` / `## PERSONALITY` / `## HOW TO
 * RESPOND` blocks. Capped at PERSONA_PROMPT_MAX_CHARS: the free-text
 * `## HOW TO RESPOND` section is trimmed first (it is the only unbounded part),
 * then the whole thing is hard-sliced as a final guard.
 */
export function personaPrompt(persona: PersonaPromptInput): string {
	const styles = persona.styles.slice(0, 3);

	const identity = `## IDENTITY\n${identityLine(persona.name, styles)}`;

	const behaviorLines = styles.map((s) => `- ${styleBehavior(s)}`);
	const personality =
		behaviorLines.length > 0
			? `## PERSONALITY\nLet these traits show in how you sound, not in what you announce:\n${behaviorLines.join("\n")}`
			: "";

	const fixed = [identity, personality].filter(Boolean).join("\n\n");

	const howTo = persona.howToRespond.trim();
	if (!howTo) {
		return fixed.slice(0, PERSONA_PROMPT_MAX_CHARS);
	}

	const header = "## HOW TO RESPOND\n";
	// Budget left for the how-to body after the fixed blocks + separators.
	const budget = PERSONA_PROMPT_MAX_CHARS - fixed.length - "\n\n".length - header.length;
	let body = howTo;
	if (body.length > budget) {
		body = budget > 1 ? `${body.slice(0, budget - 1).trimEnd()}…` : "";
	}

	const parts = body ? [fixed, `${header}${body}`] : [fixed];
	return parts.join("\n\n").slice(0, PERSONA_PROMPT_MAX_CHARS);
}

/**
 * Prepend persona (if any) then the baseline voice-style block to the base
 * instructions. Order the engine receives: persona → baseline → base. The
 * baseline applies even when there is no persona.
 */
export function composeInstructions(
	baseInstructions: string,
	persona?: PersonaPromptInput | null,
): string {
	const prefix = [persona ? personaPrompt(persona) : "", baselineVoiceRealism()]
		.filter(Boolean)
		.join("\n\n");
	const base = baseInstructions.trim();
	return base ? `${prefix}\n\n${base}` : prefix;
}
