"use client";

import "@xyflow/react/dist/style.css";
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
import { PlusIcon, SaveIcon } from "lucide-react";
import { useTheme } from "next-themes";
import { type DragEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { FlowTrace } from "../../hooks/use-flow-trace";
import { AgentFlowNode, type AgentRFNode } from "./AgentFlowNode";
import {
	makeId,
	newAgentNodeData,
	newAggressionScenarioData,
	newBookingNodeData,
	newScenarioNodeData,
	newStatementNodeData,
	newSwitchNodeData,
	newTrueFalseNodeData,
} from "./compile";
import type {
	AgentNodeData,
	CanvasDoc,
	FlowNodeData,
	FlowNodeKind,
	FlowPaletteKind,
	ScenarioNodeData,
	StatementNodeData,
	SwitchNodeData,
	TrueFalseNodeData,
} from "./flow-types";
import {
	FALSE_HANDLE_ID,
	FLOW_NODE_DRAG_TYPE,
	FLOW_PALETTE_KINDS,
	OTHERWISE_HANDLE_ID,
	SCENARIO_JUMP_HANDLE_ID,
	START_NODE_ID,
	STATEMENT_NEXT_HANDLE_ID,
	TRUE_HANDLE_ID,
} from "./flow-types";
import type { MentionItem } from "./mentions";
import { NodeEditorPanel, type FlowToolOption } from "./NodeEditorPanel";
import { ScenarioNode, type ScenarioRFNode } from "./ScenarioNode";
import { StartNode, type StartRFNode } from "./StartNode";
import { StatementNode, type StatementRFNode } from "./StatementNode";
import { SwitchNode, type SwitchRFNode } from "./SwitchNode";
import { TrueFalseNode, type TrueFalseRFNode } from "./TrueFalseNode";

type CanvasRFNode =
	| AgentRFNode
	| StartRFNode
	| TrueFalseRFNode
	| SwitchRFNode
	| StatementRFNode
	| ScenarioRFNode;

const NODE_TYPES = {
	start: StartNode,
	agent: AgentFlowNode,
	truefalse: TrueFalseNode,
	switch: SwitchNode,
	statement: StatementNode,
	scenario: ScenarioNode,
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
 * case updates the wire immediately (Start → entry stays unlabeled).
 */
function edgeLabelFor(edge: Edge, nodes: CanvasRFNode[]): string | undefined {
	const source = nodes.find((node) => node.id === edge.source);
	if (!source || source.type === "start") {
		return undefined;
	}
	if (source.type === "truefalse") {
		return edge.sourceHandle === TRUE_HANDLE_ID ? "True" : "False";
	}
	if (source.type === "switch") {
		if (edge.sourceHandle === OTHERWISE_HANDLE_ID) {
			return "Otherwise";
		}
		return source.data.cases
			.find((switchCase) => switchCase.id === edge.sourceHandle)
			?.name.trim() || undefined;
	}
	// Scenario edges carry the scenario title (the jump's "why").
	if (source.type === "scenario") {
		return source.data.title.trim() || undefined;
	}
	// Statement nodes just continue — their single Next edge stays unlabeled.
	if (source.type === "statement") {
		return undefined;
	}
	return (
		source.data.exits.find((exit) => exit.id === edge.sourceHandle)?.name.trim() || undefined
	);
}

/** Palette entry → the canvas node kind + fresh data it drops (presets pre-fill data). */
function newPaletteNode(
	kind: FlowPaletteKind,
	bookingToolIds: string[],
): { type: FlowNodeKind; data: FlowNodeData } {
	switch (kind) {
		case "truefalse":
			return { type: "truefalse", data: newTrueFalseNodeData() };
		case "switch":
			return { type: "switch", data: newSwitchNodeData() };
		case "statement":
			return { type: "statement", data: newStatementNodeData() };
		case "scenario":
			return { type: "scenario", data: newScenarioNodeData() };
		case "scenario_aggression":
			return { type: "scenario", data: newAggressionScenarioData() };
		case "booking":
			return { type: "agent", data: newBookingNodeData(bookingToolIds) };
		default:
			return { type: "agent", data: newAgentNodeData("New agent") };
	}
}

/** Source handles a node's edges may legally use after a data update. */
function validSourceHandles(node: CanvasRFNode): Set<string> {
	if (node.type === "agent") {
		return new Set(node.data.exits.map((exit) => exit.id));
	}
	if (node.type === "truefalse") {
		return new Set([TRUE_HANDLE_ID, FALSE_HANDLE_ID]);
	}
	if (node.type === "switch") {
		const handles = new Set(node.data.cases.map((switchCase) => switchCase.id));
		if (node.data.includeOtherwise) {
			handles.add(OTHERWISE_HANDLE_ID);
		}
		return handles;
	}
	if (node.type === "statement") {
		return new Set([STATEMENT_NEXT_HANDLE_ID]);
	}
	if (node.type === "scenario") {
		return new Set([SCENARIO_JUMP_HANDLE_ID]);
	}
	return new Set();
}

function docToNodes(doc: CanvasDoc): CanvasRFNode[] {
	return doc.nodes.map((node): CanvasRFNode => {
		switch (node.type) {
			case "start":
				return {
					id: node.id,
					type: "start",
					position: node.position,
					data: {},
					deletable: false,
				} satisfies StartRFNode;
			case "truefalse":
				return {
					id: node.id,
					type: "truefalse",
					position: node.position,
					data: node.data ?? newTrueFalseNodeData(),
				} satisfies TrueFalseRFNode;
			case "switch":
				return {
					id: node.id,
					type: "switch",
					position: node.position,
					data: node.data ?? newSwitchNodeData(),
				} satisfies SwitchRFNode;
			case "statement":
				return {
					id: node.id,
					type: "statement",
					position: node.position,
					data: node.data ?? newStatementNodeData(),
				} satisfies StatementRFNode;
			case "scenario":
				return {
					id: node.id,
					type: "scenario",
					position: node.position,
					data: node.data ?? newScenarioNodeData(),
				} satisfies ScenarioRFNode;
			default:
				return {
					id: node.id,
					type: "agent",
					position: node.position,
					data: node.data ?? newAgentNodeData("Untitled agent"),
				} satisfies AgentRFNode;
		}
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
	isSaving: boolean;
	onSave: (doc: CanvasDoc) => void;
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
	isSaving,
	onSave,
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
	isSaving: boolean;
	onSave: (doc: CanvasDoc) => void;
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
			nodes: nodes.map((node) => {
				switch (node.type) {
					case "start":
						return { id: node.id, type: "start" as const, position: node.position };
					case "truefalse":
						return {
							id: node.id,
							type: "truefalse" as const,
							position: node.position,
							data: node.data as TrueFalseNodeData,
						};
					case "switch":
						return {
							id: node.id,
							type: "switch" as const,
							position: node.position,
							data: node.data as SwitchNodeData,
						};
					case "statement":
						return {
							id: node.id,
							type: "statement" as const,
							position: node.position,
							data: node.data as StatementNodeData,
						};
					case "scenario":
						return {
							id: node.id,
							type: "scenario" as const,
							position: node.position,
							data: node.data as ScenarioNodeData,
						};
					default:
						return {
							id: node.id,
							type: "agent" as const,
							position: node.position,
							data: node.data as AgentNodeData,
						};
				}
			}),
			edges: edges.map((edge) => ({
				id: edge.id,
				source: edge.source,
				sourceHandle: edge.sourceHandle ?? undefined,
				target: edge.target,
			})),
			viewport: getViewport(),
		};
		onSave(doc);
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
				<Panel position="top-left" className="gap-2 flex">
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={onOpenActions ?? (() => addNode("agent"))}
					>
						<PlusIcon className="size-4" /> Add node
					</Button>
					<Button type="button" size="sm" loading={isSaving} onClick={handleSave}>
						<SaveIcon className="size-4" /> Save flow
					</Button>
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
