import type {
	AgentCanvasNodeDoc,
	AgentNodeData,
	CanvasEdgeDoc,
	CanvasNodeDoc,
	EngineFlowNode,
} from "../../flow-types";
import { applyBookingPromptExtras, instructionsToSections, makeId, sectionsToInstructions, textToTiptapDoc } from "../text";

export function compileAgentNode(
	node: AgentCanvasNodeDoc & { data: AgentNodeData },
	entry: string,
	targetOf: (nodeId: string, handleId: string) => string | undefined,
): EngineFlowNode {
	const entryMessage = node.data.entryMessage.trim();
	// Per-node booking settings ride the tools' existing LLM-facing args:
	// calendar_name (executor's explicit-name branch), book_appointment's
	// title, and add_tag on failure. Unset fields append nothing, so a doc
	// without them compiles byte-identical.
	const instructions = applyBookingPromptExtras(sectionsToInstructions(node.data.sections), {
		calendarName: node.data.calendarName,
		appointmentTitle: node.data.appointmentTitle,
		failedBookingTag: node.data.failedBookingTag,
	});
	return {
		id: node.id,
		name: node.data.title.trim() || undefined,
		instructions,
		// The engine ignores entryInstructions on the entry node — omit it there.
		entryInstructions: node.id !== entry && entryMessage ? entryMessage : undefined,
		toolIds: [...node.data.toolIds],
		llm: node.data.model ? { model: node.data.model } : undefined,
		exits: node.data.exits.map((exit) => ({
			name: exit.name.trim(),
			description: exit.description.trim(),
			target: targetOf(node.id, exit.id),
		})),
	};
}

/** Fallback reconstruction: any engine node not otherwise recognized round-trips as an Agent node. */
export function decompileAgentNode(
	flowNode: EngineFlowNode,
	position: { x: number; y: number },
): { node: CanvasNodeDoc; edges: CanvasEdgeDoc[] } {
	const edges: CanvasEdgeDoc[] = [];
	const exits = flowNode.exits.map((exit) => ({
		id: makeId("exit"),
		name: exit.name,
		description: exit.description,
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
	return {
		node: {
			id: flowNode.id,
			type: "agent",
			position,
			data: {
				title: flowNode.name ?? flowNode.id,
				sections: instructionsToSections(flowNode.instructions),
				entryMessage: flowNode.entryInstructions ?? "",
				exits,
				toolIds: [...flowNode.toolIds],
				model: flowNode.llm?.model,
			},
		},
		edges,
	};
}

/** Fresh empty agent node data (used by the Actions palette). */
export function newAgentNodeData(title: string): AgentNodeData {
	return {
		title,
		sections: [{ id: makeId("sec"), body: textToTiptapDoc("") }],
		entryMessage: "",
		exits: [],
		toolIds: [],
	};
}
