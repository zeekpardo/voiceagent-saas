import type {
	CanvasEdgeDoc,
	CanvasNodeDoc,
	EngineFlowScenario,
	ScenarioCanvasNodeDoc,
	ScenarioNodeData,
} from "../../flow-types";
import { SCENARIO_JUMP_HANDLE_ID } from "../../flow-types";
import { makeId } from "../text";

export function compileScenarioNode(
	node: ScenarioCanvasNodeDoc & { data: ScenarioNodeData },
	targetOf: (nodeId: string, handleId: string) => string | undefined,
): EngineFlowScenario {
	// Scenario nodes compile into flow.scenarios (global detect-and-jump),
	// not flow.nodes — their single edge defines the jump target.
	return {
		name: node.data.title.trim(),
		description: node.data.description.trim(),
		target: targetOf(node.id, SCENARIO_JUMP_HANDLE_ID) ?? "",
	};
}

/**
 * Scenarios live outside flow.nodes — grid-place their canvas nodes in a
 * row below the main flow, each wired to its jump target.
 */
export function decompileScenario(
	scenario: EngineFlowScenario,
	position: { x: number; y: number },
): { node: CanvasNodeDoc; edges: CanvasEdgeDoc[] } {
	const scenarioNodeId = makeId("scenario");
	const edges: CanvasEdgeDoc[] = [];
	if (scenario.target) {
		edges.push({
			id: makeId("edge"),
			source: scenarioNodeId,
			sourceHandle: SCENARIO_JUMP_HANDLE_ID,
			target: scenario.target,
		});
	}
	return {
		node: {
			id: scenarioNodeId,
			type: "scenario",
			position,
			data: { title: scenario.name, description: scenario.description },
		},
		edges,
	};
}

/** Fresh Custom Scenario node data (used by the Actions palette). */
export function newScenarioNodeData(): ScenarioNodeData {
	return { title: "Custom Scenario", description: "" };
}

/** The Aggression Detected palette preset — just a pre-filled Custom Scenario. */
export function newAggressionScenarioData(): ScenarioNodeData {
	return {
		title: "Aggression Detected",
		description: "The caller is angry, hostile, cursing, or verbally aggressive",
	};
}
