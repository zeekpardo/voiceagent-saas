import { describe, expect, it } from "vitest";

import { checkVariableName, normalizeVariableName } from "./custom-variables";

describe("normalizeVariableName", () => {
	it("lowercases and snake_cases spaces and dashes", () => {
		expect(normalizeVariableName("Appointment Type")).toBe("appointment_type");
		expect(normalizeVariableName("call-back number")).toBe("call_back_number");
	});

	it("strips invalid characters and collapses underscores", () => {
		expect(normalizeVariableName("  Job #1!!  ")).toBe("job_1");
		expect(normalizeVariableName("a___b")).toBe("a_b");
	});

	it("drops leading digits/underscores and trailing underscores", () => {
		expect(normalizeVariableName("123abc")).toBe("abc");
		expect(normalizeVariableName("_name_")).toBe("name");
	});

	it("returns empty for input with no valid identifier chars", () => {
		expect(normalizeVariableName("!!!")).toBe("");
		expect(normalizeVariableName("   ")).toBe("");
	});
});

describe("checkVariableName", () => {
	it("accepts a fresh valid name and reports the normalized form", () => {
		const result = checkVariableName("Appointment Type");
		expect(result).toEqual({ normalized: "appointment_type", valid: true });
	});

	it("rejects an empty/invalid name", () => {
		const result = checkVariableName("   ");
		expect(result.valid).toBe(false);
		expect(result.normalized).toBe("");
		expect(result.error).toBeTruthy();
	});

	it("rejects collisions with built-in runtime variables", () => {
		const result = checkVariableName("Contact First Name");
		expect(result.normalized).toBe("contact_first_name");
		expect(result.valid).toBe(false);
		expect(result.error).toContain("built-in");
	});

	it("rejects location_* and caller_* runtime collisions too", () => {
		expect(checkVariableName("location_name").valid).toBe(false);
		expect(checkVariableName("caller_name").valid).toBe(false);
	});

	it("rejects a name already defined (post-normalization)", () => {
		const result = checkVariableName("Appointment Type", ["appointment_type"]);
		expect(result.valid).toBe(false);
		expect(result.error).toContain("already defined");
	});

	it("does not treat the row's own name as a collision (excluded from existing)", () => {
		// The editor passes other names only, so re-saving the same name is valid.
		const result = checkVariableName("appointment_type", ["other_var"]);
		expect(result.valid).toBe(true);
	});
});
