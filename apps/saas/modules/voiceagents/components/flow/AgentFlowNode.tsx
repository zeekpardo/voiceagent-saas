"use client";

import type { Node, NodeProps } from "@xyflow/react";
import { BotIcon, WrenchIcon } from "lucide-react";

import type { AgentNodeData } from "./flow-types";
import { FlowNodeShell, nodeTraceProps } from "./FlowNodeShell";

export type AgentRFNode = Node<AgentNodeData, "agent">;

/**
 * A flow agent node, CloseBot-compact: a small gradient card with a circular
 * bot icon, the title floated below, one right-edge source dot per exit (exit
 * names ride on the edge labels) and a tools badge in the corner.
 */
export function AgentFlowNode({ id, data, selected }: NodeProps<AgentRFNode>) {
	return (
		<FlowNodeShell
			id={id}
			selected={selected}
			title={data.title}
			fallbackTitle="Untitled agent"
			icon={BotIcon}
			borderClassName="bg-gradient-to-br from-blue-500/70 to-purple-500/70"
			tileClassName="bg-gradient-to-br from-blue-500 to-purple-500"
			handleClassName="!bg-purple-500"
			targetHandleClassName="!bg-blue-500"
			sourceHandles={data.exits.map((exit) => ({ id: exit.id, name: exit.name }))}
			channels={data.channels}
			{...nodeTraceProps(data)}
			badge={
				data.toolIds.length > 0 ? (
					<span
						title={`${data.toolIds.length} tool${data.toolIds.length === 1 ? "" : "s"}`}
						className="-right-1 -bottom-1 size-4 absolute flex items-center justify-center rounded-full border bg-background text-muted-foreground"
					>
						<WrenchIcon className="size-3" />
					</span>
				) : undefined
			}
		/>
	);
}
