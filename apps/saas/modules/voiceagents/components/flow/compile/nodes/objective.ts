import { FULL_ADDRESS_FIELD_KEY } from "../../field-adapter";
import type {
	CanvasEdgeDoc,
	CanvasNodeDoc,
	EngineFlowNode,
	ObjectiveCanvasNodeDoc,
	ObjectiveDoc,
	ObjectiveNodeData,
} from "../../flow-types";
import { OBJECTIVE_NEXT_HANDLE_ID } from "../../flow-types";
import { makeId } from "../text";

/** The engine field keys the managed full-address parts write to, in order. */
const FULL_ADDRESS_PART_FIELDS = [
	"contact.address1",
	"contact.city",
	"contact.state",
	"contact.postal_code",
] as const;

/**
 * Expand any single "Full address" objective (`fullAddress`) into the managed
 * street/city/state/zip parts + aggregate. The builder keeps full address as one
 * normal-looking row; the four-part collector only materializes here at compile
 * time, so the engine spec is unchanged. Non-full-address objectives pass through.
 */
export function expandFullAddress(objectives: ObjectiveDoc[]): ObjectiveDoc[] {
	if (!objectives.some((o) => o.fullAddress)) return objectives;
	return objectives.flatMap((o) =>
		o.fullAddress ? newFullAddressObjectiveData().objectives : [o],
	);
}

/**
 * Inverse of `expandFullAddress`: fold a saved managed full-address group (four
 * street/city/state/zip parts + a contact.address aggregate composing them) back
 * into ONE `fullAddress` objective row. Detected purely by shape, so it collapses
 * both older canvases (parts flagged `managed`) and flows decompiled from the
 * engine. Generic user-built aggregates (different field / parts) are untouched.
 */
export function collapseFullAddress(objectives: ObjectiveDoc[]): ObjectiveDoc[] {
	const aggregate = objectives.find(
		(o) => o.field === FULL_ADDRESS_FIELD_KEY && !!o.aggregateOf?.length,
	);
	if (!aggregate?.aggregateOf) return objectives;
	const partIds = new Set(aggregate.aggregateOf);
	const parts = objectives.filter((o) => partIds.has(o.id));
	const partFields = new Set(parts.map((o) => o.field));
	const isManagedAddress =
		parts.length === FULL_ADDRESS_PART_FIELDS.length &&
		FULL_ADDRESS_PART_FIELDS.every((f) => partFields.has(f));
	if (!isManagedAddress) return objectives;
	const memberIds = new Set<string>([aggregate.id, ...partIds]);
	const single: ObjectiveDoc = {
		id: aggregate.id,
		title: "Full Address",
		description: "",
		field: FULL_ADDRESS_FIELD_KEY,
		fullAddress: true,
	};
	return objectives.flatMap((o) => {
		if (o.id === aggregate.id) return [single];
		return memberIds.has(o.id) ? [] : [o];
	});
}

export function compileObjectiveNode(
	node: ObjectiveCanvasNodeDoc & { data: ObjectiveNodeData },
	entry: string,
	targetOf: (nodeId: string, handleId: string) => string | undefined,
): EngineFlowNode {
	// An objective node compiles to an engine AGENT node carrying
	// objectives[]; the engine gathers them one at a time and auto-takes
	// the single Next exit once every required objective is verified.
	const target = targetOf(node.id, OBJECTIVE_NEXT_HANDLE_ID);
	// Expand any single "Full address" row into its managed parts + aggregate
	// before compiling, so the engine spec is identical to authoring them by hand.
	const expanded = expandFullAddress(node.data.objectives);
	// An aggregate objective composes other objectives' answers, so it may carry no
	// own description — keep it even when the description is blank (a non-aggregate
	// still needs a description to be judged).
	const kept = expanded.filter((o) => o.description.trim() || o.aggregateOf?.length);
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
		// Compiled for every node, including the entry node: on a normal call the
		// engine ignores the entry node's entryInstructions (the greeting opens),
		// but on a HANDOFF the target's entry node is entered fresh and speaks it.
		entryInstructions: node.data.entryMessage.trim() || undefined,
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
	// Collapse a managed full-address group (4 parts + aggregate) back into ONE
	// row so it renders like every other objective (inverse of expandFullAddress).
	const objectives = collapseFullAddress(
		(flowNode.objectives ?? []).map((o) => ({
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
	);
	return {
		node: {
			id: flowNode.id,
			type: "objective",
			position,
			data: {
				title: flowNode.name ?? flowNode.id,
				entryMessage: flowNode.entryInstructions ?? "",
				objectives,
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
 * them into contact.address once every part is met. All five are `managed`.
 * This is the COMPILE-TIME expansion of a single `fullAddress` objective row
 * (see `expandFullAddress`): the builder shows one clean row, and these parts
 * only materialize when compiling to the engine spec — never in the editor.
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
