import { STANDARD_VARIABLES } from "@voiceagents/components/flow/mentions";

/**
 * Job Flow Variables — builder-side name rules.
 *
 * A custom variable name has to be a valid `{{name}}` / @-mention identifier and
 * must not shadow a built-in runtime variable (contact_*, location_*, caller_*),
 * otherwise its chip would resolve to the CRM value at call time instead of the
 * custom one. Names are normalized to lowercase snake_case on save.
 */

/** Runtime variable names a custom variable must never collide with. */
const RESERVED_NAMES = new Set(STANDARD_VARIABLES);

/**
 * Normalize a raw name into a lowercase snake_case identifier: trim, lowercase,
 * spaces/dashes → underscores, strip anything but [a-z0-9_], and collapse
 * repeated / leading underscores (leading digits are dropped so it stays a
 * valid identifier).
 */
export function normalizeVariableName(raw: string): string {
	return raw
		.trim()
		.toLowerCase()
		.replace(/[\s-]+/g, "_")
		.replace(/[^a-z0-9_]/g, "")
		.replace(/_+/g, "_")
		.replace(/^[0-9_]+/, "")
		.replace(/_+$/, "");
}

export interface VariableNameCheck {
	/** The normalized name (what would be saved). */
	normalized: string;
	valid: boolean;
	/** Human-readable reason when invalid, else undefined. */
	error?: string;
}

/**
 * Validate a raw name against a set of already-used names (excluding the row
 * being edited). Returns the normalized value plus a validity flag + reason.
 */
export function checkVariableName(raw: string, existingNames: string[] = []): VariableNameCheck {
	const normalized = normalizeVariableName(raw);
	if (!normalized) {
		return { normalized, valid: false, error: "Enter a name using letters, numbers or _" };
	}
	if (RESERVED_NAMES.has(normalized)) {
		return {
			normalized,
			valid: false,
			error: `"${normalized}" is a built-in variable — pick another name`,
		};
	}
	if (existingNames.includes(normalized)) {
		return { normalized, valid: false, error: `"${normalized}" is already defined` };
	}
	return { normalized, valid: true };
}
