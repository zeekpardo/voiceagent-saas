"use client";

import { createContext, useContext } from "react";

import type { FlowNodeRef } from "./mentions";

/**
 * The current flow's nodes, exposed to the field pickers so they can offer a
 * "Nodes" group (CloseBot "Nodes" variables, Tier 1): each prior node's runtime
 * outcome as insertable `{{node_<id>_*}}` tokens.
 *
 * Provided once by FlowCanvas (which holds the LIVE canvas node state, so the
 * group tracks renames / additions immediately) and read by useFieldPickerGroups
 * (rail panel + single-field pill editors). `currentNodeId` is the node being
 * edited — dropped from the list so a node never offers its own result.
 *
 * Nullable-safe: outside a provider (a field picker used off-canvas) the default
 * is an empty flow, so no Nodes group appears and nothing breaks.
 */
export interface FlowNodesContextValue {
	nodes: FlowNodeRef[];
	currentNodeId: string | null;
}

const FlowNodesContext = createContext<FlowNodesContextValue>({
	nodes: [],
	currentNodeId: null,
});

export function FlowNodesProvider({
	value,
	children,
}: {
	value: FlowNodesContextValue;
	children: React.ReactNode;
}) {
	return <FlowNodesContext.Provider value={value}>{children}</FlowNodesContext.Provider>;
}

export function useFlowNodes(): FlowNodesContextValue {
	return useContext(FlowNodesContext);
}
