import type { ComponentType } from "react";
import type { NodeProps } from "@xyflow/react";

import type { FlowNodeData, FlowNodeKind } from "./flow-types";
import { FLOW_KIND_LIST, FLOW_KINDS } from "./kinds";

/**
 * Thin compatibility view over the node-kind registry (see kinds/index.ts).
 * FlowCanvas consumes this shape; the fields map straight onto registry entries
 * (`component` = `canvasNode`, `createData` = `newData`, …). New kinds are added
 * to the registry, never here.
 */
export interface FlowKindMeta<TData extends FlowNodeData = FlowNodeData> {
	component: ComponentType<NodeProps<any>>;
	createData: (bookingToolIds: string[]) => TData;
	createFallbackData?: (bookingToolIds: string[]) => TData;
	sourceHandles: (data: TData) => Set<string>;
	edgeLabel: (data: TData, sourceHandle: string | undefined) => string | undefined;
}

/** Per-kind canvas metadata, projected from the registry. */
export const FLOW_KIND_META = Object.fromEntries(
	FLOW_KIND_LIST.map((entry) => [
		entry.kind,
		{
			component: entry.canvasNode,
			createData: entry.newData,
			createFallbackData: entry.fallbackData,
			sourceHandles: entry.sourceHandles,
			edgeLabel: entry.edgeLabel,
		} satisfies FlowKindMeta,
	]),
) as Record<FlowNodeKind, FlowKindMeta>;

export { isFlowNodeKind } from "./kinds";
export { FLOW_KINDS };
