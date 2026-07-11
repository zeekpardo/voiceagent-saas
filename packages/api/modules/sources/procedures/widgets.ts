import {
	createSourceWidget,
	deleteSourceWidget,
	listSourceWidgets,
	updateSourceWidget,
} from "@repo/database";
import { z } from "zod";

import { protectedProcedure } from "../../../orpc/procedures";
import {
	parseWidgetAppearance,
	parseWidgetBehavior,
	parseWidgetTargeting,
	WIDGET_APPEARANCE_DEFAULTS,
	WIDGET_BEHAVIOR_DEFAULTS,
	WIDGET_TARGETING_DEFAULTS,
	widgetAppearanceSchema,
	widgetBehaviorSchema,
	widgetTargetingSchema,
} from "../../voiceagents/lib/widget-config";
import { createWidgetToken } from "../../voiceagents/lib/widget-token";
import { requireOwnedSource } from "../lib/require-owned-source";
import { requireOwnedWidget } from "../lib/require-owned-widget";

/** Serialize a stored row into the shape the Studio UI consumes (blobs parsed
 *  back through the schemas so stale rows fill defaults). */
function toWidgetDto(row: {
	id: string;
	sourceId: string;
	agentId: string;
	name: string;
	enabled: boolean;
	widgetToken: string;
	origins: unknown;
	appearance: unknown;
	targeting: unknown;
	behavior: unknown;
	createdAt: Date;
	updatedAt: Date;
}) {
	return {
		id: row.id,
		sourceId: row.sourceId,
		agentId: row.agentId,
		name: row.name,
		enabled: row.enabled,
		token: row.widgetToken,
		origins: Array.isArray(row.origins) ? (row.origins as string[]) : [],
		appearance: parseWidgetAppearance(row.appearance),
		targeting: parseWidgetTargeting(row.targeting),
		behavior: parseWidgetBehavior(row.behavior),
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
	};
}

export const listWidgets = protectedProcedure
	.route({
		method: "GET",
		path: "/sources/{sourceId}/widgets",
		tags: ["Sources"],
		summary: "List the saved Website Widgets for a source",
	})
	.input(z.object({ sourceId: z.string() }))
	.handler(async ({ input, context }) => {
		await requireOwnedSource(context.session, input.sourceId);
		const rows = await listSourceWidgets(input.sourceId);
		return rows.map(toWidgetDto);
	});

export const createWidget = protectedProcedure
	.route({
		method: "POST",
		path: "/sources/{sourceId}/widgets",
		tags: ["Sources"],
		summary: "Create a Website Widget for a source",
	})
	.input(
		z.object({
			sourceId: z.string(),
			agentId: z.string().min(1),
			name: z.string().min(1).max(80),
		}),
	)
	.handler(async ({ input, context }) => {
		const source = await requireOwnedSource(context.session, input.sourceId);
		// New widgets start with no origins pinned; the merchant adds them in the
		// editor (update re-mints the token). "*" would be needed to actually run
		// before then — surfaced in the editor's origins section.
		const origins: string[] = [];
		const token = createWidgetToken(input.agentId, source.organizationId, origins);
		const row = await createSourceWidget({
			sourceId: input.sourceId,
			agentId: input.agentId,
			name: input.name,
			widgetToken: token,
			origins,
			appearance: WIDGET_APPEARANCE_DEFAULTS,
			targeting: WIDGET_TARGETING_DEFAULTS,
			behavior: WIDGET_BEHAVIOR_DEFAULTS,
		});
		return toWidgetDto(row);
	});

export const updateWidget = protectedProcedure
	.route({
		method: "PATCH",
		path: "/sources/widgets/{id}",
		tags: ["Sources"],
		summary: "Update a Website Widget",
	})
	.input(
		z.object({
			id: z.string(),
			name: z.string().min(1).max(80).optional(),
			agentId: z.string().min(1).optional(),
			enabled: z.boolean().optional(),
			origins: z.array(z.string()).optional(),
			appearance: widgetAppearanceSchema.partial().optional(),
			targeting: widgetTargetingSchema.optional(),
			behavior: widgetBehaviorSchema.optional(),
		}),
	)
	.handler(async ({ input, context }) => {
		const { widget, organizationId } = await requireOwnedWidget(context.session, input.id);

		const nextAgentId = input.agentId ?? widget.agentId;
		const nextOrigins = input.origins ?? (widget.origins as string[]);
		// Origins and agentId are baked into the signed token — re-mint when either
		// changes so old snippets keep working but the token reflects the new pins.
		const agentChanged = input.agentId !== undefined && input.agentId !== widget.agentId;
		const originsChanged = input.origins !== undefined;
		const nextToken =
			agentChanged || originsChanged
				? createWidgetToken(nextAgentId, organizationId, nextOrigins)
				: undefined;

		const row = await updateSourceWidget(input.id, {
			...(input.name !== undefined ? { name: input.name } : {}),
			...(input.agentId !== undefined ? { agentId: input.agentId } : {}),
			...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
			...(input.origins !== undefined ? { origins: input.origins } : {}),
			...(nextToken !== undefined ? { widgetToken: nextToken } : {}),
			// Appearance is a partial merge onto the current stored value; targeting
			// and behavior are replaced wholesale (the editor always sends the full
			// object for those).
			...(input.appearance !== undefined
				? { appearance: { ...parseWidgetAppearance(widget.appearance), ...input.appearance } }
				: {}),
			...(input.targeting !== undefined ? { targeting: input.targeting } : {}),
			...(input.behavior !== undefined ? { behavior: input.behavior } : {}),
		});
		return toWidgetDto(row);
	});

export const removeWidget = protectedProcedure
	.route({
		method: "DELETE",
		path: "/sources/widgets/{id}",
		tags: ["Sources"],
		summary: "Delete a Website Widget",
	})
	.input(z.object({ id: z.string() }))
	.handler(async ({ input, context }) => {
		await requireOwnedWidget(context.session, input.id);
		await deleteSourceWidget(input.id);
		return { id: input.id };
	});
