import type { MessageChannel } from "./channels";

/**
 * Inbound-message → agent routing for omni-channel conversations. Pure and
 * CRM-neutral so it's unit-testable: given a source's (agent, source) mapping
 * rows and the inbound channel + the contact's tags, pick the ONE agent that
 * should handle the turn.
 *
 * Rules (mirrors the outbound trigger's gating):
 *  - the row must be `enabled`,
 *  - its `channels` must include the inbound channel,
 *  - the contact must pass the row's tag filters,
 *  - one agent per channel per source is enforced at save time, so the first
 *    qualifying row is THE match (deterministic by the caller's row order).
 */

export interface TagFilter {
	tag: string;
	mode: "is" | "is_not";
}

/** A minimal view of a VoiceAgentSource row for routing. */
export interface RoutableAgentSource {
	agentId: string;
	enabled: boolean;
	channels: unknown;
	tagFilters: unknown;
}

/**
 * Per-(agent, source) contact-tag gate: every condition must hold. An empty
 * filter set always passes. Tag matching is case-insensitive.
 */
export function passesTagFilters(
	filters: TagFilter[],
	contactTagsCsv: string | undefined,
): boolean {
	if (filters.length === 0) return true;
	const tags = new Set(
		(contactTagsCsv ?? "")
			.split(",")
			.map((t) => t.trim().toLowerCase())
			.filter(Boolean),
	);
	return filters.every((f) =>
		f.mode === "is" ? tags.has(f.tag.toLowerCase()) : !tags.has(f.tag.toLowerCase()),
	);
}

function coerceChannels(value: unknown): string[] {
	return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

function coerceTagFilters(value: unknown): TagFilter[] {
	if (!Array.isArray(value)) return [];
	return value.filter(
		(f): f is TagFilter =>
			!!f &&
			typeof (f as TagFilter).tag === "string" &&
			((f as TagFilter).mode === "is" || (f as TagFilter).mode === "is_not"),
	);
}

/**
 * Resolve the agent that should handle an inbound message on `channel` for a
 * source, or null when none qualifies. `contactTagsCsv` is the contact's tags
 * (comma-separated) used for the tag-filter gate.
 */
export function resolveInboundAgent(input: {
	rows: RoutableAgentSource[];
	channel: MessageChannel;
	contactTagsCsv?: string;
}): RoutableAgentSource | null {
	for (const row of input.rows) {
		if (!row.enabled) continue;
		if (!coerceChannels(row.channels).includes(input.channel)) continue;
		if (!passesTagFilters(coerceTagFilters(row.tagFilters), input.contactTagsCsv)) continue;
		return row;
	}
	return null;
}
