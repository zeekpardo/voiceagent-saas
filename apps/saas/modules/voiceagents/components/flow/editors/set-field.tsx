"use client";

import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectLabel,
	SelectTrigger,
	SelectValue,
} from "@repo/ui/components/select";
import { Textarea } from "@repo/ui/components/textarea";

import type { FlowNodeData, SetFieldNodeData } from "../flow-types";
import { OBJECTIVE_OUTPUT_VARIABLES } from "../flow-types";
import { OBJECTIVE_CUSTOM_FIELD, TitleInput, usePatch } from "./shared";

export function SetFieldNodeEditor({
	nodeId,
	data,
	onChange,
}: {
	nodeId: string;
	data: SetFieldNodeData;
	onChange: (nodeId: string, data: FlowNodeData) => void;
}) {
	const patch = usePatch<SetFieldNodeData>(nodeId, data, onChange);
	const knownField = OBJECTIVE_OUTPUT_VARIABLES.some((v) => v.field === data.field);
	const selectValue = data.field ? (knownField ? data.field : OBJECTIVE_CUSTOM_FIELD) : "";

	return (
		<>
			<TitleInput
				value={data.title}
				onChange={(value) => patch({ title: value })}
				placeholder="Mark as qualified"
			/>

			<div className="gap-1.5 flex flex-col">
				<Label>Field</Label>
				<Select
					value={selectValue}
					onValueChange={(value) =>
						patch({
							field: value === OBJECTIVE_CUSTOM_FIELD ? (knownField ? "" : data.field) : value,
						})
					}
				>
					<SelectTrigger className="h-9">
						<SelectValue placeholder="Which field to set" />
					</SelectTrigger>
					<SelectContent>
						<SelectGroup>
							<SelectLabel>Standard fields</SelectLabel>
							{OBJECTIVE_OUTPUT_VARIABLES.map((v) => (
								<SelectItem key={v.field} value={v.field}>
									{v.label}
								</SelectItem>
							))}
						</SelectGroup>
						<SelectItem value={OBJECTIVE_CUSTOM_FIELD}>Custom field…</SelectItem>
					</SelectContent>
				</Select>
				{selectValue === OBJECTIVE_CUSTOM_FIELD && (
					<Input
						className="mt-1 h-9"
						value={data.field}
						onChange={(e) => patch({ field: e.target.value })}
						placeholder="Exact CRM field name, e.g. Lead Type"
					/>
				)}
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
