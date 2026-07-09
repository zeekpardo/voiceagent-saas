"use client";

import type { Node, NodeProps } from "@xyflow/react";
import { GraduationCapIcon } from "lucide-react";

import type { ObjectiveNodeData } from "./flow-types";
import { OBJECTIVE_NEXT_HANDLE_ID } from "./flow-types";
import { FlowNodeShell, nodeTraceProps } from "./FlowNodeShell";

export type ObjectiveRFNode = Node<ObjectiveNodeData, "objective">;

const SOURCE_HANDLES = [{ id: OBJECTIVE_NEXT_HANDLE_ID, name: "Next" }];

/**
 * An Objective node (CloseBot-style): gather one or more pieces of information
 * from the caller, optionally writing each to a CRM field. The engine verifies
 * the objectives as the caller answers and auto-advances along Next once every
 * required one is met — there is no LLM-called exit tool.
 */
export function ObjectiveNode({ id, data, selected }: NodeProps<ObjectiveRFNode>) {
	return (
		<FlowNodeShell
			id={id}
			selected={selected}
			title={data.title}
			fallbackTitle="Objective"
			icon={GraduationCapIcon}
			borderClassName="bg-gradient-to-br from-emerald-500/70 to-teal-500/70"
			tileClassName="bg-gradient-to-br from-emerald-500 to-teal-500"
			handleClassName="!bg-teal-500"
			targetHandleClassName="!bg-emerald-500"
			sourceHandles={SOURCE_HANDLES}
			{...nodeTraceProps(data)}
		/>
	);
}
