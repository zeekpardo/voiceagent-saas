import { ORPCError } from "@orpc/server";
import { getAgentSource, saveAgentSourceMapping as saveMappingRow } from "@repo/database";
import z from "zod";

import { protectedProcedure } from "../../../orpc/procedures";
import { resolveCrmProvider } from "../../crm/lib/resolve";
import { requireOwnedSource } from "../../sources/lib/require-owned-source";
import { gatewayFetch } from "../lib/gateway";
import { requireOwnedAgent } from "../lib/require-owned-agent";

/**
 * One-click field setup: read the agent's post-call extract fields, match
 * each to an existing CRM custom field (on this specific Source) by
 * (normalized) name, create the ones that don't exist, and save the mapping.
 */

interface FieldMapping {
	extractField: string;
	crmFieldId: string;
	crmFieldName?: string;
}

const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

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
	const fieldMappings: FieldMapping[] = (
		(existing?.fieldMappings as unknown as FieldMapping[]) ?? []
	).filter((m) => m.crmFieldId);
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
		let field = byName.get(normalize(key));
		if (!field) {
			field = await provider.createCustomField(humanize(key));
			created.push(field.name);
		} else {
			matched.push(field.name);
		}
		fieldMappings.push({ extractField: key, crmFieldId: field.id, crmFieldName: field.name });
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
	crmFieldId: z.string().min(1),
	crmFieldName: z.string().optional(),
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
			fieldMappings: mapping.fieldMappings as z.infer<typeof fieldMapping>[],
			tagRules: mapping.tagRules as z.infer<typeof tagRule>[],
			stageRules: mapping.stageRules as z.infer<typeof stageRule>[],
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
			tagRules: z.array(tagRule).default([]),
			stageRules: z.array(stageRule).default([]),
			writeNote: z.boolean().default(true),
			bookingCalendarId: z.string().nullable().optional(),
			bookingCalendarName: z.string().nullable().optional(),
		}),
	)
	.handler(async ({ input, context }) => {
		await requireOwnedAgent(context.session, input.agentId);
		await requireOwnedSource(context.session, input.sourceId);
		await saveMappingRow(input);
		return { saved: true };
	});
