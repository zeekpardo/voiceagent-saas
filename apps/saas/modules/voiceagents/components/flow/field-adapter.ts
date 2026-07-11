import type { ContactFieldOption } from "@voiceagents/lib/contact-fields-api";

/**
 * Display↔stored adapter for the objective / set_field field pickers.
 *
 * BYTE-COMPAT CONTRACT: objective/set_field `field` is stored — and compiled to
 * the engine — as a plain human string ("First Name", "Full Address", or a
 * bespoke custom name like "Reason for Selling"), NOT a `contact.*` key. The
 * engine's live update_contact tool resolves that string by name OR key for
 * STANDARD fields (packages/api/.../standard-fields.ts → STANDARD_BY_MATCH) and
 * ONLY by name for CUSTOM fields (contact-tools.ts → resolveCustomFieldIds). So
 * we must keep storing the label; a `contact.*` key would fail to resolve for
 * custom fields. The combobox works in key-space, so we map at the seam:
 *
 *   stored string  →  fieldToKey()  →  combobox `value`
 *   combobox key   →  keyToStored()  →  stored string
 *
 * Existing flows load unchanged (nothing is rewritten on open); a value only
 * changes when the user actively re-picks, and it round-trips byte-identically
 * (label → key → same label).
 */

const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, "");

/**
 * The "Full address" standard field's key. Picking it as an objective's output
 * field marks the objective `fullAddress` and keeps it a single normal row in
 * the builder; at compile time it expands into the managed multi-part address
 * collector (see `expandFullAddress` / `newFullAddressObjectiveData`) rather than
 * writing a single field.
 */
export const FULL_ADDRESS_FIELD_KEY = "contact.address";

/** Composite standard fields whose one objective fills every sub-part. */
const COMPOSITE_KEYS = new Set([FULL_ADDRESS_FIELD_KEY, "contact.name"]);

/** Resolve a stored field string to its catalog entry (by key, label, or slug). */
function findField(
	stored: string | undefined,
	fields: ContactFieldOption[],
): ContactFieldOption | undefined {
	if (!stored) return undefined;
	const n = norm(stored);
	return fields.find(
		(f) =>
			f.key === stored ||
			norm(f.key) === n ||
			norm(f.label) === n ||
			norm(f.key.split(".").pop() ?? f.key) === n,
	);
}

/** Stored field string → combobox key (falls back to the raw string for bespoke keys). */
export function fieldToKey(
	stored: string | undefined,
	fields: ContactFieldOption[],
): string | null {
	if (!stored) return null;
	return findField(stored, fields)?.key ?? stored;
}

/** Combobox key (or bespoke string) → the string to STORE on the node's `field`. */
export function keyToStored(key: string | null, fields: ContactFieldOption[]): string {
	if (!key) return "";
	const match = fields.find((f) => f.key === key);
	// Standard + custom: store the human label (engine resolves by name). Bespoke
	// keys typed via allowCustomKey have no catalog entry → store them verbatim.
	return match ? match.label : key;
}

/** Is the currently-stored field a composite (Full Address / Full Name)? */
export function isCompositeField(
	stored: string | undefined,
	fields: ContactFieldOption[],
): boolean {
	const key = fieldToKey(stored, fields);
	return key != null && COMPOSITE_KEYS.has(key);
}

/** Picklist options for the stored field, if it is a select/picklist custom field. */
export function fieldOptionsFor(
	stored: string | undefined,
	fields: ContactFieldOption[],
): string[] | undefined {
	const opts = findField(stored, fields)?.options;
	return opts && opts.length > 0 ? opts : undefined;
}
