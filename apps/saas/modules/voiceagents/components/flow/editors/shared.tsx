"use client";

import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";

import type { FlowNodeData } from "../flow-types";

export interface FlowToolOption {
	id: string;
	name: string;
	description: string;
}

/** Sentinel for "use the agent's default calendar" in calendar selects. */
export const AGENT_DEFAULT_CALENDAR = "__agent_default__";

/** Sentinels for the objective/set-field "where to save it" field selects. */
export const OBJECTIVE_CUSTOM_FIELD = "__custom__";
export const OBJECTIVE_NO_FIELD = "__none__";

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
		<div className="flex flex-col gap-1.5">
			<Label>Title</Label>
			<Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
		</div>
	);
}
