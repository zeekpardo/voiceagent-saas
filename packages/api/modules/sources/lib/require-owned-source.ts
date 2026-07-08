import { ORPCError } from "@orpc/server";
import { getSource } from "@repo/database";

import { requireActiveOrganizationId } from "./org";

/** Verifies the caller's active organization owns sourceId, throwing NOT_FOUND otherwise. */
export async function requireOwnedSource(
	session: { activeOrganizationId?: string | null },
	sourceId: string,
) {
	const organizationId = requireActiveOrganizationId(session);
	const source = await getSource(sourceId, organizationId);
	if (!source) {
		throw new ORPCError("NOT_FOUND", { message: "Source not found" });
	}
	return source;
}
