import { compileSwitchNode, decompileRouterNode, newSwitchNodeData } from "../compile/nodes/router";
import { sanitizeExitName } from "../compile/text";
import { SwitchNodeEditor } from "../editors/switch";
import type { SwitchCanvasNodeDoc, SwitchNodeData } from "../flow-types";
import { OTHERWISE_HANDLE_ID, switchNodeDataSchema } from "../flow-types";
import { SwitchNode } from "../SwitchNode";
import { defineKind } from "./types";

export const switchKind = defineKind<SwitchNodeData>({
	kind: "switch",
	schema: switchNodeDataSchema,
	canvasNode: SwitchNode,
	editor: ({ nodeId, data, onChange }) => (
		<SwitchNodeEditor nodeId={nodeId} data={data as SwitchNodeData} onChange={onChange} />
	),
	sheetMeta: {
		title: "Edit Switch branch",
		description:
			"This node never speaks — the AI checks the conversation against a question and follows the matching case.",
	},
	newData: () => newSwitchNodeData(),
	sourceHandles: (data) => {
		const handles = new Set(data.cases.map((switchCase) => switchCase.id));
		if (data.includeOtherwise) {
			handles.add(OTHERWISE_HANDLE_ID);
		}
		return handles;
	},
	edgeLabel: (data, sourceHandle) => {
		if (sourceHandle === OTHERWISE_HANDLE_ID) {
			return "Otherwise";
		}
		return (
			data.cases.find((switchCase) => switchCase.id === sourceHandle)?.name.trim() || undefined
		);
	},
	compile: (node, { targetOf }) => ({
		node: compileSwitchNode(node as SwitchCanvasNodeDoc & { data: SwitchNodeData }, targetOf),
	}),
	decompile: decompileRouterNode,
	validate: (node) => {
		const data = node.data as SwitchNodeData | undefined;
		const label = data?.title?.trim() || node.id;
		if (!data) {
			return [`Branch node "${label}" has no data.`];
		}
		const errors: string[] = [];
		if (!data.title.trim()) {
			errors.push("A Switch node needs a name.");
		}
		if (!data.condition.trim()) {
			errors.push(`Switch node "${label}" needs a question to evaluate.`);
		}
		const pathCount = data.cases.length + (data.includeOtherwise ? 1 : 0);
		if (pathCount < 2) {
			errors.push(
				`Switch node "${label}" needs at least two paths — add cases or enable the Otherwise path.`,
			);
		}
		const seenCases = new Set<string>();
		for (const switchCase of data.cases) {
			if (!switchCase.name.trim()) {
				errors.push(`Switch node "${label}" has a case without a name.`);
				continue;
			}
			if (!switchCase.description.trim()) {
				errors.push(
					`Switch node "${label}" case "${switchCase.name}" needs a description (when to take it).`,
				);
			}
			const key = sanitizeExitName(switchCase.name);
			if (seenCases.has(key)) {
				errors.push(`Switch node "${label}" has duplicate case name "${switchCase.name}".`);
			}
			seenCases.add(key);
		}
		return errors;
	},
});
