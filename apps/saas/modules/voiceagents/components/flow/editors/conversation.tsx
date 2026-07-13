"use client";

import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import { Switch } from "@repo/ui/components/switch";
import { PlusIcon, Trash2Icon } from "lucide-react";

import { makeId } from "../compile/text";
import { FieldPickerInput, FieldPickerTextarea } from "../FieldPicker";
import type { ConversationNodeData, FlowNodeData } from "../flow-types";
import { ExitTagConditions, TitleInput, usePatch } from "./shared";

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
			<TitleInput
				value={data.title}
				onChange={(value) => patch({ title: value })}
				placeholder="Keep the conversation going"
			/>

			<div className="gap-1.5 flex flex-col">
				<Label>
					Conversation reason <span className="text-destructive">*</span>
				</Label>
				<FieldPickerTextarea
					agentId={agentId}
					rows={3}
					value={data.reason}
					onValueChange={(reason) => patch({ reason })}
					placeholder="Real estate lead looking to sell or buy a property"
				/>
				<p className="text-xs opacity-50">
					What this open-ended conversation is for. The AI probes naturally from here — no
					objectives, no tools — until the goal is exhausted or the caller disengages.
				</p>
			</div>

			<div className="gap-2 flex flex-col">
				<Label>Talking-point hints</Label>
				<p className="-mt-1 text-xs opacity-50">
					Optional nudges the AI can weave in (timeline, motivation, wishlist…). Leave empty to let
					it drive entirely from the reason.
				</p>
				{data.hints.map((hint, index) => (
					<div key={index} className="gap-2 flex items-center">
						<FieldPickerInput
							agentId={agentId}
							value={hint}
							onValueChange={(next) =>
								patch({ hints: data.hints.map((h, i) => (i === index ? next : h)) })
							}
							placeholder="Ask what's motivating the move"
						/>
						<Button
							type="button"
							variant="ghost"
							size="icon"
							className="shrink-0"
							onClick={() => patch({ hints: data.hints.filter((_, i) => i !== index) })}
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
					onClick={() => patch({ hints: [...data.hints, ""] })}
				>
					<PlusIcon className="size-4" /> Add hint
				</Button>
			</div>

			<div className="gap-2 flex flex-col">
				<Label>Exits</Label>
				<p className="-mt-1 text-xs opacity-50">
					Optional paths out of the loop. Wire each on the canvas to another node; leave one unwired
					to end the call. Removing an exit removes its edge.
				</p>
				{data.exits.map((exit) => (
					<div key={exit.id} className="gap-2 p-2.5 flex flex-col rounded-lg border">
						<div className="gap-2 flex items-start">
							<Input
								value={exit.name}
								onChange={(e) =>
									patch({
										exits: data.exits.map((x) =>
											x.id === exit.id ? { ...x, name: e.target.value } : x,
										),
									})
								}
								placeholder="Wants to book"
								className="max-w-36 font-mono text-sm"
							/>
							<Input
								value={exit.description}
								onChange={(e) =>
									patch({
										exits: data.exits.map((x) =>
											x.id === exit.id ? { ...x, description: e.target.value } : x,
										),
									})
								}
								placeholder="When to take it, e.g. the caller is ready to book"
							/>
							<Button
								type="button"
								variant="ghost"
								size="icon"
								className="shrink-0"
								onClick={() =>
									patch({
										exits: data.exits.filter((x) => x.id !== exit.id),
										wrapUpExitId: data.wrapUpExitId === exit.id ? undefined : data.wrapUpExitId,
									})
								}
							>
								<Trash2Icon className="size-4" />
							</Button>
						</div>
						<ExitTagConditions
							tagRules={exit.tagRules}
							onChange={(tagRules) =>
								patch({
									exits: data.exits.map((x) => (x.id === exit.id ? { ...x, tagRules } : x)),
								})
							}
						/>
					</div>
				))}
				<Button
					type="button"
					variant="outline"
					size="sm"
					className="self-start"
					onClick={() =>
						patch({ exits: [...data.exits, { id: makeId("exit"), name: "", description: "" }] })
					}
				>
					<PlusIcon className="size-4" /> Add exit
				</Button>
			</div>

			<div className="gap-2 flex flex-col">
				<Label>When the conversation is exhausted</Label>
				<div className="gap-2.5 p-2.5 flex items-start rounded-lg border">
					<input
						id={`wrapup-end-${nodeId}`}
						type="radio"
						name={`wrapup-${nodeId}`}
						className="mt-1"
						checked={data.wrapUpMode === "end_call"}
						onChange={() => patch({ wrapUpMode: "end_call" })}
					/>
					<label htmlFor={`wrapup-end-${nodeId}`} className="min-w-0 cursor-pointer">
						<span className="text-sm block">End the call</span>
						<span className="text-xs block opacity-60">
							Wrap up warmly and hang up when the caller disengages.
						</span>
					</label>
				</div>
				<div className="gap-2.5 p-2.5 flex items-start rounded-lg border">
					<input
						id={`wrapup-exit-${nodeId}`}
						type="radio"
						name={`wrapup-${nodeId}`}
						className="mt-1"
						checked={data.wrapUpMode === "exit"}
						onChange={() =>
							patch({
								wrapUpMode: "exit",
								wrapUpExitId: data.wrapUpExitId ?? data.exits[0]?.id,
							})
						}
					/>
					<div className="min-w-0 flex-1">
						<label htmlFor={`wrapup-exit-${nodeId}`} className="cursor-pointer">
							<span className="text-sm block">Take an exit</span>
							<span className="text-xs block opacity-60">
								Move on along one of this node's exits.
							</span>
						</label>
						{data.wrapUpMode === "exit" && (
							<select
								aria-label="Wrap-up exit"
								value={data.wrapUpExitId ?? ""}
								onChange={(e) => patch({ wrapUpExitId: e.target.value || undefined })}
								className="mt-2 px-2 py-1.5 text-sm w-full rounded-md border bg-background"
							>
								<option value="">Select an exit…</option>
								{data.exits.map((exit) => (
									<option key={exit.id} value={exit.id}>
										{exit.name.trim() || "(unnamed exit)"}
									</option>
								))}
							</select>
						)}
					</div>
				</div>
			</div>

			<div className="gap-3 p-2.5 flex items-center rounded-lg border">
				<Switch
					id={`conversation-default-${nodeId}`}
					checked={!!data.isDefault}
					onCheckedChange={(on) => patch({ isDefault: on })}
				/>
				<label htmlFor={`conversation-default-${nodeId}`} className="min-w-0 cursor-pointer">
					<span className="text-sm block">Use as default for unconnected exits</span>
					<span className="text-xs block opacity-60">
						Any dangling exit in the flow falls back to this node (CloseBot parity). Only one
						conversation node can be the default.
					</span>
				</label>
			</div>

			<details className="p-2.5 rounded-lg border">
				<summary className="text-sm cursor-pointer">Advanced</summary>
				<div className="mt-3 gap-1.5 flex flex-col">
					<Label>Max duration in this node (seconds)</Label>
					<Input
						type="number"
						min={0}
						value={data.maxDurationSeconds ?? ""}
						onChange={(e) => {
							const value = Number(e.target.value);
							patch({
								maxDurationSeconds:
									e.target.value === "" || Number.isNaN(value) || value <= 0
										? undefined
										: Math.floor(value),
							});
						}}
						placeholder="No cap"
					/>
					<p className="text-xs opacity-50">
						Optional cap on time spent here before wrapping up. Leave empty for no limit.
					</p>
				</div>
			</details>
		</>
	);
}
