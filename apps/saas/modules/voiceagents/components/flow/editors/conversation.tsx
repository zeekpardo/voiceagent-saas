"use client";

import { Label } from "@repo/ui/components/label";

import { FieldPickerTextarea } from "../FieldPicker";
import type { ConversationNodeData, FlowNodeData } from "../flow-types";
import { TitleInput, usePatch } from "./shared";

export function ConversationNodeEditor({
	agentId,
	nodeId,
	data,
	onChange,
}: {
	agentId: string;
	nodeId: string;
	data: ConversationNodeData;
	onChange: (nodeId: string, data: FlowNodeData) => void;
}) {
	const patch = usePatch<ConversationNodeData>(nodeId, data, onChange);

	return (
		<>
			<p className="text-sm opacity-70">
				While on this node, your agent keeps chatting with the contact — answering questions and
				gathering what it needs — using its Goal, business info, and response style. Add an Extra
				Prompt below only if you want extra guidance for this stage.
			</p>

			<TitleInput
				value={data.title}
				onChange={(value) => patch({ title: value })}
				placeholder="Keep the conversation going"
			/>

			<details className="p-2.5 rounded-lg border">
				<summary className="text-sm cursor-pointer">Advanced Settings</summary>
				<div className="mt-3 gap-1.5 flex flex-col">
					<Label>Extra Prompt</Label>
					<FieldPickerTextarea
						agentId={agentId}
						rows={3}
						value={data.extraPrompt ?? ""}
						onValueChange={(extraPrompt) => patch({ extraPrompt: extraPrompt || undefined })}
						placeholder="Optional extra instructions for this stage…"
					/>
					<p className="text-xs opacity-50">
						Optional. Layered on top of the agent's Goal, business info, and response style while
						the conversation is on this node.
					</p>
				</div>
			</details>
		</>
	);
}
