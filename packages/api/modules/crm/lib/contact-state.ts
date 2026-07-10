import { getAgentSource } from "@repo/database";

import { humanizeKey, type MappingEntry } from "./field-mapping";
import { resolveCrmProvider } from "./resolve";
import { STANDARD_CONTACT_FIELDS } from "./standard-fields";

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
const MAX_FIELDS = 40;

const STANDARD_LABEL = new Map(STANDARD_CONTACT_FIELDS.map((f) => [f.key, f.label]));

/** The mapping's contact target key, tolerating legacy mapping shapes. */
function targetKey(m: MappingEntry): string | undefined {
	return m.contactField ?? m.standardField ?? m.crmFieldName;
}

/**
 * Build the contact state array for a dispatch. The field set is the
 * conversation standard fields plus every field the agent's saved mappings
 * target (so a known answer suppresses its objective's question). Values come
 * from the live CRM contact record.
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

		// Assemble the desired key set (dedup, preserve order) + a label per key.
		const labels = new Map<string, string>();
		const order: string[] = [];
		const add = (key: string, label: string) => {
			if (!key || labels.has(key)) return;
			labels.set(key, label);
			order.push(key);
		};

		for (const key of CONVERSATION_STANDARD_KEYS) {
			add(key, STANDARD_LABEL.get(key) ?? humanizeKey(key));
		}

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

		const keys = order.slice(0, MAX_FIELDS);
		if (keys.length === 0) return undefined;

		const values = await provider.getContactFieldValues(input.contactId);
		return keys.map((key) => ({
			key,
			label: labels.get(key)!,
			value: values[key] ?? null,
		}));
	} catch (err) {
		console.warn("[contact-state] could not build; dispatching without it:", err);
		return undefined;
	}
}
