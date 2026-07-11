import { z } from "zod";

/**
 * The canvas document — the flow builder's full editor state. Persisted
 * verbatim at config.canvas (the engine ignores it) so reopening the builder
 * restores positions, rich-text sections and the viewport exactly.
 */

export const START_NODE_ID = "__start__";
export const START_HANDLE_ID = "start";

/**
 * The single "Start" source handle on the Greeter fixture — it wires the
 * greeting into the flow's real entry node. The Greeter is a canvas-level
 * fixture (like Start), not an engine flow node: its text compiles into
 * config.greeting and its outgoing edge target becomes the flow entry.
 */
export const GREETER_NEXT_HANDLE_ID = "next";

/** Fixed source-handle ids on a True/False branch node. */
export const TRUE_HANDLE_ID = "true";
export const FALSE_HANDLE_ID = "false";
/** Source-handle id for a switch node's Otherwise path (cases use their own ids). */
export const OTHERWISE_HANDLE_ID = "__otherwise__";
/** The single "Next" source handle on a statement node. */
export const STATEMENT_NEXT_HANDLE_ID = "next";
/** The single "Next" source handle on an objective node (engine auto-advances once met). */
export const OBJECTIVE_NEXT_HANDLE_ID = "next";
/** The single "Connects to" source handle on a transfer node. */
export const TRANSFER_NEXT_HANDLE_ID = "next";
/** The single "Next" source handle on the deterministic action nodes. */
export const SET_FIELD_NEXT_HANDLE_ID = "next";
export const MODIFY_TAGS_NEXT_HANDLE_ID = "next";
/** The two source handles on a Booking node: appointment booked vs no slot worked. */
export const BOOKING_BOOKED_HANDLE_ID = "booked";
export const BOOKING_FAILED_HANDLE_ID = "failed";
/** The single "Jump to" source handle on a scenario node. */
export const SCENARIO_JUMP_HANDLE_ID = "jump";

/** Wrap-up modes for a conversation node when its goal is exhausted. */
export const CONVERSATION_WRAP_UP_END_CALL = "end_call";
export const CONVERSATION_WRAP_UP_EXIT = "exit";

/** dataTransfer type used when dragging an action from the palette onto the canvas. */
export const FLOW_NODE_DRAG_TYPE = "application/x-voiceagent-flow-node";

/** Editable canvas node kinds (everything but the fixed Start node). */
export type FlowNodeKind =
	| "greeter"
	| "agent"
	| "objective"
	| "conversation"
	| "truefalse"
	| "switch"
	| "statement"
	| "scenario"
	| "transfer"
	| "set_field"
	| "modify_tags"
	| "booking"
	| "handoff";

/** Palette entries: node kinds plus pre-filled presets (they map onto a kind). */
export const FLOW_PALETTE_KINDS = [
	"agent",
	"objective",
	"conversation",
	"truefalse",
	"switch",
	"statement",
	"scenario",
	"scenario_aggression",
	"booking",
	"transfer",
	"set_field",
	"modify_tags",
	"handoff",
] as const;

/**
 * Well-known CRM output variables for objectives. "Full Address" and "Full Name"
 * are composites — one objective fills every underlying standard field
 * (address1/city/state/postalCode, or firstName/lastName). Standard fields write
 * to the contact record; anything else is a custom field (find-or-create by name).
 * The `field` value is what update_contact receives as field_name.
 */
export type FlowPaletteKind = (typeof FLOW_PALETTE_KINDS)[number];

export interface FlowSectionDoc {
	id: string;
	title?: string;
	/** TipTap JSON document (mention chips + text). */
	body: unknown;
}

/**
 * Tag-driven exit gating (Phase 5b — deterministic, zero LLM cost). An exit
 * carrying tagRules is only offered when the call's current tag set satisfies
 * them: every `mustHave` tag present, no `cantHave` tag present.
 */
export interface ExitTagRules {
	mustHave?: string[];
	cantHave?: string[];
}

export interface FlowExitDoc {
	id: string;
	name: string;
	description: string;
	/** Advanced: gate this exit on the caller's CRM tags (Phase 5b). */
	tagRules?: ExitTagRules;
}

/**
 * The Greeter fixture's data. `greeting` is spoken as soon as the call connects
 * (after the AI disclosure). It is NOT an engine flow node — the compiler folds
 * this text into config.greeting and treats the greeter's outgoing edge target
 * as the flow entry.
 */
export interface GreeterNodeData {
	title: string;
	/** Spoken first, right after the AI disclosure. Empty = the caller speaks first. */
	greeting: string;
	[key: string]: unknown;
}

export interface AgentNodeData {
	title: string;
	sections: FlowSectionDoc[];
	/** Maps to flow node entryInstructions (ignored on the entry node). */
	entryMessage: string;
	exits: FlowExitDoc[];
	toolIds: string[];
	/** Optional per-node LLM model override. */
	model?: string;
	/** Optional per-node GHL booking calendar override (by name — the executor's override is name-based). */
	calendarName?: string;
	/** Optional title for appointments booked from this node. */
	appointmentTitle?: string;
	/** Optional tag applied via add_tag when booking fails on this node. */
	failedBookingTag?: string;
	[key: string]: unknown;
}

export interface ObjectiveDoc {
	id: string;
	/** Short label shown in the builder (CloseBot "Title"). */
	title: string;
	/** What to learn from the caller — the judge evaluates against this (CloseBot "Short Description"). */
	description: string;
	/** CRM field to write when met; empty = gather only, don't save. */
	field: string;
	/** Picklist values (optional) — the judge coerces the answer to one. */
	options?: string[];
	/** Give up gating after this many caller turns (CloseBot "Max Attempts"). */
	maxAttempts?: number;
	/** Judge strictness 0-100 (CloseBot "Sensitivity", default 90). */
	sensitivity?: number;
	/**
	 * Aggregate objective (CloseBot's get_full_address). Ids of OTHER objectives
	 * in THIS node whose answers this objective composes. When set, the objective
	 * has no own judge question: it completes once every part is met and its answer
	 * is the parts' answers joined in order. Stored as objective doc ids (stable);
	 * compiled to the parts' engine keys.
	 */
	aggregateOf?: string[];
	/**
	 * Platform-managed objective (e.g. the "Full address" field's parts +
	 * aggregate, applied when the user picks it in the output-field dropdown):
	 * read-only in the editor, still fully compiled. Canvas-only — never sent
	 * to the engine.
	 */
	managed?: boolean;
	/**
	 * A single "Full address" objective. Rendered as ONE normal objective row in
	 * the builder (its `field` is the composite contact.address). At COMPILE time
	 * it expands into the managed street/city/state/zip parts + aggregate (see
	 * `expandFullAddress`/`newFullAddressObjectiveData`); on load the reverse
	 * `collapseFullAddress` folds a saved 4-part group back into this one row.
	 * Canvas-only — never sent to the engine.
	 */
	fullAddress?: boolean;
}

export interface ObjectiveNodeData {
	title: string;
	objectives: ObjectiveDoc[];
	/** Spoken direction generated on entry (ignored on the entry node). */
	entryMessage: string;
	[key: string]: unknown;
}

/**
 * A Conversation node (CloseBot's "Keeping the Conversation Going"): objective-less,
 * tool-less, open-ended. The model self-drives discovery from the conversation
 * reason + optional talking-point hints, then wraps up explicitly (end the call or
 * take a named exit) instead of relying on emergent self-closure.
 */
export interface ConversationNodeData {
	title: string;
	/** What this conversation is for — drives the open-ended probing. */
	reason: string;
	/** Optional talking-point hints the model may weave in. */
	hints: string[];
	/** Editable exits (same shape as an agent node's). */
	exits: FlowExitDoc[];
	/** Explicit closure: end the call, or take one of this node's exits. */
	wrapUpMode: "end_call" | "exit";
	/** When wrapUpMode === "exit", the id of the exit to take on wrap-up. */
	wrapUpExitId?: string;
	/** Advanced: cap the time spent in this node before wrapping up. */
	maxDurationSeconds?: number;
	/** Per-flow: this node catches every unconnected exit (CloseBot parity). Max one per flow. */
	isDefault?: boolean;
	[key: string]: unknown;
}

export interface TrueFalseNodeData {
	title: string;
	/** Statement the AI evaluates true/false against the conversation. */
	condition: string;
	[key: string]: unknown;
}

export interface SwitchCaseDoc {
	id: string;
	name: string;
	description: string;
}

export interface SwitchNodeData {
	title: string;
	/** Question the AI evaluates against the conversation to pick a case. */
	condition: string;
	cases: SwitchCaseDoc[];
	/** Adds a fallback "Otherwise" path when no case matches. */
	includeOtherwise: boolean;
	[key: string]: unknown;
}

export interface StatementNodeData {
	title: string;
	/** Spoken exactly as written, then the flow continues immediately. */
	say: string;
	[key: string]: unknown;
}

export interface ScenarioNodeData {
	title: string;
	/** When to jump — checked continuously from every agent node. */
	description: string;
	[key: string]: unknown;
}

export interface BookingNodeData {
	title: string;
	/** GHL calendar name; empty = the agent's configured default booking calendar. */
	calendarName: string;
	/** What to do — the booking objective ("Book a 30 minute appointment…"). */
	description: string;
	/** Advanced: extra context injected only while booking. */
	extraPrompt: string;
	/** Advanced: title for the booked appointment. */
	appointmentTitle: string;
	/** Advanced: tag applied via add_tag when booking fails. */
	failedBookingTag: string;
	/** CRM live booking tool ids (check_availability / book_appointment), baked at creation. */
	toolIds: string[];
	[key: string]: unknown;
}

export interface SetFieldNodeData {
	title: string;
	/** CRM field to write (human name or Full Address/Full Name composite). */
	field: string;
	/** Value to write ({{variables}} interpolated). */
	value: string;
	[key: string]: unknown;
}

export interface ModifyTagsNodeData {
	title: string;
	addTags: string[];
	removeTags: string[];
	[key: string]: unknown;
}

export interface TransferNodeData {
	title: string;
	/** Announcement spoken before the music, in the pre-transfer voice. */
	say: string;
	/** Hold-music duration between the two "people". */
	holdSeconds: number;
	/** TTS voice from here on (id from the voice catalog); empty keeps the current voice. */
	voiceId?: string;
	/** Provider of voiceId (needed by the engine's TTS builder). */
	voiceProvider?: string;
	[key: string]: unknown;
}

export interface HandoffNodeData {
	title: string;
	/** The target published agent this node hands the live call off to (agent id). */
	handoffAgentId?: string;
	[key: string]: unknown;
}

export type FlowNodeData =
	| GreeterNodeData
	| AgentNodeData
	| ObjectiveNodeData
	| ConversationNodeData
	| TrueFalseNodeData
	| SwitchNodeData
	| StatementNodeData
	| ScenarioNodeData
	| TransferNodeData
	| HandoffNodeData
	| SetFieldNodeData
	| ModifyTagsNodeData
	| BookingNodeData;

export interface StartCanvasNodeDoc {
	id: string;
	type: "start";
	position: { x: number; y: number };
	data?: undefined;
}

export interface GreeterCanvasNodeDoc {
	id: string;
	type: "greeter";
	position: { x: number; y: number };
	data?: GreeterNodeData;
}

export interface AgentCanvasNodeDoc {
	id: string;
	type: "agent";
	position: { x: number; y: number };
	data?: AgentNodeData;
}

export interface ObjectiveCanvasNodeDoc {
	id: string;
	type: "objective";
	position: { x: number; y: number };
	data?: ObjectiveNodeData;
}

export interface ConversationCanvasNodeDoc {
	id: string;
	type: "conversation";
	position: { x: number; y: number };
	data?: ConversationNodeData;
}

export interface TrueFalseCanvasNodeDoc {
	id: string;
	type: "truefalse";
	position: { x: number; y: number };
	data?: TrueFalseNodeData;
}

export interface SwitchCanvasNodeDoc {
	id: string;
	type: "switch";
	position: { x: number; y: number };
	data?: SwitchNodeData;
}

export interface StatementCanvasNodeDoc {
	id: string;
	type: "statement";
	position: { x: number; y: number };
	data?: StatementNodeData;
}

export interface ScenarioCanvasNodeDoc {
	id: string;
	type: "scenario";
	position: { x: number; y: number };
	data?: ScenarioNodeData;
}

export interface TransferCanvasNodeDoc {
	id: string;
	type: "transfer";
	position: { x: number; y: number };
	data?: TransferNodeData;
}

export interface HandoffCanvasNodeDoc {
	id: string;
	type: "handoff";
	position: { x: number; y: number };
	data?: HandoffNodeData;
}

export interface SetFieldCanvasNodeDoc {
	id: string;
	type: "set_field";
	position: { x: number; y: number };
	data?: SetFieldNodeData;
}

export interface ModifyTagsCanvasNodeDoc {
	id: string;
	type: "modify_tags";
	position: { x: number; y: number };
	data?: ModifyTagsNodeData;
}

export interface BookingCanvasNodeDoc {
	id: string;
	type: "booking";
	position: { x: number; y: number };
	data?: BookingNodeData;
}

export type CanvasNodeDoc =
	| StartCanvasNodeDoc
	| GreeterCanvasNodeDoc
	| AgentCanvasNodeDoc
	| ObjectiveCanvasNodeDoc
	| ConversationCanvasNodeDoc
	| TrueFalseCanvasNodeDoc
	| SwitchCanvasNodeDoc
	| StatementCanvasNodeDoc
	| ScenarioCanvasNodeDoc
	| TransferCanvasNodeDoc
	| HandoffCanvasNodeDoc
	| SetFieldCanvasNodeDoc
	| ModifyTagsCanvasNodeDoc
	| BookingCanvasNodeDoc;

export interface CanvasEdgeDoc {
	id: string;
	source: string;
	/** Exit id on agent nodes, START_HANDLE_ID on the start node, true/false or case ids on branch nodes. */
	sourceHandle?: string;
	target: string;
}

export interface CanvasDoc {
	version: 1;
	nodes: CanvasNodeDoc[];
	edges: CanvasEdgeDoc[];
	viewport?: { x: number; y: number; zoom: number };
}

/** Engine flow payload — mirrors the gateway's AgentConfig.flow schema. */
export interface EngineFlowExit {
	name: string;
	description: string;
	target?: string;
	/** Tag-driven gating (Phase 5b) — passed through to the engine. */
	tagRules?: { mustHave?: string[]; cantHave?: string[] };
}

export interface EngineFlowNode {
	id: string;
	name?: string;
	/**
	 * "router" nodes never speak — the engine evaluates router.condition and picks an exit.
	 * "statement" nodes speak statement.say and immediately continue (at most one exit).
	 * "transfer" nodes announce, play hold music, then continue with a new voice.
	 */
	kind?: "agent" | "router" | "statement" | "transfer" | "set_field" | "modify_tags" | "handoff";
	router?: { condition: string };
	statement?: { say: string };
	/** `toolId` names the engine tool that writes the field (self-describing —
	 * the engine no longer assumes an "update_contact" tool). */
	setField?: { field: string; value: string; toolId?: string };
	/** `toolId` names the engine tool that adds tags (self-describing — the
	 * engine no longer assumes an "add_tag" tool). */
	modifyTags?: { add?: string[]; remove?: string[]; toolId?: string };
	transfer?: {
		say?: string;
		holdSeconds: number;
		voice?: { provider: string; voice: string; speed?: number };
	};
	/** handoff-only: the target published agent id the live call is handed to. */
	handoffAgentId?: string;
	instructions: string;
	entryInstructions?: string;
	toolIds: string[];
	llm?: { model: string; temperature?: number; maxTokens?: number };
	exits: EngineFlowExit[];
	/** Engine-verified data goals; the engine takes the primary exit once met. */
	objectives?: EngineFlowObjective[];
	/**
	 * Conversation-node config (node kind stays "agent" on the wire). When present,
	 * the engine runs an objective-less, open-ended discovery loop driven by
	 * `reason` + `hints`, closing per `wrapUp` (end the call or take a named exit).
	 */
	conversation?: EngineFlowConversation;
}

export interface EngineFlowConversation {
	/** What this conversation is for — drives open-ended probing. */
	reason: string;
	/** Optional talking-point hints. */
	hints?: string[];
	/** Explicit closure behavior. `exit` names one of the node's exits. */
	wrapUp: { mode: "end_call" } | { mode: "exit"; exit: string };
	/** Optional cap on time spent in this node. */
	maxDurationSeconds?: number;
}

export interface EngineFlowObjective {
	key: string;
	description: string;
	field?: string;
	options?: string[];
	required?: boolean;
	maxAttempts?: number;
	sensitivity?: number;
	/** Aggregate objective (Phase 5b): engine keys of the parts it composes. */
	aggregateOf?: string[];
}

/** Global detect-and-jump: valid from every agent node, target = flow node id. */
export interface EngineFlowScenario {
	name: string;
	description: string;
	target: string;
}

export interface EngineFlow {
	entry: string;
	nodes: EngineFlowNode[];
	scenarios?: EngineFlowScenario[];
}

const flowSectionSchema = z.object({
	id: z.string(),
	title: z.string().optional(),
	body: z.unknown(),
});

const flowExitSchema = z.object({
	id: z.string(),
	name: z.string(),
	description: z.string(),
	tagRules: z
		.object({
			mustHave: z.array(z.string()).optional(),
			cantHave: z.array(z.string()).optional(),
		})
		.optional(),
});

export const greeterNodeDataSchema = z.object({
	title: z.string(),
	greeting: z.string().default(""),
});

export const agentNodeDataSchema = z.object({
	title: z.string(),
	sections: z.array(flowSectionSchema),
	entryMessage: z.string(),
	exits: z.array(flowExitSchema),
	toolIds: z.array(z.string()),
	model: z.string().optional(),
	calendarName: z.string().optional(),
	appointmentTitle: z.string().optional(),
	failedBookingTag: z.string().optional(),
});

export const objectiveNodeDataSchema = z.object({
	title: z.string(),
	entryMessage: z.string().default(""),
	objectives: z.array(
		z.object({
			id: z.string(),
			title: z.string(),
			description: z.string(),
			field: z.string(),
			options: z.array(z.string()).optional(),
			maxAttempts: z.number().optional(),
			sensitivity: z.number().optional(),
			aggregateOf: z.array(z.string()).optional(),
			managed: z.boolean().optional(),
			fullAddress: z.boolean().optional(),
		}),
	),
});

export const conversationNodeDataSchema = z.object({
	title: z.string(),
	reason: z.string(),
	hints: z.array(z.string()).default([]),
	exits: z.array(flowExitSchema).default([]),
	wrapUpMode: z.enum(["end_call", "exit"]).default("end_call"),
	wrapUpExitId: z.string().optional(),
	maxDurationSeconds: z.number().optional(),
	isDefault: z.boolean().optional(),
});

export const trueFalseNodeDataSchema = z.object({
	title: z.string(),
	condition: z.string(),
});

export const switchNodeDataSchema = z.object({
	title: z.string(),
	condition: z.string(),
	cases: z.array(
		z.object({
			id: z.string(),
			name: z.string(),
			description: z.string(),
		}),
	),
	includeOtherwise: z.boolean().default(true),
});

export const statementNodeDataSchema = z.object({
	title: z.string(),
	say: z.string(),
});

export const scenarioNodeDataSchema = z.object({
	title: z.string(),
	description: z.string(),
});

export const transferNodeDataSchema = z.object({
	title: z.string(),
	say: z.string(),
	holdSeconds: z.number(),
	voiceId: z.string().optional(),
	voiceProvider: z.string().optional(),
});

export const handoffNodeDataSchema = z.object({
	title: z.string(),
	handoffAgentId: z.string().optional(),
});

export const setFieldNodeDataSchema = z.object({
	title: z.string(),
	field: z.string(),
	value: z.string(),
});

export const modifyTagsNodeDataSchema = z.object({
	title: z.string(),
	addTags: z.array(z.string()),
	removeTags: z.array(z.string()),
});

export const bookingNodeDataSchema = z.object({
	title: z.string(),
	calendarName: z.string().default(""),
	description: z.string().default(""),
	extraPrompt: z.string().default(""),
	appointmentTitle: z.string().default(""),
	failedBookingTag: z.string().default(""),
	toolIds: z.array(z.string()).default([]),
});

export const positionSchema = z.object({ x: z.number(), y: z.number() });

export const canvasEdgeSchema = z.object({
	id: z.string(),
	source: z.string(),
	sourceHandle: z.string().optional(),
	target: z.string(),
});

export const canvasViewportSchema = z
	.object({ x: z.number(), y: z.number(), zoom: z.number() })
	.optional();

/**
 * The Start node's canvas schema. The editable kinds' node schemas are derived
 * from the node-kind registry (see kinds/index.ts) so `canvasDocSchema` lives
 * there — this keeps the fixed Start node's shape next to its constants.
 */
export const startCanvasNodeSchema = z.object({
	id: z.string(),
	type: z.literal("start"),
	position: positionSchema,
});

export const engineFlowSchema = z.object({
	entry: z.string(),
	nodes: z.array(
		z.object({
			id: z.string(),
			name: z.string().optional(),
			kind: z
				.enum(["agent", "router", "statement", "transfer", "set_field", "modify_tags"])
				.optional(),
			router: z.object({ condition: z.string() }).optional(),
			statement: z.object({ say: z.string() }).optional(),
			setField: z.object({ field: z.string(), value: z.string() }).optional(),
			modifyTags: z
				.object({ add: z.array(z.string()).optional(), remove: z.array(z.string()).optional() })
				.optional(),
			transfer: z
				.object({
					say: z.string().optional(),
					holdSeconds: z.number(),
					voice: z
						.object({
							provider: z.string(),
							voice: z.string(),
							speed: z.number().optional(),
						})
						.optional(),
				})
				.optional(),
			instructions: z.string(),
			entryInstructions: z.string().optional(),
			toolIds: z.array(z.string()).optional(),
			llm: z
				.object({
					model: z.string(),
					temperature: z.number().optional(),
					maxTokens: z.number().optional(),
				})
				.optional(),
			exits: z
				.array(
					z.object({
						name: z.string(),
						description: z.string(),
						target: z.string().optional(),
						tagRules: z
							.object({
								mustHave: z.array(z.string()).optional(),
								cantHave: z.array(z.string()).optional(),
							})
							.optional(),
					}),
				)
				.optional(),
			objectives: z
				.array(
					z.object({
						key: z.string(),
						description: z.string(),
						field: z.string().optional(),
						options: z.array(z.string()).optional(),
						required: z.boolean().optional(),
						maxAttempts: z.number().optional(),
						sensitivity: z.number().optional(),
						aggregateOf: z.array(z.string()).optional(),
					}),
				)
				.optional(),
			conversation: z
				.object({
					reason: z.string(),
					hints: z.array(z.string()).optional(),
					wrapUp: z.union([
						z.object({ mode: z.literal("end_call") }),
						z.object({ mode: z.literal("exit"), exit: z.string() }),
					]),
					maxDurationSeconds: z.number().optional(),
				})
				.optional(),
		}),
	),
	scenarios: z
		.array(
			z.object({
				name: z.string(),
				description: z.string(),
				target: z.string(),
			}),
		)
		.optional(),
});
