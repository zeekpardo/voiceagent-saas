"use client";

import type { FlowNodeData, StopRespondingNodeData } from "../flow-types";
import { TitleInput, usePatch } from "./shared";

/**
 * Stop Responding node editor. The node has NO configuration — reaching it
 * parks the contact. The only field is the node's name; the rest is an
 * explanation of the behavior.
 */
export function StopRespondingNodeEditor({
	nodeId,
	data,
	onChange,
}: {
	nodeId: string;
	data: StopRespondingNodeData;
	onChange: (nodeId: string, data: FlowNodeData) => void;
}) {
	const patch = usePatch<StopRespondingNodeData>(nodeId, data, onChange);

	return (
		<>
			<TitleInput
				value={data.title}
				onChange={(value) => patch({ title: value })}
				placeholder="Stop responding"
			/>

			<p className="text-sm text-muted-foreground">
				When reached, the agent stops responding to the contact but keeps listening — the
				conversation is not ended. Custom scenarios keep being evaluated, so an incoming message can
				still re-engage the contact and route them onward.
			</p>
		</>
	);
}
