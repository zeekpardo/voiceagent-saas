/**
 * Shaping helpers for the engine's /v1/limits response (multi-account plan
 * §2). Kept free of @repo/database / @orpc/server imports so they're cheap
 * to unit test (see usage-bucketing.ts for the same rationale).
 */

export type LimitScope = "project" | "agent" | "group";

/** Raw row shape returned by the engine (snake_case, straight off Postgres). */
export interface GatewayLimitRow {
	scope: LimitScope;
	ref: string;
	max_concurrent: number;
	updated_at: string;
}

export interface GatewayLimitsResponse {
	limits: GatewayLimitRow[];
	project_default: number | null;
}

/** Camel-cased row shape returned by the SaaS API, with scope "group" rows
 * (ref = sourceId) enriched with the source's display name where resolvable. */
export interface LimitRow {
	scope: LimitScope;
	ref: string;
	maxConcurrent: number;
	updatedAt: string;
	sourceName?: string;
}

/** Maps the engine's raw limit rows to the SaaS API's camelCase shape,
 * resolving scope "group" refs (= sourceId) to source names via the
 * provided lookup list. Refs with no matching source (e.g. deleted, or —
 * since this endpoint is platform-admin and spans orgs — simply unresolved)
 * are left without a sourceName rather than dropped. */
export function shapeLimitRows(
	rows: GatewayLimitRow[],
	sources: { id: string; name: string }[],
): LimitRow[] {
	const nameById = new Map(sources.map((source) => [source.id, source.name]));
	return rows.map((row) => ({
		scope: row.scope,
		ref: row.ref,
		maxConcurrent: row.max_concurrent,
		updatedAt: row.updated_at,
		...(row.scope === "group" && nameById.has(row.ref)
			? { sourceName: nameById.get(row.ref) }
			: {}),
	}));
}

/** True when `ref` is missing/blank for a scope that requires it. The engine
 * enforces the same rule server-side; checking here lets the procedure fail
 * fast with a clearer message before making the gateway round-trip. */
export function refRequiredForScope(scope: LimitScope, ref?: string): boolean {
	return scope !== "project" && !ref?.trim();
}
