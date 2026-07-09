"use client";

import type { Node, NodeProps } from "@xyflow/react";
import { FormInputIcon } from "lucide-react";

import type { SetFieldNodeData } from "./flow-types";
import { SET_FIELD_NEXT_HANDLE_ID } from "./flow-types";
import { FlowNodeShell, nodeTraceProps } from "./FlowNodeShell";

export type SetFieldRFNode = Node<SetFieldNodeData, "set_field">;

const SOURCE_HANDLES = [{ id: SET_FIELD_NEXT_HANDLE_ID, name: "Next" }];

/**
 * A Set Field node: deterministically write one CRM field, then continue. No
 * conversation — the engine fires the update silently and moves on.
 */
export function SetFieldNode({ id, data, selected }: NodeProps<SetFieldRFNode>) {
	return (
		<FlowNodeShell
			id={id}
			selected={selected}
			title={data.title}
			fallbackTitle="Set Field"
			icon={FormInputIcon}
			borderClassName="bg-gradient-to-br from-orange-500/70 to-amber-500/70"
			tileClassName="bg-gradient-to-br from-orange-500 to-amber-500"
			handleClassName="!bg-amber-500"
			targetHandleClassName="!bg-orange-500"
			sourceHandles={SOURCE_HANDLES}
			{...nodeTraceProps(data)}
		/>
	);
}
