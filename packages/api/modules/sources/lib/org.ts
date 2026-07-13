import { ORPCError } from "@orpc/server";
import { getOrganizationMembership } from "@repo/database";

/**
 * Sources — and every other org-scoped resource — are tenant-isolated by the
 * caller's active organization. `activeOrganizationId` is seeded from the
 * client-writable `lastActiveOrganizationId` user field (via the session-create
 * hook in @repo/auth), so it MUST NOT be trusted on its own: a caller can point
 * their session at an organization they do not belong to. This helper resolves
 * the active organization AND verifies the session user is actually a member of
 * it, throwing FORBIDDEN otherwise, then returns the verified id.
 *
 * Every org-scoped procedure funnels through here — directly, or transitively
 * via the requireOwned* helpers — so this single membership check closes the
 * cross-org read/write hole broadly. It is async (one membership lookup), so
 * all callers must await it.
 */
export async function requireActiveOrganizationId(session: {
	activeOrganizationId?: string | null;
	userId: string;
}): Promise<string> {
	if (!session.activeOrganizationId) {
		throw new ORPCError("BAD_REQUEST", {
			message: "Select or create an organization before managing sources.",
		});
	}

	const membership = await getOrganizationMembership(session.activeOrganizationId, session.userId);

	if (!membership) {
		throw new ORPCError("FORBIDDEN", {
			message: "You are not a member of the selected organization.",
		});
	}

	return session.activeOrganizationId;
}
