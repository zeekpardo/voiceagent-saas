import { ORPCError } from "@orpc/server";
import { getOrganizationMembership } from "@repo/database";

/**
 * Roles carried on the Better Auth organization membership row. Ordered by
 * privilege: `owner` > `admin` > `member`.
 */
export type OrganizationRole = "owner" | "admin" | "member";

/**
 * The authorization surface, split into what each role may do. Product actions
 * (`read`/`manage`) cover all business resources — agents, sources, calls,
 * conversations, CRM mappings, numbers, widgets, personas, tools. The
 * governance actions cover the owner-reserved org surface.
 */
export type OrganizationAction =
	| "read" // view org-scoped product resources
	| "manage" // create / update / delete org-scoped product resources
	| "billing" // billing / subscription (checkout, customer portal, purchases)
	| "org:settings"; // org profile / settings / logo / slug

export function isOrganizationRole(role: string | null | undefined): role is OrganizationRole {
	return role === "owner" || role === "admin" || role === "member";
}

/**
 * SINGLE POLICY POINT — the role → action authorization matrix. Pure and
 * deny-by-default: any role/action pair not explicitly granted returns false.
 *
 * - owner  — full access to everything (all product resources + all governance:
 *            org settings, billing/subscription, delete org, transfer ownership,
 *            manage members/roles).
 * - admin  — full access to all product resources, but NONE of the
 *            org-governance/billing surface (i.e. admin = owner minus governance).
 * - member — DEFERRED. Deny-by-default: members may not mutate anything yet, and
 *            for now are not granted read access either (see TODO below).
 *
 * NOTE: org delete / ownership transfer / member-role management are gated
 * server-side by Better Auth's own organization plugin endpoints and are NOT
 * re-implemented as app oRPC procedures; they are therefore not modelled as
 * distinct actions here. This matrix governs only the app-level oRPC surface.
 */
export function authorize(
	role: OrganizationRole | null | undefined,
	action: OrganizationAction,
): boolean {
	switch (role) {
		case "owner":
			// Full access to everything.
			return true;
		case "admin":
			// Everything except the org-governance/billing surface.
			return action === "read" || action === "manage";
		case "member":
			// TODO(member-role): member permissions are deferred ("scope out
			// later"). This is the single place to expand them. To grant members
			// read-only access, return `action === "read"` here. Do NOT grant any
			// write/governance action to members without an explicit decision.
			return false;
		default:
			// Unknown / missing role → deny.
			return false;
	}
}

/**
 * Thin throwing wrapper for explicit role gates (e.g. owner-only procedures that
 * do not funnel through {@link requireActiveOrganizationId}, such as the billing
 * procedures keyed by an input organization id). Throws FORBIDDEN unless `role`
 * is one of `allowed`.
 */
export function assertRole(
	role: string | null | undefined,
	allowed: readonly OrganizationRole[],
): void {
	if (!isOrganizationRole(role) || !allowed.includes(role)) {
		throw new ORPCError("FORBIDDEN", {
			message: "Your role does not permit this action.",
		});
	}
}

/**
 * Sources — and every other org-scoped resource — are tenant-isolated by the
 * caller's active organization. `activeOrganizationId` is seeded from the
 * client-writable `lastActiveOrganizationId` user field (via the session-create
 * hook in @repo/auth), so it MUST NOT be trusted on its own: a caller can point
 * their session at an organization they do not belong to. This helper resolves
 * the active organization AND verifies the session user is actually a member of
 * it, throwing FORBIDDEN otherwise, then returns the verified id.
 *
 * It also enforces role-based authorization for the requested `action` via the
 * {@link authorize} policy. The default is `"manage"` (deny-by-default for the
 * write surface): every existing product procedure funnels through here —
 * directly, or transitively via the requireOwned* helpers — so owner/admin keep
 * full product access while members are denied by default. Read-only procedures
 * may pass `"read"` once member read access is scoped in (see the
 * TODO(member-role) in {@link authorize}). It is async (one membership lookup),
 * so all callers must await it.
 */
export async function requireActiveOrganizationId(
	session: {
		activeOrganizationId?: string | null;
		userId: string;
	},
	action: OrganizationAction = "manage",
): Promise<string> {
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

	if (!authorize(membership.role as OrganizationRole, action)) {
		throw new ORPCError("FORBIDDEN", {
			message: "Your role does not permit this action.",
		});
	}

	return session.activeOrganizationId;
}
