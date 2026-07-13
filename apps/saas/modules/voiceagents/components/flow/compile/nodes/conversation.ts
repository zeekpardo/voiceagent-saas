import type {
	CanvasEdgeDoc,
	CanvasNodeDoc,
	ConversationCanvasNodeDoc,
	ConversationNodeData,
	EngineFlowNode,
} from "../../flow-types";

/**
 * A Conversation node compiles to a terminal "keep chatting" stage. The engine
 * builds the live prompt from the agent-level fields; the only per-node input is
 * the optional Extra Prompt, which rides on `conversation.reason` (omitted when
 * empty). `instructions` must be non-empty (engine schema min 1), so fall back to
 * a generic line. Exits are always empty (terminal) and wrapUp is always end_call.
 */
export function compileConversationNode(
	node: ConversationCanvasNodeDoc & { data: ConversationNodeData },
): EngineFlowNode {
	const data = node.data;
	const extraPrompt = data.extraPrompt?.trim() || undefined;

	return {
		id: node.id,
		name: data.title.trim() || undefined,
		// Node kind stays "agent" on the wire — omit `kind`. The `conversation`
		// object is what tells the engine to run the terminal chat stage.
		instructions: extraPrompt || "Keep the conversation going.",
		toolIds: [],
		// Terminal by design — no exits, no objectives.
		exits: [],
		conversation: {
			reason: extraPrompt,
			wrapUp: { mode: "end_call" },
			maxDurationSeconds: data.maxDurationSeconds,
		},
	};
}

/**
 * An engine agent node carrying a `conversation` object round-trips as a
 * terminal Conversation canvas node. BACKWARD-COMPAT: an OLD node may still
 * carry `conversation.reason` + `hints` + `exits` + `wrapUp:{mode:"exit"}`.
 * Map `reason` → `extraPrompt`, DROP hints/exits/wrapUp, and build NO exit
 * edges (the node is terminal). Never crashes on old data.
 */
export function decompileConversationNode(
	flowNode: EngineFlowNode,
	position: { x: number; y: number },
): { node: CanvasNodeDoc; edges: CanvasEdgeDoc[] } {
	const conversation = flowNode.conversation;
	const extraPrompt = conversation?.reason?.trim() || undefined;

	return {
		node: {
			id: flowNode.id,
			type: "conversation",
			position,
			data: {
				title: flowNode.name ?? flowNode.id,
				extraPrompt,
				maxDurationSeconds: conversation?.maxDurationSeconds,
			},
		},
		// Terminal — no outgoing edges, even if the old node had wired exits.
		edges: [],
	};
}

/** Fresh Conversation node data (used by the Actions palette). */
export function newConversationNodeData(): ConversationNodeData {
	return {
		title: "Conversation",
	};
}
