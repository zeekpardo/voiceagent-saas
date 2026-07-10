import type { ComponentType } from "react";
import type { NodeProps } from "@xyflow/react";

import { AgentFlowNode } from "./AgentFlowNode";
import { BookingNode } from "./BookingNode";
import {
	newAgentNodeData,
	newBookingNodeData,
	newModifyTagsNodeData,
	newObjectiveNodeData,
	newScenarioNodeData,
	newSetFieldNodeData,
	newStatementNodeData,
	newSwitchNodeData,
	newTransferNodeData,
	newTrueFalseNodeData,
} from "./compile";
import type { FlowNodeData, FlowNodeKind } from "./flow-types";
import {
	BOOKING_BOOKED_HANDLE_ID,
	FALSE_HANDLE_ID,
	OTHERWISE_HANDLE_ID,
	SCENARIO_JUMP_HANDLE_ID,
	STATEMENT_NEXT_HANDLE_ID,
	TRANSFER_NEXT_HANDLE_ID,
	TRUE_HANDLE_ID,
} from "./flow-types";
import { ModifyTagsNode } from "./ModifyTagsNode";
import { ObjectiveNode } from "./ObjectiveNode";
import { ScenarioNode } from "./ScenarioNode";
import { SetFieldNode } from "./SetFieldNode";
import { StatementNode } from "./StatementNode";
import { SwitchNode } from "./SwitchNode";
import { TransferNode } from "./TransferNode";
import { TrueFalseNode } from "./TrueFalseNode";

/**
 * Single source of truth for everything FlowCanvas needs to know per editable
 * node kind (the fixed Start node sits outside this — it isn't draggable,
 * editable or connectable the same way). Seed of the future full node-kind
 * registry (T3a): compile/decompile already live in compile/nodes/*, editors
 * in editors/*; this table is the canvas-rendering counterpart.
 */
export interface FlowKindMeta<TData extends FlowNodeData = FlowNodeData> {
	/** React Flow node renderer registered under this kind. */
	component: ComponentType<NodeProps<any>>;
	/** Fresh data for a palette-dropped / drag-and-dropped node of this kind. */
	createData: (bookingToolIds: string[]) => TData;
	/**
	 * Data used to repair a persisted doc node whose `data` is missing.
	 * Defaults to `createData([])` when omitted — only kinds whose fresh vs.
	 * repaired defaults diverge (agent's title copy) need to override this.
	 */
	createFallbackData?: (bookingToolIds: string[]) => TData;
	/** Source handles this node's edges may legally use after a data update. */
	sourceHandles: (data: TData) => Set<string>;
	/** Edge label derived from the source node's data + the edge's sourceHandle. */
	edgeLabel: (data: TData, sourceHandle: string | undefined) => string | undefined;
}

function defineKindMeta<TData extends FlowNodeData>(
	meta: FlowKindMeta<TData>,
): FlowKindMeta<TData> {
	return meta;
}

/** Per-kind canvas metadata — the merge point of the six switches this table replaces. */
export const FLOW_KIND_META = {
	agent: defineKindMeta({
		component: AgentFlowNode,
		createData: () => newAgentNodeData("New agent"),
		createFallbackData: () => newAgentNodeData("Untitled agent"),
		sourceHandles: (data) => new Set(data.exits.map((exit) => exit.id)),
		edgeLabel: (data, sourceHandle) =>
			data.exits.find((exit) => exit.id === sourceHandle)?.name.trim() || undefined,
	}),
	objective: defineKindMeta({
		component: ObjectiveNode,
		createData: () => newObjectiveNodeData(),
		sourceHandles: () => new Set(),
		edgeLabel: () => undefined,
	}),
	truefalse: defineKindMeta({
		component: TrueFalseNode,
		createData: () => newTrueFalseNodeData(),
		sourceHandles: () => new Set([TRUE_HANDLE_ID, FALSE_HANDLE_ID]),
		edgeLabel: (_data, sourceHandle) => (sourceHandle === TRUE_HANDLE_ID ? "True" : "False"),
	}),
	switch: defineKindMeta({
		component: SwitchNode,
		createData: () => newSwitchNodeData(),
		sourceHandles: (data) => {
			const handles = new Set(data.cases.map((switchCase) => switchCase.id));
			if (data.includeOtherwise) {
				handles.add(OTHERWISE_HANDLE_ID);
			}
			return handles;
		},
		edgeLabel: (data, sourceHandle) => {
			if (sourceHandle === OTHERWISE_HANDLE_ID) {
				return "Otherwise";
			}
			return (
				data.cases.find((switchCase) => switchCase.id === sourceHandle)?.name.trim() || undefined
			);
		},
	}),
	statement: defineKindMeta({
		component: StatementNode,
		createData: () => newStatementNodeData(),
		sourceHandles: () => new Set([STATEMENT_NEXT_HANDLE_ID]),
		edgeLabel: () => undefined,
	}),
	scenario: defineKindMeta({
		component: ScenarioNode,
		createData: () => newScenarioNodeData(),
		sourceHandles: () => new Set([SCENARIO_JUMP_HANDLE_ID]),
		edgeLabel: (data) => data.title.trim() || undefined,
	}),
	transfer: defineKindMeta({
		component: TransferNode,
		createData: () => newTransferNodeData(),
		sourceHandles: () => new Set([TRANSFER_NEXT_HANDLE_ID]),
		edgeLabel: () => undefined,
	}),
	set_field: defineKindMeta({
		component: SetFieldNode,
		createData: () => newSetFieldNodeData(),
		sourceHandles: () => new Set(),
		edgeLabel: () => undefined,
	}),
	modify_tags: defineKindMeta({
		component: ModifyTagsNode,
		createData: () => newModifyTagsNodeData(),
		sourceHandles: () => new Set(),
		edgeLabel: () => undefined,
	}),
	booking: defineKindMeta({
		component: BookingNode,
		createData: (bookingToolIds) => newBookingNodeData(bookingToolIds),
		createFallbackData: () => newBookingNodeData([]),
		sourceHandles: () => new Set(),
		edgeLabel: (_data, sourceHandle) =>
			sourceHandle === BOOKING_BOOKED_HANDLE_ID ? "Booked" : "No time worked",
	}),
} satisfies Record<FlowNodeKind, FlowKindMeta<any>>;

export function isFlowNodeKind(type: string | undefined): type is FlowNodeKind {
	return !!type && type in FLOW_KIND_META;
}
