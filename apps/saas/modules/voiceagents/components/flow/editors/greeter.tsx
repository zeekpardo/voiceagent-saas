"use client";

import { Label } from "@repo/ui/components/label";
import { Textarea } from "@repo/ui/components/textarea";

import type { FlowNodeData, GreeterNodeData } from "../flow-types";
import { usePatch } from "./shared";

export function GreeterNodeEditor({
	nodeId,
	data,
	onChange,
}: {
	nodeId: string;
	data: GreeterNodeData;
	onChange: (nodeId: string, data: FlowNodeData) => void;
}) {
	const patch = usePatch<GreeterNodeData>(nodeId, data, onChange);

	return (
		<div className="gap-1.5 flex flex-col">
			<Label>Greeting</Label>
			<Textarea
				rows={3}
				value={data.greeting}
				onChange={(e) => patch({ greeting: e.target.value })}
				placeholder="Hi {{caller_name}}! How can I help today?"
			/>
			<p className="text-xs opacity-50">
				Spoken as soon as the call connects, after the AI disclosure. Leave empty to let the caller
				speak first.
			</p>
		</div>
	);
}
