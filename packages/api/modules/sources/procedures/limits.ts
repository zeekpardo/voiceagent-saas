import { ORPCError } from "@orpc/server";
import { getSourcesByIds } from "@repo/database";
import { z } from "zod";

import { adminProcedure } from "../../../orpc/procedures";
import { gatewayFetch } from "../../voiceagents/lib/gateway";
import {
	type GatewayLimitsResponse,
	type LimitRow,
	refRequiredForScope,
	shapeLimitRows,
} from "../lib/limits";

export type { GatewayLimitRow, GatewayLimitsResponse, LimitRow, LimitScope } from "../lib/limits";

const LIMIT_SCOPES = ["project", "agent", "group"] as const;

/**
 * Platform-admin-only: list configured concurrency limits (project/agent/
 * group scopes) from the engine. Scope "group" rows use the SaaS sourceId
 * as `ref`, so they're enriched with the source's display name where it
 * resolves — this endpoint spans all organizations, so a ref may not match
 * any source known to this SaaS instance (e.g. deleted since).
 */
export const listLimits = adminProcedure
	.route({
		method: "GET",
		path: "/sources/limits",
		tags: ["Sources"],
		summary: "List configured concurrency limits (platform admin only)",
	})
	.handler(async (): Promise<{ rows: LimitRow[]; projectDefault: number | null }> => {
		const data = await gatewayFetch<GatewayLimitsResponse>("GET", "/v1/limits");
		const groupRefs = [
			...new Set(data.limits.filter((row) => row.scope === "group").map((row) => row.ref)),
		];
		const sources = groupRefs.length ? await getSourcesByIds(groupRefs) : [];
		return { rows: shapeLimitRows(data.limits, sources), projectDefault: data.project_default };
	});

/**
 * Platform-admin-only: set or clear a concurrency limit. `ref` is required
 * for agent/group scope (group scope's ref is the SaaS sourceId, matching
 * the `group_ref` already used by usage bucketing); passing
 * `maxConcurrent: null` clears the row, reverting to unlimited (or the
 * project default, for scope "project").
 */
export const setLimit = adminProcedure
	.route({
		method: "PUT",
		path: "/sources/limits",
		tags: ["Sources"],
		summary: "Set or clear a concurrency limit (platform admin only)",
	})
	.input(
		z.object({
			scope: z.enum(LIMIT_SCOPES),
			ref: z.string().max(256).optional(),
			maxConcurrent: z.number().int().positive().nullable(),
		}),
	)
	.handler(async ({ input }) => {
		if (refRequiredForScope(input.scope, input.ref)) {
			throw new ORPCError("BAD_REQUEST", { message: `ref is required for ${input.scope} scope` });
		}
		return await gatewayFetch<{
			ok: boolean;
			scope: string;
			ref: string;
			maxConcurrent: number | null;
		}>("PUT", "/v1/limits", input);
	});
