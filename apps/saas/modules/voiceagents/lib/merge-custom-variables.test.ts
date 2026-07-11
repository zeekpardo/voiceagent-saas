import {
	mergeCustomVariables,
	readCustomVariableDefs,
	resolveVariableValues,
} from "@repo/api/modules/voiceagents/lib/custom-variables";
import { describe, expect, it } from "vitest";

const config = {
	customVariables: [
		{ name: "appointment_type", default: "consultation" },
		{ name: "promo_code", description: "current promo" },
		{ name: "office_phone", default: "555-0100" },
	],
};

describe("readCustomVariableDefs", () => {
	it("reads valid definitions and tolerates junk", () => {
		expect(readCustomVariableDefs(config)).toHaveLength(3);
		expect(readCustomVariableDefs({ customVariables: "nope" })).toEqual([]);
		expect(readCustomVariableDefs(undefined)).toEqual([]);
		expect(readCustomVariableDefs({ customVariables: [{ name: "" }, { nope: 1 }, null] })).toEqual(
			[],
		);
	});
});

describe("mergeCustomVariables precedence (default < source value < runtime)", () => {
	it("uses definition defaults when nothing overrides them", () => {
		const merged = mergeCustomVariables(config, null, {});
		expect(merged.appointment_type).toBe("consultation");
		expect(merged.office_phone).toBe("555-0100");
		// No default and no override → absent.
		expect(merged.promo_code).toBeUndefined();
	});

	it("per-source values override definition defaults", () => {
		const mapping = { variableValues: { appointment_type: "inspection", promo_code: "SAVE10" } };
		const merged = mergeCustomVariables(config, mapping, {});
		expect(merged.appointment_type).toBe("inspection");
		expect(merged.promo_code).toBe("SAVE10");
		expect(merged.office_phone).toBe("555-0100");
	});

	it("runtime variables win over both defaults and per-source values", () => {
		const mapping = { variableValues: { appointment_type: "inspection" } };
		const runtime = { appointment_type: "emergency", contact_first_name: "Ada" };
		const merged = mergeCustomVariables(config, mapping, runtime);
		expect(merged.appointment_type).toBe("emergency");
		expect(merged.contact_first_name).toBe("Ada");
	});

	it("treats empty default/per-source values as unset (never clobbers)", () => {
		const cfg = { customVariables: [{ name: "x", default: "" }] };
		const mapping = { variableValues: { x: "   " } };
		expect(mergeCustomVariables(cfg, mapping, {}).x).toBeUndefined();
	});
});

describe("resolveVariableValues preserves-when-omitted", () => {
	it("returns the input map when provided", () => {
		expect(resolveVariableValues({ a: "1" }, { b: "2" })).toEqual({ a: "1" });
	});

	it("falls back to the existing stored map when input is omitted", () => {
		expect(resolveVariableValues(undefined, { b: "2" })).toEqual({ b: "2" });
	});

	it("returns an empty map when neither input nor existing is present", () => {
		expect(resolveVariableValues(undefined, undefined)).toEqual({});
		expect(resolveVariableValues(undefined, null)).toEqual({});
	});
});
