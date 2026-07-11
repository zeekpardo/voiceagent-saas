import { z } from "zod";

/**
 * Canonical schema + defaults + pure helpers for a saved Website Widget's
 * config blobs (appearance / targeting / behavior). Lives in `packages/api`
 * so it is the ONE source of truth shared by:
 *   - the oRPC `sources.widgets` procedures (validate on write),
 *   - the public config-by-ID route (sanitize on read),
 *   - the Studio UI + live preview (types), and
 *   - the embed page (apply on render).
 *
 * The three blobs are stored as Prisma `Json`; every read runs back through
 * these schemas so stale rows written before a field existed still fill in
 * sane defaults instead of throwing.
 */

// ---------------------------------------------------------------- appearance

export const WIDGET_STYLES = ["bubble", "card", "panel", "bar"] as const;
export const WIDGET_POSITIONS = ["left", "right"] as const;
export const WIDGET_THEMES = ["system", "light", "dark"] as const;
export const WIDGET_ICONS = ["chat", "help", "smile", "headset", "mic"] as const;
export const WIDGET_VISUALIZERS = ["bars", "pulse", "waveform", "dots"] as const;

export type WidgetStyle = (typeof WIDGET_STYLES)[number];
export type WidgetPosition = (typeof WIDGET_POSITIONS)[number];
export type WidgetTheme = (typeof WIDGET_THEMES)[number];
export type WidgetIcon = (typeof WIDGET_ICONS)[number];
export type WidgetVisualizer = (typeof WIDGET_VISUALIZERS)[number];

export const widgetAppearanceSchema = z.object({
	style: z.enum(WIDGET_STYLES).catch("bubble").default("bubble"),
	position: z.enum(WIDGET_POSITIONS).catch("right").default("right"),
	accent: z.string().max(64).catch("#6366f1").default("#6366f1"),
	theme: z.enum(WIDGET_THEMES).catch("system").default("system"),
	icon: z.enum(WIDGET_ICONS).catch("chat").default("chat"),
	headerTitle: z.string().max(80).catch("Voice assistant").default("Voice assistant"),
	welcomeMessage: z.string().max(500).catch("").default(""),
	placeholder: z.string().max(120).catch("Type a message…").default("Type a message…"),
	visualizer: z.enum(WIDGET_VISUALIZERS).catch("bars").default("bars"),
	voice: z.boolean().catch(true).default(true),
	chat: z.boolean().catch(true).default(true),
	showOnlineDot: z.boolean().catch(true).default(true),
});

export type WidgetAppearance = z.infer<typeof widgetAppearanceSchema>;

// ---------------------------------------------------------------- targeting

export const widgetTargetingRuleSchema = z.object({
	pattern: z.string().max(500),
});

export type WidgetTargetingRule = z.infer<typeof widgetTargetingRuleSchema>;

export const widgetTargetingSchema = z.object({
	include: z.array(widgetTargetingRuleSchema).catch([]).default([]),
	exclude: z.array(widgetTargetingRuleSchema).catch([]).default([]),
});

export type WidgetTargeting = z.infer<typeof widgetTargetingSchema>;

// ---------------------------------------------------------------- behavior

/** v1 only auto-opens the widget; kept as a union so more actions can land later. */
export const WIDGET_TRIGGER_ACTIONS = ["open"] as const;
export type WidgetTriggerAction = (typeof WIDGET_TRIGGER_ACTIONS)[number];

export const widgetBehaviorSchema = z.object({
	exitIntent: z
		.object({
			enabled: z.boolean().catch(false).default(false),
			action: z.enum(WIDGET_TRIGGER_ACTIONS).catch("open").default("open"),
		})
		.catch({ enabled: false, action: "open" })
		.default({ enabled: false, action: "open" }),
	timeOnPage: z
		.object({
			enabled: z.boolean().catch(false).default(false),
			seconds: z.number().int().min(1).max(3600).catch(20).default(20),
			action: z.enum(WIDGET_TRIGGER_ACTIONS).catch("open").default("open"),
		})
		.catch({ enabled: false, seconds: 20, action: "open" })
		.default({ enabled: false, seconds: 20, action: "open" }),
	scrollPercent: z
		.object({
			enabled: z.boolean().catch(false).default(false),
			percent: z.number().int().min(1).max(100).catch(50).default(50),
			action: z.enum(WIDGET_TRIGGER_ACTIONS).catch("open").default("open"),
		})
		.catch({ enabled: false, percent: 50, action: "open" })
		.default({ enabled: false, percent: 50, action: "open" }),
});

export type WidgetBehavior = z.infer<typeof widgetBehaviorSchema>;

// ---------------------------------------------------------------- defaults

export const WIDGET_APPEARANCE_DEFAULTS: WidgetAppearance = widgetAppearanceSchema.parse({});
export const WIDGET_TARGETING_DEFAULTS: WidgetTargeting = widgetTargetingSchema.parse({});
export const WIDGET_BEHAVIOR_DEFAULTS: WidgetBehavior = widgetBehaviorSchema.parse({});

// ---------------------------------------------------------------- parsing helpers

/** Coerce a stored Json blob (or anything) into a fully-defaulted appearance. */
export function parseWidgetAppearance(value: unknown): WidgetAppearance {
	return widgetAppearanceSchema.parse(value ?? {});
}

export function parseWidgetTargeting(value: unknown): WidgetTargeting {
	return widgetTargetingSchema.parse(value ?? {});
}

export function parseWidgetBehavior(value: unknown): WidgetBehavior {
	return widgetBehaviorSchema.parse(value ?? {});
}

// ---------------------------------------------------------------- targeting matcher

/**
 * Whether a single URL pattern matches a full page URL. A pattern containing
 * `*` is a wildcard (each `*` matches any run of characters); otherwise it's a
 * plain case-insensitive substring test. Blank patterns never match. Matching
 * is done against the full `location.href` the loader passes in.
 */
export function widgetPatternMatches(pattern: string, url: string): boolean {
	const trimmed = pattern.trim();
	if (!trimmed) return false;
	const haystack = url.toLowerCase();
	const needle = trimmed.toLowerCase();
	if (!needle.includes("*")) return haystack.includes(needle);
	// Escape regex metacharacters, then turn each "*" into ".*".
	const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replaceAll("\\*", ".*");
	try {
		return new RegExp(escaped).test(haystack);
	} catch {
		return false;
	}
}

/**
 * Evaluate the include/exclude rules against a page URL:
 *   - an empty `include` list means "every page" (opt-out model),
 *   - otherwise the URL must match at least one include pattern,
 *   - any matching `exclude` pattern always wins (hides the widget).
 * Blank patterns are ignored on both sides.
 */
export function widgetTargetingMatches(url: string, targeting: WidgetTargeting): boolean {
	const includes = targeting.include.map((r) => r.pattern).filter((p) => p.trim() !== "");
	const excludes = targeting.exclude.map((r) => r.pattern).filter((p) => p.trim() !== "");
	if (excludes.some((p) => widgetPatternMatches(p, url))) return false;
	if (includes.length === 0) return true;
	return includes.some((p) => widgetPatternMatches(p, url));
}

// ---------------------------------------------------------------- public sanitizer

export interface WidgetPublicConfig {
	name: string;
	appearance: WidgetAppearance;
	targeting: WidgetTargeting;
	behavior: WidgetBehavior;
	token: string;
}

/**
 * Shape a stored widget row into the payload the PUBLIC config-by-ID endpoint
 * serves. Only non-secret, render-relevant fields are exposed — never the
 * sourceId, organizationId, agentId, or origins allowlist. The `token` is the
 * same public capability that already lives in the pasted snippet today.
 */
export function sanitizeWidgetConfig(row: {
	name: string;
	widgetToken: string;
	appearance: unknown;
	targeting: unknown;
	behavior: unknown;
}): WidgetPublicConfig {
	return {
		name: row.name,
		appearance: parseWidgetAppearance(row.appearance),
		targeting: parseWidgetTargeting(row.targeting),
		behavior: parseWidgetBehavior(row.behavior),
		token: row.widgetToken,
	};
}
