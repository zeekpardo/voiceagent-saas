import type { CustomVariableDef } from "./schema";

/**
 * Job Flow Variables — dispatch-time merge.
 *
 * Agent-level custom variable DEFINITIONS live on the agent config
 * (`config.customVariables`); per-source VALUE overrides live on the
 * VoiceAgentSource mapping (`mapping.variableValues`). At dispatch we fold them
 * into the runtime `variables` map the engine interpolates, with this
 * precedence (last wins):
 *
 *   definition default  <  per-source value  <  existing runtime variable
 *
 * Runtime variables (CRM-derived + explicit) always win so a live contact value
 * or an explicit override is never masked by a static default. Empty strings are
 * treated as "unset" for defaults and per-source values so they don't clobber a
 * real runtime value.
 */

/** Read + sanity-check the custom-variable definitions off an agent config. */
export function readCustomVariableDefs(
	config: Record<string, unknown> | undefined | null,
): CustomVariableDef[] {
	const raw = config?.customVariables;
	if (!Array.isArray(raw)) {
		return [];
	}
	const defs: CustomVariableDef[] = [];
	for (const entry of raw) {
		if (!entry || typeof entry !== "object") {
			continue;
		}
		const name = (entry as { name?: unknown }).name;
		if (typeof name !== "string" || !name.trim()) {
			continue;
		}
		const description = (entry as { description?: unknown }).description;
		const def = (entry as { default?: unknown }).default;
		defs.push({
			name,
			...(typeof description === "string" ? { description } : {}),
			...(typeof def === "string" ? { default: def } : {}),
		});
	}
	return defs;
}

/** The per-source value map, tolerant of the loosely-typed Prisma Json column. */
function readVariableValues(
	mapping: { variableValues?: unknown } | undefined | null,
): Record<string, string> {
	const raw = mapping?.variableValues;
	if (!raw || typeof raw !== "object") {
		return {};
	}
	const out: Record<string, string> = {};
	for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
		if (typeof value === "string") {
			out[key] = value;
		}
	}
	return out;
}

/**
 * Merge Job Flow Variables into the runtime variables map.
 *
 * Call sites (every place a call/session is born SaaS-side must merge here):
 *   - apps/saas/app/api/triggers/voice-call/[token]/route.ts  (CRM trigger)
 *   - packages/api/modules/voiceagents/procedures/sessions.ts (builder test session)
 *   - apps/saas/app/api/widget/session/route.ts               (embeddable widget)
 *
 * @param config       the agent config (holds `customVariables` definitions)
 * @param mapping      the per-source VoiceAgentSource row (holds `variableValues`)
 * @param runtimeVars  the variables already assembled for dispatch (win over both)
 */
export function mergeCustomVariables(
	config: Record<string, unknown> | undefined | null,
	mapping: { variableValues?: unknown } | undefined | null,
	runtimeVars: Record<string, string>,
): Record<string, string> {
	const merged: Record<string, string> = {};

	// 1. definition defaults (lowest precedence)
	for (const def of readCustomVariableDefs(config)) {
		if (typeof def.default === "string" && def.default.length > 0) {
			merged[def.name] = def.default;
		}
	}

	// 2. per-source values override defaults (empty string = leave default/unset)
	for (const [name, value] of Object.entries(readVariableValues(mapping))) {
		if (value.trim().length > 0) {
			merged[name] = value;
		}
	}

	// 3. runtime variables always win
	return { ...merged, ...runtimeVars };
}

/**
 * Resolve the per-source `variableValues` to persist, preserving the existing
 * stored map when the caller omits the field (mirrors writeNote's
 * preserve-when-omitted behavior in saveAgentSourceMapping).
 */
export function resolveVariableValues(
	input: Record<string, string> | undefined,
	existing: unknown,
): Record<string, string> {
	if (input !== undefined) {
		return input;
	}
	if (existing && typeof existing === "object") {
		const out: Record<string, string> = {};
		for (const [key, value] of Object.entries(existing as Record<string, unknown>)) {
			if (typeof value === "string") {
				out[key] = value;
			}
		}
		return out;
	}
	return {};
}
