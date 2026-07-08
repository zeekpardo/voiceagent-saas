import { ORPCError } from "@orpc/server";

/** Sources are org-scoped; every sources procedure needs an active organization. */
export function requireActiveOrganizationId(session: { activeOrganizationId?: string | null }): string {
	if (!session.activeOrganizationId) {
		throw new ORPCError("BAD_REQUEST", {
			message: "Select or create an organization before managing sources.",
		});
	}
	return session.activeOrganizationId;
}
