"use client";

import "@xyflow/react/dist/style.css";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import {
	Background,
	type Connection,
	Controls,
	type Edge,
	MarkerType,
	MiniMap,
	type NodeMouseHandler,
	Panel,
	ReactFlow,
	ReactFlowProvider,
	useEdgesState,
	useNodesState,
	useReactFlow,
} from "@xyflow/react";
import { PlusIcon, RocketIcon, SaveIcon, Trash2Icon } from "lucide-react";
import { useTheme } from "next-themes";
import { type DragEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { FlowTrace } from "../../hooks/use-flow-trace";
import type { AgentRFNode } from "./AgentFlowNode";
import type { BookingRFNode } from "./BookingNode";
import { makeId, newAggressionScenarioData } from "./compile";
import type { ConversationRFNode } from "./ConversationNode";
import type { CanvasDoc, CanvasNodeDoc, FlowNodeData, FlowPaletteKind } from "./flow-types";
import { FLOW_NODE_DRAG_TYPE, FLOW_PALETTE_KINDS, START_NODE_ID } from "./flow-types";
import { FLOW_KIND_META, isFlowNodeKind } from "./kind-meta";
import type { MentionItem } from "./mentions";
import type { ModifyTagsRFNode } from "./ModifyTagsNode";
import { NodeEditorPanel, type FlowToolOption } from "./NodeEditorPanel";
import type { ObjectiveRFNode } from "./ObjectiveNode";
import type { ScenarioRFNode } from "./ScenarioNode";
import type { SetFieldRFNode } from "./SetFieldNode";
import { StartNode, type StartRFNode } from "./StartNode";
import type { StatementRFNode } from "./StatementNode";
import type { SwitchRFNode } from "./SwitchNode";
import type { TransferRFNode } from "./TransferNode";
import type { TrueFalseRFNode } from "./TrueFalseNode";

type CanvasRFNode =
	| AgentRFNode
	| ObjectiveRFNode
	| ConversationRFNode
	| SetFieldRFNode
	| ModifyTagsRFNode
	| BookingRFNode
	| StartRFNode
	| TrueFalseRFNode
	| SwitchRFNode
	| StatementRFNode
	| ScenarioRFNode
	| TransferRFNode;

/** React Flow's nodeTypes map, derived from the per-kind metadata table (+ the fixed Start node). */
const NODE_TYPES = {
	start: StartNode,
	...Object.fromEntries(
		Object.entries(FLOW_KIND_META).map(([kind, meta]) => [kind, meta.component]),
	),
};

const DEFAULT_EDGE_OPTIONS = {
	markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18 },
	style: { strokeWidth: 1.5 },
};

/**
 * Live-trace edge treatment (violet — same family as the node card gradients).
 * Live edges get the full color + drop-shadow glow; a finished call keeps the
 * path visible but dimmed until the next call starts.
 */
const TRACE_EDGE_STYLE = {
	live: {
		stroke: "#8b5cf6",
		strokeWidth: 2.5,
		filter: "drop-shadow(0 0 3px rgba(139,92,246,0.55))",
	},
	ended: {
		stroke: "rgba(139,92,246,0.5)",
		strokeWidth: 2.5,
		filter: "drop-shadow(0 0 2px rgba(139,92,246,0.3))",
	},
};

const TRACE_EDGE_MARKER = {
	type: MarkerType.ArrowClosed,
	width: 18,
	height: 18,
	color: "#8b5cf6",
};

/** Exit-name pill rendered on the edge (CloseBot-style edge labels). */
const EDGE_LABEL_PROPS = {
	labelStyle: { fontSize: 11, fill: "var(--foreground)" },
	labelBgStyle: { fill: "var(--background)", stroke: "var(--border)", strokeWidth: 1 },
	labelBgPadding: [4, 2] as [number, number],
	labelBgBorderRadius: 4,
};

/**
 * Exit names live on the edges, not in the compact node cards. Labels are
 * derived from the source node's data at render time so renaming an exit /
 * case updates the wire immediately (Start → entry stays unlabeled). Kind
 * lookup + label derivation both come from the FLOW_KIND_META table.
 */
function edgeLabelFor(edge: Edge, nodes: CanvasRFNode[]): string | undefined {
	const source = nodes.find((node) => node.id === edge.source);
	if (!source || !isFlowNodeKind(source.type)) {
		return undefined;
	}
	return FLOW_KIND_META[source.type].edgeLabel(
		source.data as never,
		edge.sourceHandle ?? undefined,
	);
}

/** Palette entry → the canvas node kind + fresh data it drops (presets pre-fill data). */
function newPaletteNode(
	kind: FlowPaletteKind,
	bookingToolIds: string[],
): { type: keyof typeof FLOW_KIND_META; data: FlowNodeData } {
	// "scenario_aggression" is a preset on top of the scenario kind, not a kind of its own.
	if (kind === "scenario_aggression") {
		return { type: "scenario", data: newAggressionScenarioData() };
	}
	const nodeKind = isFlowNodeKind(kind) ? kind : "agent";
	return { type: nodeKind, data: FLOW_KIND_META[nodeKind].createData(bookingToolIds) };
}

/** Source handles a node's edges may legally use after a data update. */
function validSourceHandles(node: CanvasRFNode): Set<string> {
	if (!isFlowNodeKind(node.type)) {
		return new Set();
	}
	return FLOW_KIND_META[node.type].sourceHandles(node.data as never);
}

function docToNodes(doc: CanvasDoc): CanvasRFNode[] {
	return doc.nodes.map((node): CanvasRFNode => {
		if (node.type === "start") {
			return {
				id: node.id,
				type: "start",
				position: node.position,
				data: {},
				deletable: false,
			} satisfies StartRFNode;
		}
		const kind = isFlowNodeKind(node.type) ? node.type : "agent";
		const meta = FLOW_KIND_META[kind];
		return {
			id: node.id,
			type: kind,
			position: node.position,
			data: node.data ?? (meta.createFallbackData ?? meta.createData)([]),
		} as CanvasRFNode;
	});
}

function docToEdges(doc: CanvasDoc): Edge[] {
	return doc.edges.map((edge) => ({
		id: edge.id,
		source: edge.source,
		sourceHandle: edge.sourceHandle,
		target: edge.target,
		...DEFAULT_EDGE_OPTIONS,
	}));
}

export function FlowCanvas(props: {
	agentId: string;
	initialDoc: CanvasDoc;
	tools: FlowToolOption[];
	/** CRM live check_availability / book_appointment tool ids for the Booking preset ([] when no CRM). */
	bookingToolIds: string[];
	variableItems: MentionItem[];
	hasDraft: boolean;
	isSavingDraft: boolean;
	isPublishing: boolean;
	onSaveDraft: (doc: CanvasDoc) => void;
	onPublish: () => void;
	onDiscard: () => void;
	/** Hands the canvas' addNode(kind) callback up so the Actions aside can use it. */
	onAddNodeReady?: (addNode: ((kind: FlowPaletteKind) => void) | null) => void;
	/** Opens the Actions aside (the repurposed "Add node" button). */
	onOpenActions?: () => void;
	/** Live test-call trace: canvas node ids match engine flow node ids. */
	trace?: FlowTrace;
	/** Whether the traced call is still live (false dims the remaining trace). */
	traceLive?: boolean;
}) {
	return (
		<ReactFlowProvider>
			<FlowCanvasInner {...props} />
		</ReactFlowProvider>
	);
}

function FlowCanvasInner({
	agentId,
	initialDoc,
	tools,
	bookingToolIds,
	variableItems,
	hasDraft,
	isSavingDraft,
	isPublishing,
	onSaveDraft,
	onPublish,
	onDiscard,
	onAddNodeReady,
	onOpenActions,
	trace,
	traceLive,
}: {
	agentId: string;
	initialDoc: CanvasDoc;
	tools: FlowToolOption[];
	bookingToolIds: string[];
	variableItems: MentionItem[];
	hasDraft: boolean;
	isSavingDraft: boolean;
	isPublishing: boolean;
	onSaveDraft: (doc: CanvasDoc) => void;
	onPublish: () => void;
	onDiscard: () => void;
	onAddNodeReady?: (addNode: ((kind: FlowPaletteKind) => void) | null) => void;
	onOpenActions?: () => void;
	trace?: FlowTrace;
	traceLive?: boolean;
}) {
	const { resolvedTheme } = useTheme();
	const { getViewport, screenToFlowPosition } = useReactFlow();
	const wrapperRef = useRef<HTMLDivElement>(null);

	const [nodes, setNodes, onNodesChange] = useNodesState<CanvasRFNode>(docToNodes(initialDoc));
	const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(docToEdges(initialDoc));
	const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

	/** One edge per source handle: reconnecting an exit (or Start) replaces the old edge. */
	const onConnect = useCallback(
		(connection: Connection) => {
			setEdges((prev) => [
				...prev.filter(
					(edge) =>
						!(
							edge.source === connection.source &&
							(edge.sourceHandle ?? null) === (connection.sourceHandle ?? null)
						),
				),
				{
					id: makeId("edge"),
					source: connection.source,
					sourceHandle: connection.sourceHandle ?? undefined,
					target: connection.target,
					...DEFAULT_EDGE_OPTIONS,
				},
			]);
		},
		[setEdges],
	);

	const onNodeClick = useCallback<NodeMouseHandler<CanvasRFNode>>((_event, node) => {
		if (node.type !== "start") {
			setSelectedNodeId(node.id);
		}
	}, []);

	const updateNodeData = useCallback(
		(nodeId: string, data: FlowNodeData) => {
			const target = nodes.find((node) => node.id === nodeId);
			if (!target) {
				return;
			}
			const updated = { ...target, data } as CanvasRFNode;
			setNodes((prev) => prev.map((node) => (node.id === nodeId ? updated : node)));
			// Removing an exit / case (or the Otherwise path) removes its edges.
			const validHandles = validSourceHandles(updated);
			setEdges((prev) =>
				prev.filter((edge) => edge.source !== nodeId || validHandles.has(edge.sourceHandle ?? "")),
			);
		},
		[nodes, setNodes, setEdges],
	);

	const deleteNode = useCallback(
		(nodeId: string) => {
			setNodes((prev) => prev.filter((node) => node.id !== nodeId));
			setEdges((prev) => prev.filter((edge) => edge.source !== nodeId && edge.target !== nodeId));
			setSelectedNodeId(null);
		},
		[setNodes, setEdges],
	);

	const addNodeAt = useCallback(
		(kind: FlowPaletteKind, position: { x: number; y: number }) => {
			const palette = newPaletteNode(kind, bookingToolIds);
			const node = {
				id: makeId("node"),
				type: palette.type,
				position,
				data: palette.data,
			} as CanvasRFNode;
			setNodes((prev) => [...prev, node]);
			setSelectedNodeId(node.id);
		},
		[setNodes, bookingToolIds],
	);

	const addNode = useCallback(
		(kind: FlowPaletteKind) => {
			const bounds = wrapperRef.current?.getBoundingClientRect();
			const position = bounds
				? screenToFlowPosition({
						x: bounds.left + bounds.width / 2 + Math.random() * 60 - 30,
						y: bounds.top + bounds.height / 3 + Math.random() * 60 - 30,
					})
				: { x: 300, y: 120 };
			addNodeAt(kind, position);
		},
		[screenToFlowPosition, addNodeAt],
	);

	// Expose addNode to the workspace (right-rail Actions aside).
	useEffect(() => {
		onAddNodeReady?.(addNode);
		return () => onAddNodeReady?.(null);
	}, [addNode, onAddNodeReady]);

	/** Drag-from-palette → drop-on-canvas (standard React Flow pattern). */
	const onDragOver = useCallback((event: DragEvent) => {
		if (event.dataTransfer.types.includes(FLOW_NODE_DRAG_TYPE)) {
			event.preventDefault();
			event.dataTransfer.dropEffect = "move";
		}
	}, []);

	const onDrop = useCallback(
		(event: DragEvent) => {
			const kind = event.dataTransfer.getData(FLOW_NODE_DRAG_TYPE);
			if (!(FLOW_PALETTE_KINDS as readonly string[]).includes(kind)) {
				return;
			}
			event.preventDefault();
			addNodeAt(
				kind as FlowPaletteKind,
				screenToFlowPosition({ x: event.clientX, y: event.clientY }),
			);
		},
		[screenToFlowPosition, addNodeAt],
	);

	const handleSave = () => {
		const doc: CanvasDoc = {
			version: 1,
			// Every kind saves the same shape ({id, type, position, data}); the
			// FLOW_KIND_META table only decides the fallback kind for a rogue type.
			nodes: nodes.map((node): CanvasNodeDoc => {
				if (node.type === "start") {
					return { id: node.id, type: "start", position: node.position };
				}
				const kind = isFlowNodeKind(node.type) ? node.type : "agent";
				return {
					id: node.id,
					type: kind,
					position: node.position,
					data: node.data,
				} as CanvasNodeDoc;
			}),
			edges: edges.map((edge) => ({
				id: edge.id,
				source: edge.source,
				sourceHandle: edge.sourceHandle ?? undefined,
				target: edge.target,
			})),
			viewport: getViewport(),
		};
		onSaveDraft(doc);
	};

	const selectedNode = nodes.find(
		(node): node is Exclude<CanvasRFNode, StartRFNode> =>
			node.id === selectedNodeId && node.type !== "start",
	);
	const startEdge = edges.find((edge) => edge.source === START_NODE_ID);

	// Display-only: the live-call trace is injected into node data at render
	// time (never into the stored state, so saving stays trace-free).
	const displayNodes = useMemo(() => {
		if (!trace || trace.visitedNodeIds.length === 0) {
			return nodes;
		}
		return nodes.map((node) => {
			const traceState =
				node.id === trace.currentNodeId
					? ("current" as const)
					: trace.visitedNodeIds.includes(node.id)
						? ("visited" as const)
						: undefined;
			if (!traceState) {
				return node;
			}
			return {
				...node,
				data: { ...node.data, traceState, traceDimmed: !traceLive },
			} as CanvasRFNode;
		});
	}, [nodes, trace, traceLive]);

	// Display-only: exit names as edge-label pills (derived from node data) and
	// the live-call trace glow on taken edges. The engine only reports node
	// pairs, so when several edges share a source→target all of them light up;
	// the Start → entry hop is inferred from the first visited node.
	const displayEdges = useMemo(() => {
		const takenPairs = new Set(
			(trace?.takenEdges ?? []).map((taken) => `${taken.source} ${taken.target}`),
		);
		const entryNodeId = trace?.visitedNodeIds[0];
		return edges.map((edge) => {
			const label = edgeLabelFor(edge, nodes);
			const labeled = label ? { ...edge, label, ...EDGE_LABEL_PROPS } : edge;
			const isTaken =
				takenPairs.has(`${edge.source} ${edge.target}`) ||
				(edge.source === START_NODE_ID && !!entryNodeId && edge.target === entryNodeId);
			if (!isTaken) {
				return labeled;
			}
			return {
				...labeled,
				// Marching dashes only on the edge into the currently-active node.
				animated: !!traceLive && edge.target === trace?.currentNodeId,
				markerEnd: TRACE_EDGE_MARKER,
				style: {
					...labeled.style,
					...(traceLive ? TRACE_EDGE_STYLE.live : TRACE_EDGE_STYLE.ended),
				},
			};
		});
	}, [edges, nodes, trace, traceLive]);

	return (
		<div ref={wrapperRef} className="h-full w-full" onDragOver={onDragOver} onDrop={onDrop}>
			<ReactFlow
				nodes={displayNodes}
				edges={displayEdges}
				nodeTypes={NODE_TYPES}
				onNodesChange={onNodesChange}
				onEdgesChange={onEdgesChange}
				onConnect={onConnect}
				onNodeClick={onNodeClick}
				defaultEdgeOptions={DEFAULT_EDGE_OPTIONS}
				defaultViewport={initialDoc.viewport}
				fitView={!initialDoc.viewport}
				colorMode={resolvedTheme === "dark" ? "dark" : "light"}
				proOptions={{ hideAttribution: true }}
			>
				<Background gap={20} />
				{/* Lifted above the floating test portal pinned bottom-left. */}
				<Controls className="!mb-20" />
				{/* Pulled clear of the right icon rail. */}
				<MiniMap pannable zoomable className="!mr-16 !bg-background" />
				<Panel position="top-left" className="gap-2 flex items-center">
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={onOpenActions ?? (() => addNode("agent"))}
					>
						<PlusIcon className="size-4" /> Add node
					</Button>
					<Button
						type="button"
						variant="outline"
						size="sm"
						loading={isSavingDraft}
						onClick={handleSave}
					>
						<SaveIcon className="size-4" /> Save draft
					</Button>
					<Button
						type="button"
						size="sm"
						loading={isPublishing}
						disabled={!hasDraft}
						onClick={onPublish}
					>
						<RocketIcon className="size-4" /> Publish
					</Button>
					{hasDraft && (
						<>
							<Button type="button" variant="ghost" size="sm" onClick={onDiscard}>
								<Trash2Icon className="size-4" /> Discard draft
							</Button>
							<Badge status="warning">Unpublished changes</Badge>
						</>
					)}
				</Panel>
			</ReactFlow>

			<NodeEditorPanel
				agentId={agentId}
				nodeId={selectedNode?.id ?? null}
				nodeType={selectedNode?.type ?? null}
				data={selectedNode?.data ?? null}
				isEntry={!!selectedNode && startEdge?.target === selectedNode.id}
				tools={tools}
				bookingToolIds={bookingToolIds}
				variableItems={variableItems}
				onChange={updateNodeData}
				onDelete={deleteNode}
				onClose={() => setSelectedNodeId(null)}
			/>
		</div>
	);
}
