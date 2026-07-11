"use client";

import { Label } from "@repo/ui/components/label";

import { FieldPickerTextarea } from "../FieldPicker";
import type { FlowNodeData, GreeterNodeData } from "../flow-types";
import { usePatch } from "./shared";

export function GreeterNodeEditor({
	agentId,
	nodeId,
	data,
	onChange,
}: {
	agentId: string;
	nodeId: string;
	data: GreeterNodeData;
	onChange: (nodeId: string, data: FlowNodeData) => void;
}) {
	const patch = usePatch<GreeterNodeData>(nodeId, data, onChange);

	return (
		<div className="gap-1.5 flex flex-col">
			<Label>Greeting</Label>
			<FieldPickerTextarea
				agentId={agentId}
				rows={4}
				value={data.greeting}
				onValueChange={(greeting) => patch({ greeting })}
				className="min-h-20"
				placeholder="Hi {{contact_first_name}}, this is {{location_name}}."
			/>
			<p className="text-xs opacity-50">
				Spoken as soon as the call connects, after the AI disclosure. Supports {"{{variables}}"}.
				Leave empty to let the caller speak first.
			</p>
		</div>
	);
}
