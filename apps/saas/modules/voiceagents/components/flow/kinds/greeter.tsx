import { newGreeterNodeData } from "../compile/nodes/greeter";
import { GreeterNodeEditor } from "../editors/greeter";
import type { GreeterNodeData } from "../flow-types";
import { GREETER_NEXT_HANDLE_ID, greeterNodeDataSchema } from "../flow-types";
import { GreeterNode } from "../GreeterNode";
import { defineKind } from "./types";

/**
 * The Greeter fixture — exactly one per flow, always present, not deletable and
 * not in the Actions palette (it is a canvas fixture like Start). Its text is
 * folded into config.greeting by compileCanvas; there is no engine node to emit
 * (compile returns nothing) and no per-node decompile (canvasFromFlow inserts
 * the greeter directly). Cross-node checks (exactly one greeter, Start→Greeter,
 * Greeter→conversational entry) live in compile/validate.ts.
 */
export const greeterKind = defineKind<GreeterNodeData>({
	kind: "greeter",
	schema: greeterNodeDataSchema,
	canvasNode: GreeterNode,
	editor: ({ nodeId, data, onChange }) => (
		<GreeterNodeEditor nodeId={nodeId} data={data as GreeterNodeData} onChange={onChange} />
	),
	sheetMeta: {
		title: "Edit Greeter",
		description: "What the agent says the moment the call connects.",
	},
	newData: () => newGreeterNodeData(),
	sourceHandles: () => new Set([GREETER_NEXT_HANDLE_ID]),
	edgeLabel: () => undefined,
	// The greeter is not an engine node — it contributes config.greeting + the
	// flow entry, both handled in compileCanvas. Emit nothing here.
	compile: () => ({}),
	validate: (node) => {
		const data = node.data as GreeterNodeData | undefined;
		if (!data) {
			return ["The Greeter has no data."];
		}
		return [];
	},
});
