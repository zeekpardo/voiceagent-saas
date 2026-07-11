"use client";

import { Label } from "@repo/ui/components/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@repo/ui/components/select";

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
		</>
	);
}
