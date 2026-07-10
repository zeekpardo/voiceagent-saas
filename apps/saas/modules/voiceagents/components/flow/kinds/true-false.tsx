import {
	compileTrueFalseNode,
	decompileRouterNode,
	newTrueFalseNodeData,
} from "../compile/nodes/router";
import { TrueFalseNodeEditor } from "../editors/true-false";
import type { TrueFalseCanvasNodeDoc, TrueFalseNodeData } from "../flow-types";
import { FALSE_HANDLE_ID, trueFalseNodeDataSchema, TRUE_HANDLE_ID } from "../flow-types";
import { TrueFalseNode } from "../TrueFalseNode";
import { defineKind } from "./types";

export const trueFalseKind = defineKind<TrueFalseNodeData>({
	kind: "truefalse",
	schema: trueFalseNodeDataSchema,
	canvasNode: TrueFalseNode,
	editor: ({ nodeId, data, onChange }) => (
		<TrueFalseNodeEditor nodeId={nodeId} data={data as TrueFalseNodeData} onChange={onChange} />
	),
	sheetMeta: {
		title: "Edit True/False branch",
		description:
			"This node never speaks — the AI checks the conversation against a statement and takes the True or False path.",
	},
	newData: () => newTrueFalseNodeData(),
	sourceHandles: () => new Set([TRUE_HANDLE_ID, FALSE_HANDLE_ID]),
	edgeLabel: (_data, sourceHandle) => (sourceHandle === TRUE_HANDLE_ID ? "True" : "False"),
	compile: (node, { targetOf }) => ({
		node: compileTrueFalseNode(
			node as TrueFalseCanvasNodeDoc & { data: TrueFalseNodeData },
			targetOf,
		),
	}),
	decompile: decompileRouterNode,
	validate: (node) => {
		const data = node.data as TrueFalseNodeData | undefined;
		const label = data?.title?.trim() || node.id;
		if (!data) {
			return [`Branch node "${label}" has no data.`];
		}
		const errors: string[] = [];
		if (!data.title.trim()) {
			errors.push("A True/False node needs a name.");
		}
		if (!data.condition.trim()) {
			errors.push(`True/False node "${label}" needs a statement to evaluate.`);
		}
		return errors;
	},
});
