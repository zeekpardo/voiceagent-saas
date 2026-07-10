"use client";

import type { Node, NodeProps } from "@xyflow/react";
import { MessagesSquareIcon, StarIcon } from "lucide-react";

import type { ConversationNodeData } from "./flow-types";
import { FlowNodeShell, nodeTraceProps } from "./FlowNodeShell";

export type ConversationRFNode = Node<ConversationNodeData, "conversation">;

/**
 * A Conversation node (CloseBot's "Keeping the Conversation Going"): an
 * objective-less, open-ended discovery loop. One right-edge source dot per exit
 * (exit names ride on the edge labels); a star badge marks the flow's default
 * catch-all for unconnected exits.
 */
export function ConversationNode({ id, data, selected }: NodeProps<ConversationRFNode>) {
	return (
		<FlowNodeShell
			id={id}
			selected={selected}
			title={data.title}
			fallbackTitle="Conversation"
			icon={MessagesSquareIcon}
			borderClassName="bg-gradient-to-br from-emerald-500/70 to-teal-500/70"
			tileClassName="bg-gradient-to-br from-emerald-500 to-teal-500"
			handleClassName="!bg-teal-500"
			targetHandleClassName="!bg-emerald-500"
			sourceHandles={data.exits.map((exit) => ({ id: exit.id, name: exit.name }))}
			{...nodeTraceProps(data)}
			badge={
				data.isDefault ? (
					<span
						title="Default for unconnected exits"
						className="-right-1 -bottom-1 absolute flex size-4 items-center justify-center rounded-full border bg-background text-amber-500"
					>
						<StarIcon className="size-3" />
					</span>
				) : undefined
			}
		/>
	);
}
