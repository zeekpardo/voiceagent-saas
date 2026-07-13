import { ORPCError } from "@orpc/server";
import { disconnectSource, getSource } from "@repo/database";
import z from "zod";

import { protectedProcedure } from "../../../orpc/procedures";
import { requireActiveOrganizationId } from "../lib/org";

export const disconnectSourceProcedure = protectedProcedure
	.route({
		method: "POST",
		path: "/sources/{id}/disconnect",
		tags: ["Sources"],
		summary: "Disconnect a source",
	})
	.input(z.object({ id: z.string() }))
	.handler(async ({ input, context }) => {
		const organizationId = await requireActiveOrganizationId(context.session);
		const source = await getSource(input.id, organizationId);
		if (!source) {
			throw new ORPCError("NOT_FOUND", { message: "Source not found" });
		}
		await disconnectSource(input.id, organizationId);
		return { disconnected: true };
	});
