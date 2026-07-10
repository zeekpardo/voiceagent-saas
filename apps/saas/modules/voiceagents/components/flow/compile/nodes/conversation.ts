import type {
	CanvasEdgeDoc,
	CanvasNodeDoc,
	ConversationCanvasNodeDoc,
	ConversationNodeData,
	EngineFlowConversation,
	EngineFlowNode,
} from "../../flow-types";
import { compileExitTagRules, makeId } from "../text";

/**
 * Compose the node's `instructions` from the conversation reason + hints. The
 * engine builds the live prompt from the `conversation` object, but every node
 * still needs a non-empty `instructions` (engine schema min 1) — mirror the
 * reason here (plus hints) so the node is self-describing.
 */
function conversationInstructions(data: ConversationNodeData): string {
	const reason = data.reason.trim();
	const hints = data.hints.map((h) => h.trim()).filter(Boolean);
	const base = reason || "Keep the conversation going.";
	if (hints.length === 0) {
		return base;
	}
	return `${base}\n\nTalking points:\n${hints.map((h) => `- ${h}`).join("\n")}`;
}

export function compileConversationNode(
	node: ConversationCanvasNodeDoc & { data: ConversationNodeData },
	targetOf: (nodeId: string, handleId: string) => string | undefined,
): EngineFlowNode {
	const data = node.data;
	const hints = data.hints.map((h) => h.trim()).filter(Boolean);
	const exits = data.exits.map((exit) => ({
		name: exit.name.trim(),
		description: exit.description.trim(),
		target: targetOf(node.id, exit.id),
		tagRules: compileExitTagRules(exit.tagRules),
	}));

	// wrapUp references one of the node's exits by its (trimmed) name.
	const wrapExit = data.exits.find((e) => e.id === data.wrapUpExitId);
	const wrapUp: EngineFlowConversation["wrapUp"] =
		data.wrapUpMode === "exit" && wrapExit
			? { mode: "exit", exit: wrapExit.name.trim() }
			: { mode: "end_call" };

	return {
		id: node.id,
		name: data.title.trim() || undefined,
		// Node kind stays "agent" on the wire — omit `kind`. The `conversation`
		// object is what tells the engine to run the open-ended loop.
		instructions: conversationInstructions(data),
		toolIds: [],
		// Objective-less by design — no objectives block emitted.
		exits,
		conversation: {
			reason: data.reason.trim(),
			hints: hints.length ? hints : undefined,
			wrapUp,
			maxDurationSeconds: data.maxDurationSeconds,
		},
	};
}

/**
 * An engine agent node carrying a `conversation` object round-trips as a
 * Conversation canvas node (exits reconstructed like an agent node's).
 */
export function decompileConversationNode(
	flowNode: EngineFlowNode,
	position: { x: number; y: number },
): { node: CanvasNodeDoc; edges: CanvasEdgeDoc[] } {
	const edges: CanvasEdgeDoc[] = [];
	const exits = flowNode.exits.map((exit) => ({
		id: makeId("exit"),
		name: exit.name,
		description: exit.description,
		tagRules: exit.tagRules,
	}));
	flowNode.exits.forEach((exit, i) => {
		if (exit.target) {
			edges.push({
				id: makeId("edge"),
				source: flowNode.id,
				sourceHandle: exits[i].id,
				target: exit.target,
			});
		}
	});

	const conversation = flowNode.conversation;
	const wrapUp = conversation?.wrapUp;
	const wrapUpMode = wrapUp?.mode === "exit" ? "exit" : "end_call";
	// Re-link the wrap-up exit by matching the engine exit name to a rebuilt exit id.
	const wrapUpExitId =
		wrapUp?.mode === "exit"
			? exits.find((e, i) => flowNode.exits[i]?.name === wrapUp.exit)?.id
			: undefined;

	return {
		node: {
			id: flowNode.id,
			type: "conversation",
			position,
			data: {
				title: flowNode.name ?? flowNode.id,
				reason: conversation?.reason ?? flowNode.instructions,
				hints: conversation?.hints ? [...conversation.hints] : [],
				exits,
				wrapUpMode,
				wrapUpExitId,
				maxDurationSeconds: conversation?.maxDurationSeconds,
			},
		},
		edges,
	};
}

/** Fresh Conversation node data (used by the Actions palette). */
export function newConversationNodeData(): ConversationNodeData {
	return {
		title: "Conversation",
		reason: "",
		hints: [],
		exits: [],
		wrapUpMode: "end_call",
	};
}
