"use client";

import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@repo/ui/components/select";

import type { ExitTagRules, FlowChannel, FlowNodeData } from "../flow-types";
import { normalizeChannels } from "../flow-types";

export interface FlowToolOption {
	id: string;
	name: string;
	description: string;
}

/** Sentinel for "use the agent's default calendar" in calendar selects. */
export const AGENT_DEFAULT_CALENDAR = "__agent_default__";

/**
 * Generic "patch this node's data" closure — every per-kind node editor
 * merges a partial update into the node's current data and hands the result
 * back to the shared `onChange(nodeId, data)` callback.
 */
export function usePatch<T extends FlowNodeData>(
	nodeId: string,
	data: T,
	onChange: (nodeId: string, data: FlowNodeData) => void,
) {
	return (partial: Partial<T>) => onChange(nodeId, { ...data, ...partial });
}

/**
 * Advanced "Tag conditions" for an exit (Phase 5b — tag-driven exit routing).
 * Shared by every exits editor (agent + conversation). The exit is only offered
 * mid-call when the caller's tag set has all `mustHave` tags and none of the
 * `cantHave` tags. Empty → the exit is always available (compiles away).
 */
export function ExitTagConditions({
	tagRules,
	onChange,
}: {
	tagRules: ExitTagRules | undefined;
	onChange: (next: ExitTagRules | undefined) => void;
}) {
	const toList = (raw: string) =>
		raw
			.split(",")
			.map((t) => t.trim())
			.filter(Boolean);
	const update = (partial: ExitTagRules) => {
		const next: ExitTagRules = { ...tagRules, ...partial };
		const mustHave = next.mustHave?.length ? next.mustHave : undefined;
		const cantHave = next.cantHave?.length ? next.cantHave : undefined;
		onChange(mustHave || cantHave ? { mustHave, cantHave } : undefined);
	};
	const active = !!(tagRules?.mustHave?.length || tagRules?.cantHave?.length);

	return (
		<details className="text-xs" open={active}>
			<summary className="cursor-pointer text-primary">
				Tag conditions{active ? " (on)" : ""}
			</summary>
			<div className="mt-2 gap-2 flex flex-col">
				<div className="gap-1 flex flex-col">
					<Label className="text-xs">Only if tagged</Label>
					<Input
						className="h-8 text-sm"
						value={(tagRules?.mustHave ?? []).join(", ")}
						onChange={(e) => update({ mustHave: toList(e.target.value) })}
						placeholder="qualified, hot"
					/>
				</div>
				<div className="gap-1 flex flex-col">
					<Label className="text-xs">Never if tagged</Label>
					<Input
						className="h-8 text-sm"
						value={(tagRules?.cantHave ?? []).join(", ")}
						onChange={(e) => update({ cantHave: toList(e.target.value) })}
						placeholder="dnc, unqualified"
					/>
				</div>
				<p className="opacity-50">
					Comma-separated CRM tags. This exit is hidden mid-call until the conditions are met
					(checked at each stage change).
				</p>
			</div>
		</details>
	);
}

const CHANNEL_BOTH = "both";

/**
 * "Channels" selector shared by the node editors that support it (agent,
 * statement, handoff). "Both" is the default and stores `undefined` (the node
 * runs everywhere); "Voice only" / "Text only" restrict it. Restricted nodes
 * are pruned from the flow compiled for the other channel (`pruneFlowForChannel`)
 * and show a chip on the canvas.
 */
export function ChannelSelector({
	value,
	onChange,
}: {
	value: FlowChannel[] | undefined;
	onChange: (next: FlowChannel[] | undefined) => void;
}) {
	const normalized = normalizeChannels(value);
	const current = normalized ? normalized[0] : CHANNEL_BOTH;
	return (
		<div className="gap-1.5 flex flex-col">
			<Label>Channels</Label>
			<Select
				value={current}
				onValueChange={(next) =>
					onChange(next === CHANNEL_BOTH ? undefined : [next as FlowChannel])
				}
			>
				<SelectTrigger>
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value={CHANNEL_BOTH}>Voice & text</SelectItem>
					<SelectItem value="voice">Voice only</SelectItem>
					<SelectItem value="text">Text only</SelectItem>
				</SelectContent>
			</Select>
			<p className="text-xs opacity-50">
				Which sessions run this node. A restricted node is skipped for the other channel — its
				incoming paths splice through to the next node.
			</p>
		</div>
	);
}

/** The `Label` + `Input` "Title" field repeated across every per-kind node editor. */
export function TitleInput({
	value,
	onChange,
	placeholder,
}: {
	value: string;
	onChange: (value: string) => void;
	placeholder: string;
}) {
	return (
		<div className="gap-1.5 flex flex-col">
			<Label>Title</Label>
			<Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
		</div>
	);
}
