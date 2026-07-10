import type { CrmProvider } from "./provider";
import { normalizeName } from "./standard-fields";

/**
 * Resolve custom-field NAMES to THIS subaccount's field ids (find-or-create).
 *
 * Custom field ids are per-subaccount, so a mapping must never write by a
 * stored id — it carries the field NAME and we resolve to the right id at write
 * time. The same agent then works across every connected location: the field is
 * matched by name (or the last segment of its CRM key), and created if missing.
 *
 * Lists the subaccount's fields ONCE and resolves the whole batch against it.
 * Returns normalizedName -> fieldId.
 */
export async function resolveCustomFieldIds(
	provider: CrmProvider,
	names: string[],
): Promise<Map<string, string>> {
	const requested = names.map(normalizeName).filter(Boolean);
	if (requested.length === 0) return new Map();

	const existing = await provider.listCustomFields();
	const byNorm = new Map<string, string>();
	for (const f of existing) {
		byNorm.set(normalizeName(f.name), f.id);
		const lastKeySegment = f.key?.split(".").pop();
		if (lastKeySegment) byNorm.set(normalizeName(lastKeySegment), f.id);
	}

	const out = new Map<string, string>();
	for (const name of names) {
		const norm = normalizeName(name);
		if (!norm || out.has(norm)) continue;
		let id = byNorm.get(norm);
		if (!id) {
			const created = await provider.createCustomField(name);
			id = created.id;
			byNorm.set(norm, id);
		}
		out.set(norm, id);
	}
	return out;
}
