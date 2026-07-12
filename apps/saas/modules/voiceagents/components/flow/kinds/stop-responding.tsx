import {
	compileStopRespondingNode,
	decompileStopRespondingNode,
	newStopRespondingNodeData,
} from "../compile/nodes/stop-responding";
import { StopRespondingNodeEditor } from "../editors/stop-responding";
import type { StopRespondingCanvasNodeDoc, StopRespondingNodeData } from "../flow-types";
import { stopRespondingNodeDataSchema } from "../flow-types";
import { StopRespondingNode } from "../StopRespondingNode";
import { defineKind } from "./types";

export const stopRespondingKind = defineKind<StopRespondingNodeData>({
	kind: "stop_responding",
	schema: stopRespondingNodeDataSchema,
	canvasNode: StopRespondingNode,
	editor: ({ nodeId, data, onChange }) => (
		<StopRespondingNodeEditor
			nodeId={nodeId}
			data={data as StopRespondingNodeData}
			onChange={onChange}
		/>
	),
	sheetMeta: {
		title: "Edit Stop Responding",
		description:
			"Park the contact — the agent stops responding but keeps listening. The call is not ended; custom scenarios can still re-engage the contact.",
	},
	newData: () => newStopRespondingNodeData(),
	// Leaf/terminal: the contact parks here, so this node has no source handles.
	sourceHandles: () => new Set(),
	edgeLabel: () => undefined,
	compile: (node) => ({
		node: compileStopRespondingNode(
			node as StopRespondingCanvasNodeDoc & { data: StopRespondingNodeData },
		),
	}),
	decompile: decompileStopRespondingNode,
	validate: (node) => {
		const data = node.data as StopRespondingNodeData | undefined;
		const label = data?.title?.trim() || node.id;
		if (!data) {
			return [`Stop Responding node "${label}" has no data.`];
		}
		if (!data.title.trim()) {
			return ["A Stop Responding node needs a name."];
		}
		return [];
	},
});
