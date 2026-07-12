import type {
	CanvasEdgeDoc,
	CanvasNodeDoc,
	EngineFlowNode,
	StopRespondingCanvasNodeDoc,
	StopRespondingNodeData,
} from "../../flow-types";

/**
 * Compile a Stop Responding canvas node into the engine's generic
 * `stop_responding` flow node. Reaching it PARKS the contact: the agent stops
 * responding but the session stays alive and listening. It is a leaf — terminal
 * for this flow (no exits) — but NOT an end-of-call: the engine never hangs up
 * on it (voice ends only via the existing silence timeout; text parks
 * indefinitely). Only a global scenario can move the contact onward. It carries
 * no config, so there is nothing to emit beyond the kind + name.
 */
export function compileStopRespondingNode(
	node: StopRespondingCanvasNodeDoc & { data: StopRespondingNodeData },
): EngineFlowNode {
	return {
		id: node.id,
		name: node.data.title.trim() || undefined,
		kind: "stop_responding",
		// The engine requires instructions min 1 on every node; a stop_responding
		// node is resolved inline (never becomes an agent), so this is never used.
		instructions: "The agent stops responding and keeps listening.",
		toolIds: [],
		exits: [],
	};
}

export function decompileStopRespondingNode(
	flowNode: EngineFlowNode,
	position: { x: number; y: number },
): { node: CanvasNodeDoc; edges: CanvasEdgeDoc[] } {
	return {
		node: {
			id: flowNode.id,
			type: "stop_responding",
			position,
			data: { title: flowNode.name ?? flowNode.id },
		},
		edges: [],
	};
}

/** Fresh Stop Responding node data (used by the Actions palette). */
export function newStopRespondingNodeData(): StopRespondingNodeData {
	return { title: "Stop responding" };
}
