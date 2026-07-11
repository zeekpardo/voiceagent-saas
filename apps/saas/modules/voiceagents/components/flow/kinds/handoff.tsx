import {
	compileHandoffNode,
	decompileHandoffNode,
	newHandoffNodeData,
} from "../compile/nodes/handoff";
import { HandoffNodeEditor } from "../editors/handoff";
import type { HandoffCanvasNodeDoc, HandoffNodeData } from "../flow-types";
import { handoffNodeDataSchema } from "../flow-types";
import { HandoffNode } from "../HandoffNode";
import { defineKind } from "./types";

export const handoffKind = defineKind<HandoffNodeData>({
	kind: "handoff",
	schema: handoffNodeDataSchema,
	canvasNode: HandoffNode,
	editor: ({ agentId, nodeId, data, onChange }) => (
		<HandoffNodeEditor
			agentId={agentId}
			nodeId={nodeId}
			data={data as HandoffNodeData}
			onChange={onChange}
		/>
	),
	sheetMeta: {
		title: "Edit Handoff",
		description:
			"Hand the live call off to a different published agent — its own persona, flow and tools take over, carrying the conversation so far. One-way.",
	},
	newData: () => newHandoffNodeData(),
	// Terminal: the target agent takes over, so this node has no source handles.
	sourceHandles: () => new Set(),
	edgeLabel: () => undefined,
	compile: (node) => ({
		node: compileHandoffNode(node as HandoffCanvasNodeDoc & { data: HandoffNodeData }),
	}),
	decompile: decompileHandoffNode,
	validate: (node) => {
		const data = node.data as HandoffNodeData | undefined;
		const label = data?.title?.trim() || node.id;
		if (!data) {
			return [`Handoff node "${label}" has no data.`];
		}
		const errors: string[] = [];
		if (!data.title.trim()) {
			errors.push("A Handoff node needs a name.");
		}
		if (!data.handoffAgentId) {
			errors.push(`Handoff node "${label}" must choose an agent to hand off to.`);
		}
		return errors;
	},
});
