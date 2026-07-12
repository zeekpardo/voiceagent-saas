import type { CanvasDoc, FlowNodeKind, TransferNodeData } from "../flow-types";
import { START_NODE_ID } from "../flow-types";
import { FLOW_KIND_LIST } from "../kinds";

/** Human-readable problems that block saving. Empty array = good to go. */
export function validateFlowDoc(doc: CanvasDoc): string[] {
	const errors: string[] = [];
	// Conversational nodes can take the call first (they converse): agent nodes
	// plus objective, conversation and booking nodes, which all compile to agent
	// engine nodes.
	const conversationalIds = new Set(
		doc.nodes
			.filter(
				(n) =>
					n.type === "agent" ||
					n.type === "objective" ||
					n.type === "conversation" ||
					n.type === "booking",
			)
			.map((n) => n.id),
	);
	const nodeIds = new Set(doc.nodes.map((n) => n.id));

	if (conversationalIds.size === 0) {
		errors.push("Add at least one agent, objective, or booking node.");
	}

	// The Greeter is a required, single fixture: Start → Greeter → entry. Its
	// text becomes config.greeting and its outgoing edge target is the flow
	// entry — so the "which node takes the call first" checks apply to the
	// Greeter's edge, not the Start edge.
	const greeters = doc.nodes.filter((n) => n.type === "greeter");
	if (greeters.length === 0) {
		errors.push("The flow is missing its Greeter — reopen the flow to restore it.");
	} else if (greeters.length > 1) {
		errors.push("A flow can only have one Greeter.");
	}
	const greeter = greeters[0];

	const startEdges = doc.edges.filter((e) => e.source === START_NODE_ID);
	if (startEdges.length === 0) {
		errors.push("Connect the Start node to the Greeter.");
	} else if (startEdges.length > 1) {
		errors.push("The Start node must connect to exactly one node.");
	} else if (greeter && startEdges[0].target !== greeter.id) {
		errors.push("The Start node must connect to the Greeter.");
	}

	if (greeter) {
		const greeterEdges = doc.edges.filter((e) => e.source === greeter.id);
		if (greeterEdges.length === 0) {
			errors.push("Connect the Greeter to the node the call should begin on.");
		} else if (greeterEdges.length > 1) {
			errors.push("The Greeter must connect to exactly one node.");
		} else if (!conversationalIds.has(greeterEdges[0].target)) {
			errors.push(
				"The call must start on an Agent, Objective, or Booking node — a branch or action node can't take the call first.",
			);
		}
	}

	for (const edge of doc.edges) {
		if (!nodeIds.has(edge.target)) {
			errors.push(`An edge points at a node that no longer exists ("${edge.target}").`);
		}
	}

	// Per-kind checks live on each registry entry (kinds/*). Looping the registry
	// list keeps "add a node kind" to a single new file.
	for (const entry of FLOW_KIND_LIST) {
		if (!entry.validate) {
			continue;
		}
		for (const node of doc.nodes) {
			if (node.type === entry.kind) {
				errors.push(...entry.validate(node, doc));
			}
		}
	}

	return errors;
}

/**
 * Source node kinds whose outgoing edges are *model-callable* exits — the agent
 * (or conversation node) picks an exit, or a scenario fires its jump. These are
 * the only transitions the engine can start an attended (warm) transfer from
 * (the exit-tool path). Every other inbound path — an objective/statement/action
 * "Next" auto-advance, a branch router, a booking outcome, the greeter — reaches
 * a node automatically, with no function-tool context, so the engine silently
 * degrades a warm transfer to a blind cold SIP REFER.
 */
const MODEL_CALLABLE_SOURCE_KINDS: ReadonlySet<FlowNodeKind> = new Set([
	"agent",
	"conversation",
	"scenario",
]);

/**
 * Non-blocking soundness warnings surfaced as a toast on save (distinct from
 * validateFlowDoc's hard errors). Empty array = nothing to flag.
 *
 * Today it catches the warm-transfer footgun: a `mode:"warm"` transfer node
 * reachable ONLY via automatic transitions. The engine can run the real
 * attended WarmTransferTask only when the node is reached from a model-callable
 * exit/scenario; reached automatically it falls back to a blind cold transfer,
 * which the author never asked for. If at least one inbound edge comes from a
 * model-callable source the author has a working path, so we stay quiet.
 */
export function flowSoundnessWarnings(doc: CanvasDoc): string[] {
	const warnings: string[] = [];
	const kindById = new Map(doc.nodes.map((n) => [n.id, n.type]));
	for (const node of doc.nodes) {
		if (node.type !== "transfer") {
			continue;
		}
		const data = node.data as TransferNodeData | undefined;
		if ((data?.mode ?? "simulated") !== "warm") {
			continue;
		}
		const inbound = doc.edges.filter((edge) => edge.target === node.id);
		// No inbound edges = unreachable; that's a structural concern, not this one.
		if (inbound.length === 0) {
			continue;
		}
		const reachableByAgent = inbound.some((edge) => {
			const sourceKind = kindById.get(edge.source);
			return (
				sourceKind !== undefined &&
				MODEL_CALLABLE_SOURCE_KINDS.has(sourceKind as FlowNodeKind)
			);
		});
		if (!reachableByAgent) {
			const label = data?.title?.trim() || node.id;
			warnings.push(
				`Warm transfer "${label}" to a person must be triggered by the agent ` +
					`(e.g. a scenario like "caller asks for a human" or an exit condition), ` +
					`not reached as an automatic next step — otherwise it falls back to a ` +
					`blind (cold) transfer.`,
			);
		}
	}
	return warnings;
}
