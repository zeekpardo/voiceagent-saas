import { VariableIcon } from "lucide-react";

import {
	compileSetFieldNode,
	decompileSetFieldNode,
	newSetFieldNodeData,
} from "../compile/nodes/set-field";
import { SetFieldNodeEditor } from "../editors/set-field";
import type { SetFieldCanvasNodeDoc, SetFieldNodeData } from "../flow-types";
import { SET_FIELD_NEXT_HANDLE_ID, setFieldNodeDataSchema } from "../flow-types";
import { SetFieldNode } from "../SetFieldNode";
import { defineKind } from "./types";

export const setFieldKind = defineKind<SetFieldNodeData>({
	kind: "set_field",
	schema: setFieldNodeDataSchema,
	canvasNode: SetFieldNode,
	editor: ({ agentId, nodeId, data, onChange }) => (
		<SetFieldNodeEditor
			agentId={agentId}
			nodeId={nodeId}
			data={data as SetFieldNodeData}
			onChange={onChange}
		/>
	),
	sheetMeta: {
		title: "Edit Set Field",
		description:
			"Deterministically write one CRM field, then continue. No conversation — the value is saved silently and the flow moves on.",
	},
	subPanels: {
		fields: {
			title: "Fields & variables",
			description: "Insert contact and source fields into this stage.",
			icon: VariableIcon,
		},
	},
	newData: () => newSetFieldNodeData(),
	sourceHandles: () => new Set([SET_FIELD_NEXT_HANDLE_ID]),
	edgeLabel: () => undefined,
	compile: (node, { targetOf }) => ({
		node: compileSetFieldNode(node as SetFieldCanvasNodeDoc & { data: SetFieldNodeData }, targetOf),
	}),
	decompile: decompileSetFieldNode,
});
