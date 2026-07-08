"use client";

import type { Node, NodeProps } from "@xyflow/react";
import { SplitIcon } from "lucide-react";

import type { TrueFalseNodeData } from "./flow-types";
import { FALSE_HANDLE_ID, TRUE_HANDLE_ID } from "./flow-types";
import { FlowNodeShell, nodeTraceProps } from "./FlowNodeShell";

export type TrueFalseRFNode = Node<TrueFalseNodeData, "truefalse">;

const SOURCE_HANDLES = [
	{ id: TRUE_HANDLE_ID, name: "True" },
	{ id: FALSE_HANDLE_ID, name: "False" },
];

/**
 * A True/False branch node, CloseBot-compact: the engine evaluates the
 * statement against the conversation and takes the True (upper dot) or False
 * (lower dot) path. Unwired paths end the call.
 */
export function TrueFalseNode({ id, data, selected }: NodeProps<TrueFalseRFNode>) {
	return (
		<FlowNodeShell
			id={id}
			selected={selected}
			title={data.title}
			fallbackTitle="True / False"
			icon={SplitIcon}
			borderClassName="bg-gradient-to-br from-pink-500/70 to-rose-500/70"
			tileClassName="bg-gradient-to-br from-pink-500 to-rose-500"
			handleClassName="!bg-rose-500"
			targetHandleClassName="!bg-pink-500"
			sourceHandles={SOURCE_HANDLES}
			{...nodeTraceProps(data)}
		/>
	);
}
