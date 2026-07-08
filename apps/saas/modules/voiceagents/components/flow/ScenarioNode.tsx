"use client";

import type { Node, NodeProps } from "@xyflow/react";
import { CornerUpRightIcon } from "lucide-react";

import type { ScenarioNodeData } from "./flow-types";
import { SCENARIO_JUMP_HANDLE_ID } from "./flow-types";
import { FlowNodeShell, nodeTraceProps } from "./FlowNodeShell";

export type ScenarioRFNode = Node<ScenarioNodeData, "scenario">;

const SOURCE_HANDLES = [{ id: SCENARIO_JUMP_HANDLE_ID, name: "Jump to" }];

/**
 * A Scenario node — global detect-and-jump, checked continuously from every
 * agent node. Rendered as a smaller round card (nothing flows INTO a scenario,
 * so there is no target handle); its single "Jump to" edge is the destination.
 */
export function ScenarioNode({ id, data, selected }: NodeProps<ScenarioRFNode>) {
	return (
		<FlowNodeShell
			id={id}
			selected={selected}
			title={data.title}
			fallbackTitle="Custom Scenario"
			icon={CornerUpRightIcon}
			borderClassName="bg-gradient-to-br from-amber-500/70 to-orange-500/70"
			tileClassName="bg-gradient-to-br from-amber-500 to-orange-500"
			handleClassName="!bg-orange-500"
			targetHandleClassName="!bg-amber-500"
			sourceHandles={SOURCE_HANDLES}
			shape="round"
			hasTargetHandle={false}
			unwiredEndsCall={false}
			{...nodeTraceProps(data)}
		/>
	);
}
