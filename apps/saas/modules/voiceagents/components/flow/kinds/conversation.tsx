import {
	compileConversationNode,
	decompileConversationNode,
	newConversationNodeData,
} from "../compile/nodes/conversation";
import { sanitizeExitName } from "../compile/text";
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
			"An open-ended discovery loop — no objectives, no tools. The AI probes from the conversation reason, then wraps up explicitly (end the call or take an exit).",
	},
	newData: () => newConversationNodeData(),
	sourceHandles: (data) => new Set(data.exits.map((exit) => exit.id)),
	edgeLabel: (data, sourceHandle) =>
		data.exits.find((exit) => exit.id === sourceHandle)?.name.trim() || undefined,
	compile: (node, { targetOf }) => ({
		node: compileConversationNode(
			node as ConversationCanvasNodeDoc & { data: ConversationNodeData },
			targetOf,
		),
	}),
	decompile: decompileConversationNode,
	validate: (node, doc) => {
		const data = node.data as ConversationNodeData | undefined;
		const label = data?.title?.trim() || node.id;
		if (!data) {
			return [`Conversation node "${label}" has no data.`];
		}
		const errors: string[] = [];
		if (!data.title.trim()) {
			errors.push("A Conversation node needs a name.");
		}
		if (!data.reason.trim()) {
			errors.push(`Conversation node "${label}" needs a conversation reason.`);
		}
		const seen = new Set<string>();
		for (const exit of data.exits) {
			if (!exit.name.trim()) {
				errors.push(`Conversation node "${label}" has an exit without a name.`);
				continue;
			}
			if (!exit.description.trim()) {
				errors.push(
					`Conversation node "${label}" exit "${exit.name}" needs a description (when to take it).`,
				);
			}
			const key = sanitizeExitName(exit.name);
			if (seen.has(key)) {
				errors.push(`Conversation node "${label}" has duplicate exit name "${exit.name}".`);
			}
			seen.add(key);
		}
		// A wrap-up "take exit" must point at one of this node's exits.
		if (data.wrapUpMode === "exit") {
			if (!data.wrapUpExitId || !data.exits.some((e) => e.id === data.wrapUpExitId)) {
				errors.push(
					`Conversation node "${label}" wraps up to an exit — pick one of its exits (or switch to ending the call).`,
				);
			}
		}
		// At most one default conversation node per flow — this node is the
		// duplicate when an earlier conversation node (doc order) is also default.
		if (data.isDefault) {
			const idx = doc.nodes.indexOf(node);
			const earlierDefault = doc.nodes.some(
				(other, i) =>
					i < idx &&
					other.type === "conversation" &&
					(other.data as ConversationNodeData | undefined)?.isDefault === true,
			);
			if (earlierDefault) {
				errors.push(
					"Only one conversation node can be the default for unconnected exits — two are marked default.",
				);
			}
		}
		return errors;
	},
});
