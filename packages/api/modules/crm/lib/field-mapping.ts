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
	key: string;
	label: string;
	kind: "standard" | "custom";
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
	const standard: ContactFieldOption[] = STANDARD_CONTACT_FIELDS.map((f) => ({
		key: f.key,
		label: f.label,
		kind: "standard",
	}));
	const custom = await provider.listCustomFields();
	const seen = new Set(standard.map((s) => s.key));
	const customOptions: ContactFieldOption[] = [];
	for (const f of custom) {
		const key = f.key || `contact.${normalizeName(f.name)}`;
		if (seen.has(key)) continue; // a custom field shadowing a standard key — skip the dupe
		seen.add(key);
		customOptions.push({ key, label: f.name, kind: "custom" });
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
