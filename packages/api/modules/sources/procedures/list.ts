import { listSources } from "@repo/database";

import { protectedProcedure } from "../../../orpc/procedures";
import { requireActiveOrganizationId } from "../lib/org";

/** Every Source connected to the caller's active organization. */
export const listSourcesProcedure = protectedProcedure
	.route({
		method: "GET",
		path: "/sources",
		tags: ["Sources"],
		summary: "List sources connected to the active organization",
	})
	.handler(async ({ context }) => {
		const organizationId = requireActiveOrganizationId(context.session);
		const sources = await listSources(organizationId);
		return sources.map((source) => ({
			id: source.id,
			name: source.name,
			providerType: source.providerType,
			accountName: source.accountName,
			address: source.address,
			status: source.status,
			connectedAgentsCount: source._count.agentSources,
			createdAt: source.createdAt,
		}));
	});
