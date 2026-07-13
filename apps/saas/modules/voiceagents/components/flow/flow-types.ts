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
/** The primary "Connects to" source handle on a transfer node. */
export const TRANSFER_NEXT_HANDLE_ID = "next";
/**
 * The warm-only "Not connected" failure source handle on a transfer node — the
 * branch taken when the person doesn't answer or declines. Compiles to an exit
 * named exactly `TRANSFER_FAILED_EXIT_NAME` (a cross-repo join key the engine
 * matches). Only present for `mode === "warm"`.
 */
export const TRANSFER_FAILED_HANDLE_ID = "not-connected";
/** The single "Next" source handle on the deterministic action nodes. */
export const SET_FIELD_NEXT_HANDLE_ID = "next";
export const MODIFY_TAGS_NEXT_HANDLE_ID = "next";
/** The two source handles on a Booking node: appointment booked vs no slot worked. */
export const BOOKING_BOOKED_HANDLE_ID = "booked";
export const BOOKING_FAILED_HANDLE_ID = "failed";
/** The single "Jump to" source handle on a scenario node. */
export const SCENARIO_JUMP_HANDLE_ID = "jump";

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
	| "handoff"
	| "stop_responding";

/**
 * A delivery channel a flow (or an individual node) can run on. A node with no
 * explicit channels runs on BOTH — the default. Voice-only machinery (transfer,
 * simulated hold music, voice swaps) is marked `["voice"]`; a node meaningful
 * only in a typed conversation is marked `["text"]`.
 */
export type FlowChannel = "voice" | "text";

/** The two channels, in canonical order. */
export const FLOW_CHANNELS: readonly FlowChannel[] = ["voice", "text"];

/**
 * Collapse a raw channels array to its canonical form: `undefined` when the node
 * runs on BOTH channels (absent/empty, or both listed), otherwise the single
 * channel it is restricted to. Keeping "both" as `undefined` means an unmarked
 * node compiles byte-identically to before this field existed.
 */
export function normalizeChannels(raw: FlowChannel[] | undefined): FlowChannel[] | undefined {
	if (!raw || raw.length === 0) {
		return undefined;
	}
	const hasVoice = raw.includes("voice");
	const hasText = raw.includes("text");
	if (hasVoice && hasText) {
		return undefined;
	}
	if (hasVoice) {
		return ["voice"];
	}
	if (hasText) {
		return ["text"];
	}
	return undefined;
}

/** Whether a node carrying these channels runs on `channel`. Absent = both = always. */
export function channelAllows(channels: FlowChannel[] | undefined, channel: FlowChannel): boolean {
	const normalized = normalizeChannels(channels);
	return !normalized || normalized.includes(channel);
}

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
	"transfer_human",
	"set_field",
	"modify_tags",
	"handoff",
	"stop_responding",
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
	/** When false/absent (default): greeting spoken VERBATIM (with {{variable}}
	 * substitution). When true: the greeting text is a DIRECTION the model
	 * generates a fresh opener from each call (caller's language + persona/style). */
	greetingGenerate?: boolean;
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
	/** Channels this node runs on; absent = both (default). See FlowChannel. */
	channels?: FlowChannel[];
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
	 * When true, the engine may silently mark this objective met from
	 * contactState (e.g. carried over from a prior agent on a HANDOFF) without
	 * asking the caller or writing to the CRM. Engine default is true; the
	 * builder defaults NEW objectives to false so a handoff specialist re-asks
	 * unless an author explicitly opts in.
	 */
	skipIfKnown?: boolean;
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
 * A Conversation node (CloseBot's "Keeping the Conversation Going"): a terminal,
 * objective-less, tool-less "keep chatting" stage. It runs off the agent-level
 * fields (Goal/business info, response style, words-to-avoid); the only per-node
 * knob is an optional Extra Prompt with extra guidance for this stage. No exits,
 * no wrap-up — it chats until the call/thread ends.
 */
export interface ConversationNodeData {
	title: string;
	/** Optional extra guidance for this stage (rich text w/ @-mention variables). */
	extraPrompt?: string;
	/** Advanced: cap the time spent in this node before wrapping up. */
	maxDurationSeconds?: number;
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
	/** When false/absent (default): `say` is delivered VERBATIM. When true: `say`
	 * is a DIRECTION the model generates a fresh, natural message from each time
	 * (caller's language + persona/style). */
	generate?: boolean;
	/** Channels this node runs on; absent = both (default). See FlowChannel. */
	channels?: FlowChannel[];
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

/**
 * "simulated" (default) is the in-session hand-off: announcement + hold music
 * + voice swap, no SIP trunk required — the original transfer behavior.
 * "warm" dials `target`, caller hears hold music while it rings for up to
 * `waitSeconds`, then merges. "cold" blind-forwards the caller's SIP leg to
 * `target` and the agent drops.
 */
export type TransferMode = "simulated" | "warm" | "cold";

export interface TransferNodeData {
	title: string;
	/** Announcement spoken before the music/transfer, in the pre-transfer voice. */
	say: string;
	/** Which kind of transfer this node performs. Defaults to "simulated". */
	mode: TransferMode;
	/** Hold-music duration between the two "people" — simulated only. */
	holdSeconds: number;
	/** TTS voice from here on (id from the voice catalog); empty keeps the current voice. Simulated only. */
	voiceId?: string;
	/** Provider of voiceId (needed by the engine's TTS builder). Simulated only. */
	voiceProvider?: string;
	/** Phone number or SIP URI to dial/forward to — required for warm and cold. */
	target?: string;
	/** How long to ring `target` before giving up (warm only). 1..120, default 30. */
	waitSeconds?: number;
	[key: string]: unknown;
}

export interface HandoffNodeData {
	title: string;
	/** The target published agent this node hands the live call off to (agent id). */
	handoffAgentId?: string;
	/**
	 * How the swap presents. "announced" (default): the SOURCE agent sends the
	 * `say` bridge, then the TARGET agent opens with its own entry greeting (and,
	 * on voice, the hold music covers the swap). "seamless": the target just
	 * continues — no bridge, no self-intro, no music. Absent = announced.
	 */
	mode?: "seamless" | "announced";
	/** Announcement spoken by the SOURCE agent right before the hold music. Supports {{variables}}. */
	say?: string;
	/** When false/absent (default): `say` is spoken VERBATIM. When true: `say` is
	 * a DIRECTION the SOURCE agent's model speaks a fresh announcement from
	 * (caller's language + persona/style). */
	generate?: boolean;
	/** Hold-music duration between the source agent's announcement and the target agent picking up. Engine default 3 when unset; 0 disables music. */
	holdSeconds?: number;
	/** Channels this node runs on; absent = both (default). See FlowChannel. */
	channels?: FlowChannel[];
	[key: string]: unknown;
}

export interface StopRespondingNodeData {
	title: string;
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
	| StopRespondingNodeData
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

export interface StopRespondingCanvasNodeDoc {
	id: string;
	type: "stop_responding";
	position: { x: number; y: number };
	data?: StopRespondingNodeData;
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
	| StopRespondingCanvasNodeDoc
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
	kind?:
		| "agent"
		| "router"
		| "statement"
		| "transfer"
		| "set_field"
		| "modify_tags"
		| "handoff"
		| "stop_responding";
	router?: { condition: string };
	statement?: { say: string; generate?: boolean };
	/** `toolId` names the engine tool that writes the field (self-describing —
	 * the engine no longer assumes an "update_contact" tool). */
	setField?: { field: string; value: string; toolId?: string };
	/** `toolId` names the engine tool that adds tags (self-describing — the
	 * engine no longer assumes an "add_tag" tool). */
	modifyTags?: { add?: string[]; remove?: string[]; toolId?: string };
	transfer?: {
		mode?: "simulated" | "warm" | "cold";
		/** Phone number or SIP URI — required for warm and cold. */
		target?: string;
		/** How long to ring `target` before giving up — warm only. 1..120, default 30. */
		waitSeconds?: number;
		say?: string;
		/** Hold-music duration — simulated only. 0..30, default 4. */
		holdSeconds?: number;
		/** TTS voice from here on — simulated only. */
		voice?: { provider: string; voice: string; speed?: number };
	};
	/** handoff-only: the target published agent id the live call is handed to. */
	handoffAgentId?: string;
	/** handoff-only: optional announcement (source agent's voice) + hold music before the target takes over. */
	handoff?: {
		/** How the swap presents; absent = "announced" (the pre-mode default). */
		mode?: "seamless" | "announced";
		say?: string;
		/** When true, `say` is a direction the source agent generates the announcement from. */
		generate?: boolean;
		/** Hold-music duration. Engine default 3 when unset; 0 disables music. 0..30. */
		holdSeconds?: number;
	};
	instructions: string;
	entryInstructions?: string;
	toolIds: string[];
	llm?: { model: string; temperature?: number; maxTokens?: number };
	exits: EngineFlowExit[];
	/** Engine-verified data goals; the engine takes the primary exit once met. */
	objectives?: EngineFlowObjective[];
	/**
	 * Conversation-node config (node kind stays "agent" on the wire). When present,
	 * the engine runs a terminal "keep chatting" stage off the agent-level fields;
	 * the optional `reason` carries the SaaS Extra Prompt. `wrapUp` is always
	 * `{mode:"end_call"}`. Legacy nodes may still carry `hints`/`wrapUp:{mode:"exit"}`
	 * (read for decompile back-compat only).
	 */
	conversation?: EngineFlowConversation;
	/**
	 * Channels this node runs on; absent = both. Emitted by the compiler so the
	 * runtime can skip voice-only nodes on a text session. The engine's flow zod
	 * currently STRIPS this field (harmless — a text session just receives the
	 * full flow); adding `channels: z.array(z.enum(["voice","text"])).optional()`
	 * to the engine's flow-node schema activates runtime channel awareness. The
	 * SaaS also compiles a text-pruned flow via `pruneFlowForChannel`.
	 */
	channels?: FlowChannel[];
}

export interface EngineFlowConversation {
	/** Optional extra guidance for this stage (SaaS Extra Prompt). */
	reason?: string;
	/** Legacy talking-point hints (read-only for decompile back-compat). */
	hints?: string[];
	/** Closure behavior. Always `{mode:"end_call"}`; `exit` is legacy-only. */
	wrapUp?: { mode: "end_call" } | { mode: "exit"; exit: string };
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
	/**
	 * When true, the engine may auto-complete this objective from contactState
	 * with no CRM write and no question asked (e.g. carried over on a
	 * HANDOFF). Engine defaults this true when omitted.
	 */
	skipIfKnown?: boolean;
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
	greetingGenerate: z.boolean().optional(),
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
	channels: z.array(z.enum(["voice", "text"])).optional(),
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
			skipIfKnown: z.boolean().optional(),
			aggregateOf: z.array(z.string()).optional(),
			managed: z.boolean().optional(),
			fullAddress: z.boolean().optional(),
		}),
	),
});

export const conversationNodeDataSchema = z.object({
	title: z.string(),
	extraPrompt: z.string().optional(),
	maxDurationSeconds: z.number().optional(),
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
	generate: z.boolean().optional(),
	channels: z.array(z.enum(["voice", "text"])).optional(),
});

export const scenarioNodeDataSchema = z.object({
	title: z.string(),
	description: z.string(),
});

export const transferNodeDataSchema = z.object({
	title: z.string(),
	say: z.string(),
	mode: z.enum(["simulated", "warm", "cold"]).default("simulated"),
	holdSeconds: z.number(),
	voiceId: z.string().optional(),
	voiceProvider: z.string().optional(),
	target: z.string().optional(),
	waitSeconds: z.number().optional(),
});

export const handoffNodeDataSchema = z.object({
	title: z.string(),
	handoffAgentId: z.string().optional(),
	mode: z.enum(["seamless", "announced"]).optional(),
	say: z.string().optional(),
	generate: z.boolean().optional(),
	holdSeconds: z.number().optional(),
	channels: z.array(z.enum(["voice", "text"])).optional(),
});

export const stopRespondingNodeDataSchema = z.object({
	title: z.string(),
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
				.enum([
					"agent",
					"router",
					"statement",
					"transfer",
					"set_field",
					"modify_tags",
					"handoff",
					"stop_responding",
				])
				.optional(),
			router: z.object({ condition: z.string() }).optional(),
			statement: z.object({ say: z.string() }).optional(),
			setField: z.object({ field: z.string(), value: z.string() }).optional(),
			modifyTags: z
				.object({ add: z.array(z.string()).optional(), remove: z.array(z.string()).optional() })
				.optional(),
			transfer: z
				.object({
					mode: z.enum(["simulated", "warm", "cold"]).optional(),
					target: z.string().optional(),
					waitSeconds: z.number().optional(),
					say: z.string().optional(),
					holdSeconds: z.number().optional(),
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
						skipIfKnown: z.boolean().optional(),
						aggregateOf: z.array(z.string()).optional(),
					}),
				)
				.optional(),
			conversation: z
				.object({
					// reason/hints/wrapUp are all optional so a NEW terminal node
					// (reason-only) AND a legacy node (hints + wrapUp:{mode:"exit"})
					// both parse for decompile.
					reason: z.string().optional(),
					hints: z.array(z.string()).optional(),
					wrapUp: z
						.union([
							z.object({ mode: z.literal("end_call") }),
							z.object({ mode: z.literal("exit"), exit: z.string() }),
						])
						.optional(),
					maxDurationSeconds: z.number().optional(),
				})
				.optional(),
			channels: z.array(z.enum(["voice", "text"])).optional(),
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
