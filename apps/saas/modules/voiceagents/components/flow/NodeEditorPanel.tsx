"use client";

import { cn } from "@repo/ui";
import { Button } from "@repo/ui/components/button";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@repo/ui/components/sheet";
import { Trash2Icon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { AgentExitsPanel, AgentSettingsPanel, AgentToolsPanel } from "./editors/agent";
import type { FlowToolOption } from "./editors/shared";
import type { AgentNodeData, FlowNodeData, FlowNodeKind } from "./flow-types";
import { FLOW_KINDS } from "./kinds";
import type { FlowKindSubPanel } from "./kinds";
import { createFlowMentionExtension, type MentionItem } from "./mentions";

export type { FlowToolOption } from "./editors/shared";

type AgentSubPanel = "settings" | "tools" | "exits";

/**
 * The agent node's mini icon-rail sub-panels (settings / tools / exits) — defined
 * on the agent registry entry. The per-kind sheet header copy lives on each
 * entry's `sheetMeta`; this panel reads both from the registry.
 */
const SUB_PANEL_META = FLOW_KINDS.agent.subPanels as Record<AgentSubPanel, FlowKindSubPanel>;

/**
 * Right-side sheet for editing one flow node. Agent nodes get a CloseBot-style
 * layout: the prompt fills the panel, while tools/exits/settings open as a
 * narrow secondary aside from a mini icon rail on the panel's edge. Branch
 * nodes (True/False, Switch) keep a simple single-column condition editor.
 */
export function NodeEditorPanel({
	agentId,
	nodeId,
	nodeType,
	data,
	isEntry,
	tools,
	bookingToolIds,
	variableItems,
	onChange,
	onDelete,
	onClose,
}: {
	agentId: string;
	nodeId: string | null;
	nodeType: FlowNodeKind | null;
	data: FlowNodeData | null;
	isEntry: boolean;
	tools: FlowToolOption[];
	/** CRM live check_availability / book_appointment tool ids ([] when no CRM). */
	bookingToolIds: string[];
	variableItems: MentionItem[];
	onChange: (nodeId: string, data: FlowNodeData) => void;
	onDelete: (nodeId: string) => void;
	onClose: () => void;
}) {
	// Refs keep the mention extension stable while its suggestion sources stay live.
	const dataRef = useRef(data);
	dataRef.current = data;
	const toolsRef = useRef(tools);
	toolsRef.current = tools;
	const variablesRef = useRef(variableItems);
	variablesRef.current = variableItems;
	const nodeIdRef = useRef(nodeId);
	nodeIdRef.current = nodeId;
	const onChangeRef = useRef(onChange);
	onChangeRef.current = onChange;

	const [subPanel, setSubPanel] = useState<AgentSubPanel | null>(null);
	// Selecting a different node resets the secondary aside.
	// eslint-disable-next-line react-hooks/exhaustive-deps
	useEffect(() => setSubPanel(null), [nodeId]);

	// Enabling a booking tool (via the Tools panel or a @@chip) opens the
	// settings aside so the calendar picker is right there.
	const toolIds = Array.isArray((data as AgentNodeData | null)?.toolIds)
		? (data as AgentNodeData).toolIds
		: [];
	const toolIdsKey = toolIds.join(",");
	const prevToolIdsRef = useRef<{ nodeId: string | null; ids: string[] }>({
		nodeId: null,
		ids: [],
	});
	useEffect(() => {
		const prev = prevToolIdsRef.current;
		if (prev.nodeId === nodeId) {
			const added = toolIds.filter((id) => !prev.ids.includes(id));
			if (added.some((id) => bookingToolIds.includes(id))) {
				setSubPanel("settings");
			}
		}
		prevToolIdsRef.current = { nodeId, ids: toolIds };
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [nodeId, toolIdsKey, bookingToolIds]);

	const mentionExtension = useMemo(
		() =>
			createFlowMentionExtension({
				getVariables: () => variablesRef.current,
				getTools: () =>
					toolsRef.current.map((tool) => ({
						id: tool.name,
						label: tool.name,
						sub: tool.description,
					})),
				getExits: () => {
					const current = dataRef.current;
					const exits = current && Array.isArray(current.exits) ? (current as AgentNodeData).exits : [];
					return exits
						.filter((exit) => exit.name.trim())
						.map((exit) => ({ id: exit.name, label: exit.name, sub: exit.description }));
				},
				onToolInserted: (toolName) => {
					const current = dataRef.current;
					const currentNodeId = nodeIdRef.current;
					const tool = toolsRef.current.find((t) => t.name === toolName);
					if (
						!current ||
						!Array.isArray(current.toolIds) ||
						!currentNodeId ||
						!tool ||
						(current.toolIds as string[]).includes(tool.id)
					) {
						return;
					}
					onChangeRef.current(currentNodeId, {
						...(current as AgentNodeData),
						toolIds: [...(current.toolIds as string[]), tool.id],
					});
				},
			}),
		[],
	);

	if (!nodeId || !nodeType || !data) {
		return null;
	}

	const isAgent = nodeType === "agent";
	// Editor bodies come straight from the node-kind registry: the agent's editor
	// is the prompt column (rendered inside the split layout below); every other
	// kind's editor is a single-column body.
	const AgentEditor = FLOW_KINDS.agent.editor;
	const NodeEditor = FLOW_KINDS[nodeType].editor;

	const footer = (
		<div className="mt-2 flex justify-between border-t pt-4">
			<Button type="button" variant="destructive" size="sm" onClick={() => onDelete(nodeId)}>
				<Trash2Icon className="size-4" /> Delete node
			</Button>
			<Button type="button" variant="outline" size="sm" onClick={onClose}>
				Done
			</Button>
		</div>
	);

	return (
		<Sheet open onOpenChange={(open) => !open && onClose()}>
			<SheetContent
				// The shared sheet concatenates classes without tailwind-merge, so its
				// default p-6/gap-4/max-w-sm would race ours — force the row layout
				// with important modifiers and pin the width inline.
				className={cn(
					isAgent
						? "flex w-full flex-row !gap-0 overflow-hidden !p-0 transition-[max-width] duration-200"
						: "flex w-full flex-col gap-5 overflow-y-auto",
				)}
				style={{ maxWidth: isAgent ? (subPanel ? 940 : 576) : 576 }}
				onPointerDownOutside={(event) => {
					if ((event.target as HTMLElement | null)?.closest?.("[data-mention-dropdown]")) {
						event.preventDefault();
					}
				}}
				onInteractOutside={(event) => {
					if ((event.target as HTMLElement | null)?.closest?.("[data-mention-dropdown]")) {
						event.preventDefault();
					}
				}}
			>
				{isAgent ? (
					<>
						{/* Mini icon rail — the panel's edge, CloseBot style. */}
						<div className="flex w-12 shrink-0 flex-col items-center border-r bg-muted/40 pt-14">
							{(Object.keys(SUB_PANEL_META) as AgentSubPanel[]).map((key, index) => {
								const meta = SUB_PANEL_META[key];
								const Icon = meta.icon;
								return (
									<div key={key} className="flex w-full flex-col items-center">
										{index > 0 && <div className="h-px w-6 bg-border" />}
										<button
											type="button"
											title={meta.title}
											aria-label={meta.title}
											aria-pressed={subPanel === key}
											onClick={() => setSubPanel((current) => (current === key ? null : key))}
											className={cn(
												"flex w-full items-center justify-center p-2.5 transition-colors",
												subPanel === key
													? "bg-background text-primary"
													: "text-muted-foreground hover:bg-muted hover:text-foreground",
											)}
										>
											<Icon className="size-5" />
										</button>
									</div>
								);
							})}
						</div>

						{/* Secondary aside — one concern at a time. */}
						{subPanel && (
							<div className="flex w-80 shrink-0 flex-col overflow-hidden border-r">
								<div className="shrink-0 border-b px-4 pt-5 pb-3">
									<h3 className="font-semibold text-base">{SUB_PANEL_META[subPanel].title}</h3>
									<p className="mt-0.5 line-clamp-2 text-muted-foreground text-xs">
										{SUB_PANEL_META[subPanel].description}
									</p>
								</div>
								<div className="min-h-0 flex-1 overflow-y-auto p-4">
									{subPanel === "settings" && (
										<AgentSettingsPanel
											agentId={agentId}
											nodeId={nodeId}
											data={data as AgentNodeData}
											bookingToolIds={bookingToolIds}
											onChange={onChange}
										/>
									)}
									{subPanel === "tools" && (
										<AgentToolsPanel
											nodeId={nodeId}
											data={data as AgentNodeData}
											tools={tools}
											onChange={onChange}
										/>
									)}
									{subPanel === "exits" && (
										<AgentExitsPanel
											nodeId={nodeId}
											data={data as AgentNodeData}
											onChange={onChange}
										/>
									)}
								</div>
							</div>
						)}

						{/* Main column — the prompt is the focus. The agent prompt editor
						    is the agent registry entry's `editor` (it consumes the mention
						    extension; every other kind ignores it). */}
						<div className="flex min-w-0 flex-1 flex-col gap-5 overflow-y-auto p-5">
							<SheetHeader className="p-0">
								<SheetTitle>{FLOW_KINDS.agent.sheetMeta.title}</SheetTitle>
								<SheetDescription>{FLOW_KINDS.agent.sheetMeta.description}</SheetDescription>
							</SheetHeader>
							<AgentEditor
								agentId={agentId}
								nodeId={nodeId}
								data={data}
								isEntry={isEntry}
								mentionExtension={mentionExtension}
								onChange={onChange}
							/>
							{footer}
						</div>
					</>
				) : (
					<>
						<SheetHeader>
							<SheetTitle>{FLOW_KINDS[nodeType].sheetMeta.title}</SheetTitle>
							<SheetDescription>{FLOW_KINDS[nodeType].sheetMeta.description}</SheetDescription>
						</SheetHeader>
						{/* Every non-agent kind's editor is a single-column body dispatched
						    straight from the registry. */}
						<NodeEditor
							agentId={agentId}
							nodeId={nodeId}
							data={data}
							isEntry={isEntry}
							onChange={onChange}
						/>
						{footer}
					</>
				)}
			</SheetContent>
		</Sheet>
	);
}
