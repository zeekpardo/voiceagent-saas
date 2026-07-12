"use client";

import { cn } from "@repo/ui";
import { Handle, Position, useEdges, useReactFlow } from "@xyflow/react";
import {
	type LucideIcon,
	MessageSquareTextIcon,
	MicIcon,
	PhoneOffIcon,
	Trash2Icon,
} from "lucide-react";
import { Fragment, type ReactNode } from "react";

import type { FlowChannel } from "./flow-types";
import { normalizeChannels } from "./flow-types";

export interface ShellSourceHandle {
	id: string;
	name: string;
}

/** Render-only live-trace overlay state FlowCanvas injects into node data. */
export type NodeTraceState = "current" | "visited";

/**
 * Reads the trace overlay fields FlowCanvas injects into node data during a
 * test call (they ride on the data index signature, never persisted).
 */
export function nodeTraceProps(data: Record<string, unknown>): {
	traceState?: NodeTraceState;
	traceDimmed?: boolean;
} {
	const state = data.traceState;
	return {
		traceState: state === "current" || state === "visited" ? state : undefined,
		traceDimmed: data.traceDimmed === true,
	};
}

/**
 * Violet glow classes per trace state (violet-500 #8b5cf6 — same family as the
 * card gradients, alpha-based so it reads in light and dark mode). The pulse
 * lives on this dedicated layer so the card itself never flickers; a finished
 * call keeps a dimmed, steady glow until the next call starts.
 */
const TRACE_GLOW_CLASS: Record<NodeTraceState, { live: string; dimmed: string }> = {
	current: {
		live: "animate-pulse shadow-[0_0_18px_4px_rgba(139,92,246,0.6)]",
		dimmed: "shadow-[0_0_14px_3px_rgba(139,92,246,0.3)]",
	},
	visited: {
		live: "shadow-[0_0_10px_1px_rgba(139,92,246,0.35)]",
		dimmed: "shadow-[0_0_10px_1px_rgba(139,92,246,0.18)]",
	},
};

/**
 * CloseBot-style compact flow node: a small square gradient-bordered card with
 * a centered circular icon, the node name floated underneath, source-handle
 * dots evenly spread down the right edge (exit names live on the edge labels)
 * and a phone-off glyph beside any unwired handle (= the call ends there).
 */
export function FlowNodeShell({
	id,
	selected,
	title,
	fallbackTitle,
	icon: Icon,
	borderClassName,
	tileClassName,
	handleClassName,
	targetHandleClassName,
	sourceHandles,
	badge,
	traceState,
	traceDimmed,
	shape = "square",
	hasTargetHandle = true,
	unwiredEndsCall = true,
	deletable = true,
	channels,
}: {
	id: string;
	selected?: boolean;
	title: string;
	fallbackTitle: string;
	icon: LucideIcon;
	/** Gradient wrapper classes (the 1px border treatment). */
	borderClassName: string;
	/** Circular icon tile background classes. */
	tileClassName: string;
	/** Source-handle dot color classes. */
	handleClassName: string;
	targetHandleClassName: string;
	sourceHandles: ShellSourceHandle[];
	/** Optional tiny corner badge (e.g. gated-tools indicator). */
	badge?: ReactNode;
	/** Live-trace overlay: the call is on ("current") or has passed ("visited") this node. */
	traceState?: NodeTraceState;
	/** The traced call ended — keep the glow but dim it. */
	traceDimmed?: boolean;
	/** "round" renders a smaller circular card (scenario nodes) instead of the square stage card. */
	shape?: "square" | "round";
	/** Scenario nodes have no target handle — nothing flows into them. */
	hasTargetHandle?: boolean;
	/** Whether an unwired source handle means the call ends there (phone-off glyph). */
	unwiredEndsCall?: boolean;
	/** Fixtures (Greeter) can't be removed — hide the hover delete affordance. */
	deletable?: boolean;
	/** Channels this node runs on; a single-channel mark renders a corner chip. */
	channels?: FlowChannel[];
}) {
	const edges = useEdges();
	const channelChip = normalizeChannels(channels);
	const { deleteElements } = useReactFlow();
	const connectedHandles = new Set(
		edges.filter((edge) => edge.source === id).map((edge) => edge.sourceHandle),
	);
	const handleTop = (index: number) => ((index + 1) / (sourceHandles.length + 1)) * 100;
	const isRound = shape === "round";

	return (
		<div className="group relative">
			{/* Trace glow layer — pulses independently so the card itself stays steady. */}
			{traceState && (
				<span
					aria-hidden
					className={cn(
						"inset-0 pointer-events-none absolute",
						isRound ? "rounded-full" : "rounded-lg",
						TRACE_GLOW_CLASS[traceState][traceDimmed ? "dimmed" : "live"],
					)}
				/>
			)}
			{deletable && (
				<button
					type="button"
					title="Delete node"
					aria-label="Delete node"
					onClick={(event) => {
						event.stopPropagation();
						void deleteElements({ nodes: [{ id }] });
					}}
					className="-top-7 nodrag right-0 size-6 shadow-sm absolute flex items-center justify-center rounded-md border bg-background text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-destructive"
				>
					<Trash2Icon className="size-3.5" />
				</button>
			)}

			<div
				className={cn(
					"shadow-sm p-px transition-shadow",
					isRound ? "rounded-full" : "rounded-lg",
					borderClassName,
					// Violet ring for the live-active node; an explicit selection wins.
					traceState === "current" && "ring-violet-500 ring-2",
					selected && "ring-2 ring-primary",
				)}
			>
				<div
					className={cn(
						"bg-card",
						isRound ? "p-2 rounded-full" : "p-3 rounded-[calc(var(--radius)-1px)]",
					)}
				>
					<span
						className={cn(
							"size-10 p-2 text-white flex items-center justify-center rounded-full",
							tileClassName,
						)}
					>
						<Icon className="size-5" />
					</span>
				</div>
			</div>

			<div className="mt-2 max-w-48 absolute top-full left-1/2 w-max -translate-x-1/2">
				<p className="font-semibold text-sm truncate text-center whitespace-nowrap text-muted-foreground">
					{title || fallbackTitle}
				</p>
			</div>

			{badge}

			{channelChip && channelChip.length === 1 && (
				<span
					title={
						channelChip[0] === "voice"
							? "Voice only — skipped on SMS/text sessions"
							: "Text only — skipped on voice calls"
					}
					className="-top-2 -left-2 gap-0.5 px-1 shadow-sm font-medium absolute flex items-center rounded-full border bg-background py-px text-[10px] text-muted-foreground"
				>
					{channelChip[0] === "voice" ? (
						<MicIcon className="size-2.5" aria-hidden />
					) : (
						<MessageSquareTextIcon className="size-2.5" aria-hidden />
					)}
					{channelChip[0] === "voice" ? "Voice" : "Text"}
				</span>
			)}

			{hasTargetHandle && (
				<Handle
					type="target"
					position={Position.Left}
					className={cn("!size-2.5 !border-2 !border-background", targetHandleClassName)}
				/>
			)}

			{sourceHandles.length === 0
				? unwiredEndsCall && (
						<span
							title="Ends the call"
							className="-right-5 absolute top-1/2 -translate-y-1/2 text-muted-foreground"
						>
							<PhoneOffIcon className="size-3" aria-label="Ends the call" />
						</span>
					)
				: sourceHandles.map((sourceHandle, index) => (
						<Fragment key={sourceHandle.id}>
							<Handle
								type="source"
								id={sourceHandle.id}
								position={Position.Right}
								title={sourceHandle.name || "exit"}
								style={{ top: `${handleTop(index)}%` }}
								className={cn("!size-2.5 !border-2 !border-background", handleClassName)}
							/>
							{unwiredEndsCall && !connectedHandles.has(sourceHandle.id) && (
								<span
									title="Ends the call"
									className="-right-5 absolute text-muted-foreground"
									style={{ top: `${handleTop(index)}%`, transform: "translateY(-50%)" }}
								>
									<PhoneOffIcon className="size-3" aria-label="Ends the call" />
								</span>
							)}
						</Fragment>
					))}
		</div>
	);
}
