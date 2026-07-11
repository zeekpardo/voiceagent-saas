"use client";

import type { Node, NodeProps } from "@xyflow/react";
import { ArrowRightLeftIcon } from "lucide-react";

import type { HandoffNodeData } from "./flow-types";
import { FlowNodeShell, nodeTraceProps } from "./FlowNodeShell";

export type HandoffRFNode = Node<HandoffNodeData, "handoff">;

/**
 * A Handoff node — hands the live call off to a DIFFERENT published agent (its
 * own persona/flow/tools), one-way, carrying the conversation context. Terminal
 * for this flow: no source handles (the target agent takes over from here).
 */
export function HandoffNode({ id, data, selected }: NodeProps<HandoffRFNode>) {
	return (
		<FlowNodeShell
			id={id}
			selected={selected}
			title={data.title}
			fallbackTitle="Hand off to agent"
			icon={ArrowRightLeftIcon}
			borderClassName="bg-gradient-to-br from-teal-500/70 to-cyan-500/70"
			tileClassName="bg-gradient-to-br from-teal-500 to-cyan-500"
			handleClassName="!bg-cyan-500"
			targetHandleClassName="!bg-teal-500"
			sourceHandles={[]}
			{...nodeTraceProps(data)}
		/>
	);
}
