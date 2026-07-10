import type {
	CanvasEdgeDoc,
	CanvasNodeDoc,
	EngineFlowNode,
	SetFieldCanvasNodeDoc,
	SetFieldNodeData,
} from "../../flow-types";
import { SET_FIELD_NEXT_HANDLE_ID } from "../../flow-types";
import { makeId } from "../text";

export function compileSetFieldNode(
	node: SetFieldCanvasNodeDoc & { data: SetFieldNodeData },
	targetOf: (nodeId: string, handleId: string) => string | undefined,
): EngineFlowNode {
	const target = targetOf(node.id, SET_FIELD_NEXT_HANDLE_ID);
	const field = node.data.field.trim();
	return {
		id: node.id,
		name: node.data.title.trim() || undefined,
		kind: "set_field",
		setField: { field, value: node.data.value },
		// The engine requires instructions min 1 on every node.
		instructions: field ? `Set ${field}` : "Set a field",
		toolIds: [],
		exits: target ? [{ name: "Next", description: "Continue", target }] : [],
	};
}

export function decompileSetFieldNode(
	flowNode: EngineFlowNode,
	position: { x: number; y: number },
): { node: CanvasNodeDoc; edges: CanvasEdgeDoc[] } {
	const edges: CanvasEdgeDoc[] = [];
	const target = flowNode.exits[0]?.target;
	if (target) {
		edges.push({
			id: makeId("edge"),
			source: flowNode.id,
			sourceHandle: SET_FIELD_NEXT_HANDLE_ID,
			target,
		});
	}
	return {
		node: {
			id: flowNode.id,
			type: "set_field",
			position,
			data: {
				title: flowNode.name ?? flowNode.id,
				field: flowNode.setField?.field ?? "",
				value: flowNode.setField?.value ?? "",
			},
		},
		edges,
	};
}

/** Fresh Set Field node data. */
export function newSetFieldNodeData(): SetFieldNodeData {
	return { title: "Set Field", field: "", value: "" };
}
