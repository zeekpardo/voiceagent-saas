"use client";

import { readCustomVariableDefs } from "@repo/api/modules/voiceagents/lib/custom-variables";
import type { GatewayAgent } from "@repo/api/modules/voiceagents/lib/schema";
import { Skeleton } from "@repo/ui/components/skeleton";
import { toastError, toastSuccess, toastWarning } from "@repo/ui/components/toast";
import { useConfirmationAlert } from "@shared/components/ConfirmationAlertProvider";
import { useContactFieldsQuery } from "@voiceagents/lib/contact-fields-api";
import { agentPersonaId } from "@voiceagents/lib/personas-api";
import { useMemo, useState } from "react";

import type { FlowTrace } from "../../hooks/use-flow-trace";
import {
	useAgentDraftQuery,
	useAgentLiveToolsQuery,
	useDiscardDraftMutation,
	usePublishAgentMutation,
	useSaveDraftMutation,
	useToolsQuery,
} from "../../lib/api";
import {
	canvasFromFlow,
	channelPruneWarnings,
	collapseManagedObjectives,
	compileCanvas,
	ensureGreeter,
	extractVariableNames,
	flowSoundnessWarnings,
	newCanvas,
	validateFlowDoc,
} from "./compile";
import { type CanvasDoc, engineFlowSchema, type FlowPaletteKind } from "./flow-types";
import { FlowCanvas } from "./FlowCanvas";
import { canvasDocSchema } from "./kinds";
import { buildVariableItems } from "./mentions";
import type { FlowToolOption } from "./NodeEditorPanel";

/**
 * The Flow tab: a CloseBot-style canvas that stages edits as a DRAFT and only
 * writes a new agent version on publish. On open it loads the staged draft
 * canvas if the gateway holds one (badge visible), else the published canvas.
 * The full builder state lives at config.canvas / draft.config.canvas.
 */
export function FlowTab({
	agent,
	onAddNodeReady,
	onOpenActions,
	onOpenPersonas,
	trace,
	traceLive,
}: {
	agent: GatewayAgent;
	/** Hands the canvas' addNode(kind) callback up so the Actions aside can use it. */
	onAddNodeReady?: (addNode: ((kind: FlowPaletteKind) => void) | null) => void;
	/** Opens the Actions aside from the canvas' "Add node" button. */
	onOpenActions?: () => void;
	/** Opens the Personas aside — used to guide the user when publish is blocked
	 *  because no persona is attached (Persona v2: a persona is required). */
	onOpenPersonas?: () => void;
	/** Live test-call trace: nodes/edges to glow on the canvas. */
	trace?: FlowTrace;
	/** Whether the traced call is still live (false dims the remaining trace). */
	traceLive?: boolean;
}) {
	const config = agent.config as Record<string, unknown>;
	const { confirm } = useConfirmationAlert();
	const { data: gatewayTools, isLoading: isLoadingTools } = useToolsQuery();
	const { data: liveTools } = useAgentLiveToolsQuery(agent.id);
	const { data: draft, isLoading: isLoadingDraft } = useAgentDraftQuery(agent.id);
	const saveDraftMutation = useSaveDraftMutation(agent.id);
	const publishMutation = usePublishAgentMutation(agent.id);
	const discardMutation = useDiscardDraftMutation(agent.id);

	const hasDraft = !!draft;
	// Bumped on discard to force the canvas to rebuild from the published config
	// (discard leaves the agent version untouched, so the key wouldn't change).
	const [canvasNonce, setCanvasNonce] = useState(0);

	// Restore the staged draft canvas; else the published canvas; else
	// reconstruct from an existing flow; else start fresh. Read at mount time —
	// the render is gated on the draft query below so `draft` is settled here.
	const initialDoc = useMemo<CanvasDoc>(() => {
		// The Greeter fixture owns config.greeting on the canvas. Legacy canvases
		// (Start → entry, no greeter) are migrated on load, carrying the config's
		// current greeting into a freshly inserted Greeter.
		const draftConfig = draft?.config as Record<string, unknown> | undefined;
		const publishedGreeting = typeof config.greeting === "string" ? config.greeting : "";
		const draftGreeting =
			typeof draftConfig?.greeting === "string" ? draftConfig.greeting : publishedGreeting;
		// The AI-generate toggle for the greeting rides on config.greetingGenerate
		// (draft overlay wins). Default false = verbatim, so existing agents unchanged.
		const publishedGreetingGenerate = config.greetingGenerate === true;
		const draftGreetingGenerate =
			typeof draftConfig?.greetingGenerate === "boolean"
				? draftConfig.greetingGenerate
				: publishedGreetingGenerate;

		const draftCanvas = draftConfig?.canvas;
		const savedDraftCanvas = canvasDocSchema.safeParse(draftCanvas);
		if (savedDraftCanvas.success) {
			return ensureGreeter(
				collapseManagedObjectives(savedDraftCanvas.data),
				draftGreeting,
				draftGreetingGenerate,
			);
		}
		const savedCanvas = canvasDocSchema.safeParse(config.canvas);
		if (savedCanvas.success) {
			return ensureGreeter(
				collapseManagedObjectives(savedCanvas.data),
				publishedGreeting,
				publishedGreetingGenerate,
			);
		}
		const savedFlow = engineFlowSchema.safeParse(config.flow);
		if (savedFlow.success) {
			return canvasFromFlow(
				{
					entry: savedFlow.data.entry,
					nodes: savedFlow.data.nodes.map((node) => ({
						...node,
						toolIds: node.toolIds ?? [],
						exits: node.exits ?? [],
					})),
					scenarios: savedFlow.data.scenarios,
				},
				publishedGreeting,
				publishedGreetingGenerate,
			);
		}
		return newCanvas();
		// Rebuild only when switching agents, when a publish/restore bumps the
		// version, or when discard bumps the nonce — NOT on every draft refetch,
		// so saving a draft doesn't reset the canvas under the user.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [agent.id, agent.version, canvasNonce]);

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

	const { data: contactFields } = useContactFieldsQuery(agent.id);
	const customVariables = useMemo(() => readCustomVariableDefs(config), [config]);
	const variableItems = useMemo(
		() =>
			buildVariableItems(
				extractVariableNames(
					typeof config.instructions === "string" ? config.instructions : undefined,
					typeof config.greeting === "string" ? config.greeting : undefined,
				),
				contactFields?.fields ?? [],
				customVariables,
			),
		[config.instructions, config.greeting, contactFields, customVariables],
	);

	const handleSaveDraft = async (doc: CanvasDoc) => {
		const errors = validateFlowDoc(doc);
		if (errors.length > 0) {
			toastError(errors.join("\n"));
			return;
		}
		const baseToolIds = Array.isArray(config.toolIds) ? (config.toolIds as string[]) : [];
		const { flow, toolIds, greeting, greetingGenerate } = compileCanvas(doc, baseToolIds);
		// Non-blocking soundness warnings. Two families:
		//  - channelPruneWarnings: the text-pruned flow would be unsound (e.g. the
		//    entry node is voice-only, so text sessions have nowhere to start).
		//  - flowSoundnessWarnings: e.g. a warm transfer reachable only via an
		//    automatic transition, which the engine degrades to a blind cold REFER.
		// The draft still saves — the author just needs to fix the flagged path.
		const warnings = [...flowSoundnessWarnings(doc), ...channelPruneWarnings(flow, "text")];
		try {
			await saveDraftMutation.mutateAsync({
				flow,
				canvas: doc,
				toolIds,
				greeting,
				greetingGenerate,
			});
			if (warnings.length > 0) {
				toastWarning("Saved — needs attention", warnings.join("\n"));
			} else {
				toastSuccess("Draft saved");
			}
		} catch (err) {
			toastError(err instanceof Error ? err.message : "Could not save the draft");
		}
	};

	const handlePublish = async () => {
		// Persona v2: a persona is required to publish. It defines the agent's
		// identity, tone, and guardrails, so we block publishing without one and
		// point the user straight at the Personas panel to attach or create one.
		if (!agentPersonaId(agent)) {
			toastError(
				"Attach a persona to publish",
				"A persona defines this agent's identity, tone, and guardrails. Open the Personas panel to attach or create one.",
			);
			onOpenPersonas?.();
			return;
		}
		try {
			const published = await publishMutation.mutateAsync();
			toastSuccess(`Published — agent is now v${published.version}`);
		} catch (err) {
			toastError(err instanceof Error ? err.message : "Could not publish the agent");
		}
	};

	const handleDiscard = () => {
		confirm({
			title: "Discard draft?",
			message:
				"This reverts the canvas to the published version and deletes your unpublished changes.",
			destructive: true,
			confirmLabel: "Discard",
			onConfirm: async () => {
				try {
					await discardMutation.mutateAsync();
					setCanvasNonce((nonce) => nonce + 1);
					toastSuccess("Draft discarded");
				} catch (err) {
					toastError(err instanceof Error ? err.message : "Could not discard the draft");
				}
			},
		});
	};

	if (isLoadingTools || isLoadingDraft) {
		return <Skeleton className="min-h-96 h-full" />;
	}

	return (
		<FlowCanvas
			key={`${agent.id}:${agent.version}:${canvasNonce}`}
			agentId={agent.id}
			initialDoc={initialDoc}
			tools={tools}
			bookingToolIds={bookingToolIds}
			variableItems={variableItems}
			hasDraft={hasDraft}
			isSavingDraft={saveDraftMutation.isPending}
			isPublishing={publishMutation.isPending}
			onSaveDraft={(doc) => void handleSaveDraft(doc)}
			onPublish={() => void handlePublish()}
			onDiscard={handleDiscard}
			onAddNodeReady={onAddNodeReady}
			onOpenActions={onOpenActions}
			trace={trace}
			traceLive={traceLive}
		/>
	);
}
