import { z } from "zod";

/**
 * The canvas document — the flow builder's full editor state. Persisted
 * verbatim at config.canvas (the engine ignores it) so reopening the builder
 * restores positions, rich-text sections and the viewport exactly.
 */

export const START_NODE_ID = "__start__";
export const START_HANDLE_ID = "start";

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

/** dataTransfer type used when dragging an action from the palette onto the canvas. */
export const FLOW_NODE_DRAG_TYPE = "application/x-voiceagent-flow-node";

/** Editable canvas node kinds (everything but the fixed Start node). */
export type FlowNodeKind =
	| "agent"
	| "objective"
	| "truefalse"
	| "switch"
	| "statement"
	| "scenario"
	| "transfer"
	| "set_field"
	| "modify_tags"
	| "booking";

/** Palette entries: node kinds plus pre-filled presets (they map onto a kind). */
export const FLOW_PALETTE_KINDS = [
	"agent",
	"objective",
	"truefalse",
	"switch",
	"statement",
	"scenario",
	"scenario_aggression",
	"booking",
	"transfer",
	"set_field",
	"modify_tags",
] as const;

/**
 * Well-known CRM output variables for objectives. "Full Address" and "Full Name"
 * are composites — one objective fills every underlying standard field
 * (address1/city/state/postalCode, or firstName/lastName). Standard fields write
 * to the contact record; anything else is a custom field (find-or-create by name).
 * The `field` value is what update_contact receives as field_name.
 */
export const OBJECTIVE_OUTPUT_VARIABLES: { label: string; field: string; composite?: boolean }[] = [
	{ label: "Full Address", field: "Full Address", composite: true },
	{ label: "Full Name", field: "Full Name", composite: true },
	{ label: "First Name", field: "First Name" },
	{ label: "Last Name", field: "Last Name" },
	{ label: "Email", field: "Email" },
	{ label: "Phone", field: "Phone" },
	{ label: "Street Address", field: "Street Address" },
	{ label: "City", field: "City" },
	{ label: "State", field: "State" },
	{ label: "Postal Code", field: "Postal Code" },
	{ label: "Country", field: "Country" },
	{ label: "Website", field: "Website" },
];
export type FlowPaletteKind = (typeof FLOW_PALETTE_KINDS)[number];

export interface FlowSectionDoc {
	id: string;
	title?: string;
	/** TipTap JSON document (mention chips + text). */
	body: unknown;
}

export interface FlowExitDoc {
	id: string;
	name: string;
	description: string;
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
}

export interface ObjectiveNodeData {
	title: string;
	objectives: ObjectiveDoc[];
	/** Spoken direction generated on entry (ignored on the entry node). */
	entryMessage: string;
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

export type FlowNodeData =
	| AgentNodeData
	| ObjectiveNodeData
	| TrueFalseNodeData
	| SwitchNodeData
	| StatementNodeData
	| ScenarioNodeData
	| TransferNodeData
	| SetFieldNodeData
	| ModifyTagsNodeData
	| BookingNodeData;

export interface StartCanvasNodeDoc {
	id: string;
	type: "start";
	position: { x: number; y: number };
	data?: undefined;
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
	| AgentCanvasNodeDoc
	| ObjectiveCanvasNodeDoc
	| TrueFalseCanvasNodeDoc
	| SwitchCanvasNodeDoc
	| StatementCanvasNodeDoc
	| ScenarioCanvasNodeDoc
	| TransferCanvasNodeDoc
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
}

export interface EngineFlowNode {
	id: string;
	name?: string;
	/**
	 * "router" nodes never speak — the engine evaluates router.condition and picks an exit.
	 * "statement" nodes speak statement.say and immediately continue (at most one exit).
	 * "transfer" nodes announce, play hold music, then continue with a new voice.
	 */
	kind?: "agent" | "router" | "statement" | "transfer" | "set_field" | "modify_tags";
	router?: { condition: string };
	statement?: { say: string };
	setField?: { field: string; value: string };
	modifyTags?: { add?: string[]; remove?: string[] };
	transfer?: {
		say?: string;
		holdSeconds: number;
		voice?: { provider: string; voice: string; speed?: number };
	};
	instructions: string;
	entryInstructions?: string;
	toolIds: string[];
	llm?: { model: string; temperature?: number; maxTokens?: number };
	exits: EngineFlowExit[];
	/** Engine-verified data goals; the engine takes the primary exit once met. */
	objectives?: EngineFlowObjective[];
}

export interface EngineFlowObjective {
	key: string;
	description: string;
	field?: string;
	options?: string[];
	required?: boolean;
	maxAttempts?: number;
	sensitivity?: number;
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
});

const agentNodeDataSchema = z.object({
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

const objectiveNodeDataSchema = z.object({
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
		}),
	),
});

const trueFalseNodeDataSchema = z.object({
	title: z.string(),
	condition: z.string(),
});

const switchNodeDataSchema = z.object({
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

const statementNodeDataSchema = z.object({
	title: z.string(),
	say: z.string(),
});

const scenarioNodeDataSchema = z.object({
	title: z.string(),
	description: z.string(),
});

const transferNodeDataSchema = z.object({
	title: z.string(),
	say: z.string(),
	holdSeconds: z.number(),
	voiceId: z.string().optional(),
	voiceProvider: z.string().optional(),
});

const setFieldNodeDataSchema = z.object({
	title: z.string(),
	field: z.string(),
	value: z.string(),
});

const modifyTagsNodeDataSchema = z.object({
	title: z.string(),
	addTags: z.array(z.string()),
	removeTags: z.array(z.string()),
});

const bookingNodeDataSchema = z.object({
	title: z.string(),
	calendarName: z.string().default(""),
	description: z.string().default(""),
	extraPrompt: z.string().default(""),
	appointmentTitle: z.string().default(""),
	failedBookingTag: z.string().default(""),
	toolIds: z.array(z.string()).default([]),
});

const positionSchema = z.object({ x: z.number(), y: z.number() });

export const canvasDocSchema = z.object({
	version: z.literal(1),
	nodes: z.array(
		z.discriminatedUnion("type", [
			z.object({
				id: z.string(),
				type: z.literal("start"),
				position: positionSchema,
			}),
			z.object({
				id: z.string(),
				type: z.literal("agent"),
				position: positionSchema,
				data: agentNodeDataSchema.optional(),
			}),
			z.object({
				id: z.string(),
				type: z.literal("objective"),
				position: positionSchema,
				data: objectiveNodeDataSchema.optional(),
			}),
			z.object({
				id: z.string(),
				type: z.literal("truefalse"),
				position: positionSchema,
				data: trueFalseNodeDataSchema.optional(),
			}),
			z.object({
				id: z.string(),
				type: z.literal("switch"),
				position: positionSchema,
				data: switchNodeDataSchema.optional(),
			}),
			z.object({
				id: z.string(),
				type: z.literal("statement"),
				position: positionSchema,
				data: statementNodeDataSchema.optional(),
			}),
			z.object({
				id: z.string(),
				type: z.literal("scenario"),
				position: positionSchema,
				data: scenarioNodeDataSchema.optional(),
			}),
			z.object({
				id: z.string(),
				type: z.literal("transfer"),
				position: positionSchema,
				data: transferNodeDataSchema.optional(),
			}),
			z.object({
				id: z.string(),
				type: z.literal("set_field"),
				position: positionSchema,
				data: setFieldNodeDataSchema.optional(),
			}),
			z.object({
				id: z.string(),
				type: z.literal("modify_tags"),
				position: positionSchema,
				data: modifyTagsNodeDataSchema.optional(),
			}),
			z.object({
				id: z.string(),
				type: z.literal("booking"),
				position: positionSchema,
				data: bookingNodeDataSchema.optional(),
			}),
		]),
	),
	edges: z.array(
		z.object({
			id: z.string(),
			source: z.string(),
			sourceHandle: z.string().optional(),
			target: z.string(),
		}),
	),
	viewport: z.object({ x: z.number(), y: z.number(), zoom: z.number() }).optional(),
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
					}),
				)
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
