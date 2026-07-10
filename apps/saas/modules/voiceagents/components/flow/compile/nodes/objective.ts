import type {
	CanvasEdgeDoc,
	CanvasNodeDoc,
	EngineFlowNode,
	ObjectiveCanvasNodeDoc,
	ObjectiveNodeData,
} from "../../flow-types";
import { OBJECTIVE_NEXT_HANDLE_ID } from "../../flow-types";
import { makeId } from "../text";

export function compileObjectiveNode(
	node: ObjectiveCanvasNodeDoc & { data: ObjectiveNodeData },
	entry: string,
	targetOf: (nodeId: string, handleId: string) => string | undefined,
): EngineFlowNode {
	// An objective node compiles to an engine AGENT node carrying
	// objectives[]; the engine gathers them one at a time and auto-takes
	// the single Next exit once every required objective is verified.
	const target = targetOf(node.id, OBJECTIVE_NEXT_HANDLE_ID);
	const objectives = node.data.objectives
		.filter((o) => o.description.trim())
		.map((o, i) => {
			const slug =
				(o.title.trim() || o.field.trim() || `objective_${i + 1}`)
					.toLowerCase()
					.replace(/[^a-z0-9]+/g, "_")
					.replace(/^_+|_+$/g, "") || `objective_${i + 1}`;
			return {
				key: slug,
				description: o.description.trim(),
				field: o.field.trim() || undefined,
				options: o.options?.length ? o.options : undefined,
				maxAttempts: o.maxAttempts,
				sensitivity: o.sensitivity,
			};
		});
	const list = node.data.objectives
		.filter((o) => o.description.trim())
		.map((o) => `- ${o.description.trim()}`)
		.join("\n");
	return {
		id: node.id,
		name: node.data.title.trim() || undefined,
		instructions:
			`Gather the following from the caller, naturally and one question at a time:\n${list}` ||
			"Gather the information for this stage.",
		entryInstructions:
			node.id !== entry && node.data.entryMessage.trim()
				? node.data.entryMessage.trim()
				: undefined,
		toolIds: [],
		objectives,
		exits: [{ name: "Next", description: "All objectives gathered", target }],
	};
}

/**
 * An engine agent node carrying objectives round-trips as an Objective
 * canvas node (single Next handle → its primary exit's target).
 */
export function decompileObjectiveNode(
	flowNode: EngineFlowNode,
	position: { x: number; y: number },
): { node: CanvasNodeDoc; edges: CanvasEdgeDoc[] } {
	const edges: CanvasEdgeDoc[] = [];
	const target = flowNode.exits[0]?.target;
	if (target) {
		edges.push({
			id: makeId("edge"),
			source: flowNode.id,
			sourceHandle: OBJECTIVE_NEXT_HANDLE_ID,
			target,
		});
	}
	return {
		node: {
			id: flowNode.id,
			type: "objective",
			position,
			data: {
				title: flowNode.name ?? flowNode.id,
				entryMessage: flowNode.entryInstructions ?? "",
				objectives: (flowNode.objectives ?? []).map((o) => ({
					id: makeId("obj"),
					title: o.key,
					description: o.description,
					field: o.field ?? "",
					options: o.options,
					maxAttempts: o.maxAttempts,
					sensitivity: o.sensitivity,
				})),
			},
		},
		edges,
	};
}

/** Fresh Objective node data — one blank objective to fill in. */
export function newObjectiveNodeData(): ObjectiveNodeData {
	return {
		title: "Objective",
		entryMessage: "",
		objectives: [{ id: makeId("obj"), title: "", description: "", field: "" }],
	};
}
