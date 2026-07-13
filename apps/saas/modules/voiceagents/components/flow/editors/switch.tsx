"use client";

import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import { Switch } from "@repo/ui/components/switch";
import { Textarea } from "@repo/ui/components/textarea";
import { PlusIcon, Trash2Icon } from "lucide-react";

import { makeId } from "../compile/text";
import type { FlowNodeData, SwitchNodeData } from "../flow-types";
import { TitleInput, usePatch } from "./shared";

export function SwitchNodeEditor({
	nodeId,
	data,
	onChange,
}: {
	nodeId: string;
	data: SwitchNodeData;
	onChange: (nodeId: string, data: FlowNodeData) => void;
}) {
	const patch = usePatch<SwitchNodeData>(nodeId, data, onChange);

	return (
		<>
			<TitleInput
				value={data.title}
				onChange={(value) => patch({ title: value })}
				placeholder="Which service?"
			/>

			<div className="gap-1.5 flex flex-col">
				<Label>Question to evaluate</Label>
				<Textarea
					rows={3}
					value={data.condition}
					onChange={(e) => patch({ condition: e.target.value })}
					placeholder="Which service is the caller asking about?"
				/>
				<p className="text-xs opacity-50">
					The AI reads the conversation and picks the case that best answers this question.
				</p>
			</div>

			<div className="gap-2 flex flex-col">
				<Label>Cases</Label>
				<p className="-mt-1 text-xs opacity-50">
					One path per case. Wire each case on the canvas to send the call to another node; leave it
					unwired to end the call. Removing a case removes its edge.
				</p>
				{data.cases.map((switchCase) => (
					<div key={switchCase.id} className="gap-2 flex items-start">
						<Input
							value={switchCase.name}
							onChange={(e) =>
								patch({
									cases: data.cases.map((c) =>
										c.id === switchCase.id ? { ...c, name: e.target.value } : c,
									),
								})
							}
							placeholder="Booking"
							className="max-w-36 font-mono text-sm"
						/>
						<Input
							value={switchCase.description}
							onChange={(e) =>
								patch({
									cases: data.cases.map((c) =>
										c.id === switchCase.id ? { ...c, description: e.target.value } : c,
									),
								})
							}
							placeholder="When to pick this case, e.g. the caller wants to book"
						/>
						<Button
							type="button"
							variant="ghost"
							size="icon"
							className="shrink-0"
							onClick={() => patch({ cases: data.cases.filter((c) => c.id !== switchCase.id) })}
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
						patch({ cases: [...data.cases, { id: makeId("case"), name: "", description: "" }] })
					}
				>
					<PlusIcon className="size-4" /> Add case
				</Button>
			</div>

			<div className="gap-3 p-2.5 flex items-center rounded-lg border">
				<Switch
					id="switch-include-otherwise"
					checked={data.includeOtherwise}
					onCheckedChange={(on) => patch({ includeOtherwise: on })}
				/>
				<label htmlFor="switch-include-otherwise" className="min-w-0 cursor-pointer">
					<span className="text-sm block">Include an Otherwise path</span>
					<span className="text-xs block opacity-60">
						Fallback taken when no case matches the conversation.
					</span>
				</label>
			</div>
		</>
	);
}
