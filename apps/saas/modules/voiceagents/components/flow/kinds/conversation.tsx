import { VariableIcon } from "lucide-react";

import {
	compileConversationNode,
	decompileConversationNode,
	newConversationNodeData,
} from "../compile/nodes/conversation";
import { ConversationNode } from "../ConversationNode";
import { ConversationNodeEditor } from "../editors/conversation";
import type { ConversationCanvasNodeDoc, ConversationNodeData } from "../flow-types";
import { conversationNodeDataSchema } from "../flow-types";
import { defineKind } from "./types";

export const conversationKind = defineKind<ConversationNodeData>({
	kind: "conversation",
	schema: conversationNodeDataSchema,
	canvasNode: ConversationNode,
	editor: ({ agentId, nodeId, data, onChange }) => (
		<ConversationNodeEditor
			agentId={agentId}
			nodeId={nodeId}
			data={data as ConversationNodeData}
			onChange={onChange}
		/>
	),
	sheetMeta: {
		title: "Edit Conversation",
		description:
			"A terminal “keep chatting” stage. The agent keeps talking with the contact off its Goal, business info, and response style until the call or thread ends. Add an Extra Prompt for extra guidance at this stage.",
	},
	subPanels: {
		fields: {
			title: "Fields & variables",
			description: "Insert contact and source fields into this stage.",
			icon: VariableIcon,
		},
	},
	newData: () => newConversationNodeData(),
	// Terminal node — no source handles, no edge labels.
	sourceHandles: () => new Set(),
	edgeLabel: () => undefined,
	compile: (node) => ({
		node: compileConversationNode(
			node as ConversationCanvasNodeDoc & { data: ConversationNodeData },
		),
	}),
	decompile: decompileConversationNode,
	validate: (node) => {
		const data = node.data as ConversationNodeData | undefined;
		const label = data?.title?.trim() || node.id;
		if (!data) {
			return [`Conversation node "${label}" has no data.`];
		}
		const errors: string[] = [];
		if (!data.title.trim()) {
			errors.push("A Conversation node needs a name.");
		}
		return errors;
	},
});
