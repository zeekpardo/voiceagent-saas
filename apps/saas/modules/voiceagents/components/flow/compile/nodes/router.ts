import type {
	CanvasEdgeDoc,
	CanvasNodeDoc,
	EngineFlowExit,
	EngineFlowNode,
	SwitchCanvasNodeDoc,
	SwitchNodeData,
	TrueFalseCanvasNodeDoc,
	TrueFalseNodeData,
} from "../../flow-types";
import { FALSE_HANDLE_ID, OTHERWISE_HANDLE_ID, TRUE_HANDLE_ID } from "../../flow-types";
import { makeId } from "../text";

export function compileTrueFalseNode(
	node: TrueFalseCanvasNodeDoc & { data: TrueFalseNodeData },
	targetOf: (nodeId: string, handleId: string) => string | undefined,
): EngineFlowNode {
	const condition = node.data.condition.trim();
	return {
		id: node.id,
		name: node.data.title.trim() || undefined,
		kind: "router",
		router: { condition },
		// The engine requires instructions min 1 on every node — mirror the condition.
		instructions: condition,
		toolIds: [],
		exits: [
			{
				name: "True",
				description: "The statement is true",
				target: targetOf(node.id, TRUE_HANDLE_ID),
			},
			{
				name: "False",
				description: "The statement is false",
				target: targetOf(node.id, FALSE_HANDLE_ID),
			},
		],
	};
}

export function compileSwitchNode(
	node: SwitchCanvasNodeDoc & { data: SwitchNodeData },
	targetOf: (nodeId: string, handleId: string) => string | undefined,
): EngineFlowNode {
	const condition = node.data.condition.trim();
	const exits: EngineFlowExit[] = node.data.cases.map((switchCase) => ({
		name: switchCase.name.trim(),
		description: switchCase.description.trim(),
		target: targetOf(node.id, switchCase.id),
	}));
	if (node.data.includeOtherwise) {
		exits.push({
			name: "Otherwise",
			description: "None of the other options match the conversation",
			target: targetOf(node.id, OTHERWISE_HANDLE_ID),
		});
	}
	return {
		id: node.id,
		name: node.data.title.trim() || undefined,
		kind: "router",
		router: { condition },
		instructions: condition,
		toolIds: [],
		exits,
	};
}

export function decompileRouterNode(
	flowNode: EngineFlowNode,
	position: { x: number; y: number },
): { node: CanvasNodeDoc; edges: CanvasEdgeDoc[] } {
	const condition = flowNode.router?.condition ?? flowNode.instructions;
	const title = flowNode.name ?? flowNode.id;
	const exitNames = flowNode.exits.map((exit) => exit.name.trim().toLowerCase());
	const isTrueFalse =
		flowNode.exits.length === 2 && exitNames.includes("true") && exitNames.includes("false");

	const edges: CanvasEdgeDoc[] = [];

	if (isTrueFalse) {
		for (const exit of flowNode.exits) {
			if (exit.target) {
				edges.push({
					id: makeId("edge"),
					source: flowNode.id,
					sourceHandle:
						exit.name.trim().toLowerCase() === "true" ? TRUE_HANDLE_ID : FALSE_HANDLE_ID,
					target: exit.target,
				});
			}
		}
		return {
			node: {
				id: flowNode.id,
				type: "truefalse",
				position,
				data: { title, condition },
			},
			edges,
		};
	}

	// The engine's fallback exit is named otherwise/none/default (case-insensitive).
	const isOtherwise = (name: string) =>
		["otherwise", "none", "default"].includes(name.trim().toLowerCase());
	const otherwiseExit = flowNode.exits.find((exit) => isOtherwise(exit.name));
	const caseExits = flowNode.exits.filter((exit) => exit !== otherwiseExit);
	const cases = caseExits.map((exit) => ({
		id: makeId("case"),
		name: exit.name,
		description: exit.description,
	}));
	caseExits.forEach((exit, i) => {
		if (exit.target) {
			edges.push({
				id: makeId("edge"),
				source: flowNode.id,
				sourceHandle: cases[i].id,
				target: exit.target,
			});
		}
	});
	if (otherwiseExit?.target) {
		edges.push({
			id: makeId("edge"),
			source: flowNode.id,
			sourceHandle: OTHERWISE_HANDLE_ID,
			target: otherwiseExit.target,
		});
	}
	return {
		node: {
			id: flowNode.id,
			type: "switch",
			position,
			data: { title, condition, cases, includeOtherwise: !!otherwiseExit },
		},
		edges,
	};
}

/** Fresh True/False branch node data (used by the Actions palette). */
export function newTrueFalseNodeData(): TrueFalseNodeData {
	return { title: "True / False", condition: "" };
}

/** Fresh Switch branch node data (used by the Actions palette). */
export function newSwitchNodeData(): SwitchNodeData {
	return {
		title: "Switch",
		condition: "",
		cases: [{ id: makeId("case"), name: "", description: "" }],
		includeOtherwise: true,
	};
}
