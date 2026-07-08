"use client";

import { BarVisualizer, RoomContext, useVoiceAssistant } from "@livekit/components-react";
import { cn } from "@repo/ui";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@repo/ui/components/select";
import type { Room } from "livekit-client";
import {
	ChevronDownIcon,
	ChevronRightIcon,
	FlaskConicalIcon,
	MicIcon,
	PhoneOffIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { useAgentSourcesQuery } from "@sources/lib/api";

import {
	extractVariableNames,
	type TestStatus,
	useVoiceTestSession,
} from "../hooks/use-voice-test-session";

const STATUS_BADGE: Record<TestStatus, "info" | "success" | "warning" | "error"> = {
	idle: "info",
	connecting: "warning",
	listening: "success",
	thinking: "warning",
	speaking: "info",
	ended: "info",
	error: "error",
};

/** Static heights for the idle (not-connected) visualizer bars, in %. */
const IDLE_BAR_HEIGHTS = [30, 55, 75, 55, 30];

/**
 * CloseBot-style floating test portal pinned over the canvas. Collapsed it is
 * a small "Test" pill; expanded it becomes a full voice-test panel. The
 * LiveKit session lives in `useVoiceTestSession`, and the audio container div
 * below stays mounted either way, so a running call survives collapsing the
 * portal, panning the canvas or opening asides.
 */
export function TestPortal({
	agentId,
	agentConfig,
	onCallStateChange,
}: {
	agentId: string;
	agentConfig?: Record<string, unknown>;
	/** Surfaces the live call id + status upward (drives the canvas flow trace). */
	onCallStateChange?: (state: { callId: string | null; live: boolean }) => void;
}) {
	const [isExpanded, setIsExpanded] = useState(false);
	const [showSetup, setShowSetup] = useState(false);
	const [variables, setVariables] = useState<Record<string, string>>({});
	const [sourceId, setSourceId] = useState("");
	const [crmContactId, setCrmContactId] = useState("");
	const [contactPhone, setContactPhone] = useState("");
	const transcriptRef = useRef<HTMLDivElement>(null);
	const { status, turns, error, room, isLive, callId, start, stop, audioContainerRef } =
		useVoiceTestSession(agentId);
	const { data: attachedSources } = useAgentSourcesQuery(agentId);
	const variableNames = extractVariableNames(agentConfig);
	const isBusy = isLive || status === "connecting";

	useEffect(() => {
		onCallStateChange?.({ callId, live: isLive });
	}, [callId, isLive, onCallStateChange]);

	useEffect(() => {
		transcriptRef.current?.scrollTo({
			top: transcriptRef.current.scrollHeight,
			behavior: "smooth",
		});
	}, [turns]);

	return (
		<div className="bottom-4 left-4 absolute z-30">
			{isExpanded ? (
				<div className="shadow-lg flex max-h-[70vh] w-[380px] max-w-[calc(100vw-6rem)] flex-col overflow-hidden rounded-xl border bg-card">
					<div className="gap-2 px-4 py-3 flex shrink-0 items-center border-b">
						<FlaskConicalIcon className="size-4 text-primary" />
						<span className="font-medium text-sm">Test agent</span>
						<Badge status={STATUS_BADGE[status]}>{status}</Badge>
						<Button
							type="button"
							variant="ghost"
							size="icon"
							className="size-7 ml-auto"
							aria-label="Collapse test portal"
							onClick={() => setIsExpanded(false)}
						>
							<ChevronDownIcon className="size-4" />
						</Button>
					</div>

					<div className="min-h-0 gap-3 p-4 flex flex-1 flex-col overflow-y-auto">
						<div>
							<button
								type="button"
								className="gap-1 text-xs flex items-center text-muted-foreground hover:text-foreground"
								onClick={() => setShowSetup((prev) => !prev)}
							>
								<ChevronRightIcon
									className={cn("size-3.5 transition-transform", showSetup && "rotate-90")}
								/>
								Call setup — variables & CRM contact
							</button>
							{showSetup && (
								<div className="mt-2 gap-2 flex flex-col">
									{!!attachedSources?.length && (
										<div className="gap-2 flex items-center">
											<span className="w-28 font-mono text-xs shrink-0 truncate opacity-70">
												source
											</span>
											<Select value={sourceId} onValueChange={setSourceId} disabled={isBusy}>
												<SelectTrigger className="h-8 flex-1 text-sm">
													<SelectValue placeholder="none — no CRM variables" />
												</SelectTrigger>
												<SelectContent>
													{attachedSources.map((a) => (
														<SelectItem key={a.sourceId} value={a.sourceId}>
															{a.source.name}
														</SelectItem>
													))}
												</SelectContent>
											</Select>
										</div>
									)}
									{variableNames.map((name) => (
										<div key={name} className="gap-2 flex items-center">
											<span className="w-28 font-mono text-xs shrink-0 truncate opacity-70">
												{name}
											</span>
											<Input
												className="h-8 text-sm"
												placeholder={`value for {{${name}}}`}
												value={variables[name] ?? ""}
												disabled={isBusy}
												onChange={(e) =>
													setVariables((prev) => ({ ...prev, [name]: e.target.value }))
												}
											/>
										</div>
									))}
									<div className="gap-2 flex items-center">
										<span className="w-28 font-mono text-xs shrink-0 truncate opacity-70">
											crm_contact_id
										</span>
										<Input
											className="h-8 text-sm"
											placeholder="optional — enables CRM sync"
											value={crmContactId}
											disabled={isBusy}
											onChange={(e) => setCrmContactId(e.target.value)}
										/>
									</div>
									<div className="gap-2 flex items-center">
										<span className="w-28 font-mono text-xs shrink-0 truncate opacity-70">
											contact phone
										</span>
										<Input
											className="h-8 text-sm"
											placeholder="optional — finds/creates the contact"
											value={contactPhone}
											disabled={isBusy || crmContactId.trim() !== ""}
											onChange={(e) => setContactPhone(e.target.value)}
										/>
									</div>
									<p className="text-xs text-muted-foreground">
										With a CRM contact set, contact_* and location_* variables auto-fill from the
										CRM; values typed above override them.
									</p>
								</div>
							)}
						</div>

						<TestVisualizer room={room} />

						<div
							ref={transcriptRef}
							className={cn(
								"min-h-24 gap-2 p-3 flex flex-col overflow-y-auto rounded-lg border",
								turns.length === 0 ? "items-center justify-center" : "max-h-56",
							)}
						>
							{turns.length === 0 ? (
								<p className="text-xs text-center text-muted-foreground">
									The live transcript appears here. Saved changes apply to the next conversation.
								</p>
							) : (
								turns.map((t) => (
									<div
										key={t.id}
										className={cn(
											"px-3 py-2 text-sm max-w-[85%] rounded-xl",
											t.role === "agent" ? "self-start bg-muted" : "self-end bg-primary/10",
										)}
									>
										{t.text}
									</div>
								))
							)}
						</div>

						{error && <p className="text-sm text-destructive">{error}</p>}

						{isBusy ? (
							<Button type="button" variant="destructive" onClick={() => void stop()}>
								<PhoneOffIcon className="size-4" /> End conversation
							</Button>
						) : (
							<Button
								type="button"
								onClick={() => void start({ variables, sourceId, crmContactId, contactPhone })}
							>
								<MicIcon className="size-4" /> Start conversation
							</Button>
						)}
					</div>
				</div>
			) : (
				<button
					type="button"
					onClick={() => setIsExpanded(true)}
					className="gap-2 px-4 py-2.5 font-medium text-sm shadow-lg flex items-center rounded-xl border bg-card transition-colors hover:bg-accent"
				>
					<FlaskConicalIcon className="size-4 text-primary" />
					Test
					{isBusy && (
						<span className="size-2 relative flex">
							<span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
							<span className="size-2 relative inline-flex rounded-full bg-primary" />
						</span>
					)}
				</button>
			)}
			{/* Agent audio attaches here — always mounted so collapsing never kills the call. */}
			<div ref={audioContainerRef} className="hidden" />
		</div>
	);
}

/** Audio visualizer: live LiveKit bars while connected, calm static bars otherwise. */
function TestVisualizer({ room }: { room: Room | null }) {
	if (!room) {
		return (
			<div className="h-16 gap-1.5 py-3 flex shrink-0 items-end justify-center rounded-lg bg-muted/50 *:self-center">
				{IDLE_BAR_HEIGHTS.map((height, index) => (
					// eslint-disable-next-line react/no-array-index-key
					<span
						key={index}
						className="w-2 rounded-full bg-primary/20"
						style={{ height: `${height}%` }}
					/>
				))}
			</div>
		);
	}
	return (
		<RoomContext.Provider value={room}>
			<LiveBars />
		</RoomContext.Provider>
	);
}

function LiveBars() {
	const { state, audioTrack } = useVoiceAssistant();
	return (
		<BarVisualizer
			state={state}
			track={audioTrack}
			barCount={5}
			options={{ minHeight: 24 }}
			className="h-16 gap-1.5 py-3 flex shrink-0 items-center justify-center rounded-lg bg-muted/50"
		>
			<span className="w-2 rounded-full bg-primary/25 transition-colors duration-150 data-[lk-highlighted=true]:bg-primary" />
		</BarVisualizer>
	);
}
