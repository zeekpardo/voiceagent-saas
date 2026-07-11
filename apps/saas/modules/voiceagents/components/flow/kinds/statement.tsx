import { VariableIcon } from "lucide-react";

import {
	compileStatementNode,
	decompileStatementNode,
	newStatementNodeData,
} from "../compile/nodes/statement";
import { StatementNodeEditor } from "../editors/statement";
import type { StatementCanvasNodeDoc, StatementNodeData } from "../flow-types";
import { STATEMENT_NEXT_HANDLE_ID, statementNodeDataSchema } from "../flow-types";
import { StatementNode } from "../StatementNode";
import { defineKind } from "./types";

export const statementKind = defineKind<StatementNodeData>({
	kind: "statement",
	schema: statementNodeDataSchema,
	canvasNode: StatementNode,
	editor: ({ agentId, nodeId, data, onChange }) => (
		<StatementNodeEditor
			agentId={agentId}
			nodeId={nodeId}
			data={data as StatementNodeData}
			onChange={onChange}
		/>
	),
	sheetMeta: {
		title: "Edit Statement",
		description:
			"This node speaks its text exactly as written, then the flow continues immediately.",
	},
	subPanels: {
		fields: {
			title: "Fields & variables",
			description: "Insert contact and source fields into this stage.",
			icon: VariableIcon,
		},
	},
	newData: () => newStatementNodeData(),
	sourceHandles: () => new Set([STATEMENT_NEXT_HANDLE_ID]),
	edgeLabel: () => undefined,
	compile: (node, { targetOf }) => ({
		node: compileStatementNode(
			node as StatementCanvasNodeDoc & { data: StatementNodeData },
			targetOf,
		),
	}),
	decompile: decompileStatementNode,
	validate: (node) => {
		const data = node.data as StatementNodeData | undefined;
		const label = data?.title?.trim() || node.id;
		if (!data) {
			return [`Statement node "${label}" has no data.`];
		}
		const errors: string[] = [];
		if (!data.title.trim()) {
			errors.push("A Statement node needs a name.");
		}
		if (!data.say.trim()) {
			errors.push(`Statement node "${label}" needs something to say.`);
		}
		return errors;
	},
});
