import {
	compileObjectiveNode,
	decompileObjectiveNode,
	newObjectiveNodeData,
} from "../compile/nodes/objective";
import { ObjectiveNodeEditor } from "../editors/objective";
import type { ObjectiveCanvasNodeDoc, ObjectiveDoc, ObjectiveNodeData } from "../flow-types";
import { objectiveNodeDataSchema } from "../flow-types";
import { ObjectiveNode } from "../ObjectiveNode";
import { defineKind } from "./types";

/**
 * Aggregate-objective checks (Phase 5b): a "Combine other objectives" objective
 * (aggregateOf) may only reference other objectives IN THIS node, never itself,
 * and never another aggregate (no aggregate-of-aggregate) — mirroring the engine
 * schema's superRefine so the builder blocks a doc the engine would reject.
 */
function validateObjectiveNode(
	node: ObjectiveCanvasNodeDoc & { data?: ObjectiveNodeData },
): string[] {
	const errors: string[] = [];
	const objectives = (node.data?.objectives ?? []) as ObjectiveDoc[];
	const byId = new Map(objectives.map((o) => [o.id, o]));
	const aggregateIds = new Set(objectives.filter((o) => o.aggregateOf?.length).map((o) => o.id));
	const nodeLabel = node.data?.title?.trim() || "Objective node";
	for (const o of objectives) {
		if (!o.aggregateOf?.length) continue;
		const name = o.title.trim() || "an objective";
		for (const partId of o.aggregateOf) {
			if (partId === o.id) {
				errors.push(`${nodeLabel}: combined objective "${name}" can't include itself.`);
			} else if (!byId.has(partId)) {
				errors.push(
					`${nodeLabel}: combined objective "${name}" references an objective that no longer exists.`,
				);
			} else if (aggregateIds.has(partId)) {
				errors.push(
					`${nodeLabel}: combined objective "${name}" can't include another combined objective.`,
				);
			}
		}
	}
	return errors;
}

export const objectiveKind = defineKind<ObjectiveNodeData>({
	kind: "objective",
	schema: objectiveNodeDataSchema,
	canvasNode: ObjectiveNode,
	editor: ({ agentId, nodeId, data, isEntry, onChange }) => (
		<ObjectiveNodeEditor
			agentId={agentId}
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
	validate: (node) =>
		validateObjectiveNode(node as ObjectiveCanvasNodeDoc & { data?: ObjectiveNodeData }),
});
