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
	const say = node.data.say?.trim();
	const holdSeconds = node.data.holdSeconds;
	const generate = node.data.generate === true;

	const flowNode: EngineFlowNode = {
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

	// Only emit `handoff` when say or holdSeconds is actually set — omit the key
	// entirely otherwise so the engine falls back to its own defaults.
	// `generate` only matters alongside a say, and is emitted only when true so
	// verbatim announcements stay byte-identical to their pre-feature form.
	if (say || holdSeconds !== undefined) {
		const handoff: NonNullable<EngineFlowNode["handoff"]> = {};
		if (say) {
			handoff.say = say;
			if (generate) {
				handoff.generate = true;
			}
		}
		if (holdSeconds !== undefined) {
			handoff.holdSeconds = holdSeconds;
		}
		flowNode.handoff = handoff;
	}

	return flowNode;
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
				say: flowNode.handoff?.say,
				...(flowNode.handoff?.generate ? { generate: true } : {}),
				holdSeconds: flowNode.handoff?.holdSeconds,
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
