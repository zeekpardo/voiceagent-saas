import { ORPCError } from "@orpc/server";
import z from "zod";

import { protectedProcedure } from "../../../orpc/procedures";
import type { CrmCalendar, CrmProvider } from "../../crm/lib/provider";
import { GhlApiError } from "../../crm/lib/providers/ghl-client";
import { resolveCrmProvider } from "../../crm/lib/resolve";
import { requireOwnedSource } from "../lib/require-owned-source";

/** A scope the connection lacks shouldn't 500 the whole tab — degrade to empty. */
async function emptyOnScopeGap<T>(fn: () => Promise<T[]>): Promise<T[]> {
	try {
		return await fn();
	} catch (err) {
		if (err instanceof GhlApiError && (err.status === 401 || err.status === 403)) {
			console.warn("[sources] scope gap:", err.message);
			return [];
		}
		throw err;
	}
}

async function requireProvider(sourceId: string): Promise<CrmProvider> {
	const provider = await resolveCrmProvider(sourceId);
	if (!provider) {
		throw new ORPCError("BAD_REQUEST", { message: "Source has no usable CRM connection." });
	}
	return provider;
}

const sourceIdInput = z.object({ sourceId: z.string() });

/** The source's CRM tag library — options for the tag-rule picker. */
export const listSourceTags = protectedProcedure
	.route({
		method: "GET",
		path: "/sources/{sourceId}/tags",
		tags: ["Sources"],
		summary: "List a source's CRM tags",
	})
	.input(sourceIdInput)
	.handler(async ({ input, context }) => {
		await requireOwnedSource(context.session, input.sourceId);
		const provider = await requireProvider(input.sourceId);
		return emptyOnScopeGap(() => provider.listTags());
	});

/** Pipelines + stages — options for stage-move rules. */
export const listSourcePipelines = protectedProcedure
	.route({
		method: "GET",
		path: "/sources/{sourceId}/pipelines",
		tags: ["Sources"],
		summary: "List a source's CRM pipelines",
	})
	.input(sourceIdInput)
	.handler(async ({ input, context }) => {
		await requireOwnedSource(context.session, input.sourceId);
		const provider = await requireProvider(input.sourceId);
		return emptyOnScopeGap(() => provider.listPipelines());
	});

export const listSourceCustomFields = protectedProcedure
	.route({
		method: "GET",
		path: "/sources/{sourceId}/custom-fields",
		tags: ["Sources"],
		summary: "List a source's CRM contact custom fields",
	})
	.input(sourceIdInput)
	.handler(async ({ input, context }) => {
		await requireOwnedSource(context.session, input.sourceId);
		const provider = await requireProvider(input.sourceId);
		return provider.listCustomFields();
	});

export const createSourceCustomField = protectedProcedure
	.route({
		method: "POST",
		path: "/sources/{sourceId}/custom-fields",
		tags: ["Sources"],
		summary: "Create a contact custom field in a source's CRM",
	})
	.input(sourceIdInput.extend({ name: z.string().min(1).max(64) }))
	.handler(async ({ input, context }) => {
		await requireOwnedSource(context.session, input.sourceId);
		const provider = await requireProvider(input.sourceId);
		return provider.createCustomField(input.name);
	});

/** The bookable calendars on a source's account — options for the booking-calendar picker. */
export const listSourceCalendars = protectedProcedure
	.route({
		method: "GET",
		path: "/sources/{sourceId}/calendars",
		tags: ["Sources"],
		summary: "List a source's CRM calendars",
	})
	.input(sourceIdInput)
	.handler(async ({ input, context }): Promise<CrmCalendar[]> => {
		await requireOwnedSource(context.session, input.sourceId);
		const provider = await requireProvider(input.sourceId);
		return emptyOnScopeGap(() => provider.listCalendars());
	});
