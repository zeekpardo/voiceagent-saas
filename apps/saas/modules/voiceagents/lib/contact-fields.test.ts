import {
	dedupeFieldOptions,
	locationFieldOptions,
	standardContactFieldOptions,
} from "@repo/api/modules/crm/lib/field-mapping";
import { describe, expect, it } from "vitest";

describe("unified contact/location field options", () => {
	it("standard contact fields are namespaced contact + kind standard", () => {
		const std = standardContactFieldOptions();
		expect(std.length).toBeGreaterThan(0);
		expect(std.every((f) => f.namespace === "contact")).toBe(true);
		expect(std.every((f) => f.kind === "standard")).toBe(true);
		// Ordered first: first name leads the CloseBot catalog.
		expect(std[0].key).toBe("contact.first_name");
	});

	it("location fields are namespaced location and carry location.* keys", () => {
		const loc = locationFieldOptions();
		expect(loc.every((f) => f.namespace === "location")).toBe(true);
		expect(loc.every((f) => f.key.startsWith("location."))).toBe(true);
		expect(loc.map((f) => f.key)).toContain("location.timezone");
	});

	it("dedupes by key, first occurrence wins and order is preserved", () => {
		const merged = dedupeFieldOptions([
			{ key: "contact.email", label: "Email", kind: "standard", namespace: "contact" },
			{ key: "contact.pool", label: "Pool", kind: "custom", namespace: "contact" },
			{ key: "contact.email", label: "Email (dupe)", kind: "custom", namespace: "contact" },
			{ key: "location.city", label: "Location City", kind: "standard", namespace: "location" },
		]);
		expect(merged.map((f) => f.key)).toEqual(["contact.email", "contact.pool", "location.city"]);
		// First occurrence kept its label/kind.
		expect(merged[0].label).toBe("Email");
		expect(merged[0].kind).toBe("standard");
	});

	it("assembling standard + location has no key collisions", () => {
		const assembled = dedupeFieldOptions([
			...standardContactFieldOptions(),
			...locationFieldOptions(),
		]);
		const keys = assembled.map((f) => f.key);
		expect(new Set(keys).size).toBe(keys.length);
	});
});
