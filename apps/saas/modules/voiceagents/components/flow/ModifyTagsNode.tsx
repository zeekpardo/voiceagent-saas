"use client";

import type { Node, NodeProps } from "@xyflow/react";
import { TagsIcon } from "lucide-react";

import type { ModifyTagsNodeData } from "./flow-types";
import { MODIFY_TAGS_NEXT_HANDLE_ID } from "./flow-types";
import { FlowNodeShell, nodeTraceProps } from "./FlowNodeShell";

export type ModifyTagsRFNode = Node<ModifyTagsNodeData, "modify_tags">;

const SOURCE_HANDLES = [{ id: MODIFY_TAGS_NEXT_HANDLE_ID, name: "Next" }];

/**
 * A Modify Tags node: deterministically add (or remove) contact tags, then
 * continue. No conversation — the engine fires the tag change and moves on.
 */
export function ModifyTagsNode({ id, data, selected }: NodeProps<ModifyTagsRFNode>) {
	return (
		<FlowNodeShell
			id={id}
			selected={selected}
			title={data.title}
			fallbackTitle="Modify Tags"
			icon={TagsIcon}
			borderClassName="bg-gradient-to-br from-orange-500/70 to-amber-500/70"
			tileClassName="bg-gradient-to-br from-orange-500 to-amber-500"
			handleClassName="!bg-amber-500"
			targetHandleClassName="!bg-orange-500"
			sourceHandles={SOURCE_HANDLES}
			{...nodeTraceProps(data)}
		/>
	);
}
