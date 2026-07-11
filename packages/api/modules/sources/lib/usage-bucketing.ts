/**
 * Pure usage-shaping helpers, kept free of `@repo/database` / `@repo/auth`
 * imports so they're cheap to unit test (importing the procedures file pulls
 * in Prisma/Better Auth client construction, which needs a live DATABASE_URL).
 */

/** The engine's per-group usage aggregate over a call window. `group_ref` is
 * the SaaS sourceId (the trigger route sends metadata.source_id, and the
 * engine falls back to it when populating group_ref). A call the engine
 * couldn't attribute to a group comes back with `group_ref: null`. */
export interface GatewayUsageGroup {
	group_ref: string | null;
	calls: number;
	active_calls: number;
	total_seconds: number;
}

export interface GatewayUsageResponse {
	groups: GatewayUsageGroup[];
	totals: { calls: number; active_calls: number; total_seconds: number };
}

/** Normalized usage shape the UI renders. */
export interface SourceUsage {
	calls: number;
	activeCalls: number;
	totalSeconds: number;
	totalMinutes: number;
	/** True when the engine couldn't be reached — the UI should render zeros, not an error. */
	unavailable?: boolean;
}

export interface SourceUsageRow extends SourceUsage {
	/** null identifies the "Unattributed" bucket. */
	sourceId: string | null;
	sourceName: string;
}

export function usageWindow(days: number | undefined, defaultDays: number) {
	const to = new Date();
	const from = new Date(to.getTime() - (days ?? defaultDays) * 24 * 60 * 60 * 1000);
	return { from: from.toISOString(), to: to.toISOString() };
}

/** Round to one decimal — enough precision for a "minutes" stat, no more. */
export function secondsToMinutes(seconds: number) {
	return Math.round((seconds / 60) * 10) / 10;
}

export function emptyUsage(unavailable = false): SourceUsage {
	return { calls: 0, activeCalls: 0, totalSeconds: 0, totalMinutes: 0, unavailable };
}

export function usageFromGroup(group: GatewayUsageGroup | undefined): SourceUsage {
	if (!group) {
		return emptyUsage();
	}
	return {
		calls: group.calls,
		activeCalls: group.active_calls,
		totalSeconds: group.total_seconds,
		totalMinutes: secondsToMinutes(group.total_seconds),
	};
}

/**
 * Join the engine's raw usage groups against the org's known sources.
 * Every org source gets a row (defaulting to zero usage so the table is
 * stable), plus a single "Unattributed" row for groups that don't match a
 * known source (null group_ref, or a group_ref for a source outside this org).
 */
export function bucketUsageByOrgSources(
	groups: GatewayUsageGroup[],
	orgSources: { id: string; name: string }[],
): SourceUsageRow[] {
	const bySourceId = new Map<string, SourceUsageRow>(
		orgSources.map((source) => [
			source.id,
			{
				sourceId: source.id,
				sourceName: source.name,
				...emptyUsage(),
			},
		]),
	);
	const unattributed: SourceUsageRow = {
		sourceId: null,
		sourceName: "Unattributed",
		...emptyUsage(),
	};

	for (const group of groups) {
		const row = (group.group_ref && bySourceId.get(group.group_ref)) || unattributed;
		row.calls += group.calls;
		row.activeCalls += group.active_calls;
		row.totalSeconds += group.total_seconds;
		row.totalMinutes = secondsToMinutes(row.totalSeconds);
	}

	return [...bySourceId.values(), unattributed];
}
