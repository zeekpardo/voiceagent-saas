import { getAgentSource } from "@repo/database";
import z from "zod";

import { protectedProcedure } from "../../../orpc/procedures";
import { buildContactState, parseContactTags } from "../../crm/lib/contact-state";
import { normalizePhone } from "../../crm/lib/normalize";
import { resolveCrmProvider } from "../../crm/lib/resolve";
import { requireOwnedSource } from "../../sources/lib/require-owned-source";
import { mergeCustomVariables } from "../lib/custom-variables";
import { gatewayFetch } from "../lib/gateway";
import { requireOwnedAgent } from "../lib/require-owned-agent";
import type { GatewayAgent } from "../lib/schema";

/**
 * Browser test session for an agent: the gateway returns a LiveKit room URL
 * + short-lived participant token; the client joins directly. The engine's
 * worker is dispatched to the room automatically.
 *
 * Dynamic values: when a Source is chosen and a CRM contact is attached, the
 * contact's details (contact_first_name, contact_full_address, contact_tags…)
 * and the Source account/location's details (location_name, location_address…)
 * are merged into the call variables — so one agent template previews as any
 * attached sub-account/location. Explicit variables always win over
 * CRM-derived values.
 */
export const createTestSession = protectedProcedure
	.route({
		method: "POST",
		path: "/voiceagents/sessions",
		tags: ["Voice Agents"],
		summary: "Start a browser voice session with an agent",
	})
	.input(
		z.object({
			agentId: z.string(),
			variables: z.record(z.string(), z.string()).optional(),
			/** Which attached Source's CRM to pull dynamic variables from. */
			sourceId: z.string().optional(),
			/** Optional CRM contact — enables dynamic values + post-call CRM sync. */
			crmContactId: z.string().optional(),
			/** Alternative to crmContactId: find-or-create the contact by phone. */
			contactPhone: z.string().optional(),
			/**
			 * Channel the worker runs on. "voice" (default) uses STT/TTS audio;
			 * "text" runs the same flow over LiveKit text streams (lk.chat topic) —
			 * no audio tracks, no STT/TTS. Transcripts still flow to the gateway.
			 */
			channel: z.enum(["voice", "text"]).optional(),
		}),
	)
	.handler(async ({ input, context }) => {
		await requireOwnedAgent(context.session, input.agentId);
		let crmVariables: Record<string, string> = {};
		let crmContactId = input.crmContactId;

		if (input.sourceId) {
			await requireOwnedSource(context.session, input.sourceId);
		}
		const provider = input.sourceId
			? await resolveCrmProvider(input.sourceId).catch(() => null)
			: null;

		if (provider && !crmContactId && input.contactPhone?.trim()) {
			crmContactId = await provider
				.upsertContactByPhone(normalizePhone(input.contactPhone))
				.then((c) => c.id)
				.catch(() => undefined);
		}
		if (provider) {
			// Account context always applies; contact context needs a contact id.
			// Best-effort: a CRM hiccup must never block starting a call.
			const [account, contact] = await Promise.all([
				provider.getAccountContext().catch(() => ({}) as Record<string, string>),
				crmContactId
					? provider.getContactContext(crmContactId).catch(() => ({}) as Record<string, string>)
					: Promise.resolve({} as Record<string, string>),
			]);
			crmVariables = { ...account, ...contact };
		}

		// Known-contact snapshot for the engine's KNOWN CONTACT INFO block. Only
		// when a contact resolved; never blocks the session if building it fails.
		const contactState =
			input.sourceId && crmContactId
				? await buildContactState({
						sourceId: input.sourceId,
						agentId: input.agentId,
						contactId: crmContactId,
					})
				: undefined;
		// Seed the engine's tag set (Phase 5b) from the caller's current CRM tags —
		// derived from the already-fetched contact_tags variable, never a new call.
		const contactTags = parseContactTags(crmVariables.contact_tags);

		// Job Flow Variables: fold custom-variable definition defaults + this
		// source's per-source overrides into the runtime variables map (runtime
		// values win). Best-effort — CRM/config hiccups must not block the session.
		const [agentConfig, mapping] = await Promise.all([
			gatewayFetch<GatewayAgent>("GET", `/v1/agents/${input.agentId}`)
				.then((a) => a.config)
				.catch(() => undefined),
			input.sourceId
				? getAgentSource(input.agentId, input.sourceId).catch(() => null)
				: Promise.resolve(null),
		]);
		const runtimeVariables = {
			caller_name: context.user.name ?? "there",
			...crmVariables,
			...input.variables, // explicit values override CRM-derived ones
		};

		return gatewayFetch<{
			call_id: string;
			room_url: string;
			token: string;
			agent_id: string;
			agent_version: number;
		}>("POST", "/v1/sessions", {
			agent_id: input.agentId,
			variables: mergeCustomVariables(agentConfig, mapping, runtimeVariables),
			...(contactState ? { contactState } : {}),
			...(contactTags ? { contactTags } : {}),
			...(input.channel ? { channel: input.channel } : {}),
			metadata: {
				source: "builder-test",
				user_id: context.user.id,
				...(input.sourceId ? { source_id: input.sourceId } : {}),
				...(crmContactId ? { crm_contact_id: crmContactId } : {}),
			},
		});
	});
