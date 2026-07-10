import type {
	AgentCanvasNodeDoc,
	AgentNodeData,
	BookingCanvasNodeDoc,
	BookingNodeData,
	CanvasDoc,
	CanvasEdgeDoc,
	CanvasNodeDoc,
	EngineFlow,
	EngineFlowNode,
	EngineFlowScenario,
	ModifyTagsCanvasNodeDoc,
	ModifyTagsNodeData,
	ObjectiveCanvasNodeDoc,
	ObjectiveNodeData,
	ScenarioCanvasNodeDoc,
	ScenarioNodeData,
	SetFieldCanvasNodeDoc,
	SetFieldNodeData,
	StatementCanvasNodeDoc,
	StatementNodeData,
	SwitchCanvasNodeDoc,
	SwitchNodeData,
	TransferCanvasNodeDoc,
	TransferNodeData,
	TrueFalseCanvasNodeDoc,
	TrueFalseNodeData,
} from "../flow-types";
import { START_HANDLE_ID, START_NODE_ID } from "../flow-types";
import { compileAgentNode, decompileAgentNode } from "./nodes/agent";
import { compileBookingNode } from "./nodes/booking";
import { compileModifyTagsNode, decompileModifyTagsNode } from "./nodes/modify-tags";
import { compileObjectiveNode, decompileObjectiveNode } from "./nodes/objective";
import { compileSwitchNode, compileTrueFalseNode, decompileRouterNode } from "./nodes/router";
import { compileScenarioNode, decompileScenario } from "./nodes/scenario";
import { compileSetFieldNode, decompileSetFieldNode } from "./nodes/set-field";
import { compileStatementNode, decompileStatementNode } from "./nodes/statement";
import { compileTransferNode, decompileTransferNode } from "./nodes/transfer";
import { makeId, textToTiptapDoc } from "./text";

export {
	extractVariableNames,
	makeId,
	prettifyVariable,
	sanitizeExitName,
	sectionsToInstructions,
	textToTiptapDoc,
	tiptapToText,
} from "./text";
export { MENTION_CHAR_EXIT, MENTION_CHAR_TOOL, MENTION_CHAR_VARIABLE } from "./text";
export { validateFlowDoc } from "./validate";
export { newAgentNodeData } from "./nodes/agent";
export { newBookingNodeData } from "./nodes/booking";
export { newModifyTagsNodeData } from "./nodes/modify-tags";
export { newObjectiveNodeData } from "./nodes/objective";
export { newSwitchNodeData, newTrueFalseNodeData } from "./nodes/router";
export { newAggressionScenarioData, newScenarioNodeData } from "./nodes/scenario";
export { newSetFieldNodeData } from "./nodes/set-field";
export { newStatementNodeData } from "./nodes/statement";
export { newTransferNodeData } from "./nodes/transfer";

/**
 * Compile the canvas into the engine payload. Assumes validateFlowDoc passed.
 * Root toolIds = union of every node's tools ∪ baseToolIds (tools attached
 * via the classic Configure/Tools tabs must not be dropped).
 */
export function compileCanvas(
	doc: CanvasDoc,
	baseToolIds: string[],
): { flow: EngineFlow; toolIds: string[] } {
	const startEdge = doc.edges.find((e) => e.source === START_NODE_ID);
	const entry = startEdge?.target ?? "";

	// No outgoing edge → omit target → the exit ends the call.
	const targetOf = (nodeId: string, handleId: string) =>
		doc.edges.find((e) => e.source === nodeId && e.sourceHandle === handleId)?.target;

	const nodes: EngineFlowNode[] = [];
	const scenarios: EngineFlowScenario[] = [];
	for (const node of doc.nodes) {
		if (node.type === "scenario" && node.data) {
			scenarios.push(
				compileScenarioNode(node as ScenarioCanvasNodeDoc & { data: ScenarioNodeData }, targetOf),
			);
		} else if (node.type === "statement" && node.data) {
			nodes.push(
				compileStatementNode(node as StatementCanvasNodeDoc & { data: StatementNodeData }, targetOf),
			);
		} else if (node.type === "objective" && node.data) {
			nodes.push(
				compileObjectiveNode(
					node as ObjectiveCanvasNodeDoc & { data: ObjectiveNodeData },
					entry,
					targetOf,
				),
			);
		} else if (node.type === "booking" && node.data) {
			nodes.push(
				compileBookingNode(node as BookingCanvasNodeDoc & { data: BookingNodeData }, entry, targetOf),
			);
		} else if (node.type === "set_field" && node.data) {
			nodes.push(
				compileSetFieldNode(node as SetFieldCanvasNodeDoc & { data: SetFieldNodeData }, targetOf),
			);
		} else if (node.type === "modify_tags" && node.data) {
			nodes.push(
				compileModifyTagsNode(
					node as ModifyTagsCanvasNodeDoc & { data: ModifyTagsNodeData },
					targetOf,
				),
			);
		} else if (node.type === "transfer" && node.data) {
			nodes.push(
				compileTransferNode(node as TransferCanvasNodeDoc & { data: TransferNodeData }, targetOf),
			);
		} else if (node.type === "agent" && node.data) {
			nodes.push(
				compileAgentNode(node as AgentCanvasNodeDoc & { data: AgentNodeData }, entry, targetOf),
			);
		} else if (node.type === "truefalse" && node.data) {
			nodes.push(
				compileTrueFalseNode(
					node as TrueFalseCanvasNodeDoc & { data: TrueFalseNodeData },
					targetOf,
				),
			);
		} else if (node.type === "switch" && node.data) {
			nodes.push(
				compileSwitchNode(node as SwitchCanvasNodeDoc & { data: SwitchNodeData }, targetOf),
			);
		}
	}

	const toolIds = [...new Set([...baseToolIds, ...nodes.flatMap((n) => n.toolIds)])];

	return { flow: { entry, nodes, scenarios }, toolIds };
}

/* ------------------------------------------------------------------ */
/* Reconstruction: engine flow / blank slate → canvas document          */
/* ------------------------------------------------------------------ */

/** Best-effort canvas from an engine flow (used when config.canvas is absent). */
export function canvasFromFlow(flow: EngineFlow): CanvasDoc {
	// BFS from the entry node to lay columns out left → right.
	const columnOf = new Map<string, number>();
	const queue: { id: string; col: number }[] = [{ id: flow.entry, col: 0 }];
	while (queue.length > 0) {
		const { id, col } = queue.shift() as { id: string; col: number };
		if (columnOf.has(id)) {
			continue;
		}
		columnOf.set(id, col);
		const node = flow.nodes.find((n) => n.id === id);
		for (const exit of node?.exits ?? []) {
			if (exit.target && !columnOf.has(exit.target)) {
				queue.push({ id: exit.target, col: col + 1 });
			}
		}
	}
	// Orphans (not reachable from entry) go into the last column + 1.
	const maxCol = Math.max(0, ...columnOf.values());
	for (const node of flow.nodes) {
		if (!columnOf.has(node.id)) {
			columnOf.set(node.id, maxCol + 1);
		}
	}

	const rowsInCol = new Map<number, number>();
	const nodes: CanvasNodeDoc[] = [
		{ id: START_NODE_ID, type: "start", position: { x: 40, y: 120 } },
	];
	const edges: CanvasEdgeDoc[] = [
		{
			id: makeId("edge"),
			source: START_NODE_ID,
			sourceHandle: START_HANDLE_ID,
			target: flow.entry,
		},
	];

	for (const flowNode of flow.nodes) {
		const col = columnOf.get(flowNode.id) ?? 0;
		const row = rowsInCol.get(col) ?? 0;
		rowsInCol.set(col, row + 1);
		const position = { x: 280 + col * 360, y: 60 + row * 260 };

		if (flowNode.kind === "statement") {
			const { node, edges: nodeEdges } = decompileStatementNode(flowNode, position);
			nodes.push(node);
			edges.push(...nodeEdges);
			continue;
		}

		if (flowNode.kind === "set_field") {
			const { node, edges: nodeEdges } = decompileSetFieldNode(flowNode, position);
			nodes.push(node);
			edges.push(...nodeEdges);
			continue;
		}

		if (flowNode.kind === "modify_tags") {
			const { node, edges: nodeEdges } = decompileModifyTagsNode(flowNode, position);
			nodes.push(node);
			edges.push(...nodeEdges);
			continue;
		}

		if (flowNode.kind === "transfer") {
			const { node, edges: nodeEdges } = decompileTransferNode(flowNode, position);
			nodes.push(node);
			edges.push(...nodeEdges);
			continue;
		}

		if (flowNode.kind === "router") {
			const { node, edges: nodeEdges } = decompileRouterNode(flowNode, position);
			nodes.push(node);
			edges.push(...nodeEdges);
			continue;
		}

		// An engine agent node carrying objectives round-trips as an Objective
		// canvas node (single Next handle → its primary exit's target).
		if (flowNode.objectives?.length) {
			const { node, edges: nodeEdges } = decompileObjectiveNode(flowNode, position);
			nodes.push(node);
			edges.push(...nodeEdges);
			continue;
		}

		const { node, edges: nodeEdges } = decompileAgentNode(flowNode, position);
		nodes.push(node);
		edges.push(...nodeEdges);
	}

	// Scenarios live outside flow.nodes — grid-place their canvas nodes in a
	// row below the main flow, each wired to its jump target.
	const maxRow = Math.max(1, ...rowsInCol.values());
	(flow.scenarios ?? []).forEach((scenario, i) => {
		const position = {
			x: 280 + (i % 4) * 300,
			y: 60 + maxRow * 260 + 80 + Math.floor(i / 4) * 200,
		};
		const { node, edges: nodeEdges } = decompileScenario(scenario, position);
		nodes.push(node);
		edges.push(...nodeEdges);
	});

	return { version: 1, nodes, edges };
}

/** A fresh canvas: Start wired into one empty agent node. */
export function newCanvas(): CanvasDoc {
	const nodeId = makeId("node");
	return {
		version: 1,
		nodes: [
			{ id: START_NODE_ID, type: "start", position: { x: 40, y: 140 } },
			{
				id: nodeId,
				type: "agent",
				position: { x: 300, y: 80 },
				data: {
					title: "New agent",
					sections: [{ id: makeId("sec"), body: textToTiptapDoc("") }],
					entryMessage: "",
					exits: [],
					toolIds: [],
				},
			},
		],
		edges: [
			{ id: makeId("edge"), source: START_NODE_ID, sourceHandle: START_HANDLE_ID, target: nodeId },
		],
	};
}
