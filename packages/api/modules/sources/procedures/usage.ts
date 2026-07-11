import { ORPCError } from "@orpc/server";
import { getOrganizationMembership, listSources } from "@repo/database";
import z from "zod";

import { protectedProcedure } from "../../../orpc/procedures";
import { gatewayFetch } from "../../voiceagents/lib/gateway";
import { requireActiveOrganizationId } from "../lib/org";
import { requireOwnedSource } from "../lib/require-owned-source";
import {
	bucketUsageByOrgSources,
	emptyUsage,
	type GatewayUsageResponse,
	usageFromGroup,
	usageWindow,
} from "../lib/usage-bucketing";

export type {
	GatewayUsageGroup,
	GatewayUsageResponse,
	SourceUsage,
	SourceUsageRow,
} from "../lib/usage-bucketing";
export { bucketUsageByOrgSources } from "../lib/usage-bucketing";

/** Default lookback window when the caller doesn't specify one. */
const DEFAULT_DAYS = 30;

/** Per-source call usage from the engine, for the source detail page. */
export const sourceUsage = protectedProcedure
	.route({
		method: "GET",
		path: "/sources/{sourceId}/usage",
		tags: ["Sources"],
		summary: "Per-source call usage from the engine",
	})
	.input(
		z.object({
			sourceId: z.string(),
			days: z.number().int().positive().max(365).optional(),
		}),
	)
	.handler(async ({ input, context }) => {
		await requireOwnedSource(context.session, input.sourceId);
		const { from, to } = usageWindow(input.days, DEFAULT_DAYS);
		const params = new URLSearchParams({ from, to, group_ref: input.sourceId });
		try {
			const data = await gatewayFetch<GatewayUsageResponse>(
				"GET",
				`/v1/usage?${params.toString()}`,
			);
			const group = data.groups.find((g) => g.group_ref === input.sourceId);
			return usageFromGroup(group);
		} catch {
			// The engine being unreachable (or usage not yet available for a fresh
			// source) shouldn't break the detail page — render zeros instead.
			return emptyUsage(true);
		}
	});

/**
 * Org-wide per-source usage, for admins only. Fetches all groups from the
 * engine (no group_ref filter) and buckets them against the caller's org's
 * sources; group_refs that aren't one of this org's sources are folded into
 * "Unattributed" rather than leaked across orgs.
 */
export const usageSummary = protectedProcedure
	.route({
		method: "GET",
		path: "/sources/usage-summary",
		tags: ["Sources"],
		summary: "Org-wide per-source call usage (admin only)",
	})
	.input(z.object({ days: z.number().int().positive().max(365).optional() }))
	.handler(async ({ input, context }) => {
		const organizationId = requireActiveOrganizationId(context.session);
		const membership = await getOrganizationMembership(organizationId, context.user.id);
		const isOrgAdmin =
			context.user.role === "admin" || membership?.role === "owner" || membership?.role === "admin";
		if (!isOrgAdmin) {
			throw new ORPCError("FORBIDDEN", {
				message: "Only organization admins can view org-wide usage.",
			});
		}

		const orgSources = await listSources(organizationId);
		const sourceRefs = orgSources.map((source) => ({ id: source.id, name: source.name }));
		const { from, to } = usageWindow(input.days, DEFAULT_DAYS);
		const params = new URLSearchParams({ from, to });
		try {
			const data = await gatewayFetch<GatewayUsageResponse>(
				"GET",
				`/v1/usage?${params.toString()}`,
			);
			return { rows: bucketUsageByOrgSources(data.groups, sourceRefs), unavailable: false };
		} catch {
			return { rows: bucketUsageByOrgSources([], sourceRefs), unavailable: true };
		}
	});
