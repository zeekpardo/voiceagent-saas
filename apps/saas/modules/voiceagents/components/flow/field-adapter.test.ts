import type { ContactFieldOption } from "@voiceagents/lib/contact-fields-api";
import { describe, expect, it } from "vitest";

import { fieldOptionsFor, fieldToKey, isCompositeField, keyToStored } from "./field-adapter";

/**
 * BYTE-COMPAT: objective/set_field store the field as a human string ("Email",
 * "Full Address", or a bespoke custom name) — the exact shape the compiler emits
 * today and the engine's update_contact tool resolves. The combobox works in
 * key-space, so these adapters must round-trip label→key→label byte-identically
 * (no existing flow changes on load or on an unchanged re-pick).
 */
const FIELDS: ContactFieldOption[] = [
	{ key: "contact.first_name", label: "First Name", kind: "standard" },
	{ key: "contact.name", label: "Full Name", kind: "standard" },
	{ key: "contact.email", label: "Email", kind: "standard" },
	{ key: "contact.address", label: "Full Address", kind: "standard" },
	{ key: "contact.address1", label: "Street Address", kind: "standard" },
	{
		key: "contact.lead_type",
		label: "Lead Type",
		kind: "custom",
		dataType: "picklist",
		options: ["Seller", "Buyer"],
	},
	{ key: "contact.reason_for_selling", label: "Reason for Selling", kind: "custom" },
];

describe("field-adapter byte-compat", () => {
	it("maps a legacy stored standard label to its combobox key", () => {
		expect(fieldToKey("Email", FIELDS)).toBe("contact.email");
		expect(fieldToKey("Full Address", FIELDS)).toBe("contact.address");
	});

	it("round-trips standard labels byte-identically (label → key → label)", () => {
		for (const label of ["First Name", "Full Name", "Email", "Full Address", "Street Address"]) {
			const key = fieldToKey(label, FIELDS);
			expect(keyToStored(key, FIELDS)).toBe(label);
		}
	});

	it("round-trips custom field names byte-identically", () => {
		const key = fieldToKey("Reason for Selling", FIELDS);
		expect(key).toBe("contact.reason_for_selling");
		expect(keyToStored(key, FIELDS)).toBe("Reason for Selling");
	});

	it("stores a picked field's label, not its key (engine resolves standard by name, custom by name)", () => {
		expect(keyToStored("contact.email", FIELDS)).toBe("Email");
		expect(keyToStored("contact.reason_for_selling", FIELDS)).toBe("Reason for Selling");
	});

	it("passes bespoke (allowCustomKey) strings through verbatim in both directions", () => {
		expect(fieldToKey("Escrow Officer", FIELDS)).toBe("Escrow Officer");
		expect(keyToStored("Escrow Officer", FIELDS)).toBe("Escrow Officer");
	});

	it("treats empty / null as 'Leave Empty'", () => {
		expect(fieldToKey("", FIELDS)).toBeNull();
		expect(fieldToKey(undefined, FIELDS)).toBeNull();
		expect(keyToStored(null, FIELDS)).toBe("");
	});

	it("flags composite standard fields only", () => {
		expect(isCompositeField("Full Address", FIELDS)).toBe(true);
		expect(isCompositeField("Full Name", FIELDS)).toBe(true);
		expect(isCompositeField("Email", FIELDS)).toBe(false);
		expect(isCompositeField("Reason for Selling", FIELDS)).toBe(false);
	});

	it("exposes picklist options for the picked field", () => {
		expect(fieldOptionsFor("Lead Type", FIELDS)).toEqual(["Seller", "Buyer"]);
		expect(fieldOptionsFor("Email", FIELDS)).toBeUndefined();
		expect(fieldOptionsFor("Reason for Selling", FIELDS)).toBeUndefined();
	});
});
