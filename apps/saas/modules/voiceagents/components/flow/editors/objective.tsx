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
import { PlusIcon, Trash2Icon } from "lucide-react";

import { makeId } from "../compile";
import type { FlowNodeData, ObjectiveDoc, ObjectiveNodeData } from "../flow-types";
import { OBJECTIVE_OUTPUT_VARIABLES } from "../flow-types";
import { OBJECTIVE_CUSTOM_FIELD, OBJECTIVE_NO_FIELD, TitleInput, usePatch } from "./shared";

export function ObjectiveNodeEditor({
	nodeId,
	data,
	isEntry,
	onChange,
}: {
	nodeId: string;
	data: ObjectiveNodeData;
	isEntry: boolean;
	onChange: (nodeId: string, data: FlowNodeData) => void;
}) {
	const patch = usePatch<ObjectiveNodeData>(nodeId, data, onChange);
	const patchObjective = (id: string, partial: Partial<ObjectiveDoc>) =>
		patch({
			objectives: data.objectives.map((o) => (o.id === id ? { ...o, ...partial } : o)),
		});
	const knownField = (field: string) => OBJECTIVE_OUTPUT_VARIABLES.some((v) => v.field === field);

	return (
		<>
			<TitleInput value={data.title} onChange={(value) => patch({ title: value })} placeholder="Confirm Contact Info" />

			<div className="flex flex-col gap-3">
				<Label>Objectives</Label>
				{data.objectives.map((objective, index) => {
					const isComposite = OBJECTIVE_OUTPUT_VARIABLES.find(
						(v) => v.field === objective.field,
					)?.composite;
					const selectValue = objective.field
						? knownField(objective.field)
							? objective.field
							: OBJECTIVE_CUSTOM_FIELD
						: OBJECTIVE_NO_FIELD;
					return (
						<div
							key={objective.id}
							className="flex flex-col gap-3 rounded-lg border bg-muted/30 p-3"
						>
							<div className="flex items-center justify-between">
								<span className="font-medium text-xs opacity-60">Objective {index + 1}</span>
								{data.objectives.length > 1 && (
									<button
										type="button"
										aria-label="Remove objective"
										onClick={() =>
											patch({ objectives: data.objectives.filter((o) => o.id !== objective.id) })
										}
										className="text-muted-foreground hover:text-destructive"
									>
										<Trash2Icon className="size-4" />
									</button>
								)}
							</div>

							<div className="flex flex-col gap-1.5">
								<Label className="text-xs">Output variable</Label>
								<Select
									value={selectValue}
									onValueChange={(value) => {
										if (value === OBJECTIVE_NO_FIELD) patchObjective(objective.id, { field: "" });
										else if (value === OBJECTIVE_CUSTOM_FIELD)
											patchObjective(objective.id, {
												field: knownField(objective.field) ? "" : objective.field,
											});
										else patchObjective(objective.id, { field: value });
									}}
								>
									<SelectTrigger className="h-9">
										<SelectValue placeholder="Where to save it" />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value={OBJECTIVE_NO_FIELD}>Don't save (gather only)</SelectItem>
										<SelectGroup>
											<SelectLabel>Standard fields</SelectLabel>
											{OBJECTIVE_OUTPUT_VARIABLES.map((v) => (
												<SelectItem key={v.field} value={v.field}>
													{v.label}
													{v.composite ? " — fills all parts" : ""}
												</SelectItem>
											))}
										</SelectGroup>
										<SelectItem value={OBJECTIVE_CUSTOM_FIELD}>Custom field…</SelectItem>
									</SelectContent>
								</Select>
								{selectValue === OBJECTIVE_CUSTOM_FIELD && (
									<Input
										className="mt-1 h-9"
										value={objective.field}
										onChange={(e) => patchObjective(objective.id, { field: e.target.value })}
										placeholder="Exact CRM field name, e.g. Reason for Selling"
									/>
								)}
								{isComposite && (
									<p className="text-xs opacity-50">
										One objective fills every part (street, city, state, zip / first &amp; last name)
										from what the caller says.
									</p>
								)}
							</div>

							<div className="flex flex-col gap-1.5">
								<Label className="text-xs">Short description</Label>
								<Textarea
									rows={2}
									value={objective.description}
									onChange={(e) => patchObjective(objective.id, { description: e.target.value })}
									placeholder="the caller's full property address"
								/>
								<p className="text-xs opacity-50">
									Describe what to <em>find out</em> — "the caller's full address", not "ask for the
									address".
								</p>
							</div>

							<details className="text-xs">
								<summary className="cursor-pointer text-primary">Advanced</summary>
								<div className="mt-2 flex flex-col gap-3">
									<div className="flex flex-col gap-1.5">
										<Label className="text-xs">
											Sensitivity {objective.sensitivity ?? 90} / 100
										</Label>
										<input
											type="range"
											min={10}
											max={100}
											step={5}
											value={objective.sensitivity ?? 90}
											onChange={(e) =>
												patchObjective(objective.id, { sensitivity: Number(e.target.value) })
											}
											className="w-full accent-primary"
										/>
										<p className="opacity-50">
											Higher = stricter before the objective counts as met.
										</p>
									</div>
									<div className="flex flex-col gap-1.5">
										<Label className="text-xs">Max attempts</Label>
										<Input
											type="number"
											min={1}
											max={10}
											className="h-9"
											value={objective.maxAttempts ?? ""}
											onChange={(e) =>
												patchObjective(objective.id, {
													maxAttempts: e.target.value ? Number(e.target.value) : undefined,
												})
											}
											placeholder="Keep trying (default)"
										/>
										<p className="opacity-50">
											Give up and move on after this many caller turns. Leave blank to always wait.
										</p>
									</div>
								</div>
							</details>
						</div>
					);
				})}
				<button
					type="button"
					onClick={() =>
						patch({
							objectives: [
								...data.objectives,
								{ id: makeId("obj"), title: "", description: "", field: "" },
							],
						})
					}
					className="flex items-center gap-2 text-primary text-sm"
				>
					<PlusIcon className="size-4" /> Add objective
				</button>
			</div>

			<div className="flex flex-col gap-1.5">
				<Label className={isEntry ? "opacity-50" : ""}>Entry message</Label>
				<Textarea
					rows={2}
					disabled={isEntry}
					value={data.entryMessage}
					onChange={(e) => patch({ entryMessage: e.target.value })}
					placeholder="Move naturally into collecting these details."
				/>
				<p className="text-xs opacity-50">
					{isEntry
						? "The greeting opens the entry node, so this is ignored here."
						: "Spoken when the flow reaches this node, before the first objective question."}
				</p>
			</div>
		</>
	);
}
