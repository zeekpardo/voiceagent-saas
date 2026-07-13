import { ORPCError } from "@orpc/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@repo/database", () => ({
	getOrganizationMembership: vi.fn(),
}));

import { getOrganizationMembership } from "@repo/database";

import { assertRole, authorize, requireActiveOrganizationId } from "./org";

describe("authorize (role → action policy)", () => {
	it("grants the owner every action", () => {
		for (const action of ["read", "manage", "billing", "org:settings"] as const) {
			expect(authorize("owner", action)).toBe(true);
		}
	});

	it("grants the admin product access but denies the governance/billing surface", () => {
		expect(authorize("admin", "read")).toBe(true);
		expect(authorize("admin", "manage")).toBe(true);
		expect(authorize("admin", "billing")).toBe(false);
		expect(authorize("admin", "org:settings")).toBe(false);
	});

	it("denies the member every action (deferred, deny-by-default)", () => {
		for (const action of ["read", "manage", "billing", "org:settings"] as const) {
			expect(authorize("member", action)).toBe(false);
		}
	});

	it("denies unknown / missing roles", () => {
		expect(authorize(null, "read")).toBe(false);
		expect(authorize(undefined, "manage")).toBe(false);
		expect(authorize("superuser" as never, "manage")).toBe(false);
	});
});

describe("assertRole", () => {
	it("passes when the role is in the allowed set", () => {
		expect(() => assertRole("owner", ["owner"])).not.toThrow();
		expect(() => assertRole("admin", ["owner", "admin"])).not.toThrow();
	});

	it("throws FORBIDDEN for a disallowed role (admin/member on an owner-only action)", () => {
		expect(() => assertRole("admin", ["owner"])).toThrow(ORPCError);
		expect(() => assertRole("admin", ["owner"])).toThrow(
			expect.objectContaining({ code: "FORBIDDEN" }),
		);
		expect(() => assertRole("member", ["owner"])).toThrow(
			expect.objectContaining({ code: "FORBIDDEN" }),
		);
	});

	it("throws FORBIDDEN for a missing / unrecognized role", () => {
		expect(() => assertRole(null, ["owner"])).toThrow(
			expect.objectContaining({ code: "FORBIDDEN" }),
		);
		expect(() => assertRole("bogus", ["owner", "admin", "member"])).toThrow(
			expect.objectContaining({ code: "FORBIDDEN" }),
		);
	});
});

describe("requireActiveOrganizationId", () => {
	it("throws BAD_REQUEST when no active organization is set", async () => {
		await expect(
			requireActiveOrganizationId({ activeOrganizationId: null, userId: "user-1" }),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
		expect(getOrganizationMembership).not.toHaveBeenCalled();
	});

	it("throws FORBIDDEN when the session user is not a member of the active org", async () => {
		vi.mocked(getOrganizationMembership).mockResolvedValueOnce(null);

		await expect(
			requireActiveOrganizationId({ activeOrganizationId: "org-victim", userId: "attacker" }),
		).rejects.toBeInstanceOf(ORPCError);
		await expect(
			requireActiveOrganizationId({ activeOrganizationId: "org-victim", userId: "attacker" }),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
		expect(getOrganizationMembership).toHaveBeenCalledWith("org-victim", "attacker");
	});

	it("returns the verified org id for an owner (default manage action)", async () => {
		vi.mocked(getOrganizationMembership).mockResolvedValueOnce({
			organization: { id: "org-1" },
			role: "owner",
		} as never);

		await expect(
			requireActiveOrganizationId({ activeOrganizationId: "org-1", userId: "user-1" }),
		).resolves.toBe("org-1");
		expect(getOrganizationMembership).toHaveBeenCalledWith("org-1", "user-1");
	});

	it("returns the verified org id for an admin managing product resources", async () => {
		vi.mocked(getOrganizationMembership).mockResolvedValueOnce({
			organization: { id: "org-1" },
			role: "admin",
		} as never);

		await expect(
			requireActiveOrganizationId({ activeOrganizationId: "org-1", userId: "user-1" }, "manage"),
		).resolves.toBe("org-1");
	});

	it("throws FORBIDDEN when a member attempts a mutation (deny-by-default)", async () => {
		vi.mocked(getOrganizationMembership).mockResolvedValue({
			organization: { id: "org-1" },
			role: "member",
		} as never);

		await expect(
			requireActiveOrganizationId({ activeOrganizationId: "org-1", userId: "user-1" }, "manage"),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
		// default action is "manage", so a member is denied even without an explicit action
		await expect(
			requireActiveOrganizationId({ activeOrganizationId: "org-1", userId: "user-1" }),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});
});
