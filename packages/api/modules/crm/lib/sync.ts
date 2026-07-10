import { getAgentSource, getSoleEnabledAgentSource } from "@repo/database";

import { gatewayFetch } from "../../voiceagents/lib/gateway";
import { applyFieldMappings, type MappingEntry } from "./field-mapping";
import { normalizePhone } from "./normalize";
import { resolveCrmProvider } from "./resolve";

/**
 * The heart of the integration: turn a completed voice call's extracted
 * fields into CRM contact updates, per the agent's saved (agent, source)
 * mapping. Fully provider-agnostic — the resolved CrmProvider does the
 * vendor talking.
 */

export interface TagRule {
	extractField: string;
	equals: string;
	tag: string;
}

export interface StageRule {
	extractField: string;
	equals: string;
	pipelineId: string;
	stageId: string;
	pipelineName?: string;
	stageName?: string;
}

export interface CallCompletedEvent {
	type: string;
	call_id?: string;
	agent_id?: string;
	metadata?: Record<string, unknown>;
	direction?: string | null;
	from_number?: string | null;
	to_number?: string | null;
	summary?: string | null;
	extracted?: Record<string, string> | null;
	duration_seconds?: number;
	end_reason?: string;
}

export interface SyncResult {
	skipped?: string;
	provider?: string;
	contactId?: string;
	contactUrl?: string | null;
	contactCreated?: boolean;
	fieldsUpdated?: number;
	tagsAdded?: string[];
	stagesMoved?: string[];
	noteWritten?: boolean;
}

function contactIdFrom(metadata: Record<string, unknown> | undefined): string | undefined {
	const m = metadata as { crm_contact_id?: string } | undefined;
	return m?.crm_contact_id;
}

/**
 * Which Source triggered this call: explicit metadata.source_id wins
 * (set by the CRM-workflow trigger route and browser test sessions);
 * otherwise, an agent with exactly one enabled attached Source resolves
 * unambiguously. Agents monitoring multiple Sources need calls tagged with
 * source_id at creation time — ambiguous calls are skipped, never guessed.
 */
async function resolveSourceId(event: CallCompletedEvent): Promise<string | undefined> {
	const explicit = (event.metadata as { source_id?: string } | undefined)?.source_id;
	if (explicit) return explicit;
	if (!event.agent_id) return undefined;
	const sole = await getSoleEnabledAgentSource(event.agent_id);
	return sole?.sourceId;
}

export async function syncCallToCrm(event: CallCompletedEvent): Promise<SyncResult> {
	if (!event.agent_id) return { skipped: "no agent_id on event" };

	const sourceId = await resolveSourceId(event);
	if (!sourceId) {
		return { skipped: "could not resolve which source this call belongs to" };
	}

	const mapping = await getAgentSource(event.agent_id, sourceId);
	if (!mapping || !mapping.enabled) return { skipped: "no enabled source mapping for this agent" };

	const provider = await resolveCrmProvider(sourceId);
	if (!provider) return { skipped: "source has no usable CRM connection" };

	// Explicit contact id wins; otherwise resolve the caller's phone number
	// against the CRM (create-or-match), so plain phone calls sync with zero
	// per-call setup. The human's number is from_number on inbound calls and
	// to_number on outbound ones.
	let contactId = contactIdFrom(event.metadata);
	let contactCreated = false;
	if (!contactId) {
		const phone = event.direction === "outbound" ? event.to_number : event.from_number;
		if (!phone || !/\d{7,}/.test(phone.replace(/[^\d]/g, ""))) {
			return { skipped: "no crm_contact_id in call metadata and no caller phone number" };
		}
		const upserted = await provider.upsertContactByPhone(normalizePhone(phone));
		contactId = upserted.id;
		contactCreated = upserted.created;

		// Best-effort: persist the resolved link onto the gateway call so the
		// inbox can show the contact without re-matching by phone.
		if (event.call_id) {
			await gatewayFetch("PATCH", `/v1/calls/${encodeURIComponent(event.call_id)}/metadata`, {
				metadata: { crm_contact_id: contactId },
			}).catch(console.warn);
		}
	}

	const extracted = event.extracted ?? {};

	// 1. Field updates — the shared writer splits standard vs custom, resolves
	//    custom per-subaccount by name (create-if-missing), and normalizes
	//    values. "unknown"/empty never overwrites existing CRM data.
	const fieldMappings = (mapping.fieldMappings as unknown as MappingEntry[]) ?? [];
	const fieldsWritten = await applyFieldMappings(provider, contactId, fieldMappings, extracted);

	// 2. Tag rules (case-insensitive value match).
	const tagRules = (mapping.tagRules as unknown as TagRule[]) ?? [];
	const tags = tagRules
		.filter(
			(r) =>
				r.tag &&
				extracted[r.extractField] != null &&
				extracted[r.extractField]!.toLowerCase() === r.equals.toLowerCase(),
		)
		.map((r) => r.tag);
	if (tags.length > 0) {
		await provider.addContactTags(contactId, tags);
	}

	// 3. Stage-move rules: first matching rule per pipeline wins.
	const stageRules = (mapping.stageRules as unknown as StageRule[]) ?? [];
	const movedPipelines = new Set<string>();
	const stagesMoved: string[] = [];
	for (const rule of stageRules) {
		if (!rule.pipelineId || !rule.stageId || movedPipelines.has(rule.pipelineId)) continue;
		const value = extracted[rule.extractField];
		if (value != null && value.toLowerCase() === rule.equals.toLowerCase()) {
			await provider.moveContactToStage(contactId, rule.pipelineId, rule.stageId);
			movedPipelines.add(rule.pipelineId);
			stagesMoved.push(rule.stageName ?? rule.stageId);
		}
	}

	// 4. Timeline note with the call summary + outcomes.
	if (mapping.writeNote && (event.summary || fieldsWritten > 0)) {
		const lines = [
			`🎙 AI voice call completed (${event.duration_seconds ?? 0}s, ${event.end_reason ?? "ended"})`,
			event.summary ? `\n${event.summary}` : "",
			Object.keys(extracted).length > 0
				? `\nCaptured: ${Object.entries(extracted)
						.map(([k, v]) => `${k}=${v}`)
						.join(", ")}`
				: "",
			event.call_id ? `\nCall ID: ${event.call_id}` : "",
		];
		await provider.createContactNote(contactId, lines.filter(Boolean).join("\n"));
	}

	return {
		provider: provider.type,
		contactId,
		contactUrl: provider.contactUrl(contactId),
		contactCreated,
		fieldsUpdated: fieldsWritten,
		tagsAdded: tags,
		stagesMoved,
		noteWritten: mapping.writeNote,
	};
}
