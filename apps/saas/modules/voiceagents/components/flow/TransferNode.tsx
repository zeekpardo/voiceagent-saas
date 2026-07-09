"use client";

import type { Node, NodeProps } from "@xyflow/react";
import { PhoneForwardedIcon } from "lucide-react";

import type { TransferNodeData } from "./flow-types";
import { TRANSFER_NEXT_HANDLE_ID } from "./flow-types";
import { FlowNodeShell, nodeTraceProps } from "./FlowNodeShell";

export type TransferRFNode = Node<TransferNodeData, "transfer">;

const SOURCE_HANDLES = [{ id: TRANSFER_NEXT_HANDLE_ID, name: "Connects to" }];

/**
 * A Transfer node — the simulated warm hand-off: optional announcement in the
 * current voice, hold music for a few seconds, then the flow continues at the
 * connected node with a new voice that persists for the rest of the call.
 */
export function TransferNode({ id, data, selected }: NodeProps<TransferRFNode>) {
	return (
		<FlowNodeShell
			id={id}
			selected={selected}
			title={data.title}
			fallbackTitle="Transfer"
			icon={PhoneForwardedIcon}
			borderClassName="bg-gradient-to-br from-teal-500/70 to-cyan-500/70"
			tileClassName="bg-gradient-to-br from-teal-500 to-cyan-500"
			handleClassName="!bg-cyan-500"
			targetHandleClassName="!bg-teal-500"
			sourceHandles={SOURCE_HANDLES}
			{...nodeTraceProps(data)}
		/>
	);
}
