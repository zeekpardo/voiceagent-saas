"use client";

import type { Node, NodeProps } from "@xyflow/react";
import { MessageSquareIcon } from "lucide-react";

import type { StatementNodeData } from "./flow-types";
import { STATEMENT_NEXT_HANDLE_ID } from "./flow-types";
import { FlowNodeShell, nodeTraceProps } from "./FlowNodeShell";

export type StatementRFNode = Node<StatementNodeData, "statement">;

const SOURCE_HANDLES = [{ id: STATEMENT_NEXT_HANDLE_ID, name: "Next" }];

/**
 * A Statement node, CloseBot-compact: the engine speaks the text exactly as
 * written and immediately continues along the single Next handle. Leaving
 * Next unwired ends the call after speaking (phone-off glyph via the shell).
 */
export function StatementNode({ id, data, selected }: NodeProps<StatementRFNode>) {
	return (
		<FlowNodeShell
			id={id}
			selected={selected}
			title={data.title}
			fallbackTitle="Statement"
			icon={MessageSquareIcon}
			borderClassName="bg-gradient-to-br from-blue-500/70 to-purple-500/70"
			tileClassName="bg-gradient-to-br from-blue-500 to-purple-500"
			handleClassName="!bg-purple-500"
			targetHandleClassName="!bg-blue-500"
			sourceHandles={SOURCE_HANDLES}
			{...nodeTraceProps(data)}
		/>
	);
}
