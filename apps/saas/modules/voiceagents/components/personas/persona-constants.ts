/** Eight preset theme colors for a persona's avatar backdrop / accent. */
export const PERSONA_THEME_COLORS = [
	"#6366f1", // indigo
	"#0ea5e9", // sky
	"#14b8a6", // teal
	"#10b981", // emerald
	"#f59e0b", // amber
	"#f97316", // orange
	"#ef4444", // red
	"#ec4899", // pink
] as const;

export const DEFAULT_PERSONA_THEME_COLOR = PERSONA_THEME_COLORS[0];

/** Suggested tone words offered as one-tap chips in the editor. */
export const PERSONA_STYLE_SUGGESTIONS = [
	"warm",
	"curious",
	"professional",
	"direct",
	"calm",
	"playful",
] as const;

export const MAX_PERSONA_STYLES = 3;

export const HOW_TO_RESPOND_MAX = 3000;

export const HOW_TO_RESPOND_PLACEHOLDER =
	"Don't use the contact's name in replies. Keep answers concise and natural — a sentence or two at a time. Never sound scripted; mirror the caller's energy and ask one question at a time.";

export const GUARDRAILS_MAX = 4000;

export const GUARDRAILS_PLACEHOLDER =
	"Never provide medical, legal, or financial advice. Don't discuss pricing outside the approved range. If the caller sounds distressed or asks for a human, offer to transfer or escalate immediately.";

/** Sentinel Select value meaning "no override — use the agent/engine default". */
export const NO_PREFERENCE_VALUE = "__default__";

/**
 * Readable foreground (near-black or white) for text drawn on a hex backdrop,
 * chosen by perceived luminance so initials stay legible on any theme color.
 */
export function contrastText(hex: string): string {
	const parsed = hex.replace("#", "");
	if (parsed.length !== 6) {
		return "#ffffff";
	}
	const r = Number.parseInt(parsed.slice(0, 2), 16);
	const g = Number.parseInt(parsed.slice(2, 4), 16);
	const b = Number.parseInt(parsed.slice(4, 6), 16);
	// Rec. 601 luma.
	const luma = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
	return luma > 0.6 ? "#0a0a0a" : "#ffffff";
}
