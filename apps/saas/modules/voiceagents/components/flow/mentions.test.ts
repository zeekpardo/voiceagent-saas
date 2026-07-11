import { describe, expect, it } from "vitest";

import {
	buildNodeResultItems,
	type FlowNodeRef,
	nodeResultEntries,
	nodeResultVarName,
} from "./mentions";

/**
 * CloseBot "Nodes" variables, Tier 1. These tokens are a cross-repo CONTRACT:
 * the engine (worker/src/flow/context.ts nodeResultVarName) populates the exact
 * same names its `slugify` produces, and `slugify` is byte-identical to this
 * repo's sanitizeExitName. If these expectations change, the engine must too.
 */
describe("nodeResultVarName", () => {
	it("emits the id-based token contract per suffix", () => {
		expect(nodeResultVarName("node_abc12", "result")).toBe("node_node_abc12_result");
		expect(nodeResultVarName("node_abc12", "attempts")).toBe("node_node_abc12_attempts");
		expect(nodeResultVarName("node_abc12", "succeeded")).toBe("node_node_abc12_succeeded");
	});

	it("slugs the node id (matches the engine slugify / sanitizeExitName charset)", () => {
		// Uppercase + punctuation collapse to a [a-z0-9_] slug, trimmed of edges.
		expect(nodeResultVarName("Node-A.B!", "result")).toBe("node_node_a_b_result");
	});
});

const nodes: FlowNodeRef[] = [
	{ id: "node_1", kind: "objective", title: "Qualify Lead" },
	{ id: "node_2", kind: "agent", title: "Book" },
	{ id: "node_3", kind: "conversation", title: "" },
	{ id: "node_4", kind: "statement", title: "Say hi" },
	{ id: "node_5", kind: "truefalse", title: "Is member?" },
];

describe("nodeResultEntries", () => {
	it("only exposes kinds that yield a runtime value (agent/objective/conversation)", () => {
		const entries = nodeResultEntries(nodes);
		const names = new Set(entries.map((e) => e.name));
		// objective, agent, conversation → 3 suffixes each = 9 entries.
		expect(entries).toHaveLength(9);
		expect(names.has(nodeResultVarName("node_1", "result"))).toBe(true);
		expect(names.has(nodeResultVarName("node_2", "succeeded"))).toBe(true);
		// statement + truefalse are inline/deterministic — no dead tokens.
		expect(names.has(nodeResultVarName("node_4", "result"))).toBe(false);
		expect(names.has(nodeResultVarName("node_5", "result"))).toBe(false);
	});

	it("excludes the node currently being edited (no self-reference)", () => {
		const entries = nodeResultEntries(nodes, "node_1");
		expect(entries.some((e) => e.name.startsWith("node_node_1_"))).toBe(false);
		expect(entries).toHaveLength(6);
	});

	it("falls back to a placeholder title for an untitled node", () => {
		const entries = nodeResultEntries(nodes);
		const conv = entries.find((e) => e.name === nodeResultVarName("node_3", "result"));
		expect(conv?.nodeTitle).toBe("Untitled node");
	});
});

describe("buildNodeResultItems", () => {
	it("labels items under the Nodes group and serializes to the {{token}}", () => {
		const items = buildNodeResultItems([nodes[0]!]);
		expect(items[0]).toEqual({
			id: "node_node_1_result",
			label: "Nodes.Qualify Lead.Result",
			sub: "{{node_node_1_result}}",
		});
	});
});
