import { describe, expect, it } from "vitest";

import {
	canvasFromFlow,
	channelPruneWarnings,
	collapseManagedObjectives,
	compileCanvas,
	ensureGreeter,
	extractVariableNames,
	flowSoundnessWarnings,
	newCanvas,
	newFullAddressObjectiveData,
	prettifyVariable,
	pruneFlowForChannel,
	sanitizeExitName,
	sectionsToInstructions,
	textToTiptapDoc,
	tiptapToText,
	TRANSFER_FAILED_EXIT_NAME,
	validateFlowDoc,
} from "./compile";
import type {
	AgentNodeData,
	CanvasDoc,
	HandoffNodeData,
	ObjectiveNodeData,
	StatementNodeData,
	TransferNodeData,
} from "./flow-types";
import {
	FALSE_HANDLE_ID,
	GREETER_NEXT_HANDLE_ID,
	normalizeChannels,
	OBJECTIVE_NEXT_HANDLE_ID,
	OTHERWISE_HANDLE_ID,
	SCENARIO_JUMP_HANDLE_ID,
	START_HANDLE_ID,
	START_NODE_ID,
	STATEMENT_NEXT_HANDLE_ID,
	TRANSFER_FAILED_HANDLE_ID,
	TRANSFER_NEXT_HANDLE_ID,
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

describe("textToTiptapDoc → tiptapToText round-trip", () => {
	// The pill editors (FieldPickerTextarea) load node text with textToTiptapDoc
	// and save with tiptapToText on every change — an UNTOUCHED field must save
	// back the byte-identical string or every open/close would dirty the node.
	const roundTrip = (text: string) => tiptapToText(textToTiptapDoc(text));

	it.each([
		["plain text", "Please hold while I connect you."],
		["token mid-sentence", "Hi {{contact_first_name}}, this is {{location_name}}."],
		["token-only value", "{{contact_kitchen_year}}"],
		["adjacent tokens", "{{contact_first_name}}{{contact_last_name}}"],
		["multi-line with tokens", "Line one {{location_city}}\n\nLine three {{customvalue_slogan}}"],
		["unknown token preserved verbatim", "prefix {{some_unknown_var-1.x}} suffix"],
		["trailing newline", "ends with newline\n"],
		["empty string", ""],
		["lone braces are not tokens", "not {{a token because spaces}} here { } {{}}"],
	])("round-trips %s byte-identically", (_label, text) => {
		expect(roundTrip(text)).toBe(text);
	});

	it("parses tokens into variable mention nodes with prettified labels", () => {
		const doc = textToTiptapDoc("Hi {{contact_first_name}}!") as {
			content: { content: { type: string; attrs?: Record<string, unknown>; text?: string }[] }[];
		};
		const inline = doc.content[0].content;
		expect(inline.map((n) => n.type)).toEqual(["text", "mention", "text"]);
		expect(inline[1].attrs).toMatchObject({
			id: "contact_first_name",
			label: "Contact.First Name",
			mentionSuggestionChar: "@",
		});
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
					entryMessage: "Introduce yourself as the specialist",
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
		// Entry node's entry message now compiles too (spoken by a handoff target
		// when it enters this node fresh; ignored by the engine on a normal call).
		expect(n1?.entryInstructions).toBe("Introduce yourself as the specialist");
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
		// Under the Greeter model the entry is the Greeter's target, so point the
		// Greeter's edge at a branch node and expect the entry-kind rejection.
		const doc = withGreeter(makeBranchDoc());
		const greeterEdge = doc.edges.find((e) => e.source === GREETER_ID);
		if (greeterEdge) {
			greeterEdge.target = "tf1";
		}
		const errors = validateFlowDoc(doc);
		expect(
			errors.some((e) => e.includes("The call must start on an Agent, Objective, or Booking node")),
		).toBe(true);
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
		const doc = withGreeter(makeStatementDoc());
		const st1 = doc.nodes.find((n) => n.id === "st1");
		if (st1?.type === "statement" && st1.data) {
			st1.data.say = "   ";
		}
		// Route the Greeter's edge to a statement node so it becomes the entry.
		const greeterEdge = doc.edges.find((e) => e.source === GREETER_ID);
		if (greeterEdge) {
			greeterEdge.target = "st2";
		}
		const errors = validateFlowDoc(doc);
		expect(errors.some((e) => e.includes("needs something to say"))).toBe(true);
		expect(
			errors.some((e) => e.includes("The call must start on an Agent, Objective, or Booking node")),
		).toBe(true);
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

	it("omits statement.generate for a verbatim statement (default, unchanged shape)", () => {
		const { flow } = compileCanvas(makeStatementDoc(), []);
		const st1 = flow.nodes.find((n) => n.id === "st1");
		// No `generate` key at all — existing statements compile byte-identically.
		expect(st1?.statement).toEqual({ say: "Please hold while I connect you." });
		expect(st1?.statement && "generate" in st1.statement).toBe(false);
	});

	it("compiles statement.generate=true and round-trips the AI-generate flag", () => {
		const doc = makeStatementDoc();
		const st1 = doc.nodes.find((n) => n.id === "st1");
		if (st1?.type === "statement" && st1.data) {
			st1.data.generate = true;
		}
		const { flow } = compileCanvas(doc, []);
		const compiled = flow.nodes.find((n) => n.id === "st1");
		expect(compiled?.statement).toEqual({
			say: "Please hold while I connect you.",
			generate: true,
		});

		// flow → canvas → flow keeps the flag.
		const rebuilt = canvasFromFlow(flow);
		const rebuiltSt1 = rebuilt.nodes.find((n) => n.id === "st1");
		if (rebuiltSt1?.type === "statement") {
			expect(rebuiltSt1.data?.generate).toBe(true);
		}
		const recompiled = compileCanvas(rebuilt, []).flow;
		expect(recompiled.nodes.find((n) => n.id === "st1")?.statement).toEqual({
			say: "Please hold while I connect you.",
			generate: true,
		});
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
 * Start → a1 agent (exit "wrap" → cv1) → cv1 conversation (terminal "keep
 * chatting" stage — no exits, no wrap-up, just an optional Extra Prompt).
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
					extraPrompt: "Real estate lead looking to sell or buy a property",
					maxDurationSeconds: 180,
				},
			},
		],
		edges: [
			{ id: "e1", source: START_NODE_ID, sourceHandle: START_HANDLE_ID, target: "a1" },
			{ id: "e2", source: "a1", sourceHandle: "x1", target: "cv1" },
		],
	};
}

describe("conversation nodes", () => {
	it("compiles to a terminal agent-on-the-wire node carrying the conversation contract", () => {
		const { flow } = compileCanvas(makeConversationDoc(), []);
		const cv = flow.nodes.find((n) => n.id === "cv1");
		// Node kind stays "agent" on the wire — no `kind`, no objectives block.
		expect(cv?.kind).toBeUndefined();
		expect(cv?.objectives).toBeUndefined();
		expect(cv?.toolIds).toEqual([]);
		expect(cv?.name).toBe("Keep it going");
		// Extra Prompt rides on conversation.reason; wrapUp is always end_call.
		expect(cv?.conversation).toEqual({
			reason: "Real estate lead looking to sell or buy a property",
			wrapUp: { mode: "end_call" },
			maxDurationSeconds: 180,
		});
		// Terminal — always empty exits.
		expect(cv?.exits).toEqual([]);
		// instructions mirror the Extra Prompt (engine schema requires min 1).
		expect(cv?.instructions).toBe("Real estate lead looking to sell or buy a property");
	});

	it("omits reason and falls back to a generic instruction when the Extra Prompt is empty", () => {
		const doc = makeConversationDoc();
		const cv = doc.nodes.find((n) => n.id === "cv1");
		if (cv?.type === "conversation" && cv.data) {
			cv.data.extraPrompt = "   ";
			cv.data.maxDurationSeconds = undefined;
		}
		const { flow } = compileCanvas(doc, []);
		const compiled = flow.nodes.find((n) => n.id === "cv1");
		expect(compiled?.conversation).toEqual({
			reason: undefined,
			wrapUp: { mode: "end_call" },
			maxDurationSeconds: undefined,
		});
		expect(compiled?.instructions).toBe("Keep the conversation going.");
	});

	it("validates a well-formed conversation doc", () => {
		expect(validateFlowDoc(withGreeter(makeConversationDoc()))).toEqual([]);
	});

	it("flags a conversation node with no name", () => {
		const doc = makeConversationDoc();
		const cv = doc.nodes.find((n) => n.id === "cv1");
		if (cv?.type === "conversation" && cv.data) {
			cv.data.title = "  ";
		}
		const errors = validateFlowDoc(doc);
		expect(errors.some((e) => e.includes("needs a name"))).toBe(true);
	});

	it("round-trips a conversation node flow → canvas → flow", () => {
		const original = compileCanvas(makeConversationDoc(), []).flow;
		const rebuilt = canvasFromFlow(original);

		const cv = rebuilt.nodes.find((n) => n.id === "cv1");
		expect(cv?.type).toBe("conversation");
		if (cv?.type === "conversation") {
			expect(cv.data?.extraPrompt).toBe("Real estate lead looking to sell or buy a property");
			expect(cv.data?.maxDurationSeconds).toBe(180);
			// Terminal — no exits, no wrap-up on the rebuilt data.
			expect(cv.data?.exits).toBeUndefined();
		}

		expect(validateFlowDoc(rebuilt)).toEqual([]);
		const recompiled = compileCanvas(rebuilt, []).flow;
		expect(
			recompiled.nodes.map((n) => [n.id, n.kind, n.conversation, n.instructions, n.exits]),
		).toEqual(original.nodes.map((n) => [n.id, n.kind, n.conversation, n.instructions, n.exits]));
	});

	it("decompiles a LEGACY conversation node (reason + hints + exits + wrapUp:exit) as terminal", () => {
		// An OLD engine node still carries hints, a wired exit and wrapUp:{mode:"exit"}.
		const legacyFlow = {
			entry: "cv1",
			nodes: [
				{
					id: "cv1",
					name: "Old chat",
					instructions: "Old instructions",
					toolIds: [],
					exits: [{ name: "booked", description: "Ready to book", target: "a2" }],
					conversation: {
						reason: "Legacy discovery reason",
						hints: ["Ask about timeline"],
						wrapUp: { mode: "exit" as const, exit: "booked" },
						maxDurationSeconds: 120,
					},
				},
				{
					id: "a2",
					name: "Book",
					instructions: "Book it.",
					toolIds: [],
					exits: [],
				},
			],
		};
		const rebuilt = canvasFromFlow(legacyFlow);
		const cv = rebuilt.nodes.find((n) => n.id === "cv1");
		expect(cv?.type).toBe("conversation");
		if (cv?.type === "conversation") {
			// reason → extraPrompt; hints/exits/wrapUp dropped.
			expect(cv.data?.extraPrompt).toBe("Legacy discovery reason");
			expect(cv.data?.maxDurationSeconds).toBe(120);
			expect(cv.data?.hints).toBeUndefined();
			expect(cv.data?.exits).toBeUndefined();
			expect(cv.data?.wrapUpMode).toBeUndefined();
		}
		// No exit edge is rebuilt from the legacy node (terminal).
		expect(rebuilt.edges.some((e) => e.source === "cv1")).toBe(false);
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
 * Start → a1 agent with a single UNWIRED exit "wrap". A dangling exit ends the
 * call (there's no longer a "default conversation" catch-all — conversation
 * nodes are terminal).
 */
function makeDanglingExitDoc(): CanvasDoc {
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
		],
		// a1's "wrap" exit is intentionally left unwired.
		edges: [{ id: "e1", source: START_NODE_ID, sourceHandle: START_HANDLE_ID, target: "a1" }],
	};
}

describe("unconnected-exit semantics", () => {
	it("leaves a dangling exit ending the call", () => {
		const { flow } = compileCanvas(makeDanglingExitDoc(), []);
		const a1 = flow.nodes.find((n) => n.id === "a1");
		expect(a1?.exits).toEqual([
			{ name: "wrap", description: "Core data captured", target: undefined },
		]);
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

describe("Full address objective", () => {
	// A single "Full address" objective row (fullAddress) — the builder keeps ONE
	// normal-looking row; the managed 4-part collector materializes at COMPILE time.
	function makeFullAddressDoc(): CanvasDoc {
		return {
			version: 1,
			nodes: [
				{ id: START_NODE_ID, type: "start", position: { x: 0, y: 0 } },
				{
					id: "obj1",
					type: "objective",
					position: { x: 100, y: 0 },
					data: {
						title: "Get Full Address",
						entryMessage: "",
						objectives: [
							{
								id: "o_addr",
								title: "Full Address",
								description: "",
								field: "Full Address",
								fullAddress: true,
							},
						],
					},
				},
			],
			edges: [{ id: "e1", source: START_NODE_ID, sourceHandle: START_HANDLE_ID, target: "obj1" }],
		};
	}

	/** Objective node whose data is the managed 4-part + aggregate set authored by hand. */
	function makeManagedDoc(): CanvasDoc {
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

	it("newFullAddressObjectiveData is still 4 managed parts + 1 managed aggregate (expansion source)", () => {
		const data = newFullAddressObjectiveData();
		expect(data.objectives).toHaveLength(5);
		expect(data.objectives.every((o) => o.managed)).toBe(true);
		const aggregate = data.objectives.find((o) => o.aggregateOf?.length)!;
		expect(aggregate.field).toBe("contact.address");
		expect(aggregate.aggregateOf).toHaveLength(4);
		const partIds = data.objectives.filter((o) => !o.aggregateOf?.length).map((o) => o.id);
		expect(aggregate.aggregateOf).toEqual(partIds);
	});

	it("a SINGLE full-address row compiles to 4 parts + 1 aggregate referencing the parts' engine keys", () => {
		const { flow } = compileCanvas(makeFullAddressDoc(), []);
		const node = flow.nodes.find((n) => n.id === "obj1")!;
		expect(node.objectives).toHaveLength(5);
		const aggregate = node.objectives!.find((o) => o.aggregateOf?.length)!;
		const partKeys = node.objectives!.filter((o) => o !== aggregate).map((o) => o.key);
		expect(partKeys).toHaveLength(4);
		expect(aggregate.aggregateOf).toEqual(partKeys);
		expect(aggregate.field).toBe("contact.address");
	});

	it("compiles byte-identically to authoring the managed 4-part + aggregate objectives by hand", () => {
		const single = compileCanvas(makeFullAddressDoc(), []).flow.nodes.find((n) => n.id === "obj1")!;
		const managed = compileCanvas(makeManagedDoc(), []).flow.nodes.find((n) => n.id === "obj1")!;
		expect(single).toEqual(managed);
	});

	it("strips canvas-only metadata (managed/fullAddress) from the compiled engine objectives", () => {
		const { flow } = compileCanvas(makeFullAddressDoc(), []);
		const node = flow.nodes.find((n) => n.id === "obj1")!;
		for (const objective of node.objectives!) {
			expect(objective).not.toHaveProperty("managed");
			expect(objective).not.toHaveProperty("fullAddress");
		}
		expect(JSON.stringify(flow)).not.toContain("managed");
		expect(JSON.stringify(flow)).not.toContain("fullAddress");
	});

	it("round-trips: compile then decompile collapses the 4-part group back to ONE full-address row", () => {
		const flow = compileCanvas(makeFullAddressDoc(), []).flow;
		const rebuilt = canvasFromFlow(flow);
		const objectives = (rebuilt.nodes.find((n) => n.id === "obj1")!.data as ObjectiveNodeData)
			.objectives;
		expect(objectives).toHaveLength(1);
		expect(objectives[0].fullAddress).toBe(true);
		expect(objectives[0].field).toBe("contact.address");
		// ...and it recompiles to the identical engine spec.
		const recompiled = compileCanvas(rebuilt, []).flow.nodes.find((n) => n.id === "obj1")!;
		expect(recompiled.objectives).toEqual(flow.nodes.find((n) => n.id === "obj1")!.objectives);
	});

	it("collapseManagedObjectives folds a saved managed 4-part canvas back to ONE row", () => {
		const collapsed = collapseManagedObjectives(makeManagedDoc());
		const objectives = (collapsed.nodes[1].data as ObjectiveNodeData).objectives;
		expect(objectives).toHaveLength(1);
		expect(objectives[0].fullAddress).toBe(true);
		expect(objectives[0].field).toBe("contact.address");
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

	it("defaults greetingGenerate to false (verbatim greeting)", () => {
		const doc = withGreeter(makeDoc(), "Hi there!");
		const { greetingGenerate } = compileCanvas(doc, []);
		expect(greetingGenerate).toBe(false);
	});

	it("compiles greetingGenerate=true and round-trips the AI-generate greeting flag", () => {
		const doc = withGreeter(makeDoc(), "Hi there!");
		const greeter = doc.nodes.find((n) => n.id === GREETER_ID);
		if (greeter?.type === "greeter" && greeter.data) {
			(greeter.data as { greetingGenerate?: boolean }).greetingGenerate = true;
		}
		const compiled = compileCanvas(doc, []);
		expect(compiled.greeting).toBe("Hi there!");
		expect(compiled.greetingGenerate).toBe(true);

		// flow + greeting + flag → canvas → flow keeps the flag on the greeter.
		const rebuilt = canvasFromFlow(compiled.flow, compiled.greeting, compiled.greetingGenerate);
		const rebuiltGreeter = rebuilt.nodes.find((n) => n.type === "greeter");
		expect(
			(rebuiltGreeter?.data as { greetingGenerate?: boolean } | undefined)?.greetingGenerate,
		).toBe(true);
		expect(compileCanvas(rebuilt, []).greetingGenerate).toBe(true);
	});
});

function makeHandoffDoc(data: Partial<HandoffNodeData> = {}): CanvasDoc {
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
					exits: [{ id: "x1", name: "to booking", description: "Caller wants the booking team" }],
					toolIds: [],
				},
			},
			{
				id: "h1",
				type: "handoff",
				position: { x: 400, y: 0 },
				data: { title: "To booking agent", handoffAgentId: "ag_booking", ...data },
			},
		],
		edges: [
			{ id: "e1", source: START_NODE_ID, sourceHandle: START_HANDLE_ID, target: "a1" },
			{ id: "e2", source: "a1", sourceHandle: "x1", target: "h1" },
			// h1 is terminal — no outgoing edge (the target agent takes over).
		],
	};
}

describe("handoff nodes", () => {
	it("compiles a handoff into kind handoff with a target agent id and no exits", () => {
		const { flow } = compileCanvas(makeHandoffDoc(), []);
		const h1 = flow.nodes.find((n) => n.id === "h1");
		expect(h1?.kind).toBe("handoff");
		expect(h1?.name).toBe("To booking agent");
		expect(h1?.handoffAgentId).toBe("ag_booking");
		// Terminal for this flow: the target agent takes over one-way.
		expect(h1?.exits).toEqual([]);
		expect(h1?.toolIds).toEqual([]);
		// Engine requires instructions min 1 even though a handoff node never becomes an agent.
		expect((h1?.instructions.length ?? 0) > 0).toBe(true);
	});

	it("validates a well-formed handoff doc", () => {
		expect(validateFlowDoc(withGreeter(makeHandoffDoc()))).toEqual([]);
	});

	it("flags a handoff with no target agent", () => {
		const doc = makeHandoffDoc();
		const h1 = doc.nodes.find((n) => n.id === "h1");
		if (h1?.type === "handoff" && h1.data) {
			h1.data.handoffAgentId = undefined;
		}
		const errors = validateFlowDoc(withGreeter(doc));
		expect(errors.some((e) => e.includes("must choose an agent"))).toBe(true);
	});

	it("round-trips handoff nodes flow → canvas → flow", () => {
		const original = compileCanvas(makeHandoffDoc(), []).flow;
		const rebuilt = canvasFromFlow(original);

		const h1 = rebuilt.nodes.find((n) => n.id === "h1");
		expect(h1?.type).toBe("handoff");
		if (h1?.type === "handoff") {
			expect(h1.data?.title).toBe("To booking agent");
			expect(h1.data?.handoffAgentId).toBe("ag_booking");
		}
		// Terminal — no outgoing edges reconstructed.
		expect(rebuilt.edges.some((e) => e.source === "h1")).toBe(false);

		expect(validateFlowDoc(rebuilt)).toEqual([]);
		const recompiled = compileCanvas(rebuilt, []).flow;
		expect(recompiled.entry).toBe(original.entry);
		expect(recompiled.nodes.map((n) => [n.id, n.kind, n.handoffAgentId, n.exits])).toEqual(
			original.nodes.map((n) => [n.id, n.kind, n.handoffAgentId, n.exits]),
		);
	});

	it("compiles a handoff with say and holdSeconds into a handoff object", () => {
		const { flow } = compileCanvas(
			makeHandoffDoc({ say: "One moment — connecting you now.", holdSeconds: 5 }),
			[],
		);
		const h1 = flow.nodes.find((n) => n.id === "h1");
		expect(h1?.handoff).toEqual({ say: "One moment — connecting you now.", holdSeconds: 5 });
	});

	it("omits the handoff key entirely when neither say nor holdSeconds is set", () => {
		const { flow } = compileCanvas(makeHandoffDoc(), []);
		const h1 = flow.nodes.find((n) => n.id === "h1");
		expect(h1?.handoff).toBeUndefined();
	});

	it("preserves holdSeconds of 0 (disables music) rather than dropping it as falsy", () => {
		const { flow } = compileCanvas(makeHandoffDoc({ holdSeconds: 0 }), []);
		const h1 = flow.nodes.find((n) => n.id === "h1");
		expect(h1?.handoff).toEqual({ holdSeconds: 0 });
	});

	it("round-trips say and holdSeconds (including 0) flow → canvas → flow", () => {
		const original = compileCanvas(makeHandoffDoc({ say: "Hang tight.", holdSeconds: 0 }), []).flow;
		const rebuilt = canvasFromFlow(original);

		const h1 = rebuilt.nodes.find((n) => n.id === "h1");
		expect(h1?.type).toBe("handoff");
		if (h1?.type === "handoff") {
			expect(h1.data?.say).toBe("Hang tight.");
			expect(h1.data?.holdSeconds).toBe(0);
		}

		const recompiled = compileCanvas(rebuilt, []).flow;
		const recompiledH1 = recompiled.nodes.find((n) => n.id === "h1");
		expect(recompiledH1?.handoff).toEqual({ say: "Hang tight.", holdSeconds: 0 });
	});

	it("emits handoff.generate=true alongside a say and round-trips it", () => {
		const { flow } = compileCanvas(
			makeHandoffDoc({ say: "Connecting you now.", generate: true, holdSeconds: 3 }),
			[],
		);
		const h1 = flow.nodes.find((n) => n.id === "h1");
		expect(h1?.handoff).toEqual({ say: "Connecting you now.", generate: true, holdSeconds: 3 });

		const rebuilt = canvasFromFlow(flow);
		const rebuiltH1 = rebuilt.nodes.find((n) => n.id === "h1");
		if (rebuiltH1?.type === "handoff") {
			expect(rebuiltH1.data?.generate).toBe(true);
		}
		const recompiled = compileCanvas(rebuilt, []).flow;
		expect(recompiled.nodes.find((n) => n.id === "h1")?.handoff).toEqual({
			say: "Connecting you now.",
			generate: true,
			holdSeconds: 3,
		});
	});

	it("does not emit handoff.generate when there is no say (nothing to generate from)", () => {
		const { flow } = compileCanvas(makeHandoffDoc({ generate: true, holdSeconds: 4 }), []);
		const h1 = flow.nodes.find((n) => n.id === "h1");
		expect(h1?.handoff).toEqual({ holdSeconds: 4 });
	});

	it("omits handoff.generate for a verbatim say (default, unchanged shape)", () => {
		const { flow } = compileCanvas(makeHandoffDoc({ say: "One moment." }), []);
		const h1 = flow.nodes.find((n) => n.id === "h1");
		expect(h1?.handoff).toEqual({ say: "One moment." });
	});

	it("omits handoff.mode for the announced default (unchanged shape)", () => {
		const { flow } = compileCanvas(makeHandoffDoc({ mode: "announced", say: "One moment." }), []);
		const h1 = flow.nodes.find((n) => n.id === "h1");
		expect(h1?.handoff).toEqual({ say: "One moment." });
	});

	it("emits handoff.mode=seamless even with no say or holdSeconds", () => {
		const { flow } = compileCanvas(makeHandoffDoc({ mode: "seamless" }), []);
		const h1 = flow.nodes.find((n) => n.id === "h1");
		expect(h1?.handoff).toEqual({ mode: "seamless" });
	});

	it("emits handoff.mode=seamless alongside a say/holdSeconds and round-trips it", () => {
		const { flow } = compileCanvas(
			makeHandoffDoc({ mode: "seamless", say: "Passing you over.", holdSeconds: 0 }),
			[],
		);
		const h1 = flow.nodes.find((n) => n.id === "h1");
		expect(h1?.handoff).toEqual({ mode: "seamless", say: "Passing you over.", holdSeconds: 0 });

		const rebuilt = canvasFromFlow(flow);
		const rebuiltH1 = rebuilt.nodes.find((n) => n.id === "h1");
		expect(rebuiltH1?.type).toBe("handoff");
		if (rebuiltH1?.type === "handoff") {
			expect(rebuiltH1.data?.mode).toBe("seamless");
		}
		const recompiled = compileCanvas(rebuilt, []).flow;
		expect(recompiled.nodes.find((n) => n.id === "h1")?.handoff).toEqual({
			mode: "seamless",
			say: "Passing you over.",
			holdSeconds: 0,
		});
	});
});

/** Start → a1 agent (exit → s1 stop_responding). s1 is a leaf: no outgoing edge. */
function makeStopRespondingDoc(): CanvasDoc {
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
					exits: [{ id: "x1", name: "park", description: "Nothing more to do — park the contact" }],
					toolIds: [],
				},
			},
			{
				id: "sr1",
				type: "stop_responding",
				position: { x: 400, y: 0 },
				data: { title: "Park the contact" },
			},
		],
		edges: [
			{ id: "e1", source: START_NODE_ID, sourceHandle: START_HANDLE_ID, target: "a1" },
			{ id: "e2", source: "a1", sourceHandle: "x1", target: "sr1" },
			// sr1 is a leaf — no outgoing edge (the contact parks here).
		],
	};
}

describe("stop_responding nodes", () => {
	it("compiles a stop_responding node into kind stop_responding with no exits", () => {
		const { flow } = compileCanvas(makeStopRespondingDoc(), []);
		const sr1 = flow.nodes.find((n) => n.id === "sr1");
		expect(sr1?.kind).toBe("stop_responding");
		expect(sr1?.name).toBe("Park the contact");
		// A leaf/terminal node with no forward exits and no config.
		expect(sr1?.exits).toEqual([]);
		expect(sr1?.toolIds).toEqual([]);
		// The engine requires instructions min 1 even though it never becomes an agent.
		expect((sr1?.instructions.length ?? 0) > 0).toBe(true);
	});

	it("validates a well-formed stop_responding doc", () => {
		expect(validateFlowDoc(withGreeter(makeStopRespondingDoc()))).toEqual([]);
	});

	it("flags a stop_responding node with no name", () => {
		const doc = makeStopRespondingDoc();
		const sr1 = doc.nodes.find((n) => n.id === "sr1");
		if (sr1?.type === "stop_responding" && sr1.data) {
			sr1.data.title = "";
		}
		const errors = validateFlowDoc(withGreeter(doc));
		expect(errors.some((e) => e.includes("needs a name"))).toBe(true);
	});

	it("round-trips stop_responding nodes flow → canvas → flow", () => {
		const original = compileCanvas(makeStopRespondingDoc(), []).flow;
		const rebuilt = canvasFromFlow(original);
		const recompiled = compileCanvas(rebuilt, []).flow;
		const sr1 = recompiled.nodes.find((n) => n.id === "sr1");
		expect(sr1?.kind).toBe("stop_responding");
		expect(sr1?.exits).toEqual([]);
	});
});

/** Start → a1 agent → t1 transfer (Next → a2 agent). */
function makeTransferDoc(data: Partial<TransferNodeData> = {}): CanvasDoc {
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
					exits: [{ id: "x1", name: "transfer", description: "Caller wants the booking team" }],
					toolIds: [],
				},
			},
			{
				id: "t1",
				type: "transfer",
				position: { x: 400, y: 0 },
				data: {
					title: "Transfer",
					say: "One moment please — let me transfer you.",
					mode: "simulated",
					holdSeconds: 4,
					...data,
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
			{ id: "e2", source: "a1", sourceHandle: "x1", target: "t1" },
			{ id: "e3", source: "t1", sourceHandle: TRANSFER_NEXT_HANDLE_ID, target: "a2" },
		],
	};
}

describe("transfer nodes", () => {
	it("compiles a simulated transfer with holdSeconds and no target/waitSeconds", () => {
		const { flow } = compileCanvas(makeTransferDoc(), []);
		const t1 = flow.nodes.find((n) => n.id === "t1");
		expect(t1?.kind).toBe("transfer");
		expect(t1?.transfer).toEqual({
			mode: "simulated",
			say: "One moment please — let me transfer you.",
			holdSeconds: 4,
		});
	});

	it("auto-marks a transfer node voice-only without any author-set channels", () => {
		// The author sets NOTHING channel-related on makeTransferDoc's transfer.
		const { flow } = compileCanvas(makeTransferDoc(), []);
		expect(flow.nodes.find((n) => n.id === "t1")?.channels).toEqual(["voice"]);
	});

	it("forces voice-only even if a transfer somehow carries a text channels mark", () => {
		// Defensive: a transfer is voice-only BY NATURE, regardless of stored data.
		const { flow } = compileCanvas(
			makeTransferDoc({ channels: ["text"] } as Partial<TransferNodeData>),
			[],
		);
		expect(flow.nodes.find((n) => n.id === "t1")?.channels).toEqual(["voice"]);
	});

	it("text-prune drops the auto voice-only transfer and splices its predecessor to the Next target", () => {
		const flow = compileCanvas(makeTransferDoc(), []).flow;
		const text = pruneFlowForChannel(flow, "text");
		// t1 is gone on text; a1 → a2 splices straight through the transfer.
		expect(text.nodes.some((n) => n.id === "t1")).toBe(false);
		expect(text.nodes.find((n) => n.id === "a1")?.exits[0]?.target).toBe("a2");
		// Voice keeps the transfer intact.
		const voice = pruneFlowForChannel(flow, "voice");
		expect(voice.nodes.some((n) => n.id === "t1")).toBe(true);
		expect(voice.nodes.find((n) => n.id === "a1")?.exits[0]?.target).toBe("t1");
	});

	it("compiles a warm transfer with mode, target, and waitSeconds", () => {
		const { flow } = compileCanvas(
			makeTransferDoc({ mode: "warm", target: "+1 (555) 123-4567", waitSeconds: 45 }),
			[],
		);
		const t1 = flow.nodes.find((n) => n.id === "t1");
		expect(t1?.transfer).toEqual({
			mode: "warm",
			say: "One moment please — let me transfer you.",
			target: "tel:+15551234567",
			waitSeconds: 45,
		});
	});

	it("compiles a cold transfer with mode and target, passing a sip: URI through untouched", () => {
		const { flow } = compileCanvas(
			makeTransferDoc({ mode: "cold", target: "sip:sales@yourpbx.com" }),
			[],
		);
		const t1 = flow.nodes.find((n) => n.id === "t1");
		expect(t1?.transfer).toEqual({
			mode: "cold",
			say: "One moment please — let me transfer you.",
			target: "sip:sales@yourpbx.com",
			waitSeconds: 30,
		});
	});

	it("compiles a legacy no-mode transfer node as simulated (existing behavior)", () => {
		const doc = makeTransferDoc();
		const t1 = doc.nodes.find((n) => n.id === "t1");
		if (t1?.type === "transfer" && t1.data) {
			// Simulate an old saved node that predates the mode field.
			t1.data.mode = undefined as unknown as TransferNodeData["mode"];
		}
		const { flow } = compileCanvas(doc, []);
		const compiled = flow.nodes.find((n) => n.id === "t1");
		expect(compiled?.transfer).toEqual({
			mode: "simulated",
			say: "One moment please — let me transfer you.",
			holdSeconds: 4,
		});
	});

	it("validates a well-formed simulated transfer doc", () => {
		expect(validateFlowDoc(withGreeter(makeTransferDoc()))).toEqual([]);
	});

	it("flags a warm transfer with no target", () => {
		const doc = withGreeter(makeTransferDoc({ mode: "warm" }));
		const errors = validateFlowDoc(doc);
		expect(errors.some((e) => e.includes("needs a target phone number or SIP URI"))).toBe(true);
	});

	it("flags a cold transfer with no target", () => {
		const doc = withGreeter(makeTransferDoc({ mode: "cold" }));
		const errors = validateFlowDoc(doc);
		expect(errors.some((e) => e.includes("needs a target phone number or SIP URI"))).toBe(true);
	});

	it("round-trips a warm transfer flow → canvas → flow, preserving mode and target", () => {
		const original = compileCanvas(
			makeTransferDoc({ mode: "warm", target: "+15551234567", waitSeconds: 60 }),
			[],
		).flow;
		const rebuilt = canvasFromFlow(original);

		const t1 = rebuilt.nodes.find((n) => n.id === "t1");
		expect(t1?.type).toBe("transfer");
		if (t1?.type === "transfer") {
			expect(t1.data?.mode).toBe("warm");
			expect(t1.data?.target).toBe("tel:+15551234567");
			expect(t1.data?.waitSeconds).toBe(60);
		}

		expect(validateFlowDoc(rebuilt)).toEqual([]);
		const recompiled = compileCanvas(rebuilt, []).flow;
		expect(recompiled.nodes.map((n) => [n.id, n.kind, n.transfer, n.exits])).toEqual(
			original.nodes.map((n) => [n.id, n.kind, n.transfer, n.exits]),
		);
	});

	it("emits a 'Not Connected' exit when a warm transfer's failure handle is wired", () => {
		const doc = makeTransferDoc({ mode: "warm", target: "+15551234567" });
		// Add a fallback node the "Not connected" handle routes to.
		doc.nodes.push({
			id: "fallback",
			type: "agent",
			position: { x: 700, y: 300 },
			data: {
				title: "Fallback",
				sections: [{ id: "s3", body: sectionBody([{ type: "text", text: "Take a message." }]) }],
				entryMessage: "",
				exits: [],
				toolIds: [],
			},
		});
		doc.edges.push({
			id: "e4",
			source: "t1",
			sourceHandle: TRANSFER_FAILED_HANDLE_ID,
			target: "fallback",
		});

		const { flow } = compileCanvas(doc, []);
		const t1 = flow.nodes.find((n) => n.id === "t1");
		expect(t1?.exits).toEqual([
			{ name: "Next", description: "Continue after the transfer", target: "a2" },
			{
				name: TRANSFER_FAILED_EXIT_NAME,
				description: "The person didn't answer or declined the transfer",
				target: "fallback",
			},
		]);
		// The join key must match the engine's string exactly.
		expect(TRANSFER_FAILED_EXIT_NAME).toBe("Not Connected");
	});

	it("omits the 'Not Connected' exit when the failure handle is unwired (call ends)", () => {
		const { flow } = compileCanvas(makeTransferDoc({ mode: "warm", target: "+15551234567" }), []);
		const t1 = flow.nodes.find((n) => n.id === "t1");
		expect(t1?.exits).toEqual([
			{ name: "Next", description: "Continue after the transfer", target: "a2" },
		]);
	});

	it("never emits a 'Not Connected' exit for simulated or cold transfers", () => {
		for (const mode of ["simulated", "cold"] as const) {
			const doc = makeTransferDoc(mode === "cold" ? { mode, target: "+15551234567" } : { mode });
			// Even if a stray failure edge exists, non-warm modes ignore it.
			doc.edges.push({
				id: "e4",
				source: "t1",
				sourceHandle: TRANSFER_FAILED_HANDLE_ID,
				target: "a2",
			});
			const { flow } = compileCanvas(doc, []);
			const t1 = flow.nodes.find((n) => n.id === "t1");
			expect(t1?.exits.some((e) => e.name === TRANSFER_FAILED_EXIT_NAME)).toBe(false);
		}
	});

	it("round-trips a warm transfer's 'Not Connected' branch flow → canvas → flow", () => {
		const doc = makeTransferDoc({ mode: "warm", target: "+15551234567" });
		doc.nodes.push({
			id: "fallback",
			type: "agent",
			position: { x: 700, y: 300 },
			data: {
				title: "Fallback",
				sections: [{ id: "s3", body: sectionBody([{ type: "text", text: "Take a message." }]) }],
				entryMessage: "",
				exits: [],
				toolIds: [],
			},
		});
		doc.edges.push({
			id: "e4",
			source: "t1",
			sourceHandle: TRANSFER_FAILED_HANDLE_ID,
			target: "fallback",
		});

		const original = compileCanvas(doc, []).flow;
		const rebuilt = canvasFromFlow(original);

		// The failure edge is restored on the "Not connected" handle.
		const failureEdge = rebuilt.edges.find(
			(e) => e.source === "t1" && e.sourceHandle === TRANSFER_FAILED_HANDLE_ID,
		);
		expect(failureEdge?.target).toBe("fallback");
		const nextEdge = rebuilt.edges.find(
			(e) => e.source === "t1" && e.sourceHandle === TRANSFER_NEXT_HANDLE_ID,
		);
		expect(nextEdge?.target).toBe("a2");

		expect(validateFlowDoc(rebuilt)).toEqual([]);
		const recompiled = compileCanvas(rebuilt, []).flow;
		expect(recompiled.nodes.map((n) => [n.id, n.kind, n.exits])).toEqual(
			original.nodes.map((n) => [n.id, n.kind, n.exits]),
		);
	});
});

// --- W3: channel-aware compile + text-prune -------------------------------

function agentNode(
	id: string,
	title: string,
	exits: { id: string; name: string; description: string }[],
	channels?: AgentNodeData["channels"],
): CanvasDoc["nodes"][number] {
	return {
		id,
		type: "agent",
		position: { x: 0, y: 0 },
		data: {
			title,
			sections: [{ id: `${id}_s`, body: sectionBody([{ type: "text", text: `${title}.` }]) }],
			entryMessage: "",
			exits,
			toolIds: [],
			...(channels ? { channels } : {}),
		},
	};
}

function statementNode(
	id: string,
	title: string,
	channels?: StatementNodeData["channels"],
): CanvasDoc["nodes"][number] {
	return {
		id,
		type: "statement",
		position: { x: 0, y: 0 },
		data: { title, say: `${title} spoken.`, ...(channels ? { channels } : {}) },
	};
}

describe("channel marks — compile emit", () => {
	it("emits channels only on restricted nodes; unmarked nodes stay bare (byte-identical)", () => {
		const doc: CanvasDoc = {
			version: 1,
			nodes: [
				{ id: START_NODE_ID, type: "start", position: { x: 0, y: 0 } },
				agentNode("a1", "Both", [{ id: "x1", name: "next", description: "d" }]),
				statementNode("st1", "Voice notice", ["voice"]),
			],
			edges: [
				{ id: "e1", source: START_NODE_ID, sourceHandle: START_HANDLE_ID, target: "a1" },
				{ id: "e2", source: "a1", sourceHandle: "x1", target: "st1" },
			],
		};
		const { flow } = compileCanvas(doc, []);
		expect(flow.nodes.find((n) => n.id === "a1")?.channels).toBeUndefined();
		expect(flow.nodes.find((n) => n.id === "st1")?.channels).toEqual(["voice"]);
	});

	it("forces channels ['voice'] on transfer nodes regardless of stored data", () => {
		const { flow } = compileCanvas(makeTransferDoc(), []);
		expect(flow.nodes.find((n) => n.id === "t1")?.channels).toEqual(["voice"]);
	});

	it("normalizes a both-marked ['voice','text'] node to no channels (runs everywhere)", () => {
		const doc: CanvasDoc = {
			version: 1,
			nodes: [
				{ id: START_NODE_ID, type: "start", position: { x: 0, y: 0 } },
				agentNode("a1", "Both listed", [], ["voice", "text"]),
			],
			edges: [{ id: "e1", source: START_NODE_ID, sourceHandle: START_HANDLE_ID, target: "a1" }],
		};
		expect(compileCanvas(doc, []).flow.nodes.find((n) => n.id === "a1")?.channels).toBeUndefined();
	});

	it("round-trips channel marks flow → canvas → flow (transfer stays implicit voice)", () => {
		const doc: CanvasDoc = {
			version: 1,
			nodes: [
				{ id: START_NODE_ID, type: "start", position: { x: 0, y: 0 } },
				agentNode("a1", "Text intake", [{ id: "x1", name: "next", description: "d" }], ["text"]),
				statementNode("st1", "Voice notice", ["voice"]),
				{
					id: "h1",
					type: "handoff",
					position: { x: 0, y: 0 },
					data: { title: "To booking", handoffAgentId: "ag_b", channels: ["text"] },
				},
			],
			edges: [
				{ id: "e1", source: START_NODE_ID, sourceHandle: START_HANDLE_ID, target: "a1" },
				{ id: "e2", source: "a1", sourceHandle: "x1", target: "st1" },
				{ id: "e3", source: "st1", sourceHandle: STATEMENT_NEXT_HANDLE_ID, target: "h1" },
			],
		};
		const flow = compileCanvas(doc, []).flow;
		const rebuilt = canvasFromFlow(flow);
		const dataOf = (id: string) => rebuilt.nodes.find((n) => n.id === id)?.data;
		expect((dataOf("a1") as AgentNodeData).channels).toEqual(["text"]);
		expect((dataOf("st1") as StatementNodeData).channels).toEqual(["voice"]);
		expect((dataOf("h1") as HandoffNodeData).channels).toEqual(["text"]);
		// Recompiling the rebuilt canvas reproduces the same channel marks.
		const recompiled = compileCanvas(rebuilt, []).flow;
		expect(recompiled.nodes.map((n) => [n.id, n.channels])).toEqual(
			flow.nodes.map((n) => [n.id, n.channels]),
		);
	});
});

describe("pruneFlowForChannel", () => {
	it("returns the same flow untouched when no node is channel-restricted", () => {
		const flow = compileCanvas(makeStatementDoc(), []).flow;
		expect(pruneFlowForChannel(flow, "text")).toBe(flow);
	});

	it("splices a single-exit voice-only node out, re-pointing its predecessor to the Next target", () => {
		const doc: CanvasDoc = {
			version: 1,
			nodes: [
				{ id: START_NODE_ID, type: "start", position: { x: 0, y: 0 } },
				agentNode("a1", "Intake", [{ id: "x1", name: "go", description: "d" }]),
				statementNode("st1", "Voice hold", ["voice"]),
				agentNode("a2", "Book", []),
			],
			edges: [
				{ id: "e1", source: START_NODE_ID, sourceHandle: START_HANDLE_ID, target: "a1" },
				{ id: "e2", source: "a1", sourceHandle: "x1", target: "st1" },
				{ id: "e3", source: "st1", sourceHandle: STATEMENT_NEXT_HANDLE_ID, target: "a2" },
			],
		};
		const flow = compileCanvas(doc, []).flow;
		const pruned = pruneFlowForChannel(flow, "text");
		expect(pruned.nodes.map((n) => n.id).sort()).toEqual(["a1", "a2"]);
		// a1's exit now skips the removed voice-only statement straight to a2.
		expect(pruned.nodes.find((n) => n.id === "a1")?.exits[0]?.target).toBe("a2");
		expect(pruned.entry).toBe("a1");
		// The original flow is not mutated.
		expect(flow.nodes.find((n) => n.id === "a1")?.exits[0]?.target).toBe("st1");
	});

	it("splices a chain of voice-only nodes transitively to the first survivor", () => {
		const doc: CanvasDoc = {
			version: 1,
			nodes: [
				{ id: START_NODE_ID, type: "start", position: { x: 0, y: 0 } },
				agentNode("a1", "Intake", [{ id: "x1", name: "go", description: "d" }]),
				statementNode("v1", "Voice one", ["voice"]),
				statementNode("v2", "Voice two", ["voice"]),
				agentNode("a2", "Book", []),
			],
			edges: [
				{ id: "e1", source: START_NODE_ID, sourceHandle: START_HANDLE_ID, target: "a1" },
				{ id: "e2", source: "a1", sourceHandle: "x1", target: "v1" },
				{ id: "e3", source: "v1", sourceHandle: STATEMENT_NEXT_HANDLE_ID, target: "v2" },
				{ id: "e4", source: "v2", sourceHandle: STATEMENT_NEXT_HANDLE_ID, target: "a2" },
			],
		};
		const pruned = pruneFlowForChannel(compileCanvas(doc, []).flow, "text");
		expect(pruned.nodes.map((n) => n.id).sort()).toEqual(["a1", "a2"]);
		expect(pruned.nodes.find((n) => n.id === "a1")?.exits[0]?.target).toBe("a2");
	});

	it("falls back to the first exit target when a pruned multi-exit node is spliced", () => {
		const doc: CanvasDoc = {
			version: 1,
			nodes: [
				{ id: START_NODE_ID, type: "start", position: { x: 0, y: 0 } },
				agentNode("a1", "Intake", [{ id: "x1", name: "go", description: "d" }]),
				agentNode(
					"av",
					"Voice router",
					[
						{ id: "e1x", name: "first", description: "d" },
						{ id: "e2x", name: "second", description: "d" },
					],
					["voice"],
				),
				agentNode("a2", "First target", []),
				agentNode("a3", "Second target", []),
			],
			edges: [
				{ id: "e1", source: START_NODE_ID, sourceHandle: START_HANDLE_ID, target: "a1" },
				{ id: "e2", source: "a1", sourceHandle: "x1", target: "av" },
				{ id: "e3", source: "av", sourceHandle: "e1x", target: "a2" },
				{ id: "e4", source: "av", sourceHandle: "e2x", target: "a3" },
			],
		};
		const pruned = pruneFlowForChannel(compileCanvas(doc, []).flow, "text");
		expect(pruned.nodes.some((n) => n.id === "av")).toBe(false);
		// Predecessor splices to av's FIRST exit target.
		expect(pruned.nodes.find((n) => n.id === "a1")?.exits[0]?.target).toBe("a2");
	});

	it("leaves an exit ending the call when a pruned node has no surviving target", () => {
		const doc: CanvasDoc = {
			version: 1,
			nodes: [
				{ id: START_NODE_ID, type: "start", position: { x: 0, y: 0 } },
				agentNode("a1", "Intake", [{ id: "x1", name: "go", description: "d" }]),
				statementNode("v1", "Voice dead-end", ["voice"]),
			],
			edges: [
				{ id: "e1", source: START_NODE_ID, sourceHandle: START_HANDLE_ID, target: "a1" },
				{ id: "e2", source: "a1", sourceHandle: "x1", target: "v1" },
				// v1's Next is unwired → after prune, a1's exit ends the call.
			],
		};
		const pruned = pruneFlowForChannel(compileCanvas(doc, []).flow, "text");
		expect(pruned.nodes.map((n) => n.id)).toEqual(["a1"]);
		expect(pruned.nodes.find((n) => n.id === "a1")?.exits[0]?.target).toBeUndefined();
	});

	it("retargets a scenario through a pruned node and drops it when it dead-ends", () => {
		const doc: CanvasDoc = {
			version: 1,
			nodes: [
				{ id: START_NODE_ID, type: "start", position: { x: 0, y: 0 } },
				agentNode("a1", "Intake", []),
				statementNode("v1", "Voice hop", ["voice"]),
				agentNode("a2", "Survivor", []),
				statementNode("vdead", "Voice dead", ["voice"]),
				{
					id: "sc1",
					type: "scenario",
					position: { x: 0, y: 0 },
					data: { title: "Live", description: "jump to hop" },
				},
				{
					id: "sc2",
					type: "scenario",
					position: { x: 0, y: 0 },
					data: { title: "Dead", description: "jump to dead" },
				},
			],
			edges: [
				{ id: "e1", source: START_NODE_ID, sourceHandle: START_HANDLE_ID, target: "a1" },
				{ id: "e2", source: "v1", sourceHandle: STATEMENT_NEXT_HANDLE_ID, target: "a2" },
				{ id: "s1", source: "sc1", sourceHandle: SCENARIO_JUMP_HANDLE_ID, target: "v1" },
				{ id: "s2", source: "sc2", sourceHandle: SCENARIO_JUMP_HANDLE_ID, target: "vdead" },
			],
		};
		const pruned = pruneFlowForChannel(compileCanvas(doc, []).flow, "text");
		// sc1 retargets through the pruned hop to the survivor; sc2 dead-ends → dropped.
		expect(pruned.scenarios).toEqual([{ name: "Live", description: "jump to hop", target: "a2" }]);
	});

	it("keeps voice-only nodes when pruning for voice", () => {
		const doc: CanvasDoc = {
			version: 1,
			nodes: [
				{ id: START_NODE_ID, type: "start", position: { x: 0, y: 0 } },
				agentNode("a1", "Intake", [{ id: "x1", name: "go", description: "d" }]),
				statementNode("st1", "Voice hold", ["voice"]),
			],
			edges: [
				{ id: "e1", source: START_NODE_ID, sourceHandle: START_HANDLE_ID, target: "a1" },
				{ id: "e2", source: "a1", sourceHandle: "x1", target: "st1" },
			],
		};
		const pruned = pruneFlowForChannel(compileCanvas(doc, []).flow, "voice");
		expect(pruned.nodes.some((n) => n.id === "st1")).toBe(true);
	});
});

describe("channelPruneWarnings", () => {
	it("returns no warnings when nothing is channel-restricted", () => {
		const flow = compileCanvas(makeStatementDoc(), []).flow;
		expect(channelPruneWarnings(flow, "text")).toEqual([]);
	});

	it("warns when the text-pruned graph has no starting node (voice-only entry chain)", () => {
		const doc: CanvasDoc = {
			version: 1,
			nodes: [
				{ id: START_NODE_ID, type: "start", position: { x: 0, y: 0 } },
				agentNode("a1", "Voice intake", [{ id: "x1", name: "go", description: "d" }], ["voice"]),
				agentNode("a2", "Voice book", [], ["voice"]),
			],
			edges: [
				{ id: "e1", source: START_NODE_ID, sourceHandle: START_HANDLE_ID, target: "a1" },
				{ id: "e2", source: "a1", sourceHandle: "x1", target: "a2" },
			],
		};
		const flow = compileCanvas(doc, []).flow;
		const warnings = channelPruneWarnings(flow, "text");
		expect(warnings.length).toBeGreaterThan(0);
		expect(warnings[0]).toContain("no starting node");
		// The pruned flow is indeed orphaned.
		expect(pruneFlowForChannel(flow, "text").entry).toBe("");
	});

	it("does not warn when a voice-only entry splices to a surviving text node", () => {
		const doc: CanvasDoc = {
			version: 1,
			nodes: [
				{ id: START_NODE_ID, type: "start", position: { x: 0, y: 0 } },
				agentNode("a1", "Voice intro", [{ id: "x1", name: "go", description: "d" }], ["voice"]),
				agentNode("a2", "Both book", []),
			],
			edges: [
				{ id: "e1", source: START_NODE_ID, sourceHandle: START_HANDLE_ID, target: "a1" },
				{ id: "e2", source: "a1", sourceHandle: "x1", target: "a2" },
			],
		};
		const flow = compileCanvas(doc, []).flow;
		expect(channelPruneWarnings(flow, "text")).toEqual([]);
		expect(pruneFlowForChannel(flow, "text").entry).toBe("a2");
	});
});

function warmTransferNode(id: string, title = "To a human"): CanvasDoc["nodes"][number] {
	return {
		id,
		type: "transfer",
		position: { x: 0, y: 0 },
		data: {
			title,
			say: "",
			mode: "warm",
			holdSeconds: 0,
			target: "+15551234567",
		} satisfies TransferNodeData,
	};
}

describe("flowSoundnessWarnings — warm transfer reachability", () => {
	it("warns when a warm transfer is reachable only via an automatic (non-agent) transition", () => {
		const doc: CanvasDoc = {
			version: 1,
			nodes: [
				{ id: START_NODE_ID, type: "start", position: { x: 0, y: 0 } },
				statementNode("s1", "Hold on"),
				warmTransferNode("t1", "Escalate"),
			],
			edges: [{ id: "e1", source: "s1", sourceHandle: STATEMENT_NEXT_HANDLE_ID, target: "t1" }],
		};
		const warnings = flowSoundnessWarnings(doc);
		expect(warnings.length).toBe(1);
		expect(warnings[0]).toContain("Escalate");
		expect(warnings[0]).toContain("blind (cold) transfer");
	});

	it("does not warn when a warm transfer is reachable from an agent exit", () => {
		const doc: CanvasDoc = {
			version: 1,
			nodes: [
				{ id: START_NODE_ID, type: "start", position: { x: 0, y: 0 } },
				agentNode("a1", "Qualify", [{ id: "x1", name: "human", description: "asks for a person" }]),
				warmTransferNode("t1"),
			],
			edges: [{ id: "e1", source: "a1", sourceHandle: "x1", target: "t1" }],
		};
		expect(flowSoundnessWarnings(doc)).toEqual([]);
	});

	it("does not warn when a warm transfer is reachable from a scenario jump", () => {
		const doc: CanvasDoc = {
			version: 1,
			nodes: [
				{ id: START_NODE_ID, type: "start", position: { x: 0, y: 0 } },
				{
					id: "sc1",
					type: "scenario",
					position: { x: 0, y: 0 },
					data: { title: "Human requested", description: "caller asks for a human" },
				},
				warmTransferNode("t1"),
			],
			edges: [{ id: "e1", source: "sc1", sourceHandle: SCENARIO_JUMP_HANDLE_ID, target: "t1" }],
		};
		expect(flowSoundnessWarnings(doc)).toEqual([]);
	});

	it("does not warn when at least one inbound path is agent-triggered (mixed reachability)", () => {
		const doc: CanvasDoc = {
			version: 1,
			nodes: [
				{ id: START_NODE_ID, type: "start", position: { x: 0, y: 0 } },
				statementNode("s1", "Hold on"),
				agentNode("a1", "Qualify", [{ id: "x1", name: "human", description: "asks for a person" }]),
				warmTransferNode("t1"),
			],
			edges: [
				{ id: "e1", source: "s1", sourceHandle: STATEMENT_NEXT_HANDLE_ID, target: "t1" },
				{ id: "e2", source: "a1", sourceHandle: "x1", target: "t1" },
			],
		};
		expect(flowSoundnessWarnings(doc)).toEqual([]);
	});

	it("does not warn for a cold transfer reached automatically (only warm degrades)", () => {
		const doc: CanvasDoc = {
			version: 1,
			nodes: [
				{ id: START_NODE_ID, type: "start", position: { x: 0, y: 0 } },
				statementNode("s1", "Hold on"),
				{
					id: "t1",
					type: "transfer",
					position: { x: 0, y: 0 },
					data: {
						title: "Cold forward",
						say: "",
						mode: "cold",
						holdSeconds: 0,
						target: "+15551234567",
					} satisfies TransferNodeData,
				},
			],
			edges: [{ id: "e1", source: "s1", sourceHandle: STATEMENT_NEXT_HANDLE_ID, target: "t1" }],
		};
		expect(flowSoundnessWarnings(doc)).toEqual([]);
	});

	it("does not warn for an unreachable warm transfer (no inbound edges)", () => {
		const doc: CanvasDoc = {
			version: 1,
			nodes: [
				{ id: START_NODE_ID, type: "start", position: { x: 0, y: 0 } },
				warmTransferNode("t1"),
			],
			edges: [],
		};
		expect(flowSoundnessWarnings(doc)).toEqual([]);
	});
});

describe("normalizeChannels", () => {
	it("collapses both/empty/undefined to undefined and keeps single channels", () => {
		expect(normalizeChannels(undefined)).toBeUndefined();
		expect(normalizeChannels([])).toBeUndefined();
		expect(normalizeChannels(["voice", "text"])).toBeUndefined();
		expect(normalizeChannels(["voice"])).toEqual(["voice"]);
		expect(normalizeChannels(["text"])).toEqual(["text"]);
	});
});
