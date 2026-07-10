import { compileScenarioNode, newScenarioNodeData } from "../compile/nodes/scenario";
import { ScenarioNodeEditor } from "../editors/scenario";
import type { ScenarioCanvasNodeDoc, ScenarioNodeData } from "../flow-types";
import { scenarioNodeDataSchema, SCENARIO_JUMP_HANDLE_ID } from "../flow-types";
import { ScenarioNode } from "../ScenarioNode";
import { defineKind } from "./types";

export const scenarioKind = defineKind<ScenarioNodeData>({
	kind: "scenario",
	schema: scenarioNodeDataSchema,
	canvasNode: ScenarioNode,
	editor: ({ nodeId, data, onChange }) => (
		<ScenarioNodeEditor nodeId={nodeId} data={data as ScenarioNodeData} onChange={onChange} />
	),
	sheetMeta: {
		title: "Edit Scenario",
		description:
			"A global detector — checked continuously from every stage. When it matches, the call jumps to the connected node.",
	},
	newData: () => newScenarioNodeData(),
	sourceHandles: () => new Set([SCENARIO_JUMP_HANDLE_ID]),
	edgeLabel: (data) => data.title.trim() || undefined,
	// Scenario nodes compile into flow.scenarios (global detect-and-jump), not
	// flow.nodes. Their engine → canvas reconstruction is driven by the scenario
	// list, not an engine node kind, so it stays in compile/index (decompileScenario).
	compile: (node, { targetOf }) => ({
		scenario: compileScenarioNode(
			node as ScenarioCanvasNodeDoc & { data: ScenarioNodeData },
			targetOf,
		),
	}),
	validate: (node, doc) => {
		const data = node.data as ScenarioNodeData | undefined;
		const label = data?.title?.trim() || node.id;
		if (!data) {
			return [`Scenario "${label}" has no data.`];
		}
		const errors: string[] = [];
		if (!data.title.trim()) {
			errors.push("A Scenario needs a name.");
		}
		if (!data.description.trim()) {
			errors.push(`Scenario "${label}" needs a description (when to jump).`);
		}
		if (!doc.edges.some((edge) => edge.source === node.id)) {
			errors.push(`Scenario "${label}" must connect to the node it jumps to.`);
		}
		// Duplicate names must be unique across scenario nodes — this node is the
		// duplicate when an earlier scenario node (doc order) shares its name.
		const key = data.title.trim().toLowerCase();
		if (key) {
			const idx = doc.nodes.indexOf(node);
			const isDuplicate = doc.nodes.some(
				(other, i) =>
					i < idx &&
					other.type === "scenario" &&
					((other.data as ScenarioNodeData | undefined)?.title?.trim().toLowerCase() || "") === key,
			);
			if (isDuplicate) {
				errors.push(
					`Duplicate scenario name "${data.title.trim()}" — scenario names must be unique.`,
				);
			}
		}
		return errors;
	},
});
