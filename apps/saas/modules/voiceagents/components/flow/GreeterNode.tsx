"use client";

import type { Node, NodeProps } from "@xyflow/react";
import { HandIcon } from "lucide-react";

import type { GreeterNodeData } from "./flow-types";
import { GREETER_NEXT_HANDLE_ID } from "./flow-types";
import { FlowNodeShell, nodeTraceProps } from "./FlowNodeShell";

export type GreeterRFNode = Node<GreeterNodeData, "greeter">;

const SOURCE_HANDLES = [{ id: GREETER_NEXT_HANDLE_ID, name: "Start" }];

/**
 * The Greeter fixture — always present, one per flow, sitting between Start and
 * the first conversational node. It owns what the agent says when the call
 * connects (compiled into config.greeting). Like Start it is not deletable, so
 * the shell's delete affordance is suppressed.
 */
export function GreeterNode({ id, data, selected }: NodeProps<GreeterRFNode>) {
	return (
		<FlowNodeShell
			id={id}
			selected={selected}
			title={data.title}
			fallbackTitle="Greeter"
			icon={HandIcon}
			deletable={false}
			unwiredEndsCall={false}
			borderClassName="bg-gradient-to-br from-amber-400/70 to-orange-500/70"
			tileClassName="bg-gradient-to-br from-amber-400 to-orange-500"
			handleClassName="!bg-orange-500"
			targetHandleClassName="!bg-amber-400"
			sourceHandles={SOURCE_HANDLES}
			{...nodeTraceProps(data)}
		/>
	);
}
