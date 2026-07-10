import { resolveCustomFieldIds } from "./custom-fields";
import { normalizePhone } from "./normalize";
import type { CrmProvider } from "./provider";
import { normalizeName, toStandardWrite } from "./standard-fields";
import { stringArg } from "./tool-args";

/**
 * Contact-scoped live CRM tool handlers (update_contact, add_tag, remove_tag,
 * move_stage) plus contact resolution — see /api/tools/crm/route.ts for the
 * dispatch shell these are called from.
 */

/** Builder-test calls carry no caller identity; their CRM writes land on a
 * stable, recognizable test contact so live tools behave exactly like
 * production and results are inspectable in the CRM. */
const TEST_CONTACT_PHONE = "+15005550006";

export async function resolveContactId(
	provider: CrmProvider,
	metadata: Record<string, unknown> | null,
): Promise<string | null> {
	const contactId = metadata?.crm_contact_id;
	if (typeof contactId === "string" && contactId) return contactId;

	const fromNumber = metadata?.from_number;
	if (typeof fromNumber === "string" && fromNumber) {
		const { id } = await provider.upsertContactByPhone(normalizePhone(fromNumber));
		return id;
	}

	if (metadata?.source === "builder-test") {
		const { id } = await provider.upsertContactByPhone(TEST_CONTACT_PHONE);
		return id;
	}

	return null;
}

export async function executeUpdateContact(
	provider: CrmProvider,
	contactId: string,
	args: Record<string, unknown>,
): Promise<unknown> {
	const fieldName = stringArg(args.field_name);
	const value = stringArg(args.value);
	if (!fieldName) {
		return { error: "bad_arguments", message: "field_name is required." };
	}

	const wanted = normalizeName(fieldName);

	// Standard / composite fields (email, phone, Full Address, Full Name, …)
	// write to the real contact record, decomposed + normalized. Everything
	// else falls through to custom-field find-or-create.
	const standard = toStandardWrite(fieldName, value);
	if (standard) {
		if (Object.keys(standard).length === 0) {
			return { silent: true, detail: `No parseable components in "${value}".` };
		}
		await provider.updateContactStandard(contactId, standard);
		return { silent: true, detail: `Updated ${Object.keys(standard).join(", ")} from "${value}".` };
	}

	// Custom field: resolve by NAME in THIS subaccount (find-or-create) — same
	// per-subaccount resolver the post-call sync uses, so ids are never hardcoded.
	const idByName = await resolveCustomFieldIds(provider, [fieldName]);
	const fieldId = idByName.get(wanted);
	if (!fieldId) {
		return { silent: true, detail: `Could not resolve custom field "${fieldName}".` };
	}
	await provider.updateContactFields(contactId, [{ fieldId, value }]);
	// silent: fire-and-forget write — the worker returns no tool output to the
	// LLM, so the SDK never generates a follow-up turn (which is what made the
	// agent re-speak its question after every save). detail is for logs only.
	return { silent: true, detail: `Updated custom field "${fieldName}" to "${value}".` };
}

export async function executeAddTag(
	provider: CrmProvider,
	contactId: string,
	args: Record<string, unknown>,
): Promise<unknown> {
	const tag = stringArg(args.tag);
	if (!tag) {
		return { error: "bad_arguments", message: "tag is required." };
	}
	await provider.addContactTags(contactId, [tag]);
	return { silent: true, detail: `Added tag "${tag}".` };
}

export async function executeRemoveTag(
	provider: CrmProvider,
	contactId: string,
	args: Record<string, unknown>,
): Promise<unknown> {
	const tag = stringArg(args.tag);
	if (!tag) {
		return { error: "bad_arguments", message: "tag is required." };
	}
	await provider.removeContactTags(contactId, [tag]);
	return { silent: true, detail: `Removed tag "${tag}".` };
}

export async function executeMoveStage(
	provider: CrmProvider,
	contactId: string,
	args: Record<string, unknown>,
): Promise<unknown> {
	const pipelineName = stringArg(args.pipeline);
	const stageName = stringArg(args.stage);
	if (!pipelineName || !stageName) {
		return { error: "bad_arguments", message: "pipeline and stage are required." };
	}

	const pipelines = await provider.listPipelines();
	const pipeline = pipelines.find((p) => p.name.toLowerCase() === pipelineName.toLowerCase());
	const stage = pipeline?.stages.find((s) => s.name.toLowerCase() === stageName.toLowerCase());
	if (!pipeline || !stage) {
		return {
			error: "not_found",
			message: `No pipeline/stage named "${pipelineName}" / "${stageName}" in the CRM.`,
		};
	}

	await provider.moveContactToStage(contactId, pipeline.id, stage.id);
	return { silent: true, detail: `Moved contact to ${stage.name} in ${pipeline.name}.` };
}
