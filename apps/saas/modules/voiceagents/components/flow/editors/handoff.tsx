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
import { Switch } from "@repo/ui/components/switch";
import { Textarea } from "@repo/ui/components/textarea";
import { InfoHint } from "@voiceagents/components/shared/InfoHint";

import { useAgentsQuery } from "../../../lib/api";
import type { FlowNodeData, HandoffNodeData } from "../flow-types";
import { ChannelSelector, TitleInput, usePatch } from "./shared";

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

	// Default "announced" preserves the pre-mode behavior (bridge + music +
	// target greeting). "seamless" hides the bridge/music entirely.
	const mode = data.mode ?? "announced";

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
					Handoff style
					<InfoHint>
						Announced: the current agent sends a brief hand-off message, then the target agent opens
						with its own greeting. Seamless: the target just continues the same conversation — no
						hand-off message, no self-introduction.
					</InfoHint>
				</Label>
				<Select
					value={mode}
					onValueChange={(value) => patch({ mode: value as HandoffNodeData["mode"] })}
				>
					<SelectTrigger>
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="announced">Announced — bridge, then the target greets</SelectItem>
						<SelectItem value="seamless">Seamless — the target continues silently</SelectItem>
					</SelectContent>
				</Select>
			</div>

			{mode === "announced" ? (
				<>
					<div className="gap-1.5 flex flex-col">
						<Label className="gap-1.5 flex items-center">
							Hand-off message
							<InfoHint>
								A brief "hold tight" bridge sent by the CURRENT agent right before the swap (e.g.
								"One moment — passing you to {"{{agent_name}}"}"). Supports {"{{variables}}"},
								including {"{{agent_name}}"} (the target agent's name). Leave empty to jump straight
								to the target. The target's opening line comes from its own entry greeting.
							</InfoHint>
						</Label>
						<Textarea
							rows={2}
							value={data.say ?? ""}
							onChange={(e) => patch({ say: e.target.value })}
							placeholder="One moment — passing you to {{agent_name}}."
						/>
						<div className="gap-3 mt-1 p-2.5 flex items-center rounded-lg border">
							<Switch
								id={`handoff-generate-${nodeId}`}
								checked={!!data.generate}
								onCheckedChange={(on) => patch({ generate: on })}
							/>
							<label htmlFor={`handoff-generate-${nodeId}`} className="min-w-0 cursor-pointer">
								<span className="text-sm block">Use AI to generate a response</span>
								<span className="text-xs block opacity-60">
									Off: sent exactly as written. On: the message above guides an AI-generated line
									that varies each time, in the contact's language.
								</span>
							</label>
						</div>
					</div>

					<div className="gap-1.5 flex flex-col">
						<Label className="gap-1.5 flex items-center">
							Hold music (seconds)
							<span className="text-xs opacity-50">(voice only)</span>
							<InfoHint>
								Voice only — on SMS/text there is no hold music. How long hold music plays before
								the target agent picks up. Leave empty to use the default (3s); set to 0 to disable
								hold music entirely.
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
			) : (
				<p className="text-xs opacity-50">
					Seamless: no hand-off message and no hold music — the target agent picks up the same
					conversation without introducing itself.
				</p>
			)}

			<ChannelSelector value={data.channels} onChange={(channels) => patch({ channels })} />
		</>
	);
}
