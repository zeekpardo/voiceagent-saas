import { ORPCError } from "@orpc/server";
import {
	createPersona,
	deletePersona,
	getPersona,
	listPersonas,
	updatePersona,
} from "@repo/database";
import z from "zod";

import { protectedProcedure } from "../../../orpc/procedures";
import { requireActiveOrganizationId } from "../../sources/lib/org";

/**
 * Personas — a reusable identity/tone/behavior layer attached to voice agents.
 * Org-scoped like Sources. A persona's effect is compiled into an agent's
 * instructions at save/publish (see lib/persona-prompt + lib/resolve-persona),
 * so this module is pure CRUD.
 *
 * Deleting a persona that agents reference is allowed: agents fall back to
 * no-persona, keeping their last-compiled prompt until they are re-published.
 */

const HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/** Shared create/update field schema — the UI imports this from @repo/api. */
export const personaInput = z.object({
	name: z.string().min(1).max(80),
	internalDescription: z.string().max(2000).nullish(),
	avatarUrl: z.string().url().nullish(),
	themeColor: z.string().regex(HEX_COLOR, "Must be a hex color").nullish(),
	styles: z.array(z.string().min(1).max(40)).max(3).default([]),
	howToRespond: z.string().max(4000).default(""),
	guardrails: z.string().max(4000).nullish(),
	ttsVoice: z.string().max(120).nullish(),
	llmModel: z.string().max(120).nullish(),
});

export type PersonaInput = z.infer<typeof personaInput>;

/** The persona shape returned to the client. */
export interface PersonaDTO {
	id: string;
	name: string;
	internalDescription: string | null;
	avatarUrl: string | null;
	themeColor: string | null;
	styles: string[];
	howToRespond: string;
	guardrails: string | null;
	ttsVoice: string | null;
	llmModel: string | null;
	createdAt: Date;
	updatedAt: Date;
}

function toDTO(row: {
	id: string;
	name: string;
	internalDescription: string | null;
	avatarUrl: string | null;
	themeColor: string | null;
	styles: string[];
	howToRespond: string;
	guardrails: string | null;
	ttsVoice: string | null;
	llmModel: string | null;
	createdAt: Date;
	updatedAt: Date;
}): PersonaDTO {
	return {
		id: row.id,
		name: row.name,
		internalDescription: row.internalDescription,
		avatarUrl: row.avatarUrl,
		themeColor: row.themeColor,
		styles: row.styles,
		howToRespond: row.howToRespond,
		guardrails: row.guardrails,
		ttsVoice: row.ttsVoice,
		llmModel: row.llmModel,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
	};
}

export const listPersonasProcedure = protectedProcedure
	.route({
		method: "GET",
		path: "/voiceagents/personas",
		tags: ["Voice Agents"],
		summary: "List personas for the active organization",
	})
	.handler(async ({ context }) => {
		const organizationId = await requireActiveOrganizationId(context.session);
		const rows = await listPersonas(organizationId);
		return rows.map(toDTO);
	});

export const getPersonaProcedure = protectedProcedure
	.route({
		method: "GET",
		path: "/voiceagents/personas/{id}",
		tags: ["Voice Agents"],
		summary: "Get a persona",
	})
	.input(z.object({ id: z.string() }))
	.handler(async ({ input, context }) => {
		const organizationId = await requireActiveOrganizationId(context.session);
		const row = await getPersona(input.id, organizationId);
		if (!row) {
			throw new ORPCError("NOT_FOUND", { message: "Persona not found" });
		}
		return toDTO(row);
	});

export const createPersonaProcedure = protectedProcedure
	.route({
		method: "POST",
		path: "/voiceagents/personas",
		tags: ["Voice Agents"],
		summary: "Create a persona",
	})
	.input(personaInput)
	.handler(async ({ input, context }) => {
		const organizationId = await requireActiveOrganizationId(context.session);
		const row = await createPersona({ organizationId, ...input });
		return toDTO(row);
	});

export const updatePersonaProcedure = protectedProcedure
	.route({
		method: "PATCH",
		path: "/voiceagents/personas/{id}",
		tags: ["Voice Agents"],
		summary: "Update a persona",
	})
	.input(z.object({ id: z.string(), data: personaInput }))
	.handler(async ({ input, context }) => {
		const organizationId = await requireActiveOrganizationId(context.session);
		const row = await updatePersona(input.id, organizationId, input.data);
		if (!row) {
			throw new ORPCError("NOT_FOUND", { message: "Persona not found" });
		}
		return toDTO(row);
	});

export const deletePersonaProcedure = protectedProcedure
	.route({
		method: "DELETE",
		path: "/voiceagents/personas/{id}",
		tags: ["Voice Agents"],
		summary: "Delete a persona (agents using it fall back to no-persona)",
	})
	.input(z.object({ id: z.string() }))
	.handler(async ({ input, context }) => {
		const organizationId = await requireActiveOrganizationId(context.session);
		const result = await deletePersona(input.id, organizationId);
		if (result.count === 0) {
			throw new ORPCError("NOT_FOUND", { message: "Persona not found" });
		}
		return { deleted: true };
	});
