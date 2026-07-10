"use client";

import { Button } from "@repo/ui/components/button";
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
								<Label className="text-xs">Answer options</Label>
								<p className="-mt-1 text-xs opacity-50">
									Restrict the answer to these choices (the agent will match the caller's words to
									one). Leave empty for a free-form answer.
								</p>
								{(objective.options ?? []).map((option, optionIndex) => (
									<div key={optionIndex} className="flex items-center gap-2">
										<Input
											className="h-9"
											value={option}
											onChange={(e) =>
												patchObjective(objective.id, {
													options: (objective.options ?? []).map((o, i) =>
														i === optionIndex ? e.target.value : o,
													),
												})
											}
											placeholder="Yes"
										/>
										<Button
											type="button"
											variant="ghost"
											size="icon"
											className="shrink-0"
											onClick={() => {
												const next = (objective.options ?? []).filter(
													(_, i) => i !== optionIndex,
												);
												patchObjective(objective.id, {
													options: next.length ? next : undefined,
												});
											}}
										>
											<Trash2Icon className="size-4" />
										</Button>
									</div>
								))}
								<Button
									type="button"
									variant="outline"
									size="sm"
									className="self-start"
									onClick={() =>
										patchObjective(objective.id, {
											options: [...(objective.options ?? []), ""],
										})
									}
								>
									<PlusIcon className="size-4" /> Add option
								</Button>
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
									{objective.aggregateOf?.length
										? "Optional for a combined objective — its answer comes from the parts below."
										: 'Describe what to find out — "the caller\'s full address", not "ask for the address".'}
								</p>
							</div>

							{/* Combine other objectives (aggregate — CloseBot's get_full_address). */}
							{data.objectives.length > 1 && (
								<details
									className="text-xs"
									open={!!objective.aggregateOf?.length}
								>
									<summary className="cursor-pointer text-primary">
										Combine other objectives
										{objective.aggregateOf?.length ? ` (${objective.aggregateOf.length})` : ""}
									</summary>
									<div className="mt-2 flex flex-col gap-1.5">
										<p className="opacity-50">
											Select other objectives in this node; this one completes automatically once
											they're all met, and its answer is their answers joined in order.
										</p>
										{data.objectives
											.filter((other) => other.id !== objective.id)
											.map((other, otherIndex) => {
												const selected = objective.aggregateOf?.includes(other.id) ?? false;
												// Prevent aggregate-of-aggregate: a part that is itself an aggregate can't be picked.
												const otherIsAggregate = !!other.aggregateOf?.length;
												return (
													<label
														key={other.id}
														className={`flex items-center gap-2 ${otherIsAggregate ? "opacity-40" : "cursor-pointer"}`}
													>
														<input
															type="checkbox"
															className="accent-primary"
															disabled={otherIsAggregate}
															checked={selected}
															onChange={(e) => {
																const current = objective.aggregateOf ?? [];
																const next = e.target.checked
																	? [...current, other.id]
																	: current.filter((id) => id !== other.id);
																patchObjective(objective.id, {
																	aggregateOf: next.length ? next : undefined,
																});
															}}
														/>
														<span>
															{other.title.trim() ||
																other.description.trim().slice(0, 40) ||
																`Objective ${data.objectives.indexOf(other) + 1}`}
															{otherIsAggregate ? " (already a combination)" : ""}
														</span>
													</label>
												);
											})}
									</div>
								</details>
							)}

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
