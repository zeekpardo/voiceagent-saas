import { compileSetFieldNode, decompileSetFieldNode, newSetFieldNodeData } from "../compile/nodes/set-field";
import { SetFieldNodeEditor } from "../editors/set-field";
import type { SetFieldCanvasNodeDoc, SetFieldNodeData } from "../flow-types";
import { setFieldNodeDataSchema } from "../flow-types";
import { SetFieldNode } from "../SetFieldNode";
import { defineKind } from "./types";

export const setFieldKind = defineKind<SetFieldNodeData>({
	kind: "set_field",
	schema: setFieldNodeDataSchema,
	canvasNode: SetFieldNode,
	editor: ({ nodeId, data, onChange }) => (
		<SetFieldNodeEditor nodeId={nodeId} data={data as SetFieldNodeData} onChange={onChange} />
	),
	sheetMeta: {
		title: "Edit Set Field",
		description:
			"Deterministically write one CRM field, then continue. No conversation — the value is saved silently and the flow moves on.",
	},
	newData: () => newSetFieldNodeData(),
	sourceHandles: () => new Set(),
	edgeLabel: () => undefined,
	compile: (node, { targetOf }) => ({
		node: compileSetFieldNode(node as SetFieldCanvasNodeDoc & { data: SetFieldNodeData }, targetOf),
	}),
	decompile: decompileSetFieldNode,
});
