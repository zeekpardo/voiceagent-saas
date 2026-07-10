import {
	compileTransferNode,
	decompileTransferNode,
	newTransferNodeData,
} from "../compile/nodes/transfer";
import { TransferNodeEditor } from "../editors/transfer";
import type { TransferCanvasNodeDoc, TransferNodeData } from "../flow-types";
import { transferNodeDataSchema, TRANSFER_NEXT_HANDLE_ID } from "../flow-types";
import { TransferNode } from "../TransferNode";
import { defineKind } from "./types";

export const transferKind = defineKind<TransferNodeData>({
	kind: "transfer",
	schema: transferNodeDataSchema,
	canvasNode: TransferNode,
	editor: ({ nodeId, data, onChange }) => (
		<TransferNodeEditor nodeId={nodeId} data={data as TransferNodeData} onChange={onChange} />
	),
	sheetMeta: {
		title: "Edit Transfer",
		description:
			"A simulated warm hand-off: an optional announcement, hold music, then the connected node continues with a new voice.",
	},
	newData: () => newTransferNodeData(),
	sourceHandles: () => new Set([TRANSFER_NEXT_HANDLE_ID]),
	edgeLabel: () => undefined,
	compile: (node, { targetOf }) => ({
		node: compileTransferNode(node as TransferCanvasNodeDoc & { data: TransferNodeData }, targetOf),
	}),
	decompile: decompileTransferNode,
	validate: (node, doc) => {
		const data = node.data as TransferNodeData | undefined;
		const label = data?.title?.trim() || node.id;
		if (!data) {
			return [`Transfer node "${label}" has no data.`];
		}
		const errors: string[] = [];
		if (!data.title.trim()) {
			errors.push("A Transfer node needs a name.");
		}
		if (!doc.edges.some((edge) => edge.source === node.id)) {
			errors.push(
				`Transfer node "${label}" must connect to the node the caller is transferred to.`,
			);
		}
		return errors;
	},
});
