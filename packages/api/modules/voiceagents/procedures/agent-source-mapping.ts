import { ORPCError } from "@orpc/server";
import {
	getAgentSource,
	listSourceAgentSources,
	saveAgentSourceMapping as saveMappingRow,
} from "@repo/database";
import z from "zod";

import { protectedProcedure } from "../../../orpc/procedures";
import { MESSAGE_CHANNELS } from "../../crm/lib/channels";
import { listContactFields, type MappingEntry } from "../../crm/lib/field-mapping";
import { resolveCrmProvider } from "../../crm/lib/resolve";
import { STANDARD_CONTACT_FIELDS } from "../../crm/lib/standard-fields";
import { requireOwnedSource } from "../../sources/lib/require-owned-source";
import { resolveVariableValues } from "../lib/custom-variables";
import { gatewayFetch } from "../lib/gateway";
import { requireOwnedAgent } from "../lib/require-owned-agent";

/**
 * One-click field setup: read the agent's post-call extract fields, map contact
 * essentials to the STANDARD contact fields and the rest to custom fields on
 * this Source (create-if-missing), and save. Mappings store a stable
 * `contactField` key ("contact.email" / "contact.pool"), never a per-source id.
 */

const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Common extract-field prefixes to strip before standard-field matching. */
const STRIP_PREFIXES = ["confirmed_", "caller_", "contact_", "best_", "current_"];
const STD_SYNONYMS: Record<string, string> = {
	name: "contact.name",
	fullname: "contact.name",
	full_name: "contact.name",
	firstname: "contact.first_name",
	first_name: "contact.first_name",
	lastname: "contact.last_name",
	last_name: "contact.last_name",
	email: "contact.email",
	phone: "contact.phone",
	phone_number: "contact.phone",
	phonenumber: "contact.phone",
	address: "contact.address",
	full_address: "contact.address",
	city: "contact.city",
	state: "contact.state",
	zip: "contact.postal_code",
	zip_code: "contact.postal_code",
	postal_code: "contact.postal_code",
};

/** If an extract key clearly means a standard field, return {key,label}; else null. */
function standardForExtract(extractKey: string): { key: string; label: string } | null {
	let k = extractKey.toLowerCase();
	for (const p of STRIP_PREFIXES) if (k.startsWith(p)) k = k.slice(p.length);
	const key = STD_SYNONYMS[k];
	const def = key ? STANDARD_CONTACT_FIELDS.find((d) => d.key === key) : undefined;
	return def ? { key: def.key, label: def.label } : null;
}

/** "callback_number" → "Callback Number" (the created CRM field's label). */
const humanize = (key: string) =>
	key
		.split(/[_\s-]+/)
		.filter(Boolean)
		.map((w) => w[0]!.toUpperCase() + w.slice(1))
		.join(" ");

export async function autoMapAgentSource(agentId: string, sourceId: string) {
	const provider = await resolveCrmProvider(sourceId);
	if (!provider) {
		throw new ORPCError("BAD_REQUEST", { message: "Source has no usable CRM connection." });
	}

	const agent = await gatewayFetch<{
		config?: { postCall?: { extract?: Record<string, string> } };
	}>("GET", `/v1/agents/${agentId}`);
	const extractKeys = Object.keys(agent.config?.postCall?.extract ?? {});
	if (extractKeys.length === 0) {
		return { mapped: 0, matched: [], created: [], skipped: [] };
	}

	const existing = await getAgentSource(agentId, sourceId);
	const fieldMappings: MappingEntry[] = (
		(existing?.fieldMappings as unknown as MappingEntry[]) ?? []
	).filter((m) => m.contactField || m.crmFieldId || m.standardField);
	const alreadyMapped = new Set(fieldMappings.map((m) => m.extractField));

	const crmFields = await provider.listCustomFields();
	const byName = new Map(crmFields.map((f) => [normalize(f.name), f]));
	for (const f of crmFields) {
		// GHL field keys look like "contact.callback_number" — index both.
		if (f.key) byName.set(normalize(f.key.split(".").pop() ?? f.key), f);
	}

	const matched: string[] = [];
	const created: string[] = [];
	for (const key of extractKeys) {
		if (alreadyMapped.has(key)) continue;

		// Contact essentials → the real STANDARD field, no custom field created.
		const std = standardForExtract(key);
		if (std) {
			fieldMappings.push({
				extractField: key,
				contactField: std.key,
				contactFieldLabel: std.label,
			});
			matched.push(std.label);
			continue;
		}

		// Otherwise a custom field: match by name on this source, create if missing.
		let field = byName.get(normalize(key));
		if (!field) {
			field = await provider.createCustomField(humanize(key));
			created.push(field.name);
		} else {
			matched.push(field.name);
		}
		fieldMappings.push({
			extractField: key,
			contactField: field.key || `contact.${normalize(key)}`,
			contactFieldLabel: field.name,
		});
	}

	await saveMappingRow({
		agentId,
		sourceId,
		enabled: existing?.enabled ?? true,
		fieldMappings,
		tagRules: existing?.tagRules ?? [],
		stageRules: existing?.stageRules ?? [],
		writeNote: existing?.writeNote ?? true,
	});

	return {
		mapped: fieldMappings.length,
		matched,
		created,
		skipped: extractKeys.filter((k) => alreadyMapped.has(k)),
	};
}

export const autoMapAgentSourceProcedure = protectedProcedure
	.route({
		method: "POST",
		path: "/voiceagents/agents/{agentId}/sources/{sourceId}/auto-map",
		tags: ["Voice Agents"],
		summary: "Auto-create and map CRM fields for an agent's extract fields on a source",
	})
	.input(z.object({ agentId: z.string(), sourceId: z.string() }))
	.handler(async ({ input, context }) => {
		await requireOwnedAgent(context.session, input.agentId);
		await requireOwnedSource(context.session, input.sourceId);
		return autoMapAgentSource(input.agentId, input.sourceId);
	});

const fieldMapping = z.object({
	extractField: z.string().min(1),
	/** Unified target key, e.g. "contact.email" or "contact.pool". */
	contactField: z.string().optional(),
	/** Label captured at pick time (creates a missing custom field nicely). */
	contactFieldLabel: z.string().optional(),
	// Legacy shapes, still accepted for older saved mappings:
	crmFieldId: z.string().optional(),
	crmFieldName: z.string().optional(),
	standardField: z.string().optional(),
});

export const listContactFieldsProcedure = protectedProcedure
	.route({
		method: "GET",
		path: "/crm/sources/{sourceId}/contact-fields",
		tags: ["CRM"],
		summary: "List all writable contact fields (standard + custom) for a source",
	})
	.input(z.object({ sourceId: z.string() }))
	.handler(async ({ input, context }) => {
		await requireOwnedSource(context.session, input.sourceId);
		const provider = await resolveCrmProvider(input.sourceId);
		if (!provider) return { fields: [] };
		return { fields: await listContactFields(provider) };
	});

const tagFilter = z.object({
	tag: z.string().min(1),
	mode: z.enum(["is", "is_not"]),
});

const tagRule = z.object({
	extractField: z.string().min(1),
	equals: z.string().min(1),
	tag: z.string().min(1),
});

const stageRule = z.object({
	extractField: z.string().min(1),
	equals: z.string().min(1),
	pipelineId: z.string().min(1),
	stageId: z.string().min(1),
	pipelineName: z.string().optional(),
	stageName: z.string().optional(),
});

export const getAgentSourceMapping = protectedProcedure
	.route({
		method: "GET",
		path: "/voiceagents/agents/{agentId}/sources/{sourceId}/mapping",
		tags: ["Voice Agents"],
		summary: "Get an agent's CRM mapping for a source",
	})
	.input(z.object({ agentId: z.string(), sourceId: z.string() }))
	.handler(async ({ input, context }) => {
		await requireOwnedAgent(context.session, input.agentId);
		const mapping = await getAgentSource(input.agentId, input.sourceId);
		if (!mapping) return null;
		return {
			agentId: mapping.agentId,
			sourceId: mapping.sourceId,
			enabled: mapping.enabled,
			channels: (mapping.channels ?? []) as string[],
			fieldMappings: mapping.fieldMappings as z.infer<typeof fieldMapping>[],
			tagFilters: mapping.tagFilters as z.infer<typeof tagFilter>[],
			tagRules: mapping.tagRules as z.infer<typeof tagRule>[],
			stageRules: mapping.stageRules as z.infer<typeof stageRule>[],
			variableValues: (mapping.variableValues ?? {}) as Record<string, string>,
			writeNote: mapping.writeNote,
			bookingCalendarId: mapping.bookingCalendarId,
			bookingCalendarName: mapping.bookingCalendarName,
		};
	});

export const saveAgentSourceMappingProcedure = protectedProcedure
	.route({
		method: "PUT",
		path: "/voiceagents/agents/{agentId}/sources/{sourceId}/mapping",
		tags: ["Voice Agents"],
		summary: "Save an agent's CRM mapping for a source",
	})
	.input(
		z.object({
			agentId: z.string(),
			sourceId: z.string(),
			enabled: z.boolean().default(true),
			fieldMappings: z.array(fieldMapping).default([]),
			tagFilters: z.array(tagFilter).default([]),
			// Omni-channel: text channels this agent monitors for this source.
			// Omit to leave the stored set untouched (the chips save on their own).
			channels: z.array(z.enum(MESSAGE_CHANNELS)).optional(),
			tagRules: z.array(tagRule).default([]),
			stageRules: z.array(stageRule).default([]),
			// Optional: the per-source Call-notes control moved to the agent's
			// Preferences panel (postCall.writeNote). Saving a source mapping now
			// leaves the existing value untouched instead of resetting it.
			writeNote: z.boolean().optional(),
			// Job Flow Variables — per-source value overrides ({ name: value }).
			// Omit to preserve the stored map (like writeNote).
			variableValues: z.record(z.string(), z.string()).optional(),
			bookingCalendarId: z.string().nullable().optional(),
			bookingCalendarName: z.string().nullable().optional(),
		}),
	)
	.handler(async ({ input, context }) => {
		await requireOwnedAgent(context.session, input.agentId);
		await requireOwnedSource(context.session, input.sourceId);
		const existing = await getAgentSource(input.agentId, input.sourceId);

		// One agent per channel per source: reject enabling a channel another
		// agent already monitors on this source (a contact writing on that channel
		// must route to exactly one agent, or replies would collide).
		if (input.channels !== undefined && input.channels.length > 0) {
			const conflict = await findChannelConflict(input.agentId, input.sourceId, input.channels);
			if (conflict) {
				throw new ORPCError("CONFLICT", {
					message: `The "${conflict.channel}" channel is already monitored by another agent (${conflict.agentLabel}) on this source. Remove it there first, or pick a different channel.`,
				});
			}
		}

		await saveMappingRow({
			...input,
			writeNote: input.writeNote ?? existing?.writeNote ?? true,
			variableValues: resolveVariableValues(input.variableValues, existing?.variableValues),
		});
		return { saved: true };
	});

/**
 * Find the first requested channel that ANOTHER enabled agent already monitors
 * on this source. Returns the conflicting channel + a human label for the other
 * agent (its gateway name when resolvable, else its id). Null when clear.
 */
async function findChannelConflict(
	agentId: string,
	sourceId: string,
	channels: string[],
): Promise<{ channel: string; agentLabel: string } | null> {
	const rows = await listSourceAgentSources(sourceId);
	const want = new Set(channels);
	for (const row of rows) {
		if (row.agentId === agentId || !row.enabled) continue;
		const theirs = Array.isArray(row.channels) ? (row.channels as string[]) : [];
		const clash = theirs.find((c) => want.has(c));
		if (clash) {
			const agentLabel = await gatewayFetch<{ name?: string }>("GET", `/v1/agents/${row.agentId}`)
				.then((a) => a.name?.trim() || row.agentId)
				.catch(() => row.agentId);
			return { channel: clash, agentLabel };
		}
	}
	return null;
}
