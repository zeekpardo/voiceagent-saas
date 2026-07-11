"use client";

import { Label } from "@repo/ui/components/label";

import { InstructionsEditor } from "../../agent-form/shared-fields";
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
			<InstructionsEditor
				value={data.greeting}
				onChange={(greeting) => patch({ greeting })}
				editorClassName="min-h-20"
				hint="Spoken as soon as the call connects, after the AI disclosure. Type @ to insert a variable, e.g. Hi {{contact_first_name}}, this is {{location_name}}. Leave empty to let the caller speak first."
			/>
		</div>
	);
}
