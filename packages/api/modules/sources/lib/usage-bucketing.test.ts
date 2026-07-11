import { describe, expect, it } from "vitest";

import { bucketUsageByOrgSources, type GatewayUsageGroup } from "./usage-bucketing";

const orgSources = [
	{ id: "src-1", name: "Acme GHL" },
	{ id: "src-2", name: "Acme HubSpot" },
];

describe("bucketUsageByOrgSources", () => {
	it("returns a zero row for every org source, even with no matching groups", () => {
		const rows = bucketUsageByOrgSources([], orgSources);

		expect(rows).toHaveLength(3); // 2 org sources + unattributed
		expect(rows.filter((r) => r.sourceId !== null).every((r) => r.calls === 0)).toBe(true);
		expect(rows.find((r) => r.sourceId === null)).toMatchObject({
			sourceName: "Unattributed",
			calls: 0,
		});
	});

	it("attributes a group to the matching org source", () => {
		const groups: GatewayUsageGroup[] = [
			{ group_ref: "src-1", calls: 5, active_calls: 1, total_seconds: 600 },
		];

		const rows = bucketUsageByOrgSources(groups, orgSources);

		const src1 = rows.find((r) => r.sourceId === "src-1");
		expect(src1).toMatchObject({ calls: 5, activeCalls: 1, totalSeconds: 600, totalMinutes: 10 });
		const src2 = rows.find((r) => r.sourceId === "src-2");
		expect(src2).toMatchObject({ calls: 0, totalSeconds: 0 });
	});

	it("buckets a null group_ref as Unattributed", () => {
		const groups: GatewayUsageGroup[] = [
			{ group_ref: null, calls: 3, active_calls: 0, total_seconds: 90 },
		];

		const rows = bucketUsageByOrgSources(groups, orgSources);

		const unattributed = rows.find((r) => r.sourceId === null);
		expect(unattributed).toMatchObject({ calls: 3, totalSeconds: 90, totalMinutes: 1.5 });
	});

	it("buckets a group_ref for a source outside the org as Unattributed (no cross-org leakage)", () => {
		const groups: GatewayUsageGroup[] = [
			{ group_ref: "other-org-source", calls: 2, active_calls: 0, total_seconds: 120 },
		];

		const rows = bucketUsageByOrgSources(groups, orgSources);

		expect(rows.find((r) => r.sourceId === "other-org-source")).toBeUndefined();
		const unattributed = rows.find((r) => r.sourceId === null);
		expect(unattributed).toMatchObject({ calls: 2, totalSeconds: 120 });
	});

	it("sums multiple groups that map to the same source", () => {
		const groups: GatewayUsageGroup[] = [
			{ group_ref: "src-1", calls: 2, active_calls: 1, total_seconds: 60 },
			{ group_ref: "src-1", calls: 3, active_calls: 0, total_seconds: 60 },
		];

		const rows = bucketUsageByOrgSources(groups, orgSources);

		const src1 = rows.find((r) => r.sourceId === "src-1");
		expect(src1).toMatchObject({ calls: 5, activeCalls: 1, totalSeconds: 120, totalMinutes: 2 });
	});
});
