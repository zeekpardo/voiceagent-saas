import { describe, expect, it } from "vitest";

import {
	canvasFromFlow,
	compileCanvas,
	ensureGreeter,
	extractVariableNames,
	newCanvas,
	newFullAddressObjectiveData,
	prettifyVariable,
	sanitizeExitName,
	sectionsToInstructions,
	textToTiptapDoc,
	tiptapToText,
	validateFlowDoc,
} from "./compile";
import type { CanvasDoc } from "./flow-types";
import {
	FALSE_HANDLE_ID,
	GREETER_NEXT_HANDLE_ID,
	OBJECTIVE_NEXT_HANDLE_ID,
	OTHERWISE_HANDLE_ID,
	SCENARIO_JUMP_HANDLE_ID,
	START_HANDLE_ID,
	START_NODE_ID,
	STATEMENT_NEXT_HANDLE_ID,
	TRUE_HANDLE_ID,
} from "./flow-types";

/** Fixed id for the Greeter fixture in test docs (real canvases generate one). */
const GREETER_ID = "greeter";

/**
 * Insert the Greeter fixture into a legacy-shaped doc (Start → entry): the
 * greeter is appended (so positional node access in tests is unaffected) and
 * the Start edge is rerouted Start → Greeter → entry. Mirrors the production
 * invariant that every canvas has exactly one greeter.
 */
function withGreeter(doc: CanvasDoc, greeting = ""): CanvasDoc {
	const startEdge = doc.edges.find((e) => e.source === START_NODE_ID);
	const entry = startEdge?.target ?? "";
	return {
		...doc,
		nodes: [
			...doc.nodes,
			{
				id: GREETER_ID,
				type: "greeter" as const,
				position: { x: 180, y: 0 },
				data: { title: "Greeter", greeting },
			},
		],
		edges: [
			{
				id: "e_start_greeter",
				source: START_NODE_ID,
				sourceHandle: START_HANDLE_ID,
				target: GREETER_ID,
			},
			{
				id: "e_greeter_entry",
				source: GREETER_ID,
				sourceHandle: GREETER_NEXT_HANDLE_ID,
				target: entry,
			},
			...doc.edges.filter((e) => e.source !== START_NODE_ID),
		],
	};
}

function sectionBody(content: unknown[]): unknown {
	return { type: "doc", content: [{ type: "paragraph", content }] };
}

const mention = (char: string, id: string, label = id) => ({
	type: "mention",
	attrs: { id, label, mentionSuggestionChar: char },
});

describe("sanitizeExitName", () => {
	it("lowercases and collapses non-alphanumerics", () => {
		expect(sanitizeExitName("Wants to Book!")).toBe("wants_to_book");
		expect(sanitizeExitName("  Já--Done ")).toBe("j_done");
	});
});

describe("tiptapToText", () => {
	it("serializes mentions by trigger kind", () => {
		const doc = sectionBody([
			{ type: "text", text: "Greet " },
			mention("@", "contact_first_name", "Contact.First Name"),
			{ type: "text", text: ", then call " },
			mention("@@", "update_contact"),
			{ type: "text", text: " and use " },
			mention("@@@", "Wants to Book"),
		]);
		expect(tiptapToText(doc)).toBe(
			'Greet {{contact_first_name}}, then call update_contact and use the exit tool "exit_wants_to_book"',
		);
	});

	it("keeps paragraph and hard-break line structure", () => {
		const doc = {
			type: "doc",
			content: [
				{
					type: "paragraph",
					content: [
						{ type: "text", text: "line one" },
						{ type: "hardBreak" },
						{ type: "text", text: "line two" },
					],
				},
				{ type: "paragraph", content: [{ type: "text", text: "line three" }] },
			],
		};
		expect(tiptapToText(doc)).toBe("line one\nline two\nline three");
	});
});

describe("sectionsToInstructions", () => {
	it("adds ## headers for titled sections and skips empties", () => {
		const sections = [
			{ id: "a", title: "Role", body: sectionBody([{ type: "text", text: "Be helpful." }]) },
			{ id: "b", body: sectionBody([{ type: "text", text: "No title here." }]) },
			{ id: "c", body: sectionBody([]) },
		];
		expect(sectionsToInstructions(sections)).toBe("## Role\nBe helpful.\n\nNo title here.");
	});
});

function makeDoc(): CanvasDoc {
	return {
		version: 1,
		nodes: [
			{ id: START_NODE_ID, type: "start", position: { x: 0, y: 0 } },
			{
				id: "n1",
				type: "agent",
				position: { x: 100, y: 0 },
				data: {
					title: "Qualify",
					sections: [
						{ id: "s1", body: sectionBody([{ type: "text", text: "Qualify the lead." }]) },
					],
					entryMessage: "ignored on entry",
					exits: [
						{ id: "x1", name: "qualified", description: "Caller wants to book" },
						{ id: "x2", name: "not interested", description: "Caller declines" },
					],
					toolIds: ["tool_a"],
				},
			},
			{
				id: "n2",
				type: "agent",
				position: { x: 400, y: 0 },
				data: {
					title: "Book",
					sections: [{ id: "s2", body: sectionBody([{ type: "text", text: "Book it." }]) }],
					entryMessage: "Tell them you are booking",
					exits: [],
					toolIds: ["tool_b"],
					model: "openai/gpt-4o-mini",
				},
			},
		],
		edges: [
			{ id: "e1", source: START_NODE_ID, sourceHandle: START_HANDLE_ID, target: "n1" },
			{ id: "e2", source: "n1", sourceHandle: "x1", target: "n2" },
		],
	};
}

describe("validateFlowDoc", () => {
	it("passes a well-formed doc", () => {
		expect(validateFlowDoc(withGreeter(makeDoc()))).toEqual([]);
	});

	it("flags missing start edge, empty instructions and duplicate exits", () => {
		const doc = makeDoc();
		doc.edges = doc.edges.filter((e) => e.source !== START_NODE_ID);
		const n1 = doc.nodes[1].data;
		if (n1) {
			n1.sections = [{ id: "s1", body: sectionBody([]) }];
			n1.exits = [
				{ id: "x1", name: "Done", description: "d" },
				{ id: "x2", name: "done!", description: "d" },
			];
		}
		const errors = validateFlowDoc(doc);
		expect(errors.some((e) => e.includes("Start"))).toBe(true);
		expect(errors.some((e) => e.includes("empty instructions"))).toBe(true);
		expect(errors.some((e) => e.includes("duplicate exit name"))).toBe(true);
	});
});

describe("compileCanvas", () => {
	it("builds the engine payload with entry, exit targets and tool union", () => {
		const { flow, toolIds } = compileCanvas(makeDoc(), ["tool_existing", "tool_a"]);
		expect(flow.entry).toBe("n1");
		expect(toolIds.sort()).toEqual(["tool_a", "tool_b", "tool_existing"]);

		const n1 = flow.nodes.find((n) => n.id === "n1");
		expect(n1?.entryInstructions).toBeUndefined(); // entry node — omitted
		expect(n1?.exits).toEqual([
			{ name: "qualified", description: "Caller wants to book", target: "n2" },
			{ name: "not interested", description: "Caller declines", target: undefined },
		]);

		const n2 = flow.nodes.find((n) => n.id === "n2");
		expect(n2?.entryInstructions).toBe("Tell them you are booking");
		expect(n2?.llm).toEqual({ model: "openai/gpt-4o-mini" });
	});

	it("appends booking-setting instructions only when a node sets them", () => {
		// Unset → byte-identical to plain section output.
		const without = compileCanvas(makeDoc(), []).flow;
		expect(without.nodes.find((n) => n.id === "n2")?.instructions).toBe("Book it.");

		const doc = makeDoc();
		const n2 = doc.nodes.find((n) => n.id === "n2");
		if (n2?.type === "agent" && n2.data) {
			n2.data.calendarName = "Sales Calls";
			n2.data.appointmentTitle = "Intro call";
			n2.data.failedBookingTag = "booking-failed";
		}
		const { flow } = compileCanvas(doc, []);
		expect(flow.nodes.find((n) => n.id === "n2")?.instructions).toBe(
			"Book it." +
				'\n\nAlways pass calendar_name "Sales Calls" when using check_availability or book_appointment.' +
				'\n\nWhen booking, use the appointment title "Intro call".' +
				'\n\nIf booking fails or no time works, use add_tag with tag "booking-failed".',
		);
		// Other nodes stay untouched.
		expect(flow.nodes.find((n) => n.id === "n1")?.instructions).toBe(
			without.nodes.find((n) => n.id === "n1")?.instructions,
		);
	});
});

describe("canvasFromFlow round-trip", () => {
	it("reconstructs a canvas whose compilation matches the original flow", () => {
		const original = compileCanvas(makeDoc(), []).flow;
		const rebuilt = canvasFromFlow(original);
		expect(validateFlowDoc(rebuilt)).toEqual([]);
		const recompiled = compileCanvas(rebuilt, []).flow;
		expect(recompiled.entry).toBe(original.entry);
		expect(recompiled.nodes.map((n) => [n.id, n.instructions, n.exits])).toEqual(
			original.nodes.map((n) => [n.id, n.instructions, n.exits]),
		);
	});
});

/** Start → agent → truefalse (True → agent2) + switch (case → agent2, Otherwise unwired). */
function makeBranchDoc(): CanvasDoc {
	return {
		version: 1,
		nodes: [
			{ id: START_NODE_ID, type: "start", position: { x: 0, y: 0 } },
			{
				id: "a1",
				type: "agent",
				position: { x: 100, y: 0 },
				data: {
					title: "Intake",
					sections: [{ id: "s1", body: sectionBody([{ type: "text", text: "Greet." }]) }],
					entryMessage: "",
					exits: [{ id: "x1", name: "done", description: "Caller finished intake" }],
					toolIds: [],
				},
			},
			{
				id: "tf1",
				type: "truefalse",
				position: { x: 400, y: 0 },
				data: {
					title: "Speaks English?",
					condition: "The caller has confirmed they speak English",
				},
			},
			{
				id: "sw1",
				type: "switch",
				position: { x: 400, y: 300 },
				data: {
					title: "Which service?",
					condition: "Which service is the caller asking about?",
					cases: [
						{ id: "c1", name: "Booking", description: "The caller wants to book" },
						{ id: "c2", name: "Support", description: "The caller has a problem" },
					],
					includeOtherwise: true,
				},
			},
			{
				id: "a2",
				type: "agent",
				position: { x: 700, y: 0 },
				data: {
					title: "Book",
					sections: [{ id: "s2", body: sectionBody([{ type: "text", text: "Book it." }]) }],
					entryMessage: "",
					exits: [],
					toolIds: [],
				},
			},
		],
		edges: [
			{ id: "e1", source: START_NODE_ID, sourceHandle: START_HANDLE_ID, target: "a1" },
			{ id: "e2", source: "a1", sourceHandle: "x1", target: "tf1" },
			{ id: "e3", source: "tf1", sourceHandle: TRUE_HANDLE_ID, target: "a2" },
			{ id: "e4", source: "tf1", sourceHandle: FALSE_HANDLE_ID, target: "sw1" },
			{ id: "e5", source: "sw1", sourceHandle: "c1", target: "a2" },
			// c2 and Otherwise stay unwired → they end the call.
		],
	};
}

describe("branch nodes", () => {
	it("compiles a truefalse node into a router with True/False exits and edge targets", () => {
		const { flow } = compileCanvas(makeBranchDoc(), []);
		const tf = flow.nodes.find((n) => n.id === "tf1");
		expect(tf?.kind).toBe("router");
		expect(tf?.router).toEqual({ condition: "The caller has confirmed they speak English" });
		// Engine requires instructions min 1 — mirrors the condition.
		expect(tf?.instructions).toBe("The caller has confirmed they speak English");
		expect(tf?.toolIds).toEqual([]);
		expect(tf?.exits).toEqual([
			{ name: "True", description: "The statement is true", target: "a2" },
			{ name: "False", description: "The statement is false", target: "sw1" },
		]);
	});

	it("compiles a switch node into a router with case exits plus Otherwise", () => {
		const { flow } = compileCanvas(makeBranchDoc(), []);
		const sw = flow.nodes.find((n) => n.id === "sw1");
		expect(sw?.kind).toBe("router");
		expect(sw?.router).toEqual({ condition: "Which service is the caller asking about?" });
		expect(sw?.exits).toEqual([
			{ name: "Booking", description: "The caller wants to book", target: "a2" },
			{ name: "Support", description: "The caller has a problem", target: undefined },
			{
				name: "Otherwise",
				description: "None of the other options match the conversation",
				target: undefined,
			},
		]);
	});

	it("omits the Otherwise exit when includeOtherwise is off", () => {
		const doc = makeBranchDoc();
		const sw = doc.nodes.find((n) => n.id === "sw1");
		if (sw?.type === "switch" && sw.data) {
			sw.data.includeOtherwise = false;
		}
		const { flow } = compileCanvas(doc, []);
		const compiled = flow.nodes.find((n) => n.id === "sw1");
		expect(compiled?.exits.map((e) => e.name)).toEqual(["Booking", "Support"]);
	});

	it("validates a well-formed branch doc", () => {
		expect(validateFlowDoc(withGreeter(makeBranchDoc()))).toEqual([]);
	});

	it("rejects a branch node as the entry", () => {
		const doc = makeBranchDoc();
		const startEdge = doc.edges.find((e) => e.source === START_NODE_ID);
		if (startEdge) {
			startEdge.target = "tf1";
		}
		const errors = validateFlowDoc(doc);
		expect(errors.some((e) => e.includes("must start on an Agent node"))).toBe(true);
	});

	it("flags empty conditions, too few switch paths and duplicate case names", () => {
		const doc = makeBranchDoc();
		const tf = doc.nodes.find((n) => n.id === "tf1");
		if (tf?.type === "truefalse" && tf.data) {
			tf.data.condition = "  ";
		}
		const sw = doc.nodes.find((n) => n.id === "sw1");
		if (sw?.type === "switch" && sw.data) {
			sw.data.includeOtherwise = false;
			sw.data.cases = [
				{ id: "c1", name: "Booking", description: "d" },
				{ id: "c2", name: "booking!", description: "d" },
			];
		}
		const errors = validateFlowDoc(doc);
		expect(errors.some((e) => e.includes("needs a statement to evaluate"))).toBe(true);
		expect(errors.some((e) => e.includes("duplicate case name"))).toBe(true);

		if (sw?.type === "switch" && sw.data) {
			sw.data.cases = [{ id: "c1", name: "Booking", description: "d" }];
		}
		const tooFew = validateFlowDoc(doc);
		expect(tooFew.some((e) => e.includes("at least two paths"))).toBe(true);
	});

	it("round-trips branch nodes flow → canvas → flow", () => {
		const original = compileCanvas(makeBranchDoc(), []).flow;
		const rebuilt = canvasFromFlow(original);

		const tf = rebuilt.nodes.find((n) => n.id === "tf1");
		expect(tf?.type).toBe("truefalse");
		if (tf?.type === "truefalse") {
			expect(tf.data?.condition).toBe("The caller has confirmed they speak English");
		}
		const sw = rebuilt.nodes.find((n) => n.id === "sw1");
		expect(sw?.type).toBe("switch");
		if (sw?.type === "switch") {
			expect(sw.data?.includeOtherwise).toBe(true);
			expect(sw.data?.cases.map((c) => c.name)).toEqual(["Booking", "Support"]);
		}
		// True/False edges land on the fixed handles.
		const tfEdges = rebuilt.edges.filter((e) => e.source === "tf1");
		expect(
			tfEdges.map((e) => `${e.sourceHandle}->${e.target}`).sort((a, b) => a.localeCompare(b)),
		).toEqual([`${FALSE_HANDLE_ID}->sw1`, `${TRUE_HANDLE_ID}->a2`]);
		// Unwired Otherwise stays unwired.
		expect(rebuilt.edges.some((e) => e.sourceHandle === OTHERWISE_HANDLE_ID)).toBe(false);

		expect(validateFlowDoc(rebuilt)).toEqual([]);
		const recompiled = compileCanvas(rebuilt, []).flow;
		expect(recompiled.entry).toBe(original.entry);
		expect(recompiled.nodes.map((n) => [n.id, n.kind, n.router, n.instructions, n.exits])).toEqual(
			original.nodes.map((n) => [n.id, n.kind, n.router, n.instructions, n.exits]),
		);
	});
});

/** Start → a1 agent → st1 statement (Next → a2) + st2 statement unwired (ends the call). */
function makeStatementDoc(): CanvasDoc {
	return {
		version: 1,
		nodes: [
			{ id: START_NODE_ID, type: "start", position: { x: 0, y: 0 } },
			{
				id: "a1",
				type: "agent",
				position: { x: 100, y: 0 },
				data: {
					title: "Intake",
					sections: [{ id: "s1", body: sectionBody([{ type: "text", text: "Greet." }]) }],
					entryMessage: "",
					exits: [
						{ id: "x1", name: "transfer", description: "Caller wants the booking team" },
						{ id: "x2", name: "done", description: "Caller is finished" },
					],
					toolIds: [],
				},
			},
			{
				id: "st1",
				type: "statement",
				position: { x: 400, y: 0 },
				data: { title: "Transfer notice", say: "Please hold while I connect you." },
			},
			{
				id: "st2",
				type: "statement",
				position: { x: 400, y: 300 },
				data: { title: "Goodbye", say: "Thanks for calling, goodbye!" },
			},
			{
				id: "a2",
				type: "agent",
				position: { x: 700, y: 0 },
				data: {
					title: "Book",
					sections: [{ id: "s2", body: sectionBody([{ type: "text", text: "Book it." }]) }],
					entryMessage: "",
					exits: [],
					toolIds: [],
				},
			},
		],
		edges: [
			{ id: "e1", source: START_NODE_ID, sourceHandle: START_HANDLE_ID, target: "a1" },
			{ id: "e2", source: "a1", sourceHandle: "x1", target: "st1" },
			{ id: "e3", source: "a1", sourceHandle: "x2", target: "st2" },
			{ id: "e4", source: "st1", sourceHandle: STATEMENT_NEXT_HANDLE_ID, target: "a2" },
			// st2's Next stays unwired → the call ends after it speaks.
		],
	};
}

describe("statement nodes", () => {
	it("compiles a wired statement into kind statement with a single Next exit", () => {
		const { flow } = compileCanvas(makeStatementDoc(), []);
		const st1 = flow.nodes.find((n) => n.id === "st1");
		expect(st1?.kind).toBe("statement");
		expect(st1?.name).toBe("Transfer notice");
		expect(st1?.statement).toEqual({ say: "Please hold while I connect you." });
		// Engine requires instructions min 1 — mirrors the say text.
		expect(st1?.instructions).toBe("Please hold while I connect you.");
		expect(st1?.toolIds).toEqual([]);
		expect(st1?.exits).toEqual([{ name: "Next", description: "Continue", target: "a2" }]);
	});

	it("compiles an unwired statement with no exits — the call ends after speaking", () => {
		const { flow } = compileCanvas(makeStatementDoc(), []);
		const st2 = flow.nodes.find((n) => n.id === "st2");
		expect(st2?.kind).toBe("statement");
		expect(st2?.exits).toEqual([]);
	});

	it("validates a well-formed statement doc", () => {
		expect(validateFlowDoc(withGreeter(makeStatementDoc()))).toEqual([]);
	});

	it("flags an empty say and rejects a statement as the entry", () => {
		const doc = makeStatementDoc();
		const st1 = doc.nodes.find((n) => n.id === "st1");
		if (st1?.type === "statement" && st1.data) {
			st1.data.say = "   ";
		}
		const startEdge = doc.edges.find((e) => e.source === START_NODE_ID);
		if (startEdge) {
			startEdge.target = "st2";
		}
		const errors = validateFlowDoc(doc);
		expect(errors.some((e) => e.includes("needs something to say"))).toBe(true);
		expect(errors.some((e) => e.includes("must connect to an agent node"))).toBe(true);
	});

	it("round-trips statement nodes flow → canvas → flow", () => {
		const original = compileCanvas(makeStatementDoc(), []).flow;
		const rebuilt = canvasFromFlow(original);

		const st1 = rebuilt.nodes.find((n) => n.id === "st1");
		expect(st1?.type).toBe("statement");
		if (st1?.type === "statement") {
			expect(st1.data?.title).toBe("Transfer notice");
			expect(st1.data?.say).toBe("Please hold while I connect you.");
		}
		const st1Edges = rebuilt.edges.filter((e) => e.source === "st1");
		expect(st1Edges.map((e) => `${e.sourceHandle}->${e.target}`)).toEqual([
			`${STATEMENT_NEXT_HANDLE_ID}->a2`,
		]);
		expect(rebuilt.edges.some((e) => e.source === "st2")).toBe(false);

		expect(validateFlowDoc(rebuilt)).toEqual([]);
		const recompiled = compileCanvas(rebuilt, []).flow;
		expect(recompiled.entry).toBe(original.entry);
		expect(
			recompiled.nodes.map((n) => [n.id, n.kind, n.statement, n.instructions, n.exits]),
		).toEqual(original.nodes.map((n) => [n.id, n.kind, n.statement, n.instructions, n.exits]));
	});

	it("falls back to instructions when an engine statement node has no statement.say", () => {
		const rebuilt = canvasFromFlow({
			entry: "a1",
			nodes: [
				{
					id: "a1",
					instructions: "Greet.",
					toolIds: [],
					exits: [{ name: "done", description: "d", target: "st1" }],
				},
				{
					id: "st1",
					kind: "statement",
					instructions: "Spoken from instructions.",
					toolIds: [],
					exits: [],
				},
			],
		});
		const st1 = rebuilt.nodes.find((n) => n.id === "st1");
		expect(st1?.type).toBe("statement");
		if (st1?.type === "statement") {
			expect(st1.data?.say).toBe("Spoken from instructions.");
		}
	});
});

/** makeDoc plus two scenario nodes: sc1 wired to n1, sc2 wired to n2. */
function makeScenarioDoc(): CanvasDoc {
	const doc = makeDoc();
	doc.nodes.push(
		{
			id: "sc1",
			type: "scenario",
			position: { x: 100, y: 500 },
			data: {
				title: "Aggression Detected",
				description: "The caller is angry, hostile, cursing, or verbally aggressive",
			},
		},
		{
			id: "sc2",
			type: "scenario",
			position: { x: 400, y: 500 },
			data: { title: "Wants a human", description: "The caller asks for a real person" },
		},
	);
	doc.edges.push(
		{ id: "se1", source: "sc1", sourceHandle: SCENARIO_JUMP_HANDLE_ID, target: "n1" },
		{ id: "se2", source: "sc2", sourceHandle: SCENARIO_JUMP_HANDLE_ID, target: "n2" },
	);
	return doc;
}

describe("scenario nodes", () => {
	it("compiles scenario nodes into flow.scenarios, not flow.nodes", () => {
		const { flow } = compileCanvas(makeScenarioDoc(), []);
		expect(flow.nodes.map((n) => n.id).sort()).toEqual(["n1", "n2"]);
		expect(flow.scenarios).toEqual([
			{
				name: "Aggression Detected",
				description: "The caller is angry, hostile, cursing, or verbally aggressive",
				target: "n1",
			},
			{
				name: "Wants a human",
				description: "The caller asks for a real person",
				target: "n2",
			},
		]);
	});

	it("emits an empty scenarios array when the canvas has no scenario nodes", () => {
		expect(compileCanvas(makeDoc(), []).flow.scenarios).toEqual([]);
	});

	it("validates a well-formed scenario doc", () => {
		expect(validateFlowDoc(withGreeter(makeScenarioDoc()))).toEqual([]);
	});

	it("flags an unconnected scenario, empty description and duplicate titles", () => {
		const doc = makeScenarioDoc();
		doc.edges = doc.edges.filter((e) => e.source !== "sc2");
		const sc2 = doc.nodes.find((n) => n.id === "sc2");
		if (sc2?.type === "scenario" && sc2.data) {
			sc2.data.description = "  ";
			sc2.data.title = "aggression detected";
		}
		const errors = validateFlowDoc(doc);
		expect(
			errors.some((e) => e.includes('"aggression detected" must connect to the node it jumps to')),
		).toBe(true);
		expect(errors.some((e) => e.includes("needs a description (when to jump)"))).toBe(true);
		expect(errors.some((e) => e.includes("Duplicate scenario name"))).toBe(true);
	});

	it("round-trips scenarios flow → canvas → flow", () => {
		const original = compileCanvas(makeScenarioDoc(), []).flow;
		const rebuilt = canvasFromFlow(original);

		const scenarioNodes = rebuilt.nodes.filter((n) => n.type === "scenario");
		expect(scenarioNodes.map((n) => n.data?.title)).toEqual([
			"Aggression Detected",
			"Wants a human",
		]);
		// Each scenario node is wired to its jump target on the jump handle.
		for (const node of scenarioNodes) {
			const edge = rebuilt.edges.find((e) => e.source === node.id);
			expect(edge?.sourceHandle).toBe(SCENARIO_JUMP_HANDLE_ID);
		}

		expect(validateFlowDoc(rebuilt)).toEqual([]);
		const recompiled = compileCanvas(rebuilt, []).flow;
		expect(recompiled.scenarios).toEqual(original.scenarios);
		expect(recompiled.nodes.map((n) => n.id).sort()).toEqual(
			original.nodes.map((n) => n.id).sort(),
		);
	});
});

/**
 * Start → a1 agent (exit "wrap" → cv1) → cv1 conversation
 * (exit "booked" → a2 agent; wraps up by taking that exit).
 */
function makeConversationDoc(): CanvasDoc {
	return {
		version: 1,
		nodes: [
			{ id: START_NODE_ID, type: "start", position: { x: 0, y: 0 } },
			{
				id: "a1",
				type: "agent",
				position: { x: 100, y: 0 },
				data: {
					title: "Qualify",
					sections: [{ id: "s1", body: sectionBody([{ type: "text", text: "Qualify." }]) }],
					entryMessage: "",
					exits: [{ id: "x1", name: "wrap", description: "Core data captured" }],
					toolIds: [],
				},
			},
			{
				id: "cv1",
				type: "conversation",
				position: { x: 400, y: 0 },
				data: {
					title: "Keep it going",
					reason: "Real estate lead looking to sell or buy a property",
					hints: ["Ask about timeline", "Ask what's motivating the move"],
					exits: [{ id: "ce1", name: "booked", description: "The caller is ready to book" }],
					wrapUpMode: "exit",
					wrapUpExitId: "ce1",
					maxDurationSeconds: 180,
				},
			},
			{
				id: "a2",
				type: "agent",
				position: { x: 700, y: 0 },
				data: {
					title: "Book",
					sections: [{ id: "s2", body: sectionBody([{ type: "text", text: "Book it." }]) }],
					entryMessage: "",
					exits: [],
					toolIds: [],
				},
			},
		],
		edges: [
			{ id: "e1", source: START_NODE_ID, sourceHandle: START_HANDLE_ID, target: "a1" },
			{ id: "e2", source: "a1", sourceHandle: "x1", target: "cv1" },
			{ id: "e3", source: "cv1", sourceHandle: "ce1", target: "a2" },
		],
	};
}

describe("conversation nodes", () => {
	it("compiles to an agent-on-the-wire node carrying the conversation contract", () => {
		const { flow } = compileCanvas(makeConversationDoc(), []);
		const cv = flow.nodes.find((n) => n.id === "cv1");
		// Node kind stays "agent" on the wire — no `kind`, no objectives block.
		expect(cv?.kind).toBeUndefined();
		expect(cv?.objectives).toBeUndefined();
		expect(cv?.toolIds).toEqual([]);
		expect(cv?.name).toBe("Keep it going");
		expect(cv?.conversation).toEqual({
			reason: "Real estate lead looking to sell or buy a property",
			hints: ["Ask about timeline", "Ask what's motivating the move"],
			wrapUp: { mode: "exit", exit: "booked" },
			maxDurationSeconds: 180,
		});
		// Exits compile as usual (wired handle → target).
		expect(cv?.exits).toEqual([
			{ name: "booked", description: "The caller is ready to book", target: "a2" },
		]);
		// instructions mirror reason + hints (engine schema requires min 1).
		expect(cv?.instructions).toBe(
			"Real estate lead looking to sell or buy a property\n\nTalking points:\n- Ask about timeline\n- Ask what's motivating the move",
		);
	});

	it("emits wrapUp end_call and drops hints when there are none", () => {
		const doc = makeConversationDoc();
		const cv = doc.nodes.find((n) => n.id === "cv1");
		if (cv?.type === "conversation" && cv.data) {
			cv.data.wrapUpMode = "end_call";
			cv.data.wrapUpExitId = undefined;
			cv.data.hints = [];
			cv.data.maxDurationSeconds = undefined;
		}
		const { flow } = compileCanvas(doc, []);
		const compiled = flow.nodes.find((n) => n.id === "cv1");
		expect(compiled?.conversation).toEqual({
			reason: "Real estate lead looking to sell or buy a property",
			hints: undefined,
			wrapUp: { mode: "end_call" },
			maxDurationSeconds: undefined,
		});
	});

	it("validates a well-formed conversation doc", () => {
		expect(validateFlowDoc(withGreeter(makeConversationDoc()))).toEqual([]);
	});

	it("flags a missing reason and a wrap-up exit that points nowhere", () => {
		const doc = makeConversationDoc();
		const cv = doc.nodes.find((n) => n.id === "cv1");
		if (cv?.type === "conversation" && cv.data) {
			cv.data.reason = "  ";
			cv.data.wrapUpExitId = "does-not-exist";
		}
		const errors = validateFlowDoc(doc);
		expect(errors.some((e) => e.includes("needs a conversation reason"))).toBe(true);
		expect(errors.some((e) => e.includes("wraps up to an exit"))).toBe(true);
	});

	it("round-trips a conversation node flow → canvas → flow", () => {
		const original = compileCanvas(makeConversationDoc(), []).flow;
		const rebuilt = canvasFromFlow(original);

		const cv = rebuilt.nodes.find((n) => n.id === "cv1");
		expect(cv?.type).toBe("conversation");
		if (cv?.type === "conversation") {
			expect(cv.data?.reason).toBe("Real estate lead looking to sell or buy a property");
			expect(cv.data?.hints).toEqual(["Ask about timeline", "Ask what's motivating the move"]);
			expect(cv.data?.wrapUpMode).toBe("exit");
			expect(cv.data?.maxDurationSeconds).toBe(180);
			// wrap-up exit is re-linked to the rebuilt "booked" exit id.
			const bookedExit = cv.data?.exits.find((x) => x.name === "booked");
			expect(cv.data?.wrapUpExitId).toBe(bookedExit?.id);
		}

		expect(validateFlowDoc(rebuilt)).toEqual([]);
		const recompiled = compileCanvas(rebuilt, []).flow;
		expect(
			recompiled.nodes.map((n) => [n.id, n.kind, n.conversation, n.instructions, n.exits]),
		).toEqual(original.nodes.map((n) => [n.id, n.kind, n.conversation, n.instructions, n.exits]));
	});
});

/** Start → ob1 objective node (one objective with picklist options) → a2 agent. */
function makeObjectiveDoc(): CanvasDoc {
	return {
		version: 1,
		nodes: [
			{ id: START_NODE_ID, type: "start", position: { x: 0, y: 0 } },
			{
				id: "ob1",
				type: "objective",
				position: { x: 100, y: 0 },
				data: {
					title: "Confirm timeline",
					entryMessage: "",
					objectives: [
						{
							id: "obj1",
							title: "Timeline",
							description: "how soon the caller wants to sell",
							field: "Timeline",
							options: ["ASAP", "1-3 months", "3-6 months", "Not sure"],
						},
					],
				},
			},
			{
				id: "a2",
				type: "agent",
				position: { x: 400, y: 0 },
				data: {
					title: "Book",
					sections: [{ id: "s2", body: sectionBody([{ type: "text", text: "Book it." }]) }],
					entryMessage: "",
					exits: [],
					toolIds: [],
				},
			},
		],
		edges: [
			{ id: "e1", source: START_NODE_ID, sourceHandle: START_HANDLE_ID, target: "ob1" },
			{ id: "e2", source: "ob1", sourceHandle: OBJECTIVE_NEXT_HANDLE_ID, target: "a2" },
		],
	};
}

describe("objective nodes", () => {
	it("compiles picklist options onto the engine objective", () => {
		const { flow } = compileCanvas(makeObjectiveDoc(), []);
		const ob1 = flow.nodes.find((n) => n.id === "ob1");
		expect(ob1?.objectives).toEqual([
			{
				key: "timeline",
				description: "how soon the caller wants to sell",
				field: "Timeline",
				options: ["ASAP", "1-3 months", "3-6 months", "Not sure"],
				maxAttempts: undefined,
				sensitivity: undefined,
			},
		]);
	});

	it("omits options when none are set", () => {
		const doc = makeObjectiveDoc();
		const ob1 = doc.nodes.find((n) => n.id === "ob1");
		if (ob1?.type === "objective" && ob1.data) {
			ob1.data.objectives = ob1.data.objectives.map((o) => ({ ...o, options: undefined }));
		}
		const { flow } = compileCanvas(doc, []);
		expect(flow.nodes.find((n) => n.id === "ob1")?.objectives?.[0]?.options).toBeUndefined();
	});

	it("round-trips objective options flow → canvas → flow", () => {
		const original = compileCanvas(makeObjectiveDoc(), []).flow;
		const rebuilt = canvasFromFlow(original);
		const ob1 = rebuilt.nodes.find((n) => n.id === "ob1");
		expect(ob1?.type).toBe("objective");
		if (ob1?.type === "objective") {
			expect(ob1.data?.objectives[0]?.options).toEqual([
				"ASAP",
				"1-3 months",
				"3-6 months",
				"Not sure",
			]);
		}
		const recompiled = compileCanvas(rebuilt, []).flow;
		expect(recompiled.nodes.find((n) => n.id === "ob1")?.objectives).toEqual(
			original.nodes.find((n) => n.id === "ob1")?.objectives,
		);
	});
});

/**
 * Start → a1 agent with a single UNWIRED exit "wrap" + a default conversation
 * node cv1 (isDefault). The dangling exit must fall back to cv1 on compile.
 */
function makeDefaultExitDoc(isDefault: boolean): CanvasDoc {
	return {
		version: 1,
		nodes: [
			{ id: START_NODE_ID, type: "start", position: { x: 0, y: 0 } },
			{
				id: "a1",
				type: "agent",
				position: { x: 100, y: 0 },
				data: {
					title: "Qualify",
					sections: [{ id: "s1", body: sectionBody([{ type: "text", text: "Qualify." }]) }],
					entryMessage: "",
					exits: [{ id: "x1", name: "wrap", description: "Core data captured" }],
					toolIds: [],
				},
			},
			{
				id: "cv1",
				type: "conversation",
				position: { x: 400, y: 0 },
				data: {
					title: "Default chat",
					reason: "Keep the lead engaged",
					hints: [],
					exits: [],
					wrapUpMode: "end_call",
					isDefault,
				},
			},
		],
		// a1's "wrap" exit is intentionally left unwired.
		edges: [{ id: "e1", source: START_NODE_ID, sourceHandle: START_HANDLE_ID, target: "a1" }],
	};
}

describe("default-conversation unconnected-exit semantics", () => {
	it("wires a dangling exit to the designated default conversation node", () => {
		const { flow } = compileCanvas(makeDefaultExitDoc(true), []);
		const a1 = flow.nodes.find((n) => n.id === "a1");
		expect(a1?.exits).toEqual([{ name: "wrap", description: "Core data captured", target: "cv1" }]);
		// The default node's own (absent) exits are untouched — no self-loop.
		const cv = flow.nodes.find((n) => n.id === "cv1");
		expect(cv?.exits).toEqual([]);
	});

	it("leaves a dangling exit ending the call when no default node is designated", () => {
		const { flow } = compileCanvas(makeDefaultExitDoc(false), []);
		const a1 = flow.nodes.find((n) => n.id === "a1");
		expect(a1?.exits).toEqual([
			{ name: "wrap", description: "Core data captured", target: undefined },
		]);
	});

	it("errors when two conversation nodes are marked default", () => {
		const doc = makeDefaultExitDoc(true);
		doc.nodes.push({
			id: "cv2",
			type: "conversation",
			position: { x: 700, y: 0 },
			data: {
				title: "Second default",
				reason: "Another loop",
				hints: [],
				exits: [],
				wrapUpMode: "end_call",
				isDefault: true,
			},
		});
		const errors = validateFlowDoc(doc);
		expect(errors.some((e) => e.includes("Only one conversation node can be the default"))).toBe(
			true,
		);
	});
});

describe("variable helpers", () => {
	it("extracts {{vars}} and prettifies chip labels", () => {
		expect(extractVariableNames("Hi {{caller_name}} at {{ location_name }}", undefined)).toEqual([
			"caller_name",
			"location_name",
		]);
		expect(prettifyVariable("contact_first_name")).toBe("Contact.First Name");
		expect(prettifyVariable("caller_number")).toBe("Caller.Number");
	});

	it("turns {{vars}} in plain text back into mention chips", () => {
		const doc = textToTiptapDoc("Hello {{contact_first_name}}!") as {
			content: { content: { type: string; attrs?: { id: string } }[] }[];
		};
		const inline = doc.content[0].content;
		expect(inline.map((n) => n.type)).toEqual(["text", "mention", "text"]);
		expect(inline[1].attrs?.id).toBe("contact_first_name");
	});
});

// --- Phase 5b: aggregate objectives + tag-driven exit routing ---------------

/** Objective node with two part objectives + one aggregate combining them. */
function makeAggregateDoc(): CanvasDoc {
	return {
		version: 1,
		nodes: [
			{ id: START_NODE_ID, type: "start", position: { x: 0, y: 0 } },
			{
				id: "obj1",
				type: "objective",
				position: { x: 100, y: 0 },
				data: {
					title: "Address",
					entryMessage: "",
					objectives: [
						{ id: "o_city", title: "City", description: "the caller's city", field: "City" },
						{ id: "o_zip", title: "Zip", description: "the caller's zip", field: "Postal Code" },
						{
							id: "o_full",
							title: "Full Address",
							description: "",
							field: "Full Address",
							aggregateOf: ["o_city", "o_zip"],
						},
					],
				},
			},
		],
		edges: [{ id: "e1", source: START_NODE_ID, sourceHandle: START_HANDLE_ID, target: "obj1" }],
	};
}

describe("aggregate objectives", () => {
	it("compiles aggregateOf to the parts' engine keys", () => {
		const { flow } = compileCanvas(makeAggregateDoc(), []);
		const node = flow.nodes.find((n) => n.id === "obj1")!;
		const agg = node.objectives!.find((o) => o.key === "full_address")!;
		expect(agg.aggregateOf).toEqual(["city", "zip"]);
		expect(agg.field).toBe("Full Address");
		// Parts keep their own keys/fields.
		expect(node.objectives!.map((o) => o.key)).toEqual(["city", "zip", "full_address"]);
	});

	it("round-trips aggregateOf through decompile → recompile", () => {
		const original = compileCanvas(makeAggregateDoc(), []).flow;
		const rebuilt = canvasFromFlow(original);
		const recompiled = compileCanvas(rebuilt, []).flow;
		const agg = recompiled.nodes
			.find((n) => n.id === "obj1")!
			.objectives!.find((o) => o.key === "full_address")!;
		expect(agg.aggregateOf).toEqual(["city", "zip"]);
	});

	it("rejects a self-referential aggregate", () => {
		const doc = makeAggregateDoc();
		const objs = (doc.nodes[1].data as { objectives: { id: string; aggregateOf?: string[] }[] })
			.objectives;
		objs[2].aggregateOf = ["o_full"];
		const errors = validateFlowDoc(doc);
		expect(errors.some((e) => e.includes("can't include itself"))).toBe(true);
	});

	it("rejects aggregate-of-aggregate", () => {
		const doc = makeAggregateDoc();
		const objs = (doc.nodes[1].data as { objectives: { id: string; aggregateOf?: string[] }[] })
			.objectives;
		// o_zip becomes an aggregate; o_full references it → aggregate-of-aggregate.
		objs[1].aggregateOf = ["o_city"];
		const errors = validateFlowDoc(doc);
		expect(errors.some((e) => e.includes("another combined objective"))).toBe(true);
	});
});

describe("Get Full Address preset", () => {
	function makeFullAddressDoc(): CanvasDoc {
		return {
			version: 1,
			nodes: [
				{ id: START_NODE_ID, type: "start", position: { x: 0, y: 0 } },
				{
					id: "obj1",
					type: "objective",
					position: { x: 100, y: 0 },
					data: newFullAddressObjectiveData(),
				},
			],
			edges: [{ id: "e1", source: START_NODE_ID, sourceHandle: START_HANDLE_ID, target: "obj1" }],
		};
	}

	it("produces 4 managed parts + 1 managed aggregate on the canvas", () => {
		const data = newFullAddressObjectiveData();
		expect(data.objectives).toHaveLength(5);
		expect(data.objectives.every((o) => o.managed)).toBe(true);
		const aggregate = data.objectives.find((o) => o.aggregateOf?.length)!;
		expect(aggregate.field).toBe("contact.address");
		expect(aggregate.aggregateOf).toHaveLength(4);
		const partIds = data.objectives.filter((o) => !o.aggregateOf?.length).map((o) => o.id);
		expect(aggregate.aggregateOf).toEqual(partIds);
	});

	it("compiles to 4 parts + 1 aggregate whose aggregateOf references the 4 parts' engine keys", () => {
		const { flow } = compileCanvas(makeFullAddressDoc(), []);
		const node = flow.nodes.find((n) => n.id === "obj1")!;
		expect(node.objectives).toHaveLength(5);
		const aggregate = node.objectives!.find((o) => o.aggregateOf?.length)!;
		const partKeys = node.objectives!.filter((o) => o !== aggregate).map((o) => o.key);
		expect(partKeys).toHaveLength(4);
		expect(aggregate.aggregateOf).toEqual(partKeys);
		expect(aggregate.field).toBe("contact.address");
	});

	it("strips `managed` from the compiled engine objectives — canvas-only metadata", () => {
		const { flow } = compileCanvas(makeFullAddressDoc(), []);
		const node = flow.nodes.find((n) => n.id === "obj1")!;
		for (const objective of node.objectives!) {
			expect(objective).not.toHaveProperty("managed");
		}
		// Also confirm it isn't hiding under JSON serialization (belt and suspenders).
		expect(JSON.stringify(flow)).not.toContain("managed");
	});
});

describe("exit tag rules (tag-driven routing)", () => {
	it("passes exit tagRules through compile", () => {
		const doc = makeDoc();
		const agentData = doc.nodes[1].data as {
			exits: { id: string; name: string; description: string; tagRules?: unknown }[];
		};
		agentData.exits[0].tagRules = { mustHave: ["qualified"], cantHave: ["dnc"] };
		const { flow } = compileCanvas(doc, []);
		const exit = flow.nodes.find((n) => n.id === "n1")!.exits.find((e) => e.name === "qualified")!;
		expect(exit.tagRules).toEqual({ mustHave: ["qualified"], cantHave: ["dnc"] });
	});

	it("drops empty tagRules to undefined (byte-identical to no rules)", () => {
		const doc = makeDoc();
		const agentData = doc.nodes[1].data as {
			exits: { id: string; tagRules?: unknown }[];
		};
		agentData.exits[0].tagRules = { mustHave: ["  ", ""], cantHave: [] };
		const { flow } = compileCanvas(doc, []);
		const exit = flow.nodes.find((n) => n.id === "n1")!.exits.find((e) => e.name === "qualified")!;
		expect(exit.tagRules).toBeUndefined();
	});
});

// --- Greeter fixture --------------------------------------------------------

describe("greeter fixture", () => {
	it("newCanvas contains exactly one greeter wired Start → Greeter → agent", () => {
		const doc = newCanvas();
		const greeters = doc.nodes.filter((n) => n.type === "greeter");
		expect(greeters).toHaveLength(1);
		const greeter = greeters[0]!;

		// Start's only edge goes to the greeter.
		const startEdges = doc.edges.filter((e) => e.source === START_NODE_ID);
		expect(startEdges).toHaveLength(1);
		expect(startEdges[0]!.target).toBe(greeter.id);

		// The greeter has one outgoing edge into the (agent) entry node.
		const greeterEdges = doc.edges.filter((e) => e.source === greeter.id);
		expect(greeterEdges).toHaveLength(1);
		expect(greeterEdges[0]!.sourceHandle).toBe(GREETER_NEXT_HANDLE_ID);
		const entry = doc.nodes.find((n) => n.id === greeterEdges[0]!.target);
		expect(entry?.type).toBe("agent");

		// The greeter wiring itself is valid (the fresh agent's empty prompt is a
		// separate, expected error — assert only that no greeter/Start issue fires).
		const errors = validateFlowDoc(doc);
		expect(errors.some((e) => e.includes("Greeter"))).toBe(false);
		expect(errors.some((e) => e.includes("Start"))).toBe(false);
	});

	it("compiles the greeter text into greeting and its edge target into entry", () => {
		const doc = withGreeter(makeDoc(), "Hi there, thanks for calling!");
		const { flow, greeting } = compileCanvas(doc, []);
		expect(greeting).toBe("Hi there, thanks for calling!");
		expect(flow.entry).toBe("n1");
		// The greeter is a fixture, never an engine node.
		expect(flow.nodes.some((n) => n.id === GREETER_ID)).toBe(false);
	});

	it("errors when the flow has no greeter", () => {
		const errors = validateFlowDoc(makeDoc());
		expect(errors.some((e) => e.includes("missing its Greeter"))).toBe(true);
	});

	it("errors when the flow has more than one greeter", () => {
		const doc = withGreeter(makeDoc());
		doc.nodes.push({
			id: "greeter2",
			type: "greeter",
			position: { x: 180, y: 200 },
			data: { title: "Greeter", greeting: "" },
		});
		const errors = validateFlowDoc(doc);
		expect(errors.some((e) => e.includes("only have one Greeter"))).toBe(true);
	});

	it("round-trips greeting through flow → canvas → flow", () => {
		const source = withGreeter(makeDoc(), "Welcome, how can I help?");
		const original = compileCanvas(source, []);
		// Reconstruct a canvas from the engine flow + greeting, then recompile.
		const rebuilt = canvasFromFlow(original.flow, original.greeting);
		expect(validateFlowDoc(rebuilt)).toEqual([]);
		const recompiled = compileCanvas(rebuilt, []);
		expect(recompiled.greeting).toBe("Welcome, how can I help?");
		expect(recompiled.flow.entry).toBe(original.flow.entry);
	});

	it("migrates a legacy canvas (Start → agent, no greeter) on load", () => {
		const legacy = makeDoc(); // Start → n1 directly, no greeter
		expect(legacy.nodes.some((n) => n.type === "greeter")).toBe(false);

		const migrated = ensureGreeter(legacy, "Legacy greeting");
		const greeters = migrated.nodes.filter((n) => n.type === "greeter");
		expect(greeters).toHaveLength(1);
		const greeter = greeters[0]!;

		// Start now points at the greeter; the greeter points at the old entry.
		const startEdges = migrated.edges.filter((e) => e.source === START_NODE_ID);
		expect(startEdges).toHaveLength(1);
		expect(startEdges[0]!.target).toBe(greeter.id);
		const greeterEdge = migrated.edges.find((e) => e.source === greeter.id);
		expect(greeterEdge?.target).toBe("n1");

		expect(validateFlowDoc(migrated)).toEqual([]);
		const { flow, greeting } = compileCanvas(migrated, []);
		expect(flow.entry).toBe("n1");
		expect(greeting).toBe("Legacy greeting");
	});

	it("leaves a canvas that already has a greeter unchanged", () => {
		const doc = withGreeter(makeDoc(), "Existing");
		const result = ensureGreeter(doc, "Should be ignored");
		expect(result).toBe(doc);
	});
});
