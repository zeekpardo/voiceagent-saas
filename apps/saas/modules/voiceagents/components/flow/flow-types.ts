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
/** The single "Jump to" source handle on a scenario node. */
export const SCENARIO_JUMP_HANDLE_ID = "jump";

/** dataTransfer type used when dragging an action from the palette onto the canvas. */
export const FLOW_NODE_DRAG_TYPE = "application/x-voiceagent-flow-node";

/** Editable canvas node kinds (everything but the fixed Start node). */
export type FlowNodeKind = "agent" | "truefalse" | "switch" | "statement" | "scenario";

/** Palette entries: node kinds plus pre-filled presets (they map onto a kind). */
export const FLOW_PALETTE_KINDS = [
	"agent",
	"truefalse",
	"switch",
	"statement",
	"scenario",
	"scenario_aggression",
	"booking",
] as const;
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

export type FlowNodeData =
	| AgentNodeData
	| TrueFalseNodeData
	| SwitchNodeData
	| StatementNodeData
	| ScenarioNodeData;

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

export type CanvasNodeDoc =
	| StartCanvasNodeDoc
	| AgentCanvasNodeDoc
	| TrueFalseCanvasNodeDoc
	| SwitchCanvasNodeDoc
	| StatementCanvasNodeDoc
	| ScenarioCanvasNodeDoc;

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
	 */
	kind?: "agent" | "router" | "statement";
	router?: { condition: string };
	statement?: { say: string };
	instructions: string;
	entryInstructions?: string;
	toolIds: string[];
	llm?: { model: string; temperature?: number; maxTokens?: number };
	exits: EngineFlowExit[];
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
			kind: z.enum(["agent", "router", "statement"]).optional(),
			router: z.object({ condition: z.string() }).optional(),
			statement: z.object({ say: z.string() }).optional(),
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
