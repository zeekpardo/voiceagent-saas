"use client";

import { Handle, type Node, type NodeProps, Position } from "@xyflow/react";
import { PhoneIncomingIcon } from "lucide-react";

import { START_HANDLE_ID } from "./flow-types";

export type StartRFNode = Node<Record<string, unknown>, "start">;

/** The fixed entry point — its single edge decides which agent takes the call. */
export function StartNode(_props: NodeProps<StartRFNode>) {
	return (
		<div className="gap-2 border-emerald-500/50 bg-emerald-500/10 px-4 py-2 shadow-sm flex items-center rounded-full border">
			<PhoneIncomingIcon className="size-4 text-emerald-600 dark:text-emerald-400" />
			<span className="font-medium text-sm">Start</span>
			<Handle
				type="source"
				id={START_HANDLE_ID}
				position={Position.Right}
				className="!size-3 !bg-emerald-500 !border-2 !border-background"
			/>
		</div>
	);
}
