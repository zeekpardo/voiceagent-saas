"use client";

import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@repo/ui/components/select";
import { Textarea } from "@repo/ui/components/textarea";
import { InfoHint } from "@voiceagents/components/shared/InfoHint";

import { useAgentsQuery } from "../../../lib/api";
import type { FlowNodeData, HandoffNodeData } from "../flow-types";
import { TitleInput, usePatch } from "./shared";

/**
 * Handoff node editor: pick the TARGET published agent the live call is handed
 * off to. The current agent is excluded — a flow can't hand off to itself.
 */
export function HandoffNodeEditor({
	agentId,
	nodeId,
	data,
	onChange,
}: {
	agentId: string;
	nodeId: string;
	data: HandoffNodeData;
	onChange: (nodeId: string, data: FlowNodeData) => void;
}) {
	const patch = usePatch<HandoffNodeData>(nodeId, data, onChange);
	const { data: agents, isLoading } = useAgentsQuery();

	// Exclude the current agent (no self-handoff) from the pickable targets.
	const options = (agents ?? []).filter((agent) => agent.id !== agentId);
	// A previously-picked target that has since been deleted / is no longer listed
	// still shows its stored id so the selection isn't silently lost.
	const selectedMissing =
		!!data.handoffAgentId && !options.some((agent) => agent.id === data.handoffAgentId);

	return (
		<>
			<TitleInput
				value={data.title}
				onChange={(value) => patch({ title: value })}
				placeholder="Hand off to booking agent"
			/>

			<div className="gap-1.5 flex flex-col">
				<Label>Hand off to</Label>
				<Select
					value={data.handoffAgentId ?? ""}
					onValueChange={(value) => patch({ handoffAgentId: value })}
				>
					<SelectTrigger>
						<SelectValue placeholder={isLoading ? "Loading agents…" : "Choose an agent…"} />
					</SelectTrigger>
					<SelectContent>
						{selectedMissing ? (
							<SelectItem value={data.handoffAgentId as string}>
								{data.handoffAgentId} (unavailable)
							</SelectItem>
						) : null}
						{options.map((agent) => (
							<SelectItem key={agent.id} value={agent.id}>
								{agent.name}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				<p className="text-xs opacity-50">
					The live call is handed to this agent — its own persona, flow and tools take over,
					carrying the conversation so far. One-way: the call does not return here.
				</p>
			</div>

			<div className="gap-1.5 flex flex-col">
				<Label className="gap-1.5 flex items-center">
					Announcement
					<InfoHint>
						Spoken by the CURRENT agent, in its own voice, right before the hold music. Supports{" "}
						{"{{variables}}"}; leave empty to jump straight to the music.
					</InfoHint>
				</Label>
				<Textarea
					rows={2}
					value={data.say ?? ""}
					onChange={(e) => patch({ say: e.target.value })}
					placeholder="One moment — connecting you with our valuation specialist."
				/>
			</div>

			<div className="gap-1.5 flex flex-col">
				<Label className="gap-1.5 flex items-center">
					Hold music (seconds)
					<InfoHint>
						How long hold music plays before the target agent picks up, in its own voice. Leave
						empty to use the default (3s); set to 0 to disable hold music entirely.
					</InfoHint>
				</Label>
				<Input
					type="number"
					min={0}
					max={30}
					step={1}
					value={data.holdSeconds ?? ""}
					onChange={(e) => {
						const raw = e.target.value;
						if (raw === "") {
							patch({ holdSeconds: undefined });
							return;
						}
						patch({ holdSeconds: Math.max(0, Math.min(30, Number(raw))) });
					}}
					placeholder="3 (default)"
				/>
			</div>
		</>
	);
}
