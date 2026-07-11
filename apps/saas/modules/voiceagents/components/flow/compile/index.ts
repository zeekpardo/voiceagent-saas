import type {
	CanvasDoc,
	CanvasEdgeDoc,
	CanvasNodeDoc,
	EngineFlow,
	EngineFlowNode,
	EngineFlowScenario,
} from "../flow-types";
import { GREETER_NEXT_HANDLE_ID, START_HANDLE_ID, START_NODE_ID } from "../flow-types";
import { FLOW_KINDS, isFlowNodeKind } from "../kinds";
import { decompileAgentNode } from "./nodes/agent";
import { decompileConversationNode } from "./nodes/conversation";
import { newGreeterNodeData } from "./nodes/greeter";
import { decompileModifyTagsNode } from "./nodes/modify-tags";
import { decompileObjectiveNode } from "./nodes/objective";
import { decompileRouterNode } from "./nodes/router";
import { decompileScenario } from "./nodes/scenario";
import { decompileSetFieldNode } from "./nodes/set-field";
import { decompileStatementNode } from "./nodes/statement";
import { decompileTransferNode } from "./nodes/transfer";
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
export { newConversationNodeData } from "./nodes/conversation";
export { newGreeterNodeData } from "./nodes/greeter";
export { newModifyTagsNodeData } from "./nodes/modify-tags";
export { newFullAddressObjectiveData, newObjectiveNodeData } from "./nodes/objective";
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
): { flow: EngineFlow; toolIds: string[]; greeting: string } {
	// The Greeter fixture owns the connect-time greeting and points at the real
	// flow entry. It is not an engine node: its text folds into config.greeting
	// and its outgoing edge target becomes `entry`. Legacy canvases without a
	// greeter (never produced once migration runs, but guard anyway) fall back
	// to the classic Start → entry wiring.
	const greeter = doc.nodes.find((n) => n.type === "greeter");
	const greeting = greeter
		? ((greeter.data as { greeting?: string } | undefined)?.greeting ?? "")
		: "";
	const startEdge = doc.edges.find((e) => e.source === START_NODE_ID);
	const entry = greeter
		? (doc.edges.find((e) => e.source === greeter.id)?.target ?? "")
		: (startEdge?.target ?? "");

	// CloseBot parity: when a conversation node is designated the flow default,
	// every dangling/unconnected exit falls back to it (instead of ending the
	// call). The default node's own dangling exits are left alone (no self-loop).
	const defaultConversationId = doc.nodes.find(
		(n) => n.type === "conversation" && (n.data as { isDefault?: boolean } | undefined)?.isDefault,
	)?.id;

	// No outgoing edge → fall back to the default conversation node when one
	// exists, otherwise omit target → the exit ends the call.
	const targetOf = (nodeId: string, handleId: string) => {
		const wired = doc.edges.find((e) => e.source === nodeId && e.sourceHandle === handleId)?.target;
		if (wired) {
			return wired;
		}
		return defaultConversationId && nodeId !== defaultConversationId
			? defaultConversationId
			: undefined;
	};

	// Per-kind compile lives on each registry entry (kinds/*). Scenario nodes emit
	// a global scenario (flow.scenarios); every other kind emits a flow node. Nodes
	// without data (never persisted, but guard anyway) and the Start node are skipped.
	const nodes: EngineFlowNode[] = [];
	const scenarios: EngineFlowScenario[] = [];
	for (const node of doc.nodes) {
		if (node.type === "start" || !node.data || !isFlowNodeKind(node.type)) {
			continue;
		}
		const result = FLOW_KINDS[node.type].compile(node, { entry, targetOf });
		if (result.node) {
			nodes.push(result.node);
		}
		if (result.scenario) {
			scenarios.push(result.scenario);
		}
	}

	const toolIds = [...new Set([...baseToolIds, ...nodes.flatMap((n) => n.toolIds)])];

	return { flow: { entry, nodes, scenarios }, toolIds, greeting };
}

/**
 * Build the Greeter fixture + its wiring for a given entry node: Start →
 * Greeter → entry. Shared by newCanvas, canvasFromFlow and the on-load
 * migration (insertGreeter into a legacy Start → entry canvas).
 */
function greeterNodeAndEdges(
	entryId: string,
	greeting: string,
	position: { x: number; y: number },
): { node: CanvasNodeDoc; startEdge: CanvasEdgeDoc; greeterEdge: CanvasEdgeDoc } {
	const greeterId = makeId("greeter");
	return {
		node: { id: greeterId, type: "greeter", position, data: newGreeterNodeData(greeting) },
		startEdge: {
			id: makeId("edge"),
			source: START_NODE_ID,
			sourceHandle: START_HANDLE_ID,
			target: greeterId,
		},
		greeterEdge: {
			id: makeId("edge"),
			source: greeterId,
			sourceHandle: GREETER_NEXT_HANDLE_ID,
			target: entryId,
		},
	};
}

/**
 * Migrate a persisted canvas that predates the Greeter fixture (Start → entry,
 * no greeter) by inserting a Greeter carrying the config's current greeting
 * between Start and the entry node. Canvases that already have a greeter are
 * returned unchanged. Applied wherever a saved canvas is loaded (FlowTab).
 */
export function ensureGreeter(doc: CanvasDoc, greeting: string): CanvasDoc {
	if (doc.nodes.some((n) => n.type === "greeter")) {
		return doc;
	}
	const startEdge = doc.edges.find((e) => e.source === START_NODE_ID);
	const entryId = startEdge?.target;
	const startNode = doc.nodes.find((n) => n.type === "start");
	const position = {
		x: (startNode?.position.x ?? 40) + 140,
		y: startNode?.position.y ?? 140,
	};
	// No entry to wire into (empty/broken canvas): still insert an unwired
	// greeter so the invariant "exactly one greeter" holds; validation will
	// flag the missing entry.
	const {
		node,
		startEdge: newStartEdge,
		greeterEdge,
	} = greeterNodeAndEdges(entryId ?? "", greeting, position);
	const edges = doc.edges.filter((e) => e.source !== START_NODE_ID);
	edges.push(newStartEdge);
	if (entryId) {
		edges.push(greeterEdge);
	}
	return { ...doc, nodes: [...doc.nodes, node], edges };
}

/* ------------------------------------------------------------------ */
/* Reconstruction: engine flow / blank slate → canvas document          */
/* ------------------------------------------------------------------ */

/**
 * Best-effort canvas from an engine flow (used when config.canvas is absent).
 * Inserts the Greeter fixture between Start and the flow entry, carrying the
 * config's current greeting so existing flows keep their connect-time greeting.
 */
export function canvasFromFlow(flow: EngineFlow, greeting = ""): CanvasDoc {
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
	const greeter = greeterNodeAndEdges(flow.entry, greeting, { x: 180, y: 120 });
	const nodes: CanvasNodeDoc[] = [
		{ id: START_NODE_ID, type: "start", position: { x: 40, y: 120 } },
		greeter.node,
	];
	const edges: CanvasEdgeDoc[] = [greeter.startEdge, greeter.greeterEdge];

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

		// An engine agent node carrying a `conversation` object round-trips as a
		// Conversation canvas node (node kind stays "agent" on the wire).
		if (flowNode.conversation) {
			const { node, edges: nodeEdges } = decompileConversationNode(flowNode, position);
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

/** A fresh canvas: Start → Greeter → one empty agent node. */
export function newCanvas(): CanvasDoc {
	const nodeId = makeId("node");
	const greeter = greeterNodeAndEdges(nodeId, "", { x: 180, y: 140 });
	return {
		version: 1,
		nodes: [
			{ id: START_NODE_ID, type: "start", position: { x: 40, y: 140 } },
			greeter.node,
			{
				id: nodeId,
				type: "agent",
				position: { x: 320, y: 80 },
				data: {
					title: "New agent",
					sections: [{ id: makeId("sec"), body: textToTiptapDoc("") }],
					entryMessage: "",
					exits: [],
					toolIds: [],
				},
			},
		],
		edges: [greeter.startEdge, greeter.greeterEdge],
	};
}
