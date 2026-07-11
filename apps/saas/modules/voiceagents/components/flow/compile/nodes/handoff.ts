import type {
	CanvasEdgeDoc,
	CanvasNodeDoc,
	EngineFlowNode,
	HandoffCanvasNodeDoc,
	HandoffNodeData,
} from "../../flow-types";

/**
 * Compile a Handoff canvas node into the engine's generic `handoff` flow node.
 * The node hands the live call off to a DIFFERENT published agent (its own
 * persona/flow/tools) one-way — so it is terminal for this flow: no exits.
 */
export function compileHandoffNode(
	node: HandoffCanvasNodeDoc & { data: HandoffNodeData },
): EngineFlowNode {
	return {
		id: node.id,
		name: node.data.title.trim() || undefined,
		kind: "handoff",
		handoffAgentId: node.data.handoffAgentId,
		// The engine requires instructions min 1 on every node; a handoff node is
		// resolved inline (never becomes an agent), so this is never used at runtime.
		instructions: "Handing the call off to another agent.",
		toolIds: [],
		exits: [],
	};
}

export function decompileHandoffNode(
	flowNode: EngineFlowNode,
	position: { x: number; y: number },
): { node: CanvasNodeDoc; edges: CanvasEdgeDoc[] } {
	return {
		node: {
			id: flowNode.id,
			type: "handoff",
			position,
			data: {
				title: flowNode.name ?? flowNode.id,
				handoffAgentId: flowNode.handoffAgentId,
			},
		},
		edges: [],
	};
}

/** Fresh Handoff node data (used by the Actions palette). */
export function newHandoffNodeData(): HandoffNodeData {
	return {
		title: "Hand off to agent",
		handoffAgentId: undefined,
	};
}
