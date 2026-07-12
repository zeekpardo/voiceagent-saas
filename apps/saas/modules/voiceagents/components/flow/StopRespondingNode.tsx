"use client";

import type { Node, NodeProps } from "@xyflow/react";
import { HandIcon } from "lucide-react";

import type { StopRespondingNodeData } from "./flow-types";
import { FlowNodeShell, nodeTraceProps } from "./FlowNodeShell";

export type StopRespondingRFNode = Node<StopRespondingNodeData, "stop_responding">;

/**
 * A Stop Responding node — parks the contact: the agent stops responding but
 * keeps listening. A leaf node (no source handles), but NOT an end-of-call: the
 * call is never hung up here. Custom scenarios keep evaluating and can re-engage
 * the contact.
 */
export function StopRespondingNode({ id, data, selected }: NodeProps<StopRespondingRFNode>) {
	return (
		<FlowNodeShell
			id={id}
			selected={selected}
			title={data.title}
			fallbackTitle="Stop responding"
			icon={HandIcon}
			borderClassName="bg-gradient-to-br from-slate-500/70 to-zinc-500/70"
			tileClassName="bg-gradient-to-br from-slate-500 to-zinc-500"
			handleClassName="!bg-zinc-500"
			targetHandleClassName="!bg-slate-500"
			sourceHandles={[]}
			{...nodeTraceProps(data)}
		/>
	);
}
