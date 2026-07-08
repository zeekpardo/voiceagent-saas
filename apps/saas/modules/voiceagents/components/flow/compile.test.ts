import { describe, expect, it } from "vitest";

import {
	canvasFromFlow,
	compileCanvas,
	extractVariableNames,
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
	OTHERWISE_HANDLE_ID,
	SCENARIO_JUMP_HANDLE_ID,
	START_HANDLE_ID,
	START_NODE_ID,
	STATEMENT_NEXT_HANDLE_ID,
	TRUE_HANDLE_ID,
} from "./flow-types";

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
		expect(validateFlowDoc(makeDoc())).toEqual([]);
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
				data: { title: "Speaks English?", condition: "The caller has confirmed they speak English" },
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
		expect(validateFlowDoc(makeBranchDoc())).toEqual([]);
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
			tfEdges
				.map((e) => `${e.sourceHandle}->${e.target}`)
				.sort((a, b) => a.localeCompare(b)),
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
		expect(validateFlowDoc(makeStatementDoc())).toEqual([]);
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
		expect(validateFlowDoc(makeScenarioDoc())).toEqual([]);
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
