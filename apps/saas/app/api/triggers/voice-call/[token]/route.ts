import { verifyTriggerToken } from "@repo/api/modules/crm/lib/trigger-token";
import { resolveCrmProvider } from "@repo/api/modules/crm/lib/resolve";
import { gatewayFetch } from "@repo/api/modules/voiceagents/lib/gateway";
import { getAgentSource } from "@repo/database";

/**
 * CRM workflow → voice call. Drop this URL into a workflow webhook action
 * (e.g. GHL's "Custom Webhook") and the workflow can place an AI call to the
 * contact it's processing. The token pins the URL to one (agent, source)
 * pair; the payload just needs a phone number — contact fields, custom data,
 * and the connected sub-account's details all become {{variables}} for the
 * agent. The resulting call is tagged with source_id so post-call CRM sync
 * and mid-call live-tools resolve to the same Source unambiguously.
 *
 * This static route wins over the /api/[[...rest]] catch-all.
 */

interface TriggerPayload {
	phone?: string;
	contact_id?: string;
	id?: string;
	first_name?: string;
	last_name?: string;
	email?: string;
	customData?: Record<string, unknown>;
	contact?: { id?: string; phone?: string };
	[key: string]: unknown;
}

interface TagFilter {
	tag: string;
	mode: "is" | "is_not";
}

/**
 * Per-(agent, source) contact-tag gate (closebot "Filters"): every condition
 * must hold for the agent to act — e.g. `tag is_not "ai off"` stops calls to
 * contacts opted out of automation on THIS sub-account without affecting the
 * same agent on other sources.
 */
function passesTagFilters(filters: TagFilter[], contactTagsCsv: string | undefined): boolean {
	if (filters.length === 0) return true;
	const tags = new Set(
		(contactTagsCsv ?? "")
			.split(",")
			.map((t) => t.trim().toLowerCase())
			.filter(Boolean),
	);
	return filters.every((f) =>
		f.mode === "is" ? tags.has(f.tag.toLowerCase()) : !tags.has(f.tag.toLowerCase()),
	);
}

function toE164(raw: string | undefined): string | null {
	if (!raw) return null;
	const digits = raw.replace(/[^\d+]/g, "");
	if (!/\d{7,}/.test(digits)) return null;
	// US 10-digit numbers arrive without a country code from some CRMs.
	if (!digits.startsWith("+")) return digits.length === 10 ? `+1${digits}` : `+${digits}`;
	return digits;
}

export async function POST(
	req: Request,
	{ params }: { params: Promise<{ token: string }> },
): Promise<Response> {
	const { token } = await params;
	const identity = verifyTriggerToken(token);
	if (!identity) {
		return Response.json({ error: "invalid trigger token" }, { status: 401 });
	}

	const payload = (await req.json().catch(() => ({}))) as TriggerPayload;
	const phone = toE164(payload.phone ?? payload.contact?.phone);
	if (!phone) {
		return Response.json(
			{ error: "payload has no usable phone number (expected E.164 or 10-digit US)" },
			{ status: 400 },
		);
	}

	// Contact + account context become agent {{variables}} — best-effort, a
	// CRM hiccup must not block the call.
	let contactId = payload.contact_id ?? payload.contact?.id ?? payload.id;
	let variables: Record<string, string> = {};
	const provider = await resolveCrmProvider(identity.sourceId).catch(() => null);
	if (provider) {
		if (!contactId) {
			contactId = await provider
				.upsertContactByPhone(phone)
				.then((c) => c.id)
				.catch(() => undefined);
		}
		const [account, contact] = await Promise.all([
			provider.getAccountContext().catch(() => ({}) as Record<string, string>),
			contactId
				? provider.getContactContext(contactId).catch(() => ({}) as Record<string, string>)
				: Promise.resolve({} as Record<string, string>),
		]);
		variables = { ...account, ...contact };
	}

	// Workflow authors can add custom key/values on the webhook action; pass
	// string values straight through as variables (they win over CRM values).
	for (const [key, value] of Object.entries(payload.customData ?? {})) {
		if (typeof value === "string" && value.trim()) {
			variables[key] = value;
		}
	}

	// Per-source tag filters: skip (ack, don't retry) when the contact doesn't
	// qualify on this sub-account.
	const mapping = await getAgentSource(identity.agentId, identity.sourceId).catch(() => null);
	const tagFilters = ((mapping?.tagFilters ?? []) as unknown as TagFilter[]).filter(
		(f) => f?.tag && (f.mode === "is" || f.mode === "is_not"),
	);
	if (!passesTagFilters(tagFilters, variables.contact_tags)) {
		return Response.json({ queued: false, skipped: "contact does not match this source's tag filters" });
	}

	try {
		const call = await gatewayFetch<{ id: string; status: string }>("POST", "/v1/calls", {
			agent_id: identity.agentId,
			to: phone,
			variables,
			metadata: {
				source: "crm_workflow",
				source_id: identity.sourceId,
				...(contactId ? { crm_contact_id: contactId } : {}),
			},
		});
		return Response.json({ queued: true, call_id: call.id, to: phone }, { status: 201 });
	} catch (err) {
		console.error("[voice-trigger] outbound call dispatch failed:", err);
		return Response.json({ error: (err as Error).message }, { status: 502 });
	}
}
