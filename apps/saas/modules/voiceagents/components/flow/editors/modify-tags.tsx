"use client";

import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";

import type { FlowNodeData, ModifyTagsNodeData } from "../flow-types";
import { TitleInput, usePatch } from "./shared";

export function ModifyTagsNodeEditor({
	nodeId,
	data,
	onChange,
}: {
	nodeId: string;
	data: ModifyTagsNodeData;
	onChange: (nodeId: string, data: FlowNodeData) => void;
}) {
	const patch = usePatch<ModifyTagsNodeData>(nodeId, data, onChange);
	const toList = (raw: string) =>
		raw
			.split(",")
			.map((t) => t.trim())
			.filter(Boolean);

	return (
		<>
			<TitleInput
				value={data.title}
				onChange={(value) => patch({ title: value })}
				placeholder="Tag as hot lead"
			/>

			<div className="gap-1.5 flex flex-col">
				<Label>Add tags</Label>
				<Input
					value={data.addTags.join(", ")}
					onChange={(e) => patch({ addTags: toList(e.target.value) })}
					placeholder="hot seller, qualified"
				/>
				<p className="text-xs opacity-50">Comma-separated. Added to the contact silently.</p>
			</div>

			<div className="gap-1.5 flex flex-col">
				<Label>Remove tags</Label>
				<Input
					value={data.removeTags.join(", ")}
					onChange={(e) => patch({ removeTags: toList(e.target.value) })}
					placeholder="cold, unqualified"
				/>
				<p className="text-xs opacity-50">Comma-separated. Removed from the contact silently.</p>
			</div>
		</>
	);
}
