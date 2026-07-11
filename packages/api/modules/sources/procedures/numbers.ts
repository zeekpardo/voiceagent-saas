import { ORPCError } from "@orpc/server";
import {
	createSourcePhoneNumber,
	deleteSourcePhoneNumber,
	getSourcePhoneNumber,
	listSourcePhoneNumbers,
} from "@repo/database";
import z from "zod";

import { protectedProcedure } from "../../../orpc/procedures";
import { gatewayFetch } from "../../voiceagents/lib/gateway";
import type { GatewayNumber } from "../../voiceagents/procedures/numbers";
import { requireOwnedSource } from "../lib/require-owned-source";

/** An engine-provisioned number available to purchase (engine GET available). */
export interface AvailableNumber {
	number: string;
	locality?: string | null;
	region?: string | null;
	provider?: string | null;
}

/**
 * Search the engine for purchasable numbers. Requires the caller to own the
 * source (management is scoped to a source). The engine is CRM-neutral, so the
 * source is only enforced here — it never reaches the engine.
 */
export const searchAvailableNumbers = protectedProcedure
	.route({
		method: "GET",
		path: "/sources/{sourceId}/numbers/available",
		tags: ["Sources"],
		summary: "Search purchasable phone numbers for a source",
	})
	.input(
		z.object({
			sourceId: z.string(),
			country: z.string().optional(),
			areaCode: z.string().optional(),
			contains: z.string().optional(),
			limit: z.number().int().positive().max(50).optional(),
		}),
	)
	.handler(async ({ input, context }) => {
		await requireOwnedSource(context.session, input.sourceId);
		const params = new URLSearchParams();
		if (input.country) {
			params.set("country", input.country);
		}
		if (input.areaCode) {
			params.set("area_code", input.areaCode);
		}
		if (input.contains) {
			params.set("contains", input.contains);
		}
		params.set("limit", String(input.limit ?? 20));
		const { available_numbers } = await gatewayFetch<{ available_numbers: AvailableNumber[] }>(
			"GET",
			`/v1/numbers/available?${params.toString()}`,
		);
		return available_numbers;
	});

/**
 * Purchase a number on the engine, then record the source↔number mapping in the
 * SaaS DB. The engine returns the created number row (with a LiveKit provider ref).
 */
export const purchaseNumberForSource = protectedProcedure
	.route({
		method: "POST",
		path: "/sources/{sourceId}/numbers/purchase",
		tags: ["Sources"],
		summary: "Buy a phone number and map it to a source",
	})
	.input(
		z.object({
			sourceId: z.string(),
			number: z.string().min(1),
			inboundAgentId: z.string().nullable().optional(),
			label: z.string().optional(),
		}),
	)
	.handler(async ({ input, context }) => {
		await requireOwnedSource(context.session, input.sourceId);
		const created = await gatewayFetch<GatewayNumber>("POST", "/v1/numbers/purchase", {
			number: input.number,
			agentId: input.inboundAgentId ?? undefined,
		});
		const row = await createSourcePhoneNumber({
			sourceId: input.sourceId,
			e164: created.e164 ?? input.number,
			providerRef: created.provider_ref ?? created.id ?? null,
			label: input.label ?? null,
			inboundAgentId: created.inbound_agent_id ?? input.inboundAgentId ?? null,
		});
		return { ...row, engine: created };
	});

/** The numbers mapped to a source, best-effort enriched with engine routing data. */
export const listNumbersForSource = protectedProcedure
	.route({
		method: "GET",
		path: "/sources/{sourceId}/numbers",
		tags: ["Sources"],
		summary: "List phone numbers mapped to a source",
	})
	.input(z.object({ sourceId: z.string() }))
	.handler(async ({ input, context }) => {
		await requireOwnedSource(context.session, input.sourceId);
		const rows = await listSourcePhoneNumbers(input.sourceId);

		// Best-effort enrichment: fold in the engine's live routing info (agent
		// name, etc.). If the engine is unreachable or phone provisioning isn't
		// configured, fall back to the locally stored mapping so the list still renders.
		let engineByRef = new Map<string, GatewayNumber>();
		try {
			const { numbers } = await gatewayFetch<{ numbers: GatewayNumber[] }>("GET", "/v1/numbers");
			engineByRef = new Map(numbers.map((n) => [n.provider_ref, n]));
		} catch {
			// swallow — enrichment is optional
		}

		return rows.map((row) => {
			const engine = row.providerRef ? engineByRef.get(row.providerRef) : undefined;
			return {
				id: row.id,
				sourceId: row.sourceId,
				e164: row.e164,
				providerRef: row.providerRef,
				label: row.label,
				inboundAgentId: engine?.inbound_agent_id ?? row.inboundAgentId,
				inboundAgentName: engine?.inbound_agent_name ?? null,
				createdAt: row.createdAt,
			};
		});
	});

/** Release a number on the engine, then delete the source mapping. */
export const releaseNumberForSource = protectedProcedure
	.route({
		method: "POST",
		path: "/sources/{sourceId}/numbers/{id}/release",
		tags: ["Sources"],
		summary: "Release a phone number and unmap it from a source",
	})
	.input(z.object({ sourceId: z.string(), id: z.string() }))
	.handler(async ({ input, context }) => {
		await requireOwnedSource(context.session, input.sourceId);
		const row = await getSourcePhoneNumber(input.id, input.sourceId);
		if (!row) {
			return { released: false as const, id: input.id };
		}
		if (row.providerRef) {
			try {
				await gatewayFetch("POST", `/v1/numbers/${encodeURIComponent(row.providerRef)}/release`);
			} catch (error) {
				// If the engine no longer knows this number (already released), still
				// drop the local mapping so the UI doesn't wedge.
				if (!(error instanceof ORPCError) || error.code !== "NOT_FOUND") {
					throw error;
				}
			}
		}
		await deleteSourcePhoneNumber(input.id, input.sourceId);
		return { released: true as const, id: input.id };
	});
