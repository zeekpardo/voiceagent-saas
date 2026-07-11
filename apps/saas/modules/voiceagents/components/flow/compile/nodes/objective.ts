import type {
	CanvasEdgeDoc,
	CanvasNodeDoc,
	EngineFlowNode,
	ObjectiveCanvasNodeDoc,
	ObjectiveNodeData,
} from "../../flow-types";
import { OBJECTIVE_NEXT_HANDLE_ID } from "../../flow-types";
import { makeId } from "../text";

export function compileObjectiveNode(
	node: ObjectiveCanvasNodeDoc & { data: ObjectiveNodeData },
	entry: string,
	targetOf: (nodeId: string, handleId: string) => string | undefined,
): EngineFlowNode {
	// An objective node compiles to an engine AGENT node carrying
	// objectives[]; the engine gathers them one at a time and auto-takes
	// the single Next exit once every required objective is verified.
	const target = targetOf(node.id, OBJECTIVE_NEXT_HANDLE_ID);
	// An aggregate objective composes other objectives' answers, so it may carry no
	// own description — keep it even when the description is blank (a non-aggregate
	// still needs a description to be judged).
	const kept = node.data.objectives.filter((o) => o.description.trim() || o.aggregateOf?.length);
	// Stable slug per surviving objective, keyed by its doc id, so aggregateOf
	// (stored as doc ids) resolves to the engine keys.
	const slugById = new Map<string, string>();
	kept.forEach((o, i) => {
		const slug =
			(o.title.trim() || o.field.trim() || `objective_${i + 1}`)
				.toLowerCase()
				.replace(/[^a-z0-9]+/g, "_")
				.replace(/^_+|_+$/g, "") || `objective_${i + 1}`;
		slugById.set(o.id, slug);
	});
	const objectives = kept.map((o) => {
		// Resolve aggregateOf doc ids → engine keys, dropping any part that didn't
		// survive filtering (defensive — validation blocks unknown parts).
		const aggregateOf = o.aggregateOf?.length
			? o.aggregateOf.map((id) => slugById.get(id)).filter((k): k is string => !!k)
			: undefined;
		const isAggregate = !!aggregateOf?.length;
		return {
			key: slugById.get(o.id)!,
			description:
				o.description.trim() || (isAggregate ? "Combined from the objectives above." : ""),
			field: o.field.trim() || undefined,
			options: o.options?.length ? o.options : undefined,
			maxAttempts: o.maxAttempts,
			sensitivity: o.sensitivity,
			aggregateOf,
		};
	});
	// Aggregate objectives aren't asked directly, so keep them out of the spoken
	// "gather the following" list.
	const list = kept
		.filter((o) => o.description.trim() && !o.aggregateOf?.length)
		.map((o) => `- ${o.description.trim()}`)
		.join("\n");
	return {
		id: node.id,
		name: node.data.title.trim() || undefined,
		instructions:
			`Gather the following from the caller, naturally and one question at a time:\n${list}` ||
			"Gather the information for this stage.",
		entryInstructions:
			node.id !== entry && node.data.entryMessage.trim()
				? node.data.entryMessage.trim()
				: undefined,
		toolIds: [],
		objectives,
		exits: [{ name: "Next", description: "All objectives gathered", target }],
	};
}

/**
 * An engine agent node carrying objectives round-trips as an Objective
 * canvas node (single Next handle → its primary exit's target).
 */
export function decompileObjectiveNode(
	flowNode: EngineFlowNode,
	position: { x: number; y: number },
): { node: CanvasNodeDoc; edges: CanvasEdgeDoc[] } {
	const edges: CanvasEdgeDoc[] = [];
	const target = flowNode.exits[0]?.target;
	if (target) {
		edges.push({
			id: makeId("edge"),
			source: flowNode.id,
			sourceHandle: OBJECTIVE_NEXT_HANDLE_ID,
			target,
		});
	}
	// Assign a doc id per engine objective, keyed by engine key, so aggregateOf
	// (engine keys) can be mapped back to the new doc ids.
	const idByKey = new Map<string, string>();
	for (const o of flowNode.objectives ?? []) {
		idByKey.set(o.key, makeId("obj"));
	}
	return {
		node: {
			id: flowNode.id,
			type: "objective",
			position,
			data: {
				title: flowNode.name ?? flowNode.id,
				entryMessage: flowNode.entryInstructions ?? "",
				objectives: (flowNode.objectives ?? []).map((o) => ({
					id: idByKey.get(o.key)!,
					title: o.key,
					description: o.description,
					field: o.field ?? "",
					options: o.options,
					maxAttempts: o.maxAttempts,
					sensitivity: o.sensitivity,
					aggregateOf: o.aggregateOf?.length
						? o.aggregateOf.map((k) => idByKey.get(k)).filter((id): id is string => !!id)
						: undefined,
				})),
			},
		},
		edges,
	};
}

/** Fresh Objective node data — one blank objective to fill in. */
export function newObjectiveNodeData(): ObjectiveNodeData {
	return {
		title: "Objective",
		entryMessage: "",
		objectives: [{ id: makeId("obj"), title: "", description: "", field: "" }],
	};
}

/**
 * The managed "Full address" objective set — a platform-managed composite: four
 * part objectives (street/city/state/zip) plus an aggregate that assembles
 * them into contact.address once every part is met. All five are `managed`,
 * so the editor renders them read-only (see ObjectiveNodeEditor). Applied when
 * the user picks "Full address" as an objective's output field (see
 * ObjectiveNodeEditor's field-pick handler) — not a standalone palette item.
 */
export function newFullAddressObjectiveData(): ObjectiveNodeData {
	const streetId = makeId("obj");
	const cityId = makeId("obj");
	const stateId = makeId("obj");
	const postalId = makeId("obj");
	return {
		title: "Get Full Address",
		entryMessage: "",
		objectives: [
			{
				id: streetId,
				title: "Street",
				description: "determine the caller's street address",
				field: "contact.address1",
				managed: true,
			},
			{
				id: cityId,
				title: "City",
				description: "determine the caller's city",
				field: "contact.city",
				managed: true,
			},
			{
				id: stateId,
				title: "State",
				description: "determine the caller's state",
				field: "contact.state",
				managed: true,
			},
			{
				id: postalId,
				title: "Postal Code",
				description: "determine the caller's ZIP or postal code",
				field: "contact.postal_code",
				managed: true,
			},
			{
				id: makeId("obj"),
				title: "Full Address",
				description: "",
				field: "contact.address",
				aggregateOf: [streetId, cityId, stateId, postalId],
				managed: true,
			},
		],
	};
}
