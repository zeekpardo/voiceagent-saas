import { getAgentSource } from "@repo/database";
import { errMessage } from "@repo/utils";

import { customFieldVariableName, humanizeKey, type MappingEntry } from "./field-mapping";
import { resolveCrmProvider } from "./resolve";
import { normalizeName, STANDARD_CONTACT_FIELDS } from "./standard-fields";

/**
 * Contact state snapshot — the SaaS-side builder for the engine's KNOWN CONTACT
 * INFO prompt block (the CloseBot "UNRESOLVED marker" mechanism). At dispatch we
 * hand the engine, for every field the conversation might touch, its current CRM
 * value or null; the engine renders `label -> value` or `label -> UNRESOLVED` so
 * the agent never re-asks for something it already knows.
 *
 * Boundary: this shapes CRM data, so it lives in the SaaS. The engine only ever
 * sees the generic `{ key, label, value }[]` array — no CRM naming.
 */

export interface ContactStateEntry {
	/** Stable field-mapping-style key, e.g. "contact.first_name" / "contact.kitchen_year". */
	key: string;
	/** Human-readable field name for the prompt. */
	label: string;
	/** Current value, or null when the CRM has no value (engine renders UNRESOLVED). */
	value: string | null;
}

/** The wire shape carried alongside dispatch variables (never inside them). */
export type ContactState = ContactStateEntry[];

/**
 * Parse the comma-separated `contact_tags` context variable into the engine's
 * `contactTags` array (Phase 5b — tag-driven exit routing seed). Returns
 * `undefined` when there are no tags, so the dispatch omits the field. Pure —
 * derives from an already-fetched value, so it never blocks a call.
 */
export function parseContactTags(raw: unknown): string[] | undefined {
	if (typeof raw !== "string" || !raw.trim()) return undefined;
	const tags = raw
		.split(",")
		.map((t) => t.trim())
		.filter(Boolean);
	return tags.length ? tags : undefined;
}

const STANDARD_KEYS = new Set(STANDARD_CONTACT_FIELDS.map((f) => f.key));

/**
 * Interpolation variables for a dispatch's CUSTOM contact fields. Standard
 * slots already flow through getContactContext() as contact_first_name etc. —
 * here we expose only the CUSTOM entries of an already-built contact state
 * (value present, key outside the standard catalog) under their
 * customFieldVariableName. Callers merge these at the LOWEST priority so a
 * name collision with a standard/runtime variable never shadows it.
 */
export function customFieldVariables(state: ContactState | undefined): Record<string, string> {
	const out: Record<string, string> = {};
	for (const entry of state ?? []) {
		if (STANDARD_KEYS.has(entry.key)) continue;
		if (entry.value == null || entry.value === "") continue;
		const name = customFieldVariableName(entry.key);
		if (name && !(name in out)) out[name] = entry.value;
	}
	return out;
}

/**
 * Conversation-relevant standard fields, in prompt display order. Composite
 * catalog entries (Full Name / Full Address) are intentionally omitted in favor
 * of the atomic slots so nothing double-renders.
 */
const CONVERSATION_STANDARD_KEYS = [
	"contact.first_name",
	"contact.last_name",
	"contact.email",
	"contact.phone",
	"contact.address1",
	"contact.city",
	"contact.state",
	"contact.postal_code",
];

/** Sensible ceiling so a huge custom-field set can't bloat the prompt. */
const MAX_FIELDS = 100;

const STANDARD_LABEL = new Map(STANDARD_CONTACT_FIELDS.map((f) => [f.key, f.label]));

/** The mapping's contact target key, tolerating legacy mapping shapes. */
function targetKey(m: MappingEntry): string | undefined {
	return m.contactField ?? m.standardField ?? m.crmFieldName;
}

/**
 * Build the contact state array for a dispatch. The field set is the
 * conversation standard fields, every field the agent's saved mappings target,
 * AND the source's ENTIRE custom-field catalog — so the live agent's KNOWN
 * CONTACT INFO block lists every field it could gather (each with its current
 * value or UNRESOLVED). Values come from the live CRM contact record.
 *
 * Order: standard conversation fields → mapped fields → custom fields WITH a
 * value → remaining custom fields (UNRESOLVED). Deduped by key, capped at
 * MAX_FIELDS with a loud truncation log (never silent).
 *
 * Failure-isolated: any CRM/DB error resolves to `undefined` so the caller
 * simply dispatches without contact state — building it must never block a call.
 * Returns `undefined` (never an empty array) when there's nothing to send.
 */
export async function buildContactState(input: {
	sourceId: string;
	agentId?: string;
	contactId: string;
}): Promise<ContactState | undefined> {
	try {
		const provider = await resolveCrmProvider(input.sourceId);
		if (!provider) return undefined;

		// The live contact record's values, keyed by unified `contact.*` key.
		const values = await provider.getContactFieldValues(input.contactId);
		const hasValue = (key: string) => values[key] != null && values[key] !== "";

		// Assemble the desired key set (dedup, preserve order) + a label per key.
		const labels = new Map<string, string>();
		const order: string[] = [];
		const add = (key: string, label: string) => {
			if (!key || labels.has(key)) return;
			labels.set(key, label);
			order.push(key);
		};

		// 1) Standard conversation fields.
		for (const key of CONVERSATION_STANDARD_KEYS) {
			add(key, STANDARD_LABEL.get(key) ?? humanizeKey(key));
		}

		// 2) Fields the agent explicitly mapped (preserves their labels).
		if (input.agentId) {
			const mapping = await getAgentSource(input.agentId, input.sourceId).catch(() => null);
			const mappings = (mapping?.fieldMappings as unknown as MappingEntry[]) ?? [];
			for (const m of mappings) {
				const key = targetKey(m);
				// Skip empty and internal/system targets.
				if (!key || key.startsWith("_")) continue;
				add(
					key,
					STANDARD_LABEL.get(key) ?? m.contactFieldLabel ?? m.crmFieldName ?? humanizeKey(key),
				);
			}
		}

		// 3) The source's ENTIRE custom-field catalog — known values first, then
		//    UNRESOLVED — so the agent sees everything it could gather. One
		//    listCustomFields fetch, reused; a failure here just yields no extras.
		const customDefs = await provider.listCustomFields().catch(() => []);
		const customOptions = customDefs.map((f) => ({
			key: f.key || `contact.${normalizeName(f.name)}`,
			label: f.name,
		}));
		for (const c of customOptions) if (hasValue(c.key)) add(c.key, c.label);
		for (const c of customOptions) add(c.key, c.label);

		if (order.length === 0) return undefined;
		if (order.length > MAX_FIELDS) {
			console.warn(
				`[contact-state] truncated ${order.length - MAX_FIELDS} fields (cap ${MAX_FIELDS})`,
			);
		}

		return order.slice(0, MAX_FIELDS).map((key) => ({
			key,
			label: labels.get(key)!,
			value: values[key] ?? null,
		}));
	} catch (err) {
		console.warn("[contact-state] could not build; dispatching without it:", errMessage(err));
		return undefined;
	}
}
