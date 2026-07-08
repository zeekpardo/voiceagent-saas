"use client";

import type { Node, NodeProps } from "@xyflow/react";
import { WorkflowIcon } from "lucide-react";

import type { SwitchNodeData } from "./flow-types";
import { OTHERWISE_HANDLE_ID } from "./flow-types";
import { FlowNodeShell, nodeTraceProps } from "./FlowNodeShell";

export type SwitchRFNode = Node<SwitchNodeData, "switch">;

/**
 * A Switch branch node, CloseBot-compact: the engine evaluates the question
 * against the conversation and follows the matching case — one right-edge dot
 * per case plus Otherwise (case names ride on the edge labels).
 */
export function SwitchNode({ id, data, selected }: NodeProps<SwitchRFNode>) {
	const sourceHandles = [
		...data.cases.map((switchCase) => ({ id: switchCase.id, name: switchCase.name })),
		...(data.includeOtherwise ? [{ id: OTHERWISE_HANDLE_ID, name: "Otherwise" }] : []),
	];

	return (
		<FlowNodeShell
			id={id}
			selected={selected}
			title={data.title}
			fallbackTitle="Switch"
			icon={WorkflowIcon}
			borderClassName="bg-gradient-to-br from-pink-500/70 to-rose-500/70"
			tileClassName="bg-gradient-to-br from-pink-500 to-rose-500"
			handleClassName="!bg-rose-500"
			targetHandleClassName="!bg-pink-500"
			sourceHandles={sourceHandles}
			{...nodeTraceProps(data)}
		/>
	);
}
