import type { AnyExtension } from "@tiptap/core";
import type { NodeProps } from "@xyflow/react";
import type { LucideIcon } from "lucide-react";
import type { ComponentType } from "react";
import type { z } from "zod";

import type {
	CanvasDoc,
	CanvasEdgeDoc,
	CanvasNodeDoc,
	EngineFlowNode,
	EngineFlowScenario,
	FlowNodeData,
	FlowNodeKind,
} from "../flow-types";

/**
 * Props every per-kind editor receives. Individual editors pick the subset they
 * need (branch editors ignore `agentId`/`isEntry`; only the agent editor reads
 * `mentionExtension`). This is the single editor contract the registry wires
 * into NodeEditorPanel.
 */
export interface FlowNodeEditorProps {
	agentId: string;
	nodeId: string;
	data: FlowNodeData;
	isEntry: boolean;
	onChange: (nodeId: string, data: FlowNodeData) => void;
	/** Only the agent prompt editor consumes this (mention chips for @/@@/@@@). */
	mentionExtension?: AnyExtension;
}

export type FlowNodeEditorComponent = ComponentType<FlowNodeEditorProps>;

/** Context the compiler threads into each kind's `compile`. */
export interface FlowCompileCtx {
	/** The entry node id — some kinds omit entryInstructions when they are the entry. */
	entry: string;
	/** Resolve the target of a given source handle (undefined = unwired → ends there). */
	targetOf: (nodeId: string, handleId: string) => string | undefined;
}

/**
 * A kind's compile output. Most kinds emit an engine flow node; scenario nodes
 * emit a global scenario instead (they live in flow.scenarios, not flow.nodes).
 */
export interface FlowCompileResult {
	node?: EngineFlowNode;
	scenario?: EngineFlowScenario;
}

export interface FlowDecompileResult {
	node: CanvasNodeDoc;
	edges: CanvasEdgeDoc[];
}

/** Agent-only: the mini icon-rail sub-panels (settings / tools / exits). */
export interface FlowKindSubPanel {
	title: string;
	description: string;
	icon: LucideIcon;
}

/**
 * The full registry entry for one editable node kind — the single wiring point
 * consumed by FlowCanvas (canvas rendering, palette data, edge labels),
 * NodeEditorPanel (editor dispatch + sheet copy), the compiler (compile loop),
 * the validator (per-kind checks) and the canvas zod schema (schema).
 *
 * Adding a node kind = add one file under kinds/ exporting one of these +
 * register it in kinds/index.ts.
 */
export interface FlowKindDefinition<TData extends FlowNodeData = FlowNodeData> {
	kind: FlowNodeKind;
	/** Zod schema for this kind's `data` — the canvas doc union is built from these. */
	schema: z.ZodTypeAny;
	/** React Flow node renderer registered under this kind. */
	canvasNode: ComponentType<NodeProps<any>>;
	/** Single-column editor body rendered inside the node editor sheet. */
	editor: FlowNodeEditorComponent;
	/** Sheet header copy for this kind. */
	sheetMeta: { title: string; description: string };
	/** Agent-only secondary aside definitions (keyed, insertion-ordered). */
	subPanels?: Record<string, FlowKindSubPanel>;
	/** Fresh data for a palette-dropped node of this kind. */
	newData: (bookingToolIds: string[]) => TData;
	/**
	 * Data used to repair a persisted doc node whose `data` is missing. Defaults
	 * to `newData([])` when omitted (only agent/booking diverge).
	 */
	fallbackData?: (bookingToolIds: string[]) => TData;
	/** Source handles this node's edges may legally use after a data update. */
	sourceHandles: (data: TData) => Set<string>;
	/** Edge label derived from the source node's data + the edge's sourceHandle. */
	edgeLabel: (data: TData, sourceHandle: string | undefined) => string | undefined;
	/** Canvas node → engine payload (node or scenario). */
	compile: (node: any, ctx: FlowCompileCtx) => FlowCompileResult;
	/** Engine node → canvas node (best-effort reconstruction). Omitted where the
	 * engine→canvas mapping is not 1:1 (routers, scenarios — handled in compile/index). */
	decompile?: (flowNode: EngineFlowNode, position: { x: number; y: number }) => FlowDecompileResult;
	/** Human-readable problems that block saving for this kind's nodes. */
	validate?: (node: any, doc: CanvasDoc) => string[];
}

/** Identity helper that pins each kind file's `TData` at its definition site. */
export function defineKind<TData extends FlowNodeData>(
	def: FlowKindDefinition<TData>,
): FlowKindDefinition<TData> {
	return def;
}
