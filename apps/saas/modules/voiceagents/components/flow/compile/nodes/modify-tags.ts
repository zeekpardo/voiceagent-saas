import type {
	CanvasEdgeDoc,
	CanvasNodeDoc,
	EngineFlowNode,
	ModifyTagsCanvasNodeDoc,
	ModifyTagsNodeData,
} from "../../flow-types";
import { MODIFY_TAGS_NEXT_HANDLE_ID } from "../../flow-types";
import { makeId } from "../text";

export function compileModifyTagsNode(
	node: ModifyTagsCanvasNodeDoc & { data: ModifyTagsNodeData },
	targetOf: (nodeId: string, handleId: string) => string | undefined,
): EngineFlowNode {
	const target = targetOf(node.id, MODIFY_TAGS_NEXT_HANDLE_ID);
	const add = node.data.addTags.map((t) => t.trim()).filter(Boolean);
	const remove = node.data.removeTags.map((t) => t.trim()).filter(Boolean);
	return {
		id: node.id,
		name: node.data.title.trim() || undefined,
		kind: "modify_tags",
		modifyTags: { add, remove },
		instructions:
			[add.length ? `Add: ${add.join(", ")}` : "", remove.length ? `Remove: ${remove.join(", ")}` : ""]
				.filter(Boolean)
				.join("; ") || "Modify tags",
		toolIds: [],
		exits: target ? [{ name: "Next", description: "Continue", target }] : [],
	};
}

export function decompileModifyTagsNode(
	flowNode: EngineFlowNode,
	position: { x: number; y: number },
): { node: CanvasNodeDoc; edges: CanvasEdgeDoc[] } {
	const edges: CanvasEdgeDoc[] = [];
	const target = flowNode.exits[0]?.target;
	if (target) {
		edges.push({
			id: makeId("edge"),
			source: flowNode.id,
			sourceHandle: MODIFY_TAGS_NEXT_HANDLE_ID,
			target,
		});
	}
	return {
		node: {
			id: flowNode.id,
			type: "modify_tags",
			position,
			data: {
				title: flowNode.name ?? flowNode.id,
				addTags: flowNode.modifyTags?.add ?? [],
				removeTags: flowNode.modifyTags?.remove ?? [],
			},
		},
		edges,
	};
}

/** Fresh Modify Tags node data. */
export function newModifyTagsNodeData(): ModifyTagsNodeData {
	return { title: "Modify Tags", addTags: [], removeTags: [] };
}
