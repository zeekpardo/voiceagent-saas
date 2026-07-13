"use client";

import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import { Switch } from "@repo/ui/components/switch";
import { InfoHint } from "@voiceagents/components/shared/InfoHint";
import { useContactFieldsQuery } from "@voiceagents/lib/contact-fields-api";
import { PlusIcon, Trash2Icon } from "lucide-react";

import { makeId } from "../compile/text";
import { ContactWriteFieldCombobox } from "../ContactWriteFieldCombobox";
import {
	fieldOptionsFor,
	fieldToKey,
	FULL_ADDRESS_FIELD_KEY,
	isCompositeField,
	keyToStored,
} from "../field-adapter";
import { FieldPickerTextarea } from "../FieldPicker";
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
									onChange={(key) => {
										// "Full address" stays ONE normal-looking objective row (its field
										// is the composite contact.address). The managed street/city/state/zip
										// parts + aggregate only materialize at compile time (see
										// expandFullAddress), so the builder shows a single clean row.
										if (key === FULL_ADDRESS_FIELD_KEY) {
											patchObjective(objective.id, {
												field: keyToStored(key, fields),
												fullAddress: true,
												options: undefined,
												aggregateOf: undefined,
											});
											return;
										}
										const stored = keyToStored(key, fields);
										// Magical, no-config answer options: if the chosen CRM field is a
										// picklist, auto-scope the answer to its options so the caller's
										// free speech maps to an allowed value; clears them for free-form
										// fields. Users never hand-enter option lists.
										patchObjective(objective.id, {
											field: stored,
											options: fieldOptionsFor(stored, fields),
											fullAddress: undefined,
										});
									}}
									allowEmpty
									allowCustomKey
									placeholder="Leave Empty (gather only)"
								/>
								{isComposite && (
									<p className="text-xs opacity-50">
										One objective fills every part (street, city, state, zip / first &amp; last
										name) from what the caller says.
									</p>
								)}
							</div>

							<div className="gap-1.5 flex flex-col">
								<Label className="text-xs">Short description</Label>
								<FieldPickerTextarea
									agentId={agentId}
									rows={2}
									value={objective.description}
									onValueChange={(description) => patchObjective(objective.id, { description })}
									placeholder="determine the caller's full property address"
								/>
								{objective.aggregateOf?.length ? (
									<p className="text-xs opacity-50">
										Optional for a combined objective — its answer comes from the parts below.
									</p>
								) : (
									<div className="text-xs gap-0.5 flex flex-col opacity-60">
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
									Managed combination — its answer is assembled from {objective.aggregateOf.length}{" "}
									other objective
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
									<div className="gap-3 p-2.5 flex items-center rounded-lg border">
										<Switch
											id={`objective-skip-if-known-${objective.id}`}
											checked={objective.skipIfKnown ?? false}
											onCheckedChange={(on) => patchObjective(objective.id, { skipIfKnown: on })}
										/>
										<label
											htmlFor={`objective-skip-if-known-${objective.id}`}
											className="min-w-0 cursor-pointer"
										>
											<span className="text-sm gap-1 flex items-center">
												Skip if the CRM already has this value
												<InfoHint>
													When on, the agent may silently treat this objective as met from data
													already known about the contact — no question asked, no CRM write. Off
													(default) means it's always asked and (re)saved, which matters after a
													handoff from another agent: the caller may not have actually confirmed
													this value with THIS agent yet.
												</InfoHint>
											</span>
										</label>
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
								{ id: makeId("obj"), title: "", description: "", field: "", skipIfKnown: false },
							],
						})
					}
					className="gap-2 text-sm flex items-center text-primary"
				>
					<PlusIcon className="size-4" /> Add objective
				</button>
			</div>

			<div className="gap-1.5 flex flex-col">
				<Label>Entry message</Label>
				<FieldPickerTextarea
					agentId={agentId}
					rows={2}
					value={data.entryMessage}
					onValueChange={(entryMessage) => patch({ entryMessage })}
					placeholder="Move naturally into collecting these details."
				/>
				<p className="text-xs opacity-50">
					{isEntry
						? "The agent's opening line when this node is entered via a handoff from another agent — spoken in the caller's current language. On a normal call the greeting opens instead, so this is only used on handoff."
						: "Spoken when the flow reaches this node, before the first objective question."}
				</p>
			</div>
		</>
	);
}
