import { resolveCustomFieldIds } from "./custom-fields";
import type { CrmProvider } from "./provider";
import { STANDARD_CONTACT_FIELDS, normalizeName, toStandardWrite } from "./standard-fields";

/**
 * The reusable heart of CRM field mapping. Everything routes through here so
 * the picker, the post-call sync, and any future caller agree:
 *   - listContactFields: the unified {standard + this subaccount's custom} list
 *   - applyFieldMappings: write extracted values to a contact by their mappings
 *
 * Mappings store a stable `contactField` KEY ("contact.email" / "contact.pool")
 * — never a per-subaccount id. Standard keys write to the real contact record;
 * custom keys resolve to THIS subaccount's field by name (create-if-missing).
 */

export interface ContactFieldOption {
	/** Unified stable key, e.g. "contact.email" / "contact.pool" / "location.city". */
	key: string;
	/** Human label for the picker, e.g. "Email". */
	label: string;
	/** "standard" = a fixed catalog field; "custom" = a CRM-defined custom field. */
	kind: "standard" | "custom";
	/**
	 * Which record the field belongs to. Defaults to "contact" when omitted (kept
	 * optional so existing consumers of the contact-only list are unaffected).
	 */
	namespace?: "contact" | "location";
	/** The CRM's data type for a custom field (e.g. "TEXT", "SINGLE_OPTIONS"), when known. */
	dataType?: string;
	/** Picklist values when the CRM exposes them (single/multi-select fields). */
	options?: string[];
}

/**
 * The fixed LOCATION field catalog (the connected sub-account/location itself),
 * CloseBot-style, keyed `location.*`. Always listed — like the standard contact
 * fields — so the builder can reference the account's own details regardless of
 * whether a live CRM fetch succeeds. There are no per-location "custom" fields
 * in this catalog; it's a stable set every provider exposes the same way.
 */
export const LOCATION_FIELDS: { key: string; label: string }[] = [
	{ key: "location.name", label: "Location Name" },
	{ key: "location.address", label: "Location Address" },
	{ key: "location.city", label: "Location City" },
	{ key: "location.state", label: "Location State" },
	{ key: "location.postal_code", label: "Location Postal Code" },
	{ key: "location.country", label: "Location Country" },
	{ key: "location.phone", label: "Location Phone" },
	{ key: "location.email", label: "Location Email" },
	{ key: "location.website", label: "Location Website" },
	{ key: "location.timezone", label: "Location Timezone" },
	{ key: "location.id", label: "Location ID" },
];

/** The standard contact catalog as picker options (no CRM call — always available). */
export function standardContactFieldOptions(): ContactFieldOption[] {
	return STANDARD_CONTACT_FIELDS.map((f) => ({
		key: f.key,
		label: f.label,
		kind: "standard",
		namespace: "contact",
	}));
}

/** The location catalog as picker options (no CRM call — always available). */
export function locationFieldOptions(): ContactFieldOption[] {
	return LOCATION_FIELDS.map((f) => ({
		key: f.key,
		label: f.label,
		kind: "standard",
		namespace: "location",
	}));
}

/** Dedupe options by key, first occurrence wins (preserves order). */
export function dedupeFieldOptions(options: ContactFieldOption[]): ContactFieldOption[] {
	const seen = new Set<string>();
	const out: ContactFieldOption[] = [];
	for (const o of options) {
		if (seen.has(o.key)) continue;
		seen.add(o.key);
		out.push(o);
	}
	return out;
}

/** "callback_number" / "contact.callback_number" → "Callback Number". */
export function humanizeKey(key: string): string {
	return (key.split(".").pop() ?? key)
		.split(/[_\s-]+/)
		.filter(Boolean)
		.map((w) => w[0]!.toUpperCase() + w.slice(1))
		.join(" ");
}

/** Standard catalog + the subaccount's custom fields, ready for the picker. */
export async function listContactFields(provider: CrmProvider): Promise<ContactFieldOption[]> {
	const standard = standardContactFieldOptions();
	const custom = await provider.listCustomFields();
	const seen = new Set(standard.map((s) => s.key));
	const customOptions: ContactFieldOption[] = [];
	for (const f of custom) {
		const key = f.key || `contact.${normalizeName(f.name)}`;
		if (seen.has(key)) continue; // a custom field shadowing a standard key — skip the dupe
		seen.add(key);
		customOptions.push({
			key,
			label: f.name,
			kind: "custom",
			namespace: "contact",
			dataType: f.dataType,
			options: f.options?.length ? f.options : undefined,
		});
	}
	return [...standard, ...customOptions];
}

export interface MappingEntry {
	extractField: string;
	/** Unified target key, e.g. "contact.email" or "contact.pool". */
	contactField?: string;
	/** Display label captured at pick time — used to create a missing custom field nicely. */
	contactFieldLabel?: string;
	// Legacy shapes (older saved mappings), still honored:
	standardField?: string;
	crmFieldId?: string;
	crmFieldName?: string;
}

/** The target key for a mapping, tolerating legacy shapes. */
function targetKey(m: MappingEntry): string | undefined {
	return m.contactField ?? m.standardField ?? m.crmFieldName;
}

/** A friendly name to create a missing custom field with. */
function targetLabel(m: MappingEntry, key: string): string {
	return m.contactFieldLabel ?? m.crmFieldName ?? humanizeKey(key);
}

/**
 * Write extracted values to a contact per its mappings. Standard keys go to the
 * contact record (decomposed + normalized); custom keys resolve to this
 * subaccount's field by name (create-if-missing). "unknown"/empty never writes.
 * Returns the number of slots written.
 */
export async function applyFieldMappings(
	provider: CrmProvider,
	contactId: string,
	mappings: MappingEntry[],
	values: Record<string, string>,
): Promise<number> {
	const present = mappings
		.map((m) => ({ m, key: targetKey(m), value: values[m.extractField] }))
		.filter(
			(x): x is { m: MappingEntry; key: string; value: string } =>
				!!x.key && x.value != null && x.value !== "unknown",
		);

	const standardWrites: Record<string, string> = {};
	const customTargets: { name: string; value: string }[] = [];
	for (const { m, key, value } of present) {
		const std = toStandardWrite(key, value);
		if (std) Object.assign(standardWrites, std);
		else customTargets.push({ name: targetLabel(m, key), value });
	}

	let written = 0;
	if (Object.keys(standardWrites).length > 0) {
		await provider.updateContactStandard(contactId, standardWrites);
		written += Object.keys(standardWrites).length;
	}
	if (customTargets.length > 0) {
		const idByName = await resolveCustomFieldIds(
			provider,
			customTargets.map((t) => t.name),
		);
		const writes = customTargets
			.map((t) => {
				const id = idByName.get(normalizeName(t.name));
				return id ? { fieldId: id, value: t.value } : null;
			})
			.filter((w): w is { fieldId: string; value: string } => w !== null);
		if (writes.length > 0) {
			await provider.updateContactFields(contactId, writes);
			written += writes.length;
		}
	}
	return written;
}
