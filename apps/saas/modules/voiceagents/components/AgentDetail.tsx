"use client";

import { cn } from "@repo/ui";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import { Skeleton } from "@repo/ui/components/skeleton";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@repo/ui/components/tooltip";
import {
	ArrowLeftIcon,
	BookOpenIcon,
	CirclePlusIcon,
	CodeIcon,
	DatabaseIcon,
	HistoryIcon,
	type LucideIcon,
	SettingsIcon,
	SlidersHorizontalIcon,
	SparklesIcon,
	VariableIcon,
	WrenchIcon,
	XIcon,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useRef, useState } from "react";

import { useFlowTrace } from "../hooks/use-flow-trace";
import { useAgentDraftQuery, useAgentQuery } from "../lib/api";
import { AgentForm } from "./AgentForm";
import { AgentSourcesTab } from "./AgentSourcesTab";
import { ActionsPanel } from "./flow/ActionsPanel";
import type { FlowPaletteKind } from "./flow/flow-types";
import { FlowTab } from "./flow/FlowTab";
import { relativeTime } from "./inbox/helpers";
import { AttachedPersonaProvider } from "./personas/persona-flow-context";
import { PersonaBadge } from "./personas/PersonaBadge";
import { PersonasPanel } from "./personas/PersonasPanel";
import { TestPortal } from "./TestPortal";
import { ToolsTab } from "./ToolsTab";
import { VariablesPanel } from "./VariablesPanel";
import { VersionHistoryPanel } from "./VersionHistoryPanel";
import { WidgetPanel } from "./widget/WidgetPanel";

type WorkspacePanel =
	| "actions"
	| "job"
	| "agent"
	| "preferences"
	| "personas"
	| "variables"
	| "tools"
	| "sources"
	| "widget"
	| "history";

const PANEL_META: Record<WorkspacePanel, { title: string; description: string }> = {
	actions: {
		title: "Actions",
		description: "Actions available to build your agent job.",
	},
	job: {
		title: "Job information",
		description: "What the agent says and follows — shared by every stage.",
	},
	agent: {
		title: "Agent settings",
		description: "Model, voice, and timing.",
	},
	preferences: {
		title: "Preferences",
		description: "What happens after the call in your CRM, plus word rules.",
	},
	personas: {
		title: "Personas",
		description: "Attach a reusable identity — name, look, and tone — to this agent.",
	},
	variables: {
		title: "Job Flow Variables",
		description: "Custom variables for each source usable by this job.",
	},
	tools: {
		title: "Tools",
		description: "Webhook tools this agent can call mid-conversation.",
	},
	sources: {
		title: "Sources",
		description: "Attach CRM sub-accounts and map extracted call data onto their contacts.",
	},
	widget: {
		title: "Website Widget",
		description: "Embed this agent on any website.",
	},
	history: {
		title: "Version history",
		description: "Published versions of this agent — restore any snapshot onto the canvas.",
	},
};

/**
 * CloseBot-style full-screen builder workspace: a compact header, the flow
 * canvas as the main surface, a right icon rail whose asides slide out over
 * the canvas, and a floating test portal pinned bottom-left.
 */
export function AgentDetail({ agentId }: { agentId: string }) {
	const { data: agent, isLoading } = useAgentQuery(agentId);
	const { data: draft } = useAgentDraftQuery(agentId);
	const [activePanel, setActivePanel] = useState<WorkspacePanel | null>(null);

	// The canvas registers its addNode(kind) here so the Actions aside can call it.
	const addNodeRef = useRef<((kind: FlowPaletteKind) => void) | null>(null);
	const handleAddNodeReady = useCallback((addNode: ((kind: FlowPaletteKind) => void) | null) => {
		addNodeRef.current = addNode;
	}, []);
	const openActions = useCallback(() => setActivePanel("actions"), []);

	// Live flow tracing: the test portal reports its call id + live status,
	// useFlowTrace polls that call's events and the canvas glows along the path.
	const [callState, setCallState] = useState<{ callId: string | null; live: boolean }>({
		callId: null,
		live: false,
	});
	const trace = useFlowTrace(callState.callId, callState.live);

	if (isLoading) {
		return <Skeleton className="h-[70vh]" />;
	}
	if (!agent) {
		return <p className="opacity-60">Agent not found.</p>;
	}

	const togglePanel = (panel: WorkspacePanel) =>
		setActivePanel((current) => (current === panel ? null : panel));

	return (
		// data-fullbleed lifts the app shell's container max-width (AppWrapper
		// opt-out) and the negative margins escape its padding, so the canvas
		// fills the whole main area edge to edge at every screen size.
		<div
			data-fullbleed
			className="-mx-6 -my-6 md:h-[calc(100dvh-1rem-2px)] flex h-[calc(100dvh-8rem)] min-h-[520px] flex-col"
		>
			<div className="h-12 gap-3 px-4 flex shrink-0 items-center border-b">
				<Link
					href="/voice-agents"
					aria-label="Back to voice agents"
					className="opacity-60 hover:opacity-100"
				>
					<ArrowLeftIcon className="size-5" />
				</Link>
				<h1 className="font-medium text-lg truncate">{agent.name}</h1>
				<TooltipProvider delayDuration={150}>
					<Tooltip>
						<TooltipTrigger asChild>
							<div className="gap-1.5 flex cursor-default items-center">
								<Badge status="info">v{agent.version}</Badge>
								<span className="gap-1 font-medium text-emerald-500 flex items-center text-[11px]">
									<span className="size-1.5 animate-pulse bg-emerald-500 rounded-full" />
									Live
								</span>
							</div>
						</TooltipTrigger>
						<TooltipContent side="bottom" className="max-w-64">
							<p>
								v{agent.version} is live — every new call uses it. Publishing takes effect on the
								next call (no deploy).
							</p>
							{agent.updated_at && (
								<p className="mt-1 opacity-70">Published {relativeTime(agent.updated_at)} ago</p>
							)}
						</TooltipContent>
					</Tooltip>
					{draft && (
						<Tooltip>
							<TooltipTrigger asChild>
								<Badge status="warning" className="cursor-default">
									Unpublished changes
								</Badge>
							</TooltipTrigger>
							<TooltipContent side="bottom" className="max-w-64">
								<p>
									You have draft changes on the canvas that aren't live yet. v{agent.version} keeps
									serving every call until you publish.
								</p>
							</TooltipContent>
						</Tooltip>
					)}
				</TooltipProvider>
				<PersonaBadge agent={agent} onClick={() => setActivePanel("personas")} />
			</div>

			<div className="min-h-0 relative flex-1 overflow-hidden">
				<AttachedPersonaProvider agent={agent}>
					<FlowTab
						agent={agent}
						onAddNodeReady={handleAddNodeReady}
						onOpenActions={openActions}
						trace={trace}
						traceLive={callState.live}
					/>
				</AttachedPersonaProvider>

				{activePanel && (
					<aside className="slide-in-from-right-4 inset-y-0 right-12 animate-in shadow-xl absolute z-20 flex w-[440px] max-w-[calc(100%-3rem)] flex-col border-l bg-card duration-200">
						<div className="px-5 pt-5 pb-4 shrink-0 border-b">
							<div className="gap-3 flex items-start justify-between">
								<h2 className="font-medium text-lg">{PANEL_META[activePanel].title}</h2>
								<Button
									type="button"
									variant="ghost"
									size="icon"
									className="-mt-1 -mr-2 size-7"
									aria-label="Close panel"
									onClick={() => setActivePanel(null)}
								>
									<XIcon className="size-4" />
								</Button>
							</div>
							<p className="mt-0.5 text-sm text-muted-foreground">
								{PANEL_META[activePanel].description}
							</p>
						</div>
						<div className="min-h-0 p-5 flex-1 overflow-y-auto">
							{activePanel === "actions" && (
								<ActionsPanel onAdd={(kind) => addNodeRef.current?.(kind)} />
							)}
							{activePanel === "job" && <AgentForm agent={agent} variant="job" />}
							{activePanel === "agent" && <AgentForm agent={agent} variant="settings" />}
							{activePanel === "preferences" && <AgentForm agent={agent} variant="preferences" />}
							{activePanel === "personas" && <PersonasPanel agent={agent} />}
							{activePanel === "variables" && <VariablesPanel agent={agent} />}
							{activePanel === "tools" && (
								<ToolsTab agentId={agent.id} agentConfig={agent.config} />
							)}
							{activePanel === "sources" && (
								<AgentSourcesTab agentId={agent.id} agentConfig={agent.config} />
							)}
							{activePanel === "widget" && <WidgetPanel agentId={agent.id} />}
							{activePanel === "history" && (
								<VersionHistoryPanel agentId={agent.id} currentVersion={agent.version} />
							)}
						</div>
					</aside>
				)}

				<TooltipProvider delayDuration={150}>
					<div className="inset-y-3 right-0 w-12 gap-1 py-3 absolute z-30 flex flex-col items-center rounded-l-lg border border-r-0 bg-card shadow-[-6px_0_16px_-10px_rgb(0_0_0/0.35)]">
						<RailButton
							icon={CirclePlusIcon}
							label="Actions"
							isActive={activePanel === "actions"}
							onClick={() => togglePanel("actions")}
						/>
						<div className="my-1 w-6 h-px bg-border" />
						<RailButton
							icon={BookOpenIcon}
							label="Job information"
							isActive={activePanel === "job"}
							onClick={() => togglePanel("job")}
						/>
						<div className="my-1 w-6 h-px bg-border" />
						<RailButton
							icon={SettingsIcon}
							label="Agent settings"
							isActive={activePanel === "agent"}
							onClick={() => togglePanel("agent")}
						/>
						<div className="my-1 w-6 h-px bg-border" />
						<RailButton
							icon={SlidersHorizontalIcon}
							label="Preferences"
							isActive={activePanel === "preferences"}
							onClick={() => togglePanel("preferences")}
						/>
						<div className="my-1 w-6 h-px bg-border" />
						<RailButton
							icon={SparklesIcon}
							label="Personas"
							isActive={activePanel === "personas"}
							onClick={() => togglePanel("personas")}
						/>
						<div className="my-1 w-6 h-px bg-border" />
						<RailButton
							icon={VariableIcon}
							label="Job Flow Variables"
							isActive={activePanel === "variables"}
							onClick={() => togglePanel("variables")}
						/>
						<div className="my-1 w-6 h-px bg-border" />
						<RailButton
							icon={WrenchIcon}
							label="Tools"
							isActive={activePanel === "tools"}
							onClick={() => togglePanel("tools")}
						/>
						<div className="my-1 w-6 h-px bg-border" />
						<RailButton
							icon={DatabaseIcon}
							label="Sources"
							isActive={activePanel === "sources"}
							onClick={() => togglePanel("sources")}
						/>
						<div className="my-1 w-6 h-px bg-border" />
						<RailButton
							icon={CodeIcon}
							label="Website Widget"
							isActive={activePanel === "widget"}
							onClick={() => togglePanel("widget")}
						/>
						<div className="my-1 w-6 h-px bg-border" />
						<RailButton
							icon={HistoryIcon}
							label="Version history"
							isActive={activePanel === "history"}
							onClick={() => togglePanel("history")}
						/>
					</div>
				</TooltipProvider>

				<TestPortal
					agentId={agent.id}
					agentConfig={agent.config}
					publishedVersion={agent.version}
					hasUnpublishedDraft={!!draft}
					onCallStateChange={setCallState}
				/>
			</div>
		</div>
	);
}

function RailButton({
	icon: Icon,
	label,
	isActive,
	onClick,
}: {
	icon: LucideIcon;
	label: string;
	isActive: boolean;
	onClick: () => void;
}) {
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<button
					type="button"
					aria-label={label}
					aria-pressed={isActive}
					onClick={onClick}
					className={cn(
						"size-9 flex items-center justify-center rounded-lg transition-colors",
						isActive
							? "bg-primary/10 text-primary"
							: "text-muted-foreground hover:bg-accent hover:text-foreground",
					)}
				>
					<Icon className="size-5" />
				</button>
			</TooltipTrigger>
			<TooltipContent side="left">{label}</TooltipContent>
		</Tooltip>
	);
}
