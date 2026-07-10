"use client";

import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import { Switch } from "@repo/ui/components/switch";
import { Textarea } from "@repo/ui/components/textarea";
import { PlusIcon, Trash2Icon } from "lucide-react";

import { makeId } from "../compile";
import type { ConversationNodeData, FlowNodeData } from "../flow-types";
import { ExitTagConditions, TitleInput, usePatch } from "./shared";

export function ConversationNodeEditor({
	nodeId,
	data,
	onChange,
}: {
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

			<div className="flex flex-col gap-1.5">
				<Label>
					Conversation reason <span className="text-destructive">*</span>
				</Label>
				<Textarea
					rows={3}
					value={data.reason}
					onChange={(e) => patch({ reason: e.target.value })}
					placeholder="Real estate lead looking to sell or buy a property"
				/>
				<p className="text-xs opacity-50">
					What this open-ended conversation is for. The AI probes naturally from here — no
					objectives, no tools — until the goal is exhausted or the caller disengages.
				</p>
			</div>

			<div className="flex flex-col gap-2">
				<Label>Talking-point hints</Label>
				<p className="-mt-1 text-xs opacity-50">
					Optional nudges the AI can weave in (timeline, motivation, wishlist…). Leave empty to
					let it drive entirely from the reason.
				</p>
				{data.hints.map((hint, index) => (
					<div key={index} className="flex items-center gap-2">
						<Input
							value={hint}
							onChange={(e) =>
								patch({ hints: data.hints.map((h, i) => (i === index ? e.target.value : h)) })
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

			<div className="flex flex-col gap-2">
				<Label>Exits</Label>
				<p className="-mt-1 text-xs opacity-50">
					Optional paths out of the loop. Wire each on the canvas to another node; leave one
					unwired to end the call. Removing an exit removes its edge.
				</p>
				{data.exits.map((exit) => (
					<div key={exit.id} className="flex flex-col gap-2 rounded-lg border p-2.5">
						<div className="flex items-start gap-2">
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
										wrapUpExitId:
											data.wrapUpExitId === exit.id ? undefined : data.wrapUpExitId,
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

			<div className="flex flex-col gap-2">
				<Label>When the conversation is exhausted</Label>
				<div className="flex items-start gap-2.5 rounded-lg border p-2.5">
					<input
						id={`wrapup-end-${nodeId}`}
						type="radio"
						name={`wrapup-${nodeId}`}
						className="mt-1"
						checked={data.wrapUpMode === "end_call"}
						onChange={() => patch({ wrapUpMode: "end_call" })}
					/>
					<label htmlFor={`wrapup-end-${nodeId}`} className="min-w-0 cursor-pointer">
						<span className="block text-sm">End the call</span>
						<span className="block text-xs opacity-60">
							Wrap up warmly and hang up when the caller disengages.
						</span>
					</label>
				</div>
				<div className="flex items-start gap-2.5 rounded-lg border p-2.5">
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
							<span className="block text-sm">Take an exit</span>
							<span className="block text-xs opacity-60">
								Move on along one of this node's exits.
							</span>
						</label>
						{data.wrapUpMode === "exit" && (
							<select
								aria-label="Wrap-up exit"
								value={data.wrapUpExitId ?? ""}
								onChange={(e) => patch({ wrapUpExitId: e.target.value || undefined })}
								className="mt-2 w-full rounded-md border bg-background px-2 py-1.5 text-sm"
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

			<div className="flex items-center gap-3 rounded-lg border p-2.5">
				<Switch
					id={`conversation-default-${nodeId}`}
					checked={!!data.isDefault}
					onCheckedChange={(on) => patch({ isDefault: on })}
				/>
				<label htmlFor={`conversation-default-${nodeId}`} className="min-w-0 cursor-pointer">
					<span className="block text-sm">Use as default for unconnected exits</span>
					<span className="block text-xs opacity-60">
						Any dangling exit in the flow falls back to this node (CloseBot parity). Only one
						conversation node can be the default.
					</span>
				</label>
			</div>

			<details className="rounded-lg border p-2.5">
				<summary className="cursor-pointer text-sm">Advanced</summary>
				<div className="mt-3 flex flex-col gap-1.5">
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
