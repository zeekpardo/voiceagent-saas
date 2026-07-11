"use client";

import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import { Textarea } from "@repo/ui/components/textarea";
import { useContactFieldsQuery } from "@voiceagents/lib/contact-fields-api";
import { PlusIcon, Trash2Icon } from "lucide-react";

import { makeId } from "../compile";
import { ContactWriteFieldCombobox } from "../ContactWriteFieldCombobox";
import { fieldOptionsFor, fieldToKey, isCompositeField, keyToStored } from "../field-adapter";
import type { FlowNodeData, ObjectiveDoc, ObjectiveNodeData } from "../flow-types";
import { TitleInput, usePatch } from "./shared";

export function ObjectiveNodeEditor({
	agentId,
	nodeId,
	data,
	isEntry,
	onChange,
}: {
	agentId: string;
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
	const { data: fieldsData } = useContactFieldsQuery(agentId);
	const fields = fieldsData?.fields ?? [];

	return (
		<>
			<TitleInput
				value={data.title}
				onChange={(value) => patch({ title: value })}
				placeholder="Confirm Contact Info"
			/>

			<div className="gap-3 flex flex-col">
				<Label>Objectives</Label>
				{data.objectives.map((objective, index) => {
					const isComposite = isCompositeField(objective.field, fields);
					const pickOptions = fieldOptionsFor(objective.field, fields);
					const isManaged = !!objective.managed;
					if (isManaged) {
						return (
							<div
								key={objective.id}
								className="gap-2 p-3 flex flex-col rounded-lg border bg-muted/30"
							>
								<div className="flex items-center justify-between">
									<span className="font-medium text-xs opacity-60">
										{objective.title || `Objective ${index + 1}`}
									</span>
									<span className="text-xs opacity-50 italic">Managed — address capture</span>
								</div>
								<div className="text-xs opacity-70 gap-1 flex flex-col">
									<p>
										<span className="opacity-50">Output variable:</span>{" "}
										{objective.field || "—"}
									</p>
									{objective.description ? (
										<p>
											<span className="opacity-50">Description:</span> {objective.description}
										</p>
									) : null}
									{objective.aggregateOf?.length ? (
										<p className="opacity-50">
											Assembled from {objective.aggregateOf.length} other objective
											{objective.aggregateOf.length === 1 ? "" : "s"} in this node, in order.
										</p>
									) : null}
									<p>
										<span className="opacity-50">Sensitivity:</span> {objective.sensitivity ?? 90}{" "}
										/ 100 · <span className="opacity-50">Max attempts:</span>{" "}
										{objective.maxAttempts ?? "Keep trying (default)"}
									</p>
								</div>
							</div>
						);
					}
					return (
						<div
							key={objective.id}
							className="gap-3 p-3 flex flex-col rounded-lg border bg-muted/30"
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

							<div className="gap-1.5 flex flex-col">
								<Label className="text-xs">Output variable</Label>
								<ContactWriteFieldCombobox
									agentId={agentId}
									value={fieldToKey(objective.field, fields)}
									onChange={(key) =>
										patchObjective(objective.id, { field: keyToStored(key, fields) })
									}
									allowEmpty
									allowCustomKey
									placeholder="Leave Empty (gather only)"
								/>
								{pickOptions && (
									<Button
										type="button"
										variant="outline"
										size="sm"
										className="mt-1 self-start"
										onClick={() => patchObjective(objective.id, { options: pickOptions })}
									>
										Use field's options
									</Button>
								)}
								{isComposite && (
									<p className="text-xs opacity-50">
										One objective fills every part (street, city, state, zip / first &amp; last
										name) from what the caller says.
									</p>
								)}
							</div>

							<div className="gap-1.5 flex flex-col">
								<Label className="text-xs">Answer options</Label>
								<p className="-mt-1 text-xs opacity-50">
									Restrict the answer to these choices (the agent will match the caller's words to
									one). Leave empty for a free-form answer.
								</p>
								{(objective.options ?? []).map((option, optionIndex) => (
									<div key={optionIndex} className="gap-2 flex items-center">
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
												const next = (objective.options ?? []).filter((_, i) => i !== optionIndex);
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

							<div className="gap-1.5 flex flex-col">
								<Label className="text-xs">Short description</Label>
								<Textarea
									rows={2}
									value={objective.description}
									onChange={(e) => patchObjective(objective.id, { description: e.target.value })}
									placeholder="determine the caller's full property address"
								/>
								{objective.aggregateOf?.length ? (
									<p className="text-xs opacity-50">
										Optional for a combined objective — its answer comes from the parts below.
									</p>
								) : (
									<div className="text-xs opacity-60 flex flex-col gap-0.5">
										<p>
											The most important field — it tells the agent what to{" "}
											<span className="font-medium">find out</span>, and it's how the agent knows
											the objective is done. Describe one thing to learn, not a question to ask.
										</p>
										<p className="text-emerald-600 dark:text-emerald-400">
											✓ "determine the caller's name" · "find out why they want to sell" · "see
											whether or not they're interested"
										</p>
										<p className="text-red-500 dark:text-red-400">
											✗ "ask for their name" (just asks, never confirms) · "get their name and
											budget" (one thing at a time) · "see if they're interested" (never done if
											they aren't — use "whether or not")
										</p>
									</div>
								)}
							</div>

							{/*
							 * Aggregate objectives (`aggregateOf`) are a PLATFORM feature, not a
							 * user control: we compose them into default node templates (e.g. a
							 * managed Full Address objective that combines street/city/state/zip).
							 * The `aggregateOf` field still round-trips through the schema, compiler,
							 * and engine — it's just not user-editable here. A read-only note shows
							 * when an objective is a managed combination.
							 */}
							{objective.aggregateOf?.length ? (
								<p className="text-xs opacity-50">
									Managed combination — its answer is assembled from{" "}
									{objective.aggregateOf.length} other objective
									{objective.aggregateOf.length === 1 ? "" : "s"} in this node.
								</p>
							) : null}

							<details className="text-xs">
								<summary className="cursor-pointer text-primary">Advanced</summary>
								<div className="mt-2 gap-3 flex flex-col">
									<div className="gap-1.5 flex flex-col">
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
									<div className="gap-1.5 flex flex-col">
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
					className="gap-2 text-sm flex items-center text-primary"
				>
					<PlusIcon className="size-4" /> Add objective
				</button>
			</div>

			<div className="gap-1.5 flex flex-col">
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
