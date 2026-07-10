"use client";

import { Label } from "@repo/ui/components/label";
import { Textarea } from "@repo/ui/components/textarea";
import { useContactFieldsQuery } from "@voiceagents/lib/contact-fields-api";

import { ContactWriteFieldCombobox } from "../ContactWriteFieldCombobox";
import { fieldToKey, keyToStored } from "../field-adapter";
import type { FlowNodeData, SetFieldNodeData } from "../flow-types";
import { TitleInput, usePatch } from "./shared";

export function SetFieldNodeEditor({
	agentId,
	nodeId,
	data,
	onChange,
}: {
	agentId: string;
	nodeId: string;
	data: SetFieldNodeData;
	onChange: (nodeId: string, data: FlowNodeData) => void;
}) {
	const patch = usePatch<SetFieldNodeData>(nodeId, data, onChange);
	const { data: fieldsData } = useContactFieldsQuery(agentId);
	const fields = fieldsData?.fields ?? [];

	return (
		<>
			<TitleInput
				value={data.title}
				onChange={(value) => patch({ title: value })}
				placeholder="Mark as qualified"
			/>

			<div className="gap-1.5 flex flex-col">
				<Label>Field</Label>
				<ContactWriteFieldCombobox
					agentId={agentId}
					value={fieldToKey(data.field, fields)}
					onChange={(key) => patch({ field: keyToStored(key, fields) })}
					allowCustomKey
					placeholder="Which field to set"
				/>
			</div>

			<div className="gap-1.5 flex flex-col">
				<Label>Value</Label>
				<Textarea
					rows={2}
					value={data.value}
					onChange={(e) => patch({ value: e.target.value })}
					placeholder="Seller"
				/>
				<p className="text-xs opacity-50">
					Written exactly as typed — supports {"{{variables}}"}. Saved silently, then the flow
					continues.
				</p>
			</div>
		</>
	);
}
