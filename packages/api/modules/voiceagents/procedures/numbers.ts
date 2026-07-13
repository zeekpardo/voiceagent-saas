import { ORPCError } from "@orpc/server";
import { listOrganizationPhoneNumbers } from "@repo/database";
import z from "zod";

import { protectedProcedure } from "../../../orpc/procedures";
import { requireActiveOrganizationId } from "../../sources/lib/org";
import { gatewayFetch } from "../lib/gateway";
import { requireOwnedAgent } from "../lib/require-owned-agent";

export interface GatewayNumber {
	id: string;
	e164: string;
	provider_ref: string;
	inbound_agent_id: string | null;
	/** Name of the routed agent, resolved server-side by the gateway. Null when
	 * unassigned or the agent no longer exists. */
	inbound_agent_name: string | null;
	created_at: string;
}

/** The e164s + provider refs of every number the caller's org provisioned —
 * the gateway /v1/numbers list is org-agnostic, so we scope it here. */
async function ownedNumberKeys(organizationId: string) {
	const owned = await listOrganizationPhoneNumbers(organizationId);
	return {
		e164: new Set(owned.map((n) => n.e164)),
		refs: new Set(owned.map((n) => n.providerRef).filter((r): r is string => !!r)),
	};
}

function orgOwnsNumber(n: GatewayNumber, keys: { e164: Set<string>; refs: Set<string> }) {
	return keys.e164.has(n.e164) || keys.refs.has(n.provider_ref);
}

export const listNumbers = protectedProcedure
	.route({
		method: "GET",
		path: "/voiceagents/numbers",
		tags: ["Voice Agents"],
		summary: "List phone numbers",
	})
	.handler(async ({ context }) => {
		const organizationId = await requireActiveOrganizationId(context.session);
		const keys = await ownedNumberKeys(organizationId);
		const { numbers } = await gatewayFetch<{ numbers: GatewayNumber[] }>("GET", "/v1/numbers");
		return numbers.filter((n) => orgOwnsNumber(n, keys));
	});

export const setNumberAgent = protectedProcedure
	.route({
		method: "PATCH",
		path: "/voiceagents/numbers/{id}",
		tags: ["Voice Agents"],
		summary: "Route a phone number to an agent (or unassign it)",
	})
	.input(z.object({ id: z.string(), agentId: z.string().nullable() }))
	.handler(async ({ input, context }) => {
		const organizationId = await requireActiveOrganizationId(context.session);
		if (input.agentId) {
			await requireOwnedAgent(context.session, input.agentId);
		}
		// The number being (re)routed must belong to the caller's org.
		const keys = await ownedNumberKeys(organizationId);
		const { numbers } = await gatewayFetch<{ numbers: GatewayNumber[] }>("GET", "/v1/numbers");
		const target = numbers.find((n) => n.id === input.id);
		if (!target || !orgOwnsNumber(target, keys)) {
			throw new ORPCError("NOT_FOUND", { message: "Number not found" });
		}
		return gatewayFetch<GatewayNumber>("PATCH", `/v1/numbers/${encodeURIComponent(input.id)}`, {
			inbound_agent_id: input.agentId,
		});
	});
