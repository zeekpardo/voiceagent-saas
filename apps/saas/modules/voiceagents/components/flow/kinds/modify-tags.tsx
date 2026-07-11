import {
	compileModifyTagsNode,
	decompileModifyTagsNode,
	newModifyTagsNodeData,
} from "../compile/nodes/modify-tags";
import { ModifyTagsNodeEditor } from "../editors/modify-tags";
import type { ModifyTagsCanvasNodeDoc, ModifyTagsNodeData } from "../flow-types";
import { MODIFY_TAGS_NEXT_HANDLE_ID, modifyTagsNodeDataSchema } from "../flow-types";
import { ModifyTagsNode } from "../ModifyTagsNode";
import { defineKind } from "./types";

export const modifyTagsKind = defineKind<ModifyTagsNodeData>({
	kind: "modify_tags",
	schema: modifyTagsNodeDataSchema,
	canvasNode: ModifyTagsNode,
	editor: ({ nodeId, data, onChange }) => (
		<ModifyTagsNodeEditor nodeId={nodeId} data={data as ModifyTagsNodeData} onChange={onChange} />
	),
	sheetMeta: {
		title: "Edit Modify Tags",
		description:
			"Deterministically add or remove contact tags, then continue. No conversation — the tags change silently and the flow moves on.",
	},
	newData: () => newModifyTagsNodeData(),
	sourceHandles: () => new Set([MODIFY_TAGS_NEXT_HANDLE_ID]),
	edgeLabel: () => undefined,
	compile: (node, { targetOf }) => ({
		node: compileModifyTagsNode(
			node as ModifyTagsCanvasNodeDoc & { data: ModifyTagsNodeData },
			targetOf,
		),
	}),
	decompile: decompileModifyTagsNode,
});
