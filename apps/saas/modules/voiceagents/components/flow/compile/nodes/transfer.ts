import type {
	CanvasEdgeDoc,
	CanvasNodeDoc,
	EngineFlowNode,
	TransferCanvasNodeDoc,
	TransferNodeData,
} from "../../flow-types";
import { TRANSFER_NEXT_HANDLE_ID } from "../../flow-types";
import { makeId } from "../text";

export function compileTransferNode(
	node: TransferCanvasNodeDoc & { data: TransferNodeData },
	targetOf: (nodeId: string, handleId: string) => string | undefined,
): EngineFlowNode {
	const say = node.data.say.trim();
	const target = targetOf(node.id, TRANSFER_NEXT_HANDLE_ID);
	return {
		id: node.id,
		name: node.data.title.trim() || undefined,
		kind: "transfer",
		transfer: {
			say: say || undefined,
			holdSeconds: node.data.holdSeconds,
			voice:
				node.data.voiceId && node.data.voiceProvider
					? { provider: node.data.voiceProvider, voice: node.data.voiceId }
					: undefined,
		},
		// The engine requires instructions min 1 on every node.
		instructions: say || "Transferring the caller.",
		toolIds: [],
		exits: target ? [{ name: "Next", description: "Continue after the transfer", target }] : [],
	};
}

export function decompileTransferNode(
	flowNode: EngineFlowNode,
	position: { x: number; y: number },
): { node: CanvasNodeDoc; edges: CanvasEdgeDoc[] } {
	const edges: CanvasEdgeDoc[] = [];
	const target = flowNode.exits[0]?.target;
	if (target) {
		edges.push({
			id: makeId("edge"),
			source: flowNode.id,
			sourceHandle: TRANSFER_NEXT_HANDLE_ID,
			target,
		});
	}
	return {
		node: {
			id: flowNode.id,
			type: "transfer",
			position,
			data: {
				title: flowNode.name ?? flowNode.id,
				say: flowNode.transfer?.say ?? "",
				holdSeconds: flowNode.transfer?.holdSeconds ?? 4,
				voiceId: flowNode.transfer?.voice?.voice,
				voiceProvider: flowNode.transfer?.voice?.provider,
			},
		},
		edges,
	};
}

/** Fresh Transfer node data (used by the Actions palette). */
export function newTransferNodeData(): TransferNodeData {
	return {
		title: "Transfer",
		say: "One moment please — let me transfer you to the right person.",
		holdSeconds: 4,
	};
}
