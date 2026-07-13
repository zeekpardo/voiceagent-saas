"use client";

import type { Node, NodeProps } from "@xyflow/react";
import { MessagesSquareIcon } from "lucide-react";

import type { ConversationNodeData } from "./flow-types";
import { FlowNodeShell, nodeTraceProps } from "./FlowNodeShell";

export type ConversationRFNode = Node<ConversationNodeData, "conversation">;

/**
 * A Conversation node (CloseBot's "Keeping the Conversation Going"): a terminal
 * "keep chatting" stage. It runs off the agent-level fields (Goal, business info,
 * response style) plus an optional Extra Prompt, and chats until the call/thread
 * ends — so it has an incoming handle but NO source/exit handles.
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
			sourceHandles={[]}
			{...nodeTraceProps(data)}
		/>
	);
}
