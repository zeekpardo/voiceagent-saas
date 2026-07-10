import { ArrowRightIcon, SettingsIcon, WrenchIcon } from "lucide-react";

import { AgentFlowNode } from "../AgentFlowNode";
import { compileAgentNode, decompileAgentNode, newAgentNodeData } from "../compile/nodes/agent";
import { sanitizeExitName, sectionsToInstructions } from "../compile/text";
import { AgentPromptEditor } from "../editors/agent";
import type { AgentCanvasNodeDoc, AgentNodeData } from "../flow-types";
import { agentNodeDataSchema } from "../flow-types";
import { defineKind } from "./types";

export const agentKind = defineKind<AgentNodeData>({
	kind: "agent",
	schema: agentNodeDataSchema,
	canvasNode: AgentFlowNode,
	editor: ({ nodeId, data, isEntry, onChange, mentionExtension }) =>
		mentionExtension ? (
			<AgentPromptEditor
				nodeId={nodeId}
				data={data as AgentNodeData}
				isEntry={isEntry}
				mentionExtension={mentionExtension}
				onChange={onChange}
			/>
		) : null,
	sheetMeta: {
		title: "Edit agent node",
		description:
			"The prompt is the star — type @ for variables, @@ for tools, @@@ for exits. Tools, exits and settings live in the side rail.",
	},
	subPanels: {
		settings: {
			title: "Node settings",
			description: "Model override and booking behavior for this stage.",
			icon: SettingsIcon,
		},
		tools: {
			title: "Tools",
			description: "What this node may call while it is active. @@chips check tools automatically.",
			icon: WrenchIcon,
		},
		exits: {
			title: "Exit paths",
			description: "Mention exits in the prompt with @@@ to include them as AI exit choices.",
			icon: ArrowRightIcon,
		},
	},
	newData: () => newAgentNodeData("New agent"),
	fallbackData: () => newAgentNodeData("Untitled agent"),
	sourceHandles: (data) => new Set(data.exits.map((exit) => exit.id)),
	edgeLabel: (data, sourceHandle) =>
		data.exits.find((exit) => exit.id === sourceHandle)?.name.trim() || undefined,
	compile: (node, { entry, targetOf }) => ({
		node: compileAgentNode(node as AgentCanvasNodeDoc & { data: AgentNodeData }, entry, targetOf),
	}),
	decompile: decompileAgentNode,
	validate: (node) => {
		const data = node.data as AgentNodeData | undefined;
		const label = data?.title?.trim() || node.id;
		if (!data) {
			return [`Node "${label}" has no data.`];
		}
		const errors: string[] = [];
		if (sectionsToInstructions(data.sections).length === 0) {
			errors.push(`Node "${label}" has empty instructions — write at least one section.`);
		}
		const seen = new Set<string>();
		for (const exit of data.exits) {
			if (!exit.name.trim()) {
				errors.push(`Node "${label}" has an exit without a name.`);
				continue;
			}
			if (!exit.description.trim()) {
				errors.push(`Node "${label}" exit "${exit.name}" needs a description (when to take it).`);
			}
			const key = sanitizeExitName(exit.name);
			if (seen.has(key)) {
				errors.push(`Node "${label}" has duplicate exit name "${exit.name}".`);
			}
			seen.add(key);
		}
		return errors;
	},
});
