import { describe, expect, it } from "vitest";

import { type GatewayLimitRow, refRequiredForScope, shapeLimitRows } from "./limits";

describe("refRequiredForScope", () => {
	it("does not require a ref for project scope", () => {
		expect(refRequiredForScope("project")).toBe(false);
		expect(refRequiredForScope("project", "")).toBe(false);
	});

	it("requires a non-blank ref for agent scope", () => {
		expect(refRequiredForScope("agent")).toBe(true);
		expect(refRequiredForScope("agent", "  ")).toBe(true);
		expect(refRequiredForScope("agent", "agent-1")).toBe(false);
	});

	it("requires a non-blank ref for group scope", () => {
		expect(refRequiredForScope("group")).toBe(true);
		expect(refRequiredForScope("group", "src-1")).toBe(false);
	});
});

describe("shapeLimitRows", () => {
	const sources = [{ id: "src-1", name: "Acme GHL" }];

	it("maps snake_case gateway fields to camelCase", () => {
		const rows: GatewayLimitRow[] = [
			{ scope: "project", ref: "", max_concurrent: 50, updated_at: "2026-07-01T00:00:00Z" },
		];

		expect(shapeLimitRows(rows, [])).toEqual([
			{ scope: "project", ref: "", maxConcurrent: 50, updatedAt: "2026-07-01T00:00:00Z" },
		]);
	});

	it("resolves a group-scope ref to its source name when known", () => {
		const rows: GatewayLimitRow[] = [
			{ scope: "group", ref: "src-1", max_concurrent: 3, updated_at: "2026-07-01T00:00:00Z" },
		];

		expect(shapeLimitRows(rows, sources)[0]).toMatchObject({ sourceName: "Acme GHL" });
	});

	it("leaves sourceName unset for an unresolvable group ref", () => {
		const rows: GatewayLimitRow[] = [
			{ scope: "group", ref: "unknown-src", max_concurrent: 3, updated_at: "2026-07-01T00:00:00Z" },
		];

		expect(shapeLimitRows(rows, sources)[0].sourceName).toBeUndefined();
	});

	it("does not attempt name resolution for project or agent scope", () => {
		const rows: GatewayLimitRow[] = [
			{ scope: "project", ref: "", max_concurrent: 100, updated_at: "2026-07-01T00:00:00Z" },
			{ scope: "agent", ref: "src-1", max_concurrent: 2, updated_at: "2026-07-01T00:00:00Z" },
		];

		const shaped = shapeLimitRows(rows, sources);
		expect(shaped.every((row) => row.sourceName === undefined)).toBe(true);
	});
});
