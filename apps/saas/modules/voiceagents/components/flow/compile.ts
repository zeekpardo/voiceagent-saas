import type {
	AgentCanvasNodeDoc,
	AgentNodeData,
	CanvasDoc,
	CanvasEdgeDoc,
	CanvasNodeDoc,
	EngineFlow,
	EngineFlowExit,
	EngineFlowNode,
	EngineFlowScenario,
	FlowSectionDoc,
	ScenarioCanvasNodeDoc,
	ScenarioNodeData,
	StatementCanvasNodeDoc,
	StatementNodeData,
	SwitchCanvasNodeDoc,
	SwitchNodeData,
	TrueFalseCanvasNodeDoc,
	TrueFalseNodeData,
} from "./flow-types";
import {
	FALSE_HANDLE_ID,
	OTHERWISE_HANDLE_ID,
	SCENARIO_JUMP_HANDLE_ID,
	START_HANDLE_ID,
	START_NODE_ID,
	STATEMENT_NEXT_HANDLE_ID,
	TRUE_HANDLE_ID,
} from "./flow-types";

/**
 * Canvas document → engine flow payload. Pure functions only — no React,
 * no TipTap imports; the rich-text bodies are walked as plain JSON.
 */

/** Mention trigger characters — also stored on every chip (mentionSuggestionChar). */
export const MENTION_CHAR_VARIABLE = "@";
export const MENTION_CHAR_TOOL = "@@";
export const MENTION_CHAR_EXIT = "@@@";

interface TiptapNode {
	type?: string;
	text?: string;
	attrs?: Record<string, unknown>;
	content?: TiptapNode[];
}

/** Exit names become engine tools `exit_<sanitized>`: lowercase, non-alnum runs → _. */
export function sanitizeExitName(name: string): string {
	return name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "_")
		.replace(/^_+|_+$/g, "");
}

function attrString(value: unknown, fallback = ""): string {
	return typeof value === "string" ? value : fallback;
}

function serializeMention(attrs: Record<string, unknown> | undefined): string {
	const id = attrString(attrs?.id);
	const char = attrString(attrs?.mentionSuggestionChar, MENTION_CHAR_VARIABLE);
	if (char === MENTION_CHAR_EXIT) {
		return `the exit tool "exit_${sanitizeExitName(id)}"`;
	}
	if (char === MENTION_CHAR_TOOL) {
		return id;
	}
	return `{{${id}}}`;
}

/** Walk a TipTap JSON document into plain text (chips → serialized text). */
export function tiptapToText(doc: unknown): string {
	if (!doc || typeof doc !== "object") {
		return "";
	}
	return nodeToText(doc as TiptapNode);
}

function nodeToText(node: TiptapNode): string {
	if (node.type === "text") {
		return node.text ?? "";
	}
	if (node.type === "mention") {
		return serializeMention(node.attrs);
	}
	if (node.type === "hardBreak") {
		return "\n";
	}
	const children = node.content ?? [];
	if (node.type === "doc" || node.type === "blockquote") {
		return children.map(nodeToText).join("\n");
	}
	if (node.type === "bulletList" || node.type === "orderedList") {
		return children
			.map((child, i) => `${node.type === "orderedList" ? `${i + 1}.` : "-"} ${nodeToText(child)}`)
			.join("\n");
	}
	if (node.type === "listItem") {
		return children.map(nodeToText).join("\n");
	}
	// paragraph, heading and unknown wrappers: concatenate inline content.
	return children.map(nodeToText).join("");
}

/** Sections → the node's plain-text prompt (`## Title` headers between sections). */
export function sectionsToInstructions(sections: FlowSectionDoc[]): string {
	return sections
		.map((section) => {
			const body = tiptapToText(section.body).trim();
			const title = section.title?.trim();
			return title ? `## ${title}\n${body}` : body;
		})
		.filter((part) => part.length > 0)
		.join("\n\n")
		.trim();
}

/** Human-readable problems that block saving. Empty array = good to go. */
export function validateFlowDoc(doc: CanvasDoc): string[] {
	const errors: string[] = [];
	const agentNodes = doc.nodes.filter((n): n is AgentCanvasNodeDoc => n.type === "agent");
	const branchNodes = doc.nodes.filter(
		(n): n is SwitchCanvasNodeDoc | TrueFalseCanvasNodeDoc =>
			n.type === "truefalse" || n.type === "switch",
	);
	const statementNodes = doc.nodes.filter(
		(n): n is StatementCanvasNodeDoc => n.type === "statement",
	);
	const scenarioNodes = doc.nodes.filter((n): n is ScenarioCanvasNodeDoc => n.type === "scenario");
	const nodeIds = new Set(doc.nodes.map((n) => n.id));

	if (agentNodes.length === 0) {
		errors.push("Add at least one agent node.");
	}

	const startEdges = doc.edges.filter((e) => e.source === START_NODE_ID);
	if (startEdges.length === 0) {
		errors.push("Connect the Start node to the agent the call should begin on.");
	} else if (startEdges.length > 1) {
		errors.push("The Start node must connect to exactly one agent.");
	} else if (branchNodes.some((n) => n.id === startEdges[0].target)) {
		errors.push(
			"The call must start on an Agent node — a branch node can't take the call first. Connect Start to an agent.",
		);
	} else if (!agentNodes.some((n) => n.id === startEdges[0].target)) {
		errors.push("The Start node must connect to an agent node.");
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

/**
 * Compile the canvas into the engine payload. Assumes validateFlowDoc passed.
 * Root toolIds = union of every node's tools ∪ baseToolIds (tools attached
 * via the classic Configure/Tools tabs must not be dropped).
 */
export function compileCanvas(
	doc: CanvasDoc,
	baseToolIds: string[],
): { flow: EngineFlow; toolIds: string[] } {
	const startEdge = doc.edges.find((e) => e.source === START_NODE_ID);
	const entry = startEdge?.target ?? "";

	// No outgoing edge → omit target → the exit ends the call.
	const targetOf = (nodeId: string, handleId: string) =>
		doc.edges.find((e) => e.source === nodeId && e.sourceHandle === handleId)?.target;

	const nodes: EngineFlowNode[] = [];
	const scenarios: EngineFlowScenario[] = [];
	for (const node of doc.nodes) {
		if (node.type === "scenario" && node.data) {
			// Scenario nodes compile into flow.scenarios (global detect-and-jump),
			// not flow.nodes — their single edge defines the jump target.
			scenarios.push({
				name: node.data.title.trim(),
				description: node.data.description.trim(),
				target: targetOf(node.id, SCENARIO_JUMP_HANDLE_ID) ?? "",
			});
		} else if (node.type === "statement" && node.data) {
			const say = node.data.say.trim();
			const target = targetOf(node.id, STATEMENT_NEXT_HANDLE_ID);
			nodes.push({
				id: node.id,
				name: node.data.title.trim() || undefined,
				kind: "statement",
				statement: { say },
				// The engine requires instructions min 1 on every node — mirror the say text.
				instructions: say,
				toolIds: [],
				// Unwired Next → no exits → the call ends after speaking.
				exits: target ? [{ name: "Next", description: "Continue", target }] : [],
			});
		} else if (node.type === "agent" && node.data) {
			const entryMessage = node.data.entryMessage.trim();
			// Per-node booking settings ride the tools' existing LLM-facing args:
			// calendar_name (executor's explicit-name branch), book_appointment's
			// title, and add_tag on failure. Unset fields append nothing, so a doc
			// without them compiles byte-identical.
			const calendarName = node.data.calendarName?.trim();
			const appointmentTitle = node.data.appointmentTitle?.trim();
			const failedBookingTag = node.data.failedBookingTag?.trim();
			let instructions = sectionsToInstructions(node.data.sections);
			if (calendarName) {
				instructions += `\n\nAlways pass calendar_name "${calendarName}" when using check_availability or book_appointment.`;
			}
			if (appointmentTitle) {
				instructions += `\n\nWhen booking, use the appointment title "${appointmentTitle}".`;
			}
			if (failedBookingTag) {
				instructions += `\n\nIf booking fails or no time works, use add_tag with tag "${failedBookingTag}".`;
			}
			nodes.push({
				id: node.id,
				name: node.data.title.trim() || undefined,
				instructions,
				// The engine ignores entryInstructions on the entry node — omit it there.
				entryInstructions: node.id !== entry && entryMessage ? entryMessage : undefined,
				toolIds: [...node.data.toolIds],
				llm: node.data.model ? { model: node.data.model } : undefined,
				exits: node.data.exits.map((exit) => ({
					name: exit.name.trim(),
					description: exit.description.trim(),
					target: targetOf(node.id, exit.id),
				})),
			});
		} else if (node.type === "truefalse" && node.data) {
			const condition = node.data.condition.trim();
			nodes.push({
				id: node.id,
				name: node.data.title.trim() || undefined,
				kind: "router",
				router: { condition },
				// The engine requires instructions min 1 on every node — mirror the condition.
				instructions: condition,
				toolIds: [],
				exits: [
					{
						name: "True",
						description: "The statement is true",
						target: targetOf(node.id, TRUE_HANDLE_ID),
					},
					{
						name: "False",
						description: "The statement is false",
						target: targetOf(node.id, FALSE_HANDLE_ID),
					},
				],
			});
		} else if (node.type === "switch" && node.data) {
			const condition = node.data.condition.trim();
			const exits: EngineFlowExit[] = node.data.cases.map((switchCase) => ({
				name: switchCase.name.trim(),
				description: switchCase.description.trim(),
				target: targetOf(node.id, switchCase.id),
			}));
			if (node.data.includeOtherwise) {
				exits.push({
					name: "Otherwise",
					description: "None of the other options match the conversation",
					target: targetOf(node.id, OTHERWISE_HANDLE_ID),
				});
			}
			nodes.push({
				id: node.id,
				name: node.data.title.trim() || undefined,
				kind: "router",
				router: { condition },
				instructions: condition,
				toolIds: [],
				exits,
			});
		}
	}

	const toolIds = [...new Set([...baseToolIds, ...nodes.flatMap((n) => n.toolIds)])];

	return { flow: { entry, nodes, scenarios }, toolIds };
}

/* ------------------------------------------------------------------ */
/* Reconstruction: engine flow / blank slate → canvas document          */
/* ------------------------------------------------------------------ */

let idCounter = 0;

export function makeId(prefix: string): string {
	idCounter += 1;
	return `${prefix}_${Date.now().toString(36)}${idCounter.toString(36)}`;
}

/** Plain text → a TipTap doc; `{{var}}` occurrences become variable chips. */
export function textToTiptapDoc(text: string): unknown {
	const lines = text.split("\n");
	const paragraphs = lines.map((line) => {
		const content: TiptapNode[] = [];
		let last = 0;
		const pattern = /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g;
		let match = pattern.exec(line);
		while (match) {
			if (match.index > last) {
				content.push({ type: "text", text: line.slice(last, match.index) });
			}
			content.push({
				type: "mention",
				attrs: {
					id: match[1],
					label: prettifyVariable(match[1]),
					mentionSuggestionChar: MENTION_CHAR_VARIABLE,
				},
			});
			last = match.index + match[0].length;
			match = pattern.exec(line);
		}
		if (last < line.length) {
			content.push({ type: "text", text: line.slice(last) });
		}
		return { type: "paragraph", ...(content.length > 0 ? { content } : {}) };
	});
	return { type: "doc", content: paragraphs };
}

/** contact_first_name → "Contact.First Name"-style chip label. */
export function prettifyVariable(name: string): string {
	const parts = name.split("_").filter(Boolean);
	if (parts.length === 0) {
		return name;
	}
	const [head, ...rest] = parts;
	const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
	if (rest.length === 0) {
		return cap(head);
	}
	return `${cap(head)}.${rest.map(cap).join(" ")}`;
}

/** Split a plain-text prompt on `## Title` headers into ordered sections. */
function instructionsToSections(instructions: string): FlowSectionDoc[] {
	const sections: FlowSectionDoc[] = [];
	let currentTitle: string | undefined;
	let currentLines: string[] = [];

	const flush = () => {
		const body = currentLines.join("\n").trim();
		if (body || currentTitle) {
			sections.push({
				id: makeId("sec"),
				title: currentTitle,
				body: textToTiptapDoc(body),
			});
		}
		currentLines = [];
	};

	for (const line of instructions.split("\n")) {
		const header = /^##\s+(.+)$/.exec(line);
		if (header) {
			flush();
			currentTitle = header[1].trim();
		} else {
			currentLines.push(line);
		}
	}
	flush();

	if (sections.length === 0) {
		sections.push({ id: makeId("sec"), body: textToTiptapDoc("") });
	}
	return sections;
}

/** Best-effort canvas from an engine flow (used when config.canvas is absent). */
export function canvasFromFlow(flow: EngineFlow): CanvasDoc {
	// BFS from the entry node to lay columns out left → right.
	const columnOf = new Map<string, number>();
	const queue: { id: string; col: number }[] = [{ id: flow.entry, col: 0 }];
	while (queue.length > 0) {
		const { id, col } = queue.shift() as { id: string; col: number };
		if (columnOf.has(id)) {
			continue;
		}
		columnOf.set(id, col);
		const node = flow.nodes.find((n) => n.id === id);
		for (const exit of node?.exits ?? []) {
			if (exit.target && !columnOf.has(exit.target)) {
				queue.push({ id: exit.target, col: col + 1 });
			}
		}
	}
	// Orphans (not reachable from entry) go into the last column + 1.
	const maxCol = Math.max(0, ...columnOf.values());
	for (const node of flow.nodes) {
		if (!columnOf.has(node.id)) {
			columnOf.set(node.id, maxCol + 1);
		}
	}

	const rowsInCol = new Map<number, number>();
	const nodes: CanvasNodeDoc[] = [
		{ id: START_NODE_ID, type: "start", position: { x: 40, y: 120 } },
	];
	const edges: CanvasEdgeDoc[] = [
		{
			id: makeId("edge"),
			source: START_NODE_ID,
			sourceHandle: START_HANDLE_ID,
			target: flow.entry,
		},
	];

	for (const flowNode of flow.nodes) {
		const col = columnOf.get(flowNode.id) ?? 0;
		const row = rowsInCol.get(col) ?? 0;
		rowsInCol.set(col, row + 1);
		const position = { x: 280 + col * 360, y: 60 + row * 260 };

		if (flowNode.kind === "statement") {
			nodes.push({
				id: flowNode.id,
				type: "statement",
				position,
				data: {
					title: flowNode.name ?? flowNode.id,
					say: flowNode.statement?.say ?? flowNode.instructions,
				},
			});
			const target = flowNode.exits[0]?.target;
			if (target) {
				edges.push({
					id: makeId("edge"),
					source: flowNode.id,
					sourceHandle: STATEMENT_NEXT_HANDLE_ID,
					target,
				});
			}
			continue;
		}

		if (flowNode.kind === "router") {
			const condition = flowNode.router?.condition ?? flowNode.instructions;
			const title = flowNode.name ?? flowNode.id;
			const exitNames = flowNode.exits.map((exit) => exit.name.trim().toLowerCase());
			const isTrueFalse =
				flowNode.exits.length === 2 && exitNames.includes("true") && exitNames.includes("false");

			if (isTrueFalse) {
				nodes.push({
					id: flowNode.id,
					type: "truefalse",
					position,
					data: { title, condition },
				});
				for (const exit of flowNode.exits) {
					if (exit.target) {
						edges.push({
							id: makeId("edge"),
							source: flowNode.id,
							sourceHandle:
								exit.name.trim().toLowerCase() === "true" ? TRUE_HANDLE_ID : FALSE_HANDLE_ID,
							target: exit.target,
						});
					}
				}
			} else {
				// The engine's fallback exit is named otherwise/none/default (case-insensitive).
				const isOtherwise = (name: string) =>
					["otherwise", "none", "default"].includes(name.trim().toLowerCase());
				const otherwiseExit = flowNode.exits.find((exit) => isOtherwise(exit.name));
				const caseExits = flowNode.exits.filter((exit) => exit !== otherwiseExit);
				const cases = caseExits.map((exit) => ({
					id: makeId("case"),
					name: exit.name,
					description: exit.description,
				}));
				nodes.push({
					id: flowNode.id,
					type: "switch",
					position,
					data: { title, condition, cases, includeOtherwise: !!otherwiseExit },
				});
				caseExits.forEach((exit, i) => {
					if (exit.target) {
						edges.push({
							id: makeId("edge"),
							source: flowNode.id,
							sourceHandle: cases[i].id,
							target: exit.target,
						});
					}
				});
				if (otherwiseExit?.target) {
					edges.push({
						id: makeId("edge"),
						source: flowNode.id,
						sourceHandle: OTHERWISE_HANDLE_ID,
						target: otherwiseExit.target,
					});
				}
			}
			continue;
		}

		const exits = flowNode.exits.map((exit) => ({
			id: makeId("exit"),
			name: exit.name,
			description: exit.description,
		}));
		nodes.push({
			id: flowNode.id,
			type: "agent",
			position,
			data: {
				title: flowNode.name ?? flowNode.id,
				sections: instructionsToSections(flowNode.instructions),
				entryMessage: flowNode.entryInstructions ?? "",
				exits,
				toolIds: [...flowNode.toolIds],
				model: flowNode.llm?.model,
			},
		});
		flowNode.exits.forEach((exit, i) => {
			if (exit.target) {
				edges.push({
					id: makeId("edge"),
					source: flowNode.id,
					sourceHandle: exits[i].id,
					target: exit.target,
				});
			}
		});
	}

	// Scenarios live outside flow.nodes — grid-place their canvas nodes in a
	// row below the main flow, each wired to its jump target.
	const maxRow = Math.max(1, ...rowsInCol.values());
	(flow.scenarios ?? []).forEach((scenario, i) => {
		const scenarioNodeId = makeId("scenario");
		nodes.push({
			id: scenarioNodeId,
			type: "scenario",
			position: {
				x: 280 + (i % 4) * 300,
				y: 60 + maxRow * 260 + 80 + Math.floor(i / 4) * 200,
			},
			data: { title: scenario.name, description: scenario.description },
		});
		if (scenario.target) {
			edges.push({
				id: makeId("edge"),
				source: scenarioNodeId,
				sourceHandle: SCENARIO_JUMP_HANDLE_ID,
				target: scenario.target,
			});
		}
	});

	return { version: 1, nodes, edges };
}

/** A fresh canvas: Start wired into one empty agent node. */
export function newCanvas(): CanvasDoc {
	const nodeId = makeId("node");
	return {
		version: 1,
		nodes: [
			{ id: START_NODE_ID, type: "start", position: { x: 40, y: 140 } },
			{
				id: nodeId,
				type: "agent",
				position: { x: 300, y: 80 },
				data: {
					title: "New agent",
					sections: [{ id: makeId("sec"), body: textToTiptapDoc("") }],
					entryMessage: "",
					exits: [],
					toolIds: [],
				},
			},
		],
		edges: [
			{ id: makeId("edge"), source: START_NODE_ID, sourceHandle: START_HANDLE_ID, target: nodeId },
		],
	};
}

/** Fresh empty agent node data (used by the Actions palette). */
export function newAgentNodeData(title: string): AgentNodeData {
	return {
		title,
		sections: [{ id: makeId("sec"), body: textToTiptapDoc("") }],
		entryMessage: "",
		exits: [],
		toolIds: [],
	};
}

/** Fresh True/False branch node data (used by the Actions palette). */
export function newTrueFalseNodeData(): TrueFalseNodeData {
	return { title: "True / False", condition: "" };
}

/** Fresh Switch branch node data (used by the Actions palette). */
export function newSwitchNodeData(): SwitchNodeData {
	return {
		title: "Switch",
		condition: "",
		cases: [{ id: makeId("case"), name: "", description: "" }],
		includeOtherwise: true,
	};
}

/** Fresh Statement node data (used by the Actions palette). */
export function newStatementNodeData(): StatementNodeData {
	return { title: "Statement", say: "" };
}

/** Fresh Custom Scenario node data (used by the Actions palette). */
export function newScenarioNodeData(): ScenarioNodeData {
	return { title: "Custom Scenario", description: "" };
}

const BOOKING_INSTRUCTIONS =
	"Book the caller into an appointment. Use check_availability to find open times (the agent's configured booking calendar is used automatically). Offer two or three options conversationally — never read a long list. Once they pick one, use book_appointment with that exact slot time and confirm the booked time back to them. If nothing fits or the calendar is unavailable, reassure them someone will call back to schedule, then take the 'No time worked' exit.";

/**
 * The Booking palette preset — a pre-configured agent node (CloseBot's
 * "Booking" action). `liveToolIds` = the CRM live check_availability /
 * book_appointment tool ids, resolved by the caller at creation time
 * ([] when no CRM is connected — the user can attach tools later).
 */
export function newBookingNodeData(liveToolIds: string[]): AgentNodeData {
	return {
		title: "Booking",
		sections: [{ id: makeId("sec"), body: textToTiptapDoc(BOOKING_INSTRUCTIONS) }],
		entryMessage: "Offer to get them booked in right now.",
		exits: [
			{
				id: makeId("exit"),
				name: "Booked",
				description: "The appointment is booked and confirmed.",
			},
			{
				id: makeId("exit"),
				name: "No time worked",
				description: "No slot worked or the calendar was unavailable; a callback was promised.",
			},
		],
		toolIds: [...liveToolIds],
	};
}

/** The Aggression Detected palette preset — just a pre-filled Custom Scenario. */
export function newAggressionScenarioData(): ScenarioNodeData {
	return {
		title: "Aggression Detected",
		description: "The caller is angry, hostile, cursing, or verbally aggressive",
	};
}

/** Extract `{{var}}` names from arbitrary config strings (instructions, greeting). */
export function extractVariableNames(...texts: (string | undefined)[]): string[] {
	const found = new Set<string>();
	for (const text of texts) {
		if (!text) {
			continue;
		}
		const pattern = /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g;
		let match = pattern.exec(text);
		while (match) {
			found.add(match[1]);
			match = pattern.exec(text);
		}
	}
	return [...found];
}
