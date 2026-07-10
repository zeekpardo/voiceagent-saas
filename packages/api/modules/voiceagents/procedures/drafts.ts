import { ORPCError } from "@orpc/server";
import z from "zod";

import { protectedProcedure } from "../../../orpc/procedures";
import { gatewayFetch } from "../lib/gateway";
import { requireOwnedAgent } from "../lib/require-owned-agent";
import type { GatewayAgent } from "../lib/schema";
import { flowInput } from "./flow";

/**
 * Draft / publish workflow for the FLOW BUILDER (flow + canvas + toolIds).
 *
 * Unlike AgentForm settings — which publish immediately via PATCH /v1/agents/:id
 * — flow edits are staged on the gateway as a draft and only become a new agent
 * version when the user publishes. These are thin gatewayFetch wrappers over the
 * gateway's draft/version contract; ownership is checked on every call.
 *
 * The draft body is the same partial-config shape saveFlow PATCHes today
 * ({ flow, canvas, toolIds }): flow + toolIds are engine primitives and canvas
 * is the opaque builder document, so no toGatewayConfig reshaping is needed —
 * they ride straight through.
 */

interface DraftResponse {
	config: Record<string, unknown>;
	updated_at: string;
}

const draftBodyInput = z.object({
	id: z.string(),
	flow: flowInput,
	canvas: z.unknown(),
	toolIds: z.array(z.string()),
});

export const saveDraft = protectedProcedure
	.route({
		method: "PUT",
		path: "/voiceagents/agents/{id}/draft",
		tags: ["Voice Agents"],
		summary: "Save the flow builder draft (does not create a version)",
	})
	.input(draftBodyInput)
	.handler(async ({ input, context }) => {
		await requireOwnedAgent(context.session, input.id);
		return gatewayFetch<{ updated_at: string }>(
			"PUT",
			`/v1/agents/${encodeURIComponent(input.id)}/draft`,
			{ flow: input.flow, canvas: input.canvas, toolIds: input.toolIds },
		);
	});

export const getDraft = protectedProcedure
	.route({
		method: "GET",
		path: "/voiceagents/agents/{id}/draft",
		tags: ["Voice Agents"],
		summary: "Get the flow builder draft, or null when none is staged",
	})
	.input(z.object({ id: z.string() }))
	.handler(async ({ input, context }) => {
		await requireOwnedAgent(context.session, input.id);
		try {
			return await gatewayFetch<DraftResponse>(
				"GET",
				`/v1/agents/${encodeURIComponent(input.id)}/draft`,
			);
		} catch (err) {
			// 404 = no draft staged (ownership was already confirmed above).
			if (err instanceof ORPCError && err.code === "NOT_FOUND") {
				return null;
			}
			throw err;
		}
	});

export const discardDraft = protectedProcedure
	.route({
		method: "DELETE",
		path: "/voiceagents/agents/{id}/draft",
		tags: ["Voice Agents"],
		summary: "Discard the flow builder draft",
	})
	.input(z.object({ id: z.string() }))
	.handler(async ({ input, context }) => {
		await requireOwnedAgent(context.session, input.id);
		try {
			return await gatewayFetch<{ discarded: boolean }>(
				"DELETE",
				`/v1/agents/${encodeURIComponent(input.id)}/draft`,
			);
		} catch (err) {
			// Nothing to discard — treat as a no-op success so the UI stays coherent.
			if (err instanceof ORPCError && err.code === "NOT_FOUND") {
				return { discarded: true };
			}
			throw err;
		}
	});

export const publishAgent = protectedProcedure
	.route({
		method: "POST",
		path: "/voiceagents/agents/{id}/publish",
		tags: ["Voice Agents"],
		summary: "Publish the staged draft as a new agent version",
	})
	.input(z.object({ id: z.string() }))
	.handler(async ({ input, context }) => {
		await requireOwnedAgent(context.session, input.id);
		// The gateway returns 409 (→ CONFLICT) when there is no draft to publish.
		return gatewayFetch<GatewayAgent>("POST", `/v1/agents/${encodeURIComponent(input.id)}/publish`);
	});

export const listVersions = protectedProcedure
	.route({
		method: "GET",
		path: "/voiceagents/agents/{id}/versions",
		tags: ["Voice Agents"],
		summary: "List an agent's published versions (newest first)",
	})
	.input(z.object({ id: z.string(), limit: z.number().int().min(1).max(100).default(50) }))
	.handler(async ({ input, context }) => {
		await requireOwnedAgent(context.session, input.id);
		return gatewayFetch<{ versions: { version: number; created_at: string }[] }>(
			"GET",
			`/v1/agents/${encodeURIComponent(input.id)}/versions?limit=${input.limit}`,
		);
	});

export const getVersion = protectedProcedure
	.route({
		method: "GET",
		path: "/voiceagents/agents/{id}/versions/{version}",
		tags: ["Voice Agents"],
		summary: "Get a single agent version snapshot",
	})
	.input(z.object({ id: z.string(), version: z.number().int().positive() }))
	.handler(async ({ input, context }) => {
		await requireOwnedAgent(context.session, input.id);
		return gatewayFetch<{ version: number; config: Record<string, unknown>; created_at: string }>(
			"GET",
			`/v1/agents/${encodeURIComponent(input.id)}/versions/${input.version}`,
		);
	});

export const restoreVersion = protectedProcedure
	.route({
		method: "POST",
		path: "/voiceagents/agents/{id}/versions/{version}/restore",
		tags: ["Voice Agents"],
		summary: "Restore a version (creates a new version from that snapshot)",
	})
	.input(z.object({ id: z.string(), version: z.number().int().positive() }))
	.handler(async ({ input, context }) => {
		await requireOwnedAgent(context.session, input.id);
		return gatewayFetch<GatewayAgent>(
			"POST",
			`/v1/agents/${encodeURIComponent(input.id)}/versions/${input.version}/restore`,
		);
	});
