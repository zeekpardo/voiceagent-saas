"use client";

import { Label } from "@repo/ui/components/label";
import { Textarea } from "@repo/ui/components/textarea";

import type { FlowNodeData, TrueFalseNodeData } from "../flow-types";
import { TitleInput, usePatch } from "./shared";

export function TrueFalseNodeEditor({
	nodeId,
	data,
	onChange,
}: {
	nodeId: string;
	data: TrueFalseNodeData;
	onChange: (nodeId: string, data: FlowNodeData) => void;
}) {
	const patch = usePatch<TrueFalseNodeData>(nodeId, data, onChange);

	return (
		<>
			<TitleInput
				value={data.title}
				onChange={(value) => patch({ title: value })}
				placeholder="Speaks English?"
			/>

			<div className="gap-1.5 flex flex-col">
				<Label>Statement to evaluate</Label>
				<Textarea
					rows={3}
					value={data.condition}
					onChange={(e) => patch({ condition: e.target.value })}
					placeholder="The caller has confirmed they speak English"
				/>
				<p className="text-xs opacity-50">
					Written as a statement — the AI reads the conversation and marks it true or false, e.g.
					“The caller has confirmed they speak English.” Wire the True and False handles on the
					canvas; an unwired path ends the call.
				</p>
			</div>
		</>
	);
}
