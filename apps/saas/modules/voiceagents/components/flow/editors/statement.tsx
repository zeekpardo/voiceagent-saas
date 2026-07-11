"use client";

import { Label } from "@repo/ui/components/label";
import { Textarea } from "@repo/ui/components/textarea";

import type { FlowNodeData, StatementNodeData } from "../flow-types";
import { ChannelSelector, TitleInput, usePatch } from "./shared";

export function StatementNodeEditor({
	nodeId,
	data,
	onChange,
}: {
	nodeId: string;
	data: StatementNodeData;
	onChange: (nodeId: string, data: FlowNodeData) => void;
}) {
	const patch = usePatch<StatementNodeData>(nodeId, data, onChange);

	return (
		<>
			<TitleInput
				value={data.title}
				onChange={(value) => patch({ title: value })}
				placeholder="Transfer notice"
			/>

			<div className="gap-1.5 flex flex-col">
				<Label>What to say</Label>
				<Textarea
					rows={4}
					value={data.say}
					onChange={(e) => patch({ say: e.target.value })}
					placeholder="Please hold while I connect you to our booking team."
				/>
				<p className="text-xs opacity-50">
					Spoken exactly as written — supports {"{{variables}}"}. The flow continues immediately to
					the next node. Leave the Next handle unwired to end the call after speaking.
				</p>
			</div>

			<ChannelSelector value={data.channels} onChange={(channels) => patch({ channels })} />
		</>
	);
}
