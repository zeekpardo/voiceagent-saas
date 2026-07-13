import { ORPCError } from "@orpc/server";
import z from "zod";

import { protectedProcedure } from "../../../orpc/procedures";
import { createOauthState } from "../../crm/lib/oauth-state";
import { getCrmRegistration } from "../../crm/lib/resolve";
import { requireActiveOrganizationId } from "../lib/org";

/** Mint the marketplace-app authorize URL for an OAuth source provider. */
export const sourceOauthUrl = protectedProcedure
	.route({
		method: "POST",
		path: "/sources/oauth-url",
		tags: ["Sources"],
		summary: "Get the OAuth authorize URL for a source provider",
	})
	.input(z.object({ providerType: z.string().min(1) }))
	.handler(async ({ input, context }) => {
		const organizationId = await requireActiveOrganizationId(context.session);
		const registration = getCrmRegistration(input.providerType);
		if (!registration?.oauth || registration.authType !== "oauth") {
			throw new ORPCError("BAD_REQUEST", {
				message: `${input.providerType} is not configured for OAuth (missing marketplace app credentials)`,
			});
		}
		return {
			url: registration.oauth.getAuthUrl(
				createOauthState(context.user.id, organizationId, input.providerType),
			),
		};
	});
