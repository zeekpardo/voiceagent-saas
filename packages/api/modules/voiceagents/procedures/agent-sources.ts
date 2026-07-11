import { attachSource, detachSource, listAgentSources } from "@repo/database";
import z from "zod";

import { protectedProcedure } from "../../../orpc/procedures";
import { requireOwnedSource } from "../../sources/lib/require-owned-source";
import { requireOwnedAgent } from "../lib/require-owned-agent";
import { autoMapAgentSource } from "./agent-source-mapping";

/** The Sources currently attached to an agent, with their per-pair mapping state. */
export const listAgentSourcesProcedure = protectedProcedure
	.route({
		method: "GET",
		path: "/voiceagents/agents/{agentId}/sources",
		tags: ["Voice Agents"],
		summary: "List the sources attached to an agent",
	})
	.input(z.object({ agentId: z.string() }))
	.handler(async ({ input, context }) => {
		await requireOwnedAgent(context.session, input.agentId);
		const rows = await listAgentSources(input.agentId);
		return rows.map((row) => ({
			sourceId: row.sourceId,
			enabled: row.enabled,
			source: {
				id: row.source.id,
				name: row.source.name,
				providerType: row.source.providerType,
				accountName: row.source.accountName,
				status: row.source.status,
			},
			fieldMappings: row.fieldMappings,
			tagFilters: row.tagFilters,
			tagRules: row.tagRules,
			stageRules: row.stageRules,
			variableValues: (row.variableValues ?? {}) as Record<string, string>,
			writeNote: row.writeNote,
			bookingCalendarId: row.bookingCalendarId,
			bookingCalendarName: row.bookingCalendarName,
		}));
	});

/** Attach a Source to an agent — auto-runs field sync (closebot: "we'll add them for you"). */
export const attachAgentSource = protectedProcedure
	.route({
		method: "POST",
		path: "/voiceagents/agents/{agentId}/sources/{sourceId}",
		tags: ["Voice Agents"],
		summary: "Attach a source to an agent",
	})
	.input(z.object({ agentId: z.string(), sourceId: z.string() }))
	.handler(async ({ input, context }) => {
		await requireOwnedAgent(context.session, input.agentId);
		await requireOwnedSource(context.session, input.sourceId);
		await attachSource({ agentId: input.agentId, sourceId: input.sourceId });
		const automap = await autoMapAgentSource(input.agentId, input.sourceId).catch((err) => {
			console.warn("[voiceagents-sources] auto-map on attach failed:", err);
			return null;
		});
		return { attached: true, automap };
	});

export const detachAgentSource = protectedProcedure
	.route({
		method: "DELETE",
		path: "/voiceagents/agents/{agentId}/sources/{sourceId}",
		tags: ["Voice Agents"],
		summary: "Detach a source from an agent",
	})
	.input(z.object({ agentId: z.string(), sourceId: z.string() }))
	.handler(async ({ input, context }) => {
		await requireOwnedAgent(context.session, input.agentId);
		await requireOwnedSource(context.session, input.sourceId);
		await detachSource(input.agentId, input.sourceId);
		return { detached: true };
	});
