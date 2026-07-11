"use client";

import { Label } from "@repo/ui/components/label";
import { Switch } from "@repo/ui/components/switch";

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
	const generate = !!data.greetingGenerate;

	return (
		<>
			<div className="gap-3 p-2.5 flex items-center rounded-lg border">
				<Switch
					id={`greeter-generate-${nodeId}`}
					checked={generate}
					onCheckedChange={(on) => patch({ greetingGenerate: on })}
				/>
				<label htmlFor={`greeter-generate-${nodeId}`} className="min-w-0 cursor-pointer">
					<span className="text-sm block">Use AI to generate a response</span>
					<span className="text-xs block opacity-60">
						Off: spoken exactly as written. On: the text below guides an AI-generated greeting that
						varies each call, in the caller's language.
					</span>
				</label>
			</div>

			<div className="gap-1.5 flex flex-col">
				<Label>{generate ? "Greeting (AI guidance)" : "Greeting"}</Label>
				<FieldPickerTextarea
					agentId={agentId}
					rows={4}
					value={data.greeting}
					onValueChange={(greeting) => patch({ greeting })}
					className="min-h-20"
					placeholder="Hi {{contact_first_name}}, this is {{location_name}}."
				/>
				<p className="text-xs opacity-50">
					{generate
						? "Used as guidance — the AI generates a fresh, natural greeting from it each call, in the caller's language. Spoken after the AI disclosure. Supports {{variables}}."
						: "Spoken as soon as the call connects, after the AI disclosure. Supports {{variables}}. Leave empty to let the caller speak first."}
				</p>
			</div>
		</>
	);
}
