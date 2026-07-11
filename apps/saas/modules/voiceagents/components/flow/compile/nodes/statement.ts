import type {
	CanvasEdgeDoc,
	CanvasNodeDoc,
	EngineFlowNode,
	StatementCanvasNodeDoc,
	StatementNodeData,
} from "../../flow-types";
import { STATEMENT_NEXT_HANDLE_ID } from "../../flow-types";
import { makeId } from "../text";

export function compileStatementNode(
	node: StatementCanvasNodeDoc & { data: StatementNodeData },
	targetOf: (nodeId: string, handleId: string) => string | undefined,
): EngineFlowNode {
	const say = node.data.say.trim();
	const target = targetOf(node.id, STATEMENT_NEXT_HANDLE_ID);
	return {
		id: node.id,
		name: node.data.title.trim() || undefined,
		kind: "statement",
		// `generate` only emitted when true so verbatim statements stay byte-identical
		// to their pre-feature compiled form (default OFF, no round-trip churn).
		statement: node.data.generate ? { say, generate: true } : { say },
		// The engine requires instructions min 1 on every node — mirror the say text.
		instructions: say,
		toolIds: [],
		// Unwired Next → no exits → the call ends after speaking.
		exits: target ? [{ name: "Next", description: "Continue", target }] : [],
	};
}

export function decompileStatementNode(
	flowNode: EngineFlowNode,
	position: { x: number; y: number },
): { node: CanvasNodeDoc; edges: CanvasEdgeDoc[] } {
	const edges: CanvasEdgeDoc[] = [];
	const target = flowNode.exits[0]?.target;
	if (target) {
		edges.push({
			id: makeId("edge"),
			source: flowNode.id,
			sourceHandle: STATEMENT_NEXT_HANDLE_ID,
			target,
		});
	}
	return {
		node: {
			id: flowNode.id,
			type: "statement",
			position,
			data: {
				title: flowNode.name ?? flowNode.id,
				say: flowNode.statement?.say ?? flowNode.instructions,
				...(flowNode.statement?.generate ? { generate: true } : {}),
			},
		},
		edges,
	};
}

/** Fresh Statement node data (used by the Actions palette). */
export function newStatementNodeData(): StatementNodeData {
	return { title: "Statement", say: "" };
}
