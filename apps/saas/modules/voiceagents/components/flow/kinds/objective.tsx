import { compileObjectiveNode, decompileObjectiveNode, newObjectiveNodeData } from "../compile/nodes/objective";
import { ObjectiveNodeEditor } from "../editors/objective";
import type { ObjectiveCanvasNodeDoc, ObjectiveNodeData } from "../flow-types";
import { objectiveNodeDataSchema } from "../flow-types";
import { ObjectiveNode } from "../ObjectiveNode";
import { defineKind } from "./types";

export const objectiveKind = defineKind<ObjectiveNodeData>({
	kind: "objective",
	schema: objectiveNodeDataSchema,
	canvasNode: ObjectiveNode,
	editor: ({ nodeId, data, isEntry, onChange }) => (
		<ObjectiveNodeEditor
			nodeId={nodeId}
			data={data as ObjectiveNodeData}
			isEntry={isEntry}
			onChange={onChange}
		/>
	),
	sheetMeta: {
		title: "Edit Objective",
		description:
			"Gather information from the caller, one question at a time. The system verifies each objective as they answer, saves it to the chosen field, and moves on automatically once every objective is met.",
	},
	newData: () => newObjectiveNodeData(),
	sourceHandles: () => new Set(),
	edgeLabel: () => undefined,
	compile: (node, { entry, targetOf }) => ({
		node: compileObjectiveNode(
			node as ObjectiveCanvasNodeDoc & { data: ObjectiveNodeData },
			entry,
			targetOf,
		),
	}),
	decompile: decompileObjectiveNode,
});
