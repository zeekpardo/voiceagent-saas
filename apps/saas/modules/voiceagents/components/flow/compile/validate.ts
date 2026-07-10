import type { CanvasDoc } from "../flow-types";
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

	const startEdges = doc.edges.filter((e) => e.source === START_NODE_ID);
	if (startEdges.length === 0) {
		errors.push("Connect the Start node to the node the call should begin on.");
	} else if (startEdges.length > 1) {
		errors.push("The Start node must connect to exactly one node.");
	} else if (!conversationalIds.has(startEdges[0].target)) {
		errors.push(
			"The call must start on an Agent, Objective, or Booking node — a branch or action node can't take the call first.",
		);
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
