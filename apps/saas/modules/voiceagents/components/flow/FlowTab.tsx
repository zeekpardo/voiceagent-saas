"use client";

import type { GatewayAgent } from "@repo/api/modules/voiceagents/lib/schema";
import { Skeleton } from "@repo/ui/components/skeleton";
import { toastError, toastSuccess } from "@repo/ui/components/toast";
import { useMemo } from "react";

import type { FlowTrace } from "../../hooks/use-flow-trace";
import { useAgentLiveToolsQuery, useSaveFlowMutation, useToolsQuery } from "../../lib/api";
import {
	canvasFromFlow,
	compileCanvas,
	extractVariableNames,
	newCanvas,
	validateFlowDoc,
} from "./compile";
import { type CanvasDoc, engineFlowSchema, type FlowPaletteKind } from "./flow-types";
import { FlowCanvas } from "./FlowCanvas";
import { canvasDocSchema } from "./kinds";
import { buildVariableItems } from "./mentions";
import type { FlowToolOption } from "./NodeEditorPanel";

/**
 * The Flow tab: a CloseBot-style canvas that compiles into the engine's
 * flow config on save. The full builder state lives at config.canvas.
 */
export function FlowTab({
	agent,
	onAddNodeReady,
	onOpenActions,
	trace,
	traceLive,
}: {
	agent: GatewayAgent;
	/** Hands the canvas' addNode(kind) callback up so the Actions aside can use it. */
	onAddNodeReady?: (addNode: ((kind: FlowPaletteKind) => void) | null) => void;
	/** Opens the Actions aside from the canvas' "Add node" button. */
	onOpenActions?: () => void;
	/** Live test-call trace: nodes/edges to glow on the canvas. */
	trace?: FlowTrace;
	/** Whether the traced call is still live (false dims the remaining trace). */
	traceLive?: boolean;
}) {
	const config = agent.config as Record<string, unknown>;
	const { data: gatewayTools, isLoading: isLoadingTools } = useToolsQuery();
	const { data: liveTools } = useAgentLiveToolsQuery(agent.id);
	const saveMutation = useSaveFlowMutation(agent.id);

	// Restore the saved canvas; else reconstruct from an existing flow; else start fresh.
	const initialDoc = useMemo<CanvasDoc>(() => {
		const savedCanvas = canvasDocSchema.safeParse(config.canvas);
		if (savedCanvas.success) {
			return savedCanvas.data;
		}
		const savedFlow = engineFlowSchema.safeParse(config.flow);
		if (savedFlow.success) {
			return canvasFromFlow({
				entry: savedFlow.data.entry,
				nodes: savedFlow.data.nodes.map((node) => ({
					...node,
					toolIds: node.toolIds ?? [],
					exits: node.exits ?? [],
				})),
				scenarios: savedFlow.data.scenarios,
			});
		}
		return newCanvas();
		// Rebuild only when switching agents — not on every version bump,
		// so saving doesn't reset the canvas under the user.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [agent.id]);

	const tools = useMemo<FlowToolOption[]>(() => {
		const merged = new Map<string, FlowToolOption>();
		for (const tool of gatewayTools ?? []) {
			merged.set(tool.id, { id: tool.id, name: tool.name, description: tool.description });
		}
		for (const tool of liveTools?.tools ?? []) {
			merged.set(tool.id, { id: tool.id, name: tool.name, description: tool.description });
		}
		return [...merged.values()];
	}, [gatewayTools, liveTools]);

	// The Booking palette preset pre-attaches the CRM calendar live tools.
	// [] when no CRM is connected — the node still works, tools come later.
	const bookingToolIds = useMemo(
		() =>
			(liveTools?.tools ?? [])
				.filter((tool) => tool.name === "check_availability" || tool.name === "book_appointment")
				.map((tool) => tool.id),
		[liveTools],
	);

	const variableItems = useMemo(
		() =>
			buildVariableItems(
				extractVariableNames(
					typeof config.instructions === "string" ? config.instructions : undefined,
					typeof config.greeting === "string" ? config.greeting : undefined,
				),
			),
		[config.instructions, config.greeting],
	);

	const handleSave = async (doc: CanvasDoc) => {
		const errors = validateFlowDoc(doc);
		if (errors.length > 0) {
			toastError(errors.join("\n"));
			return;
		}
		const baseToolIds = Array.isArray(config.toolIds) ? (config.toolIds as string[]) : [];
		const { flow, toolIds } = compileCanvas(doc, baseToolIds);
		try {
			const saved = await saveMutation.mutateAsync({ flow, canvas: doc, toolIds });
			toastSuccess(`Flow saved — agent is now v${saved.version}`);
		} catch (err) {
			toastError(err instanceof Error ? err.message : "Could not save the flow");
		}
	};

	if (isLoadingTools) {
		return <Skeleton className="min-h-96 h-full" />;
	}

	return (
		<FlowCanvas
			key={agent.id}
			agentId={agent.id}
			initialDoc={initialDoc}
			tools={tools}
			bookingToolIds={bookingToolIds}
			variableItems={variableItems}
			isSaving={saveMutation.isPending}
			onSave={(doc) => void handleSave(doc)}
			onAddNodeReady={onAddNodeReady}
			onOpenActions={onOpenActions}
			trace={trace}
			traceLive={traceLive}
		/>
	);
}
