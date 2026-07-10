import type {
	AgentCanvasNodeDoc,
	CanvasDoc,
	ScenarioCanvasNodeDoc,
	StatementCanvasNodeDoc,
	SwitchCanvasNodeDoc,
	SwitchNodeData,
	TransferCanvasNodeDoc,
	TrueFalseCanvasNodeDoc,
} from "../flow-types";
import { START_NODE_ID } from "../flow-types";
import { sanitizeExitName, sectionsToInstructions } from "./text";

/** Human-readable problems that block saving. Empty array = good to go. */
export function validateFlowDoc(doc: CanvasDoc): string[] {
	const errors: string[] = [];
	const agentNodes = doc.nodes.filter((n): n is AgentCanvasNodeDoc => n.type === "agent");
	// Conversational nodes can take the call first (they converse): agent nodes
	// plus objective and booking nodes, which compile to agent engine nodes.
	const conversationalIds = new Set(
		doc.nodes
			.filter((n) => n.type === "agent" || n.type === "objective" || n.type === "booking")
			.map((n) => n.id),
	);
	const branchNodes = doc.nodes.filter(
		(n): n is SwitchCanvasNodeDoc | TrueFalseCanvasNodeDoc =>
			n.type === "truefalse" || n.type === "switch",
	);
	const statementNodes = doc.nodes.filter(
		(n): n is StatementCanvasNodeDoc => n.type === "statement",
	);
	const scenarioNodes = doc.nodes.filter((n): n is ScenarioCanvasNodeDoc => n.type === "scenario");
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

	for (const node of branchNodes) {
		const data = node.data;
		const label = data?.title?.trim() || node.id;
		if (!data) {
			errors.push(`Branch node "${label}" has no data.`);
			continue;
		}
		if (!data.title.trim()) {
			errors.push(`A ${node.type === "truefalse" ? "True/False" : "Switch"} node needs a name.`);
		}
		if (!data.condition.trim()) {
			errors.push(
				node.type === "truefalse"
					? `True/False node "${label}" needs a statement to evaluate.`
					: `Switch node "${label}" needs a question to evaluate.`,
			);
		}
		if (node.type === "switch") {
			const switchData = data as SwitchNodeData;
			const pathCount = switchData.cases.length + (switchData.includeOtherwise ? 1 : 0);
			if (pathCount < 2) {
				errors.push(
					`Switch node "${label}" needs at least two paths — add cases or enable the Otherwise path.`,
				);
			}
			const seenCases = new Set<string>();
			for (const switchCase of switchData.cases) {
				if (!switchCase.name.trim()) {
					errors.push(`Switch node "${label}" has a case without a name.`);
					continue;
				}
				if (!switchCase.description.trim()) {
					errors.push(
						`Switch node "${label}" case "${switchCase.name}" needs a description (when to take it).`,
					);
				}
				const key = sanitizeExitName(switchCase.name);
				if (seenCases.has(key)) {
					errors.push(`Switch node "${label}" has duplicate case name "${switchCase.name}".`);
				}
				seenCases.add(key);
			}
		}
	}

	for (const node of statementNodes) {
		const data = node.data;
		const label = data?.title?.trim() || node.id;
		if (!data) {
			errors.push(`Statement node "${label}" has no data.`);
			continue;
		}
		if (!data.title.trim()) {
			errors.push("A Statement node needs a name.");
		}
		if (!data.say.trim()) {
			errors.push(`Statement node "${label}" needs something to say.`);
		}
	}

	const transferNodes = doc.nodes.filter(
		(n): n is TransferCanvasNodeDoc => n.type === "transfer",
	);
	for (const node of transferNodes) {
		const data = node.data;
		const label = data?.title?.trim() || node.id;
		if (!data) {
			errors.push(`Transfer node "${label}" has no data.`);
			continue;
		}
		if (!data.title.trim()) {
			errors.push("A Transfer node needs a name.");
		}
		if (!doc.edges.some((edge) => edge.source === node.id)) {
			errors.push(
				`Transfer node "${label}" must connect to the node the caller is transferred to.`,
			);
		}
	}

	const seenScenarioTitles = new Set<string>();
	for (const node of scenarioNodes) {
		const data = node.data;
		const label = data?.title?.trim() || node.id;
		if (!data) {
			errors.push(`Scenario "${label}" has no data.`);
			continue;
		}
		if (!data.title.trim()) {
			errors.push("A Scenario needs a name.");
		}
		if (!data.description.trim()) {
			errors.push(`Scenario "${label}" needs a description (when to jump).`);
		}
		if (!doc.edges.some((edge) => edge.source === node.id)) {
			errors.push(`Scenario "${label}" must connect to the node it jumps to.`);
		}
		const key = data.title.trim().toLowerCase();
		if (key) {
			if (seenScenarioTitles.has(key)) {
				errors.push(`Duplicate scenario name "${data.title.trim()}" — scenario names must be unique.`);
			}
			seenScenarioTitles.add(key);
		}
	}

	for (const node of agentNodes) {
		const data = node.data;
		const label = data?.title?.trim() || node.id;
		if (!data) {
			errors.push(`Node "${label}" has no data.`);
			continue;
		}
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
	}

	return errors;
}
