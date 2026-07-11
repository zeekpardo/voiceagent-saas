"use client";

import { Label } from "@repo/ui/components/label";
import { useContactFieldsQuery } from "@voiceagents/lib/contact-fields-api";

import { ContactWriteFieldCombobox } from "../ContactWriteFieldCombobox";
import { fieldToKey, keyToStored } from "../field-adapter";
import { FieldPickerTextarea } from "../FieldPicker";
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
				<FieldPickerTextarea
					agentId={agentId}
					rows={2}
					value={data.value}
					onValueChange={(value) => patch({ value })}
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
