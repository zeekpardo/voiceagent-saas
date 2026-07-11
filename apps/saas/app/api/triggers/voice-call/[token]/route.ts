import { buildContactState, parseContactTags } from "@repo/api/modules/crm/lib/contact-state";
import { normalizePhone } from "@repo/api/modules/crm/lib/normalize";
import { resolveCrmProvider } from "@repo/api/modules/crm/lib/resolve";
import {
	pickTextChannel,
	startTextConversation,
} from "@repo/api/modules/crm/lib/text-conversation";
import { verifyTriggerToken } from "@repo/api/modules/crm/lib/trigger-token";
import { readChannelMode } from "@repo/api/modules/voiceagents/lib/channel-mode";
import { mergeCustomVariables } from "@repo/api/modules/voiceagents/lib/custom-variables";
import { gatewayFetch } from "@repo/api/modules/voiceagents/lib/gateway";
import type { GatewayAgent } from "@repo/api/modules/voiceagents/lib/schema";
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
	from?: string;
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
	// Validation stays here (reject junk); normalization is the shared one.
	if (!/\d{7,}/.test(raw.replace(/\D/g, ""))) return null;
	return normalizePhone(raw);
}

/**
 * CRM webhook editors (GHL among them) re-encode pasted URLs, so a copied
 * `?from=%2B1…` arrives double-encoded and one decode leaves the literal
 * "%2B1…" — whose stray "2" then corrupts the E.164 digits (+2166… instead of
 * +1661…). Peel any remaining percent-encoding before normalizing; clean
 * values ("+1…", bare digits) pass through untouched. Bounded loop + try/catch
 * so malformed input can never hang or throw.
 */
function peelPercentEncoding(value: string): string {
	let out = value;
	for (let i = 0; i < 3 && /%[0-9a-fA-F]{2}/.test(out); i++) {
		try {
			out = decodeURIComponent(out);
		} catch {
			break; // malformed sequence — use what we have
		}
	}
	return out;
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

	// Caller ID: the URL's `?from=` query param wins (that's what a copied,
	// ready-to-use trigger URL carries), falling back to a `from` field on the
	// webhook body for authors who prefer to set it there. Omit both and the
	// gateway/trunk default applies — existing tokens/URLs keep working as-is.
	const rawFrom = new URL(req.url).searchParams.get("from") ?? payload.from;
	let from: string | undefined;
	if (rawFrom) {
		from = toE164(peelPercentEncoding(rawFrom)) ?? undefined;
		if (!from) {
			return Response.json(
				{ error: "`from` must be a valid E.164 or 10-digit US phone number" },
				{ status: 400 },
			);
		}
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
		return Response.json({
			queued: false,
			skipped: "contact does not match this source's tag filters",
		});
	}

	// Known-contact snapshot for the engine's KNOWN CONTACT INFO block. Only
	// when a contact resolved; never blocks the call if building it fails.
	const contactState = contactId
		? await buildContactState({
				sourceId: identity.sourceId,
				agentId: identity.agentId,
				contactId,
			})
		: undefined;
	// Seed the engine's tag set (Phase 5b — tag-driven exit routing) from the
	// caller's current CRM tags. Derived from the already-fetched contact_tags
	// variable, so it adds no CRM call and can't block the dispatch.
	const contactTags = parseContactTags(variables.contact_tags);

	// Job Flow Variables: fold the agent's custom variable definitions (defaults)
	// and this source's per-source value overrides into the runtime variables map
	// (runtime values from CRM/customData win). Best-effort — a gateway hiccup
	// fetching the config must never block the call.
	const agentConfig = await gatewayFetch<GatewayAgent>("GET", `/v1/agents/${identity.agentId}`)
		.then((a) => a.config)
		.catch(() => undefined);
	variables = mergeCustomVariables(agentConfig, mapping, variables);

	// Channel mode: a text-only agent places NO call. Instead, continue the same
	// workflow over text — find-or-create an engine text conversation for the
	// contact and send the opener on the source's text channel.
	if (readChannelMode(agentConfig) === "text") {
		if (!provider?.sendConversationMessage) {
			return Response.json(
				{ error: "agent is text-only but the source has no messaging-capable CRM connection" },
				{ status: 409 },
			);
		}
		if (!contactId) {
			return Response.json(
				{ error: "agent is text-only but no contact could be resolved for this trigger" },
				{ status: 409 },
			);
		}
		const channel = pickTextChannel(mapping?.channels);
		if (!channel) {
			return Response.json(
				{ error: "agent is text-only but no text channel is enabled on the source" },
				{ status: 409 },
			);
		}
		try {
			const greeting =
				typeof (agentConfig as { greeting?: unknown } | undefined)?.greeting === "string"
					? (agentConfig as { greeting: string }).greeting.trim()
					: "";
			const result = await startTextConversation({
				provider,
				agentId: identity.agentId,
				sourceId: identity.sourceId,
				contactId,
				channel,
				externalRef: `text:${identity.sourceId}:${contactId}`,
				openerFallback: greeting || "Hi! Reaching out — how can we help?",
				variables,
				...(contactState ? { contactState } : {}),
				...(contactTags ? { contactTags } : {}),
				metadata: { source: "crm_workflow_text" },
			});
			return Response.json(
				{
					queued: true,
					channel: "text",
					conversation_id: result.conversationId,
					sent: result.sent,
				},
				{ status: 201 },
			);
		} catch (err) {
			console.error("[voice-trigger] text-mode conversation start failed:", err);
			return Response.json({ error: (err as Error).message }, { status: 502 });
		}
	}

	try {
		const call = await gatewayFetch<{ id: string; status: string }>("POST", "/v1/calls", {
			agent_id: identity.agentId,
			to: phone,
			...(from ? { from } : {}),
			variables,
			...(contactState ? { contactState } : {}),
			...(contactTags ? { contactTags } : {}),
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
