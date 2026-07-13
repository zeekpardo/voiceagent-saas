import { ORPCError } from "@orpc/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@repo/database", () => ({
	getOrganizationMembership: vi.fn(),
}));

import { getOrganizationMembership } from "@repo/database";

import { requireActiveOrganizationId } from "./org";

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

	it("returns the verified org id when the user is a member", async () => {
		vi.mocked(getOrganizationMembership).mockResolvedValueOnce({
			organization: { id: "org-1" },
			role: "member",
		} as never);

		await expect(
			requireActiveOrganizationId({ activeOrganizationId: "org-1", userId: "user-1" }),
		).resolves.toBe("org-1");
		expect(getOrganizationMembership).toHaveBeenCalledWith("org-1", "user-1");
	});
});
