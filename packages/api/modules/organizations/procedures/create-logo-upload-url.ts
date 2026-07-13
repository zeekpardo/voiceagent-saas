import { ORPCError } from "@orpc/server";
import { getOrganizationById } from "@repo/database";
import { getSignedUploadUrl } from "@repo/storage";
import z from "zod";

import { protectedProcedure } from "../../../orpc/procedures";
import { assertRole } from "../../sources/lib/org";
import { verifyOrganizationMembership } from "../lib/membership";

export const createLogoUploadUrl = protectedProcedure
	.route({
		method: "POST",
		path: "/organizations/logo-upload-url",
		tags: ["Organizations"],
		summary: "Create logo upload URL",
		description: "Create a signed upload URL to upload an logo image to the storage bucket",
	})
	.input(
		z.object({
			organizationId: z.string(),
		}),
	)
	.handler(async ({ context: { user }, input: { organizationId } }) => {
		const organization = await getOrganizationById(organizationId);

		if (!organization) {
			throw new ORPCError("BAD_REQUEST");
		}

		const membership = await verifyOrganizationMembership(organizationId, user.id);

		if (!membership) {
			throw new ORPCError("FORBIDDEN");
		}

		// The org logo is part of the org-settings governance surface — owner-only.
		assertRole(membership.role, ["owner"]);

		const path = `${organizationId}.png`;
		const signedUploadUrl = await getSignedUploadUrl(path, {
			bucket: "avatars",
		});

		return { signedUploadUrl, path };
	});
