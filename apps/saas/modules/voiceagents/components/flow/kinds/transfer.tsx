import {
	compileTransferNode,
	decompileTransferNode,
	newTransferNodeData,
} from "../compile/nodes/transfer";
import { TransferNodeEditor } from "../editors/transfer";
import type { TransferCanvasNodeDoc, TransferNodeData } from "../flow-types";
import {
	transferNodeDataSchema,
	TRANSFER_FAILED_HANDLE_ID,
	TRANSFER_NEXT_HANDLE_ID,
} from "../flow-types";
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
		title: "Forward to a Person",
		description:
			'Connect the caller to a real person\'s phone. It dials the target and merges the caller in once someone picks up; wire the "Not connected" branch to keep the call going if no one answers.',
	},
	newData: () => newTransferNodeData(),
	sourceHandles: (data) => {
		const handles = new Set([TRANSFER_NEXT_HANDLE_ID]);
		// The "Not connected" failure branch only exists for warm transfers.
		if ((data.mode ?? "simulated") === "warm") {
			handles.add(TRANSFER_FAILED_HANDLE_ID);
		}
		return handles;
	},
	edgeLabel: (_data, sourceHandle) =>
		sourceHandle === TRANSFER_FAILED_HANDLE_ID ? "Not connected" : undefined,
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
		const mode = data.mode ?? "simulated";
		if (mode !== "simulated" && !data.target?.trim()) {
			errors.push(
				`Transfer node "${label}" needs a target phone number or SIP URI for a ${mode} transfer.`,
			);
		}
		if (!doc.edges.some((edge) => edge.source === node.id)) {
			errors.push(
				`Transfer node "${label}" must connect to the node the caller is transferred to.`,
			);
		}
		return errors;
	},
});
