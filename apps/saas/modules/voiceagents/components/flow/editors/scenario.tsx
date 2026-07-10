"use client";

import { Label } from "@repo/ui/components/label";
import { Textarea } from "@repo/ui/components/textarea";

import type { FlowNodeData, ScenarioNodeData } from "../flow-types";
import { TitleInput, usePatch } from "./shared";

export function ScenarioNodeEditor({
	nodeId,
	data,
	onChange,
}: {
	nodeId: string;
	data: ScenarioNodeData;
	onChange: (nodeId: string, data: FlowNodeData) => void;
}) {
	const patch = usePatch<ScenarioNodeData>(nodeId, data, onChange);

	return (
		<>
			<TitleInput value={data.title} onChange={(value) => patch({ title: value })} placeholder="Aggression Detected" />

			<div className="flex flex-col gap-1.5">
				<Label>When to jump</Label>
				<Textarea
					rows={4}
					value={data.description}
					onChange={(e) => patch({ description: e.target.value })}
					placeholder="The caller is angry, hostile, cursing, or verbally aggressive"
				/>
				<p className="text-xs opacity-50">
					Checked continuously from every stage — the call jumps to the connected node the moment
					this is detected.
				</p>
			</div>
		</>
	);
}
