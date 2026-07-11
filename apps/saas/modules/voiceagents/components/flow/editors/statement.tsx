"use client";

import { Label } from "@repo/ui/components/label";
import { Switch } from "@repo/ui/components/switch";

import { FieldPickerTextarea } from "../FieldPicker";
import type { FlowNodeData, StatementNodeData } from "../flow-types";
import { ChannelSelector, TitleInput, usePatch } from "./shared";

export function StatementNodeEditor({
	agentId,
	nodeId,
	data,
	onChange,
}: {
	agentId: string;
	nodeId: string;
	data: StatementNodeData;
	onChange: (nodeId: string, data: FlowNodeData) => void;
}) {
	const patch = usePatch<StatementNodeData>(nodeId, data, onChange);
	const generate = !!data.generate;

	return (
		<>
			<TitleInput
				value={data.title}
				onChange={(value) => patch({ title: value })}
				placeholder="Transfer notice"
			/>

			<div className="gap-3 p-2.5 flex items-center rounded-lg border">
				<Switch
					id={`statement-generate-${nodeId}`}
					checked={generate}
					onCheckedChange={(on) => patch({ generate: on })}
				/>
				<label htmlFor={`statement-generate-${nodeId}`} className="min-w-0 cursor-pointer">
					<span className="text-sm block">Use AI to generate a response</span>
					<span className="text-xs block opacity-60">
						Off: sent exactly as written. On: the text below guides an AI-generated message that
						varies each time, in the caller's language.
					</span>
				</label>
			</div>

			<div className="gap-1.5 flex flex-col">
				<Label>{generate ? "What to say (AI guidance)" : "What to say"}</Label>
				<FieldPickerTextarea
					agentId={agentId}
					rows={4}
					value={data.say}
					onValueChange={(say) => patch({ say })}
					placeholder="Please hold while I connect you to our booking team."
				/>
				<p className="text-xs opacity-50">
					{generate
						? "Used as guidance — the AI generates a fresh, natural message from it each time, in the caller's current language. Supports {{variables}}."
						: "Spoken exactly as written — supports {{variables}}. The flow continues immediately to the next node. Leave the Next handle unwired to end the call after speaking."}
				</p>
			</div>

			<ChannelSelector value={data.channels} onChange={(channels) => patch({ channels })} />
		</>
	);
}
