import type {
	AgentCanvasNodeDoc,
	AgentNodeData,
	BookingNodeData,
	CanvasDoc,
	CanvasEdgeDoc,
	CanvasNodeDoc,
	EngineFlow,
	EngineFlowExit,
	EngineFlowNode,
	EngineFlowScenario,
	FlowSectionDoc,
	ModifyTagsNodeData,
	ObjectiveNodeData,
	ScenarioCanvasNodeDoc,
	SetFieldNodeData,
	ScenarioNodeData,
	StatementCanvasNodeDoc,
	StatementNodeData,
	SwitchCanvasNodeDoc,
	SwitchNodeData,
	TransferCanvasNodeDoc,
	TransferNodeData,
	TrueFalseCanvasNodeDoc,
	TrueFalseNodeData,
} from "./flow-types";
import {
	BOOKING_BOOKED_HANDLE_ID,
	BOOKING_FAILED_HANDLE_ID,
	FALSE_HANDLE_ID,
	MODIFY_TAGS_NEXT_HANDLE_ID,
	OBJECTIVE_NEXT_HANDLE_ID,
	OTHERWISE_HANDLE_ID,
	SCENARIO_JUMP_HANDLE_ID,
	SET_FIELD_NEXT_HANDLE_ID,
	START_HANDLE_ID,
	START_NODE_ID,
	STATEMENT_NEXT_HANDLE_ID,
	TRANSFER_NEXT_HANDLE_ID,
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
export function sectionsToInstructions(sections: FlowSectionDoc[] | undefined): string {
	return (sections ?? [])
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
		} else if (node.type === "objective" && node.data) {
			// An objective node compiles to an engine AGENT node carrying
			// objectives[]; the engine gathers them one at a time and auto-takes
			// the single Next exit once every required objective is verified.
			const target = targetOf(node.id, OBJECTIVE_NEXT_HANDLE_ID);
			const objectives = node.data.objectives
				.filter((o) => o.description.trim())
				.map((o, i) => {
					const slug =
						(o.title.trim() || o.field.trim() || `objective_${i + 1}`)
							.toLowerCase()
							.replace(/[^a-z0-9]+/g, "_")
							.replace(/^_+|_+$/g, "") || `objective_${i + 1}`;
					return {
						key: slug,
						description: o.description.trim(),
						field: o.field.trim() || undefined,
						options: o.options?.length ? o.options : undefined,
						maxAttempts: o.maxAttempts,
						sensitivity: o.sensitivity,
					};
				});
			const list = node.data.objectives
				.filter((o) => o.description.trim())
				.map((o) => `- ${o.description.trim()}`)
				.join("\n");
			nodes.push({
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
			});
		} else if (node.type === "booking" && node.data) {
			// A Booking node compiles to an AGENT node gated to the CRM booking
			// tools, with the standard book/confirm instructions plus the node's
			// description, extra prompt, and calendar/title/failed-tag settings.
			let instructions = node.data.description.trim()
				? `${node.data.description.trim()}\n\n${BOOKING_INSTRUCTIONS}`
				: BOOKING_INSTRUCTIONS;
			const calendarName = node.data.calendarName.trim();
			const appointmentTitle = node.data.appointmentTitle.trim();
			const failedBookingTag = node.data.failedBookingTag.trim();
			const extraPrompt = node.data.extraPrompt.trim();
			if (calendarName) {
				instructions += `\n\nAlways pass calendar_name "${calendarName}" when using check_availability or book_appointment.`;
			}
			if (appointmentTitle) {
				instructions += `\n\nWhen booking, use the appointment title "${appointmentTitle}".`;
			}
			if (failedBookingTag) {
				instructions += `\n\nIf booking fails or no time works, use add_tag with tag "${failedBookingTag}".`;
			}
			if (extraPrompt) {
				instructions += `\n\n${extraPrompt}`;
			}
			nodes.push({
				id: node.id,
				name: node.data.title.trim() || undefined,
				instructions,
				entryInstructions: node.id !== entry ? "Offer to get them booked in right now." : undefined,
				toolIds: [...node.data.toolIds],
				exits: [
					{
						name: "Booked",
						description: "The appointment is booked and confirmed.",
						target: targetOf(node.id, BOOKING_BOOKED_HANDLE_ID),
					},
					{
						name: "No time worked",
						description: "No slot worked or the calendar was unavailable; a callback was promised.",
						target: targetOf(node.id, BOOKING_FAILED_HANDLE_ID),
					},
				],
			});
		} else if (node.type === "set_field" && node.data) {
			const target = targetOf(node.id, SET_FIELD_NEXT_HANDLE_ID);
			const field = node.data.field.trim();
			nodes.push({
				id: node.id,
				name: node.data.title.trim() || undefined,
				kind: "set_field",
				setField: { field, value: node.data.value },
				// The engine requires instructions min 1 on every node.
				instructions: field ? `Set ${field}` : "Set a field",
				toolIds: [],
				exits: target ? [{ name: "Next", description: "Continue", target }] : [],
			});
		} else if (node.type === "modify_tags" && node.data) {
			const target = targetOf(node.id, MODIFY_TAGS_NEXT_HANDLE_ID);
			const add = node.data.addTags.map((t) => t.trim()).filter(Boolean);
			const remove = node.data.removeTags.map((t) => t.trim()).filter(Boolean);
			nodes.push({
				id: node.id,
				name: node.data.title.trim() || undefined,
				kind: "modify_tags",
				modifyTags: { add, remove },
				instructions:
					[add.length ? `Add: ${add.join(", ")}` : "", remove.length ? `Remove: ${remove.join(", ")}` : ""]
						.filter(Boolean)
						.join("; ") || "Modify tags",
				toolIds: [],
				exits: target ? [{ name: "Next", description: "Continue", target }] : [],
			});
		} else if (node.type === "transfer" && node.data) {
			const say = node.data.say.trim();
			const target = targetOf(node.id, TRANSFER_NEXT_HANDLE_ID);
			nodes.push({
				id: node.id,
				name: node.data.title.trim() || undefined,
				kind: "transfer",
				transfer: {
					say: say || undefined,
					holdSeconds: node.data.holdSeconds,
					voice:
						node.data.voiceId && node.data.voiceProvider
							? { provider: node.data.voiceProvider, voice: node.data.voiceId }
							: undefined,
				},
				// The engine requires instructions min 1 on every node.
				instructions: say || "Transferring the caller.",
				toolIds: [],
				exits: target ? [{ name: "Next", description: "Continue after the transfer", target }] : [],
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

		if (flowNode.kind === "set_field") {
			nodes.push({
				id: flowNode.id,
				type: "set_field",
				position,
				data: {
					title: flowNode.name ?? flowNode.id,
					field: flowNode.setField?.field ?? "",
					value: flowNode.setField?.value ?? "",
				},
			});
			const target = flowNode.exits[0]?.target;
			if (target) {
				edges.push({
					id: makeId("edge"),
					source: flowNode.id,
					sourceHandle: SET_FIELD_NEXT_HANDLE_ID,
					target,
				});
			}
			continue;
		}

		if (flowNode.kind === "modify_tags") {
			nodes.push({
				id: flowNode.id,
				type: "modify_tags",
				position,
				data: {
					title: flowNode.name ?? flowNode.id,
					addTags: flowNode.modifyTags?.add ?? [],
					removeTags: flowNode.modifyTags?.remove ?? [],
				},
			});
			const target = flowNode.exits[0]?.target;
			if (target) {
				edges.push({
					id: makeId("edge"),
					source: flowNode.id,
					sourceHandle: MODIFY_TAGS_NEXT_HANDLE_ID,
					target,
				});
			}
			continue;
		}

		if (flowNode.kind === "transfer") {
			nodes.push({
				id: flowNode.id,
				type: "transfer",
				position,
				data: {
					title: flowNode.name ?? flowNode.id,
					say: flowNode.transfer?.say ?? "",
					holdSeconds: flowNode.transfer?.holdSeconds ?? 4,
					voiceId: flowNode.transfer?.voice?.voice,
					voiceProvider: flowNode.transfer?.voice?.provider,
				},
			});
			const target = flowNode.exits[0]?.target;
			if (target) {
				edges.push({
					id: makeId("edge"),
					source: flowNode.id,
					sourceHandle: TRANSFER_NEXT_HANDLE_ID,
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

		// An engine agent node carrying objectives round-trips as an Objective
		// canvas node (single Next handle → its primary exit's target).
		if (flowNode.objectives?.length) {
			nodes.push({
				id: flowNode.id,
				type: "objective",
				position,
				data: {
					title: flowNode.name ?? flowNode.id,
					entryMessage: flowNode.entryInstructions ?? "",
					objectives: flowNode.objectives.map((o) => ({
						id: makeId("obj"),
						title: o.key,
						description: o.description,
						field: o.field ?? "",
						options: o.options,
						maxAttempts: o.maxAttempts,
						sensitivity: o.sensitivity,
					})),
				},
			});
			const target = flowNode.exits[0]?.target;
			if (target) {
				edges.push({
					id: makeId("edge"),
					source: flowNode.id,
					sourceHandle: OBJECTIVE_NEXT_HANDLE_ID,
					target,
				});
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

/** Fresh Objective node data — one blank objective to fill in. */
export function newObjectiveNodeData(): ObjectiveNodeData {
	return {
		title: "Objective",
		entryMessage: "",
		objectives: [{ id: makeId("obj"), title: "", description: "", field: "" }],
	};
}

/** Fresh Set Field node data. */
export function newSetFieldNodeData(): SetFieldNodeData {
	return { title: "Set Field", field: "", value: "" };
}

/** Fresh Modify Tags node data. */
export function newModifyTagsNodeData(): ModifyTagsNodeData {
	return { title: "Modify Tags", addTags: [], removeTags: [] };
}

/** Fresh Transfer node data (used by the Actions palette). */
export function newTransferNodeData(): TransferNodeData {
	return {
		title: "Transfer",
		say: "One moment please — let me transfer you to the right person.",
		holdSeconds: 4,
	};
}

/** Fresh Custom Scenario node data (used by the Actions palette). */
export function newScenarioNodeData(): ScenarioNodeData {
	return { title: "Custom Scenario", description: "" };
}

const BOOKING_INSTRUCTIONS =
	"Book the caller into an appointment. Use check_availability to find open times (the agent's configured booking calendar is used automatically). Offer two or three options conversationally — never read a long list. Once they pick one, use book_appointment with that exact slot time and confirm the booked time back to them. If nothing fits or the calendar is unavailable, reassure them someone will call back to schedule, then take the 'No time worked' exit.";

/**
 * Fresh Booking node data (CloseBot's dedicated "Booking" node). `liveToolIds`
 * = the CRM live check_availability / book_appointment tool ids, baked in at
 * creation ([] when no CRM is connected — booking won't work until reconnected).
 */
export function newBookingNodeData(liveToolIds: string[]): BookingNodeData {
	return {
		title: "Booking",
		calendarName: "",
		description: "Book a 30 minute appointment with the contact.",
		extraPrompt: "",
		appointmentTitle: "",
		failedBookingTag: "",
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
