import { z } from "zod";

import type { FlowNodeData, FlowNodeKind } from "../flow-types";
import {
	canvasEdgeSchema,
	canvasViewportSchema,
	positionSchema,
	startCanvasNodeSchema,
} from "../flow-types";
import { agentKind } from "./agent";
import { bookingKind } from "./booking";
import { conversationKind } from "./conversation";
import { modifyTagsKind } from "./modify-tags";
import { objectiveKind } from "./objective";
import { scenarioKind } from "./scenario";
import { setFieldKind } from "./set-field";
import { statementKind } from "./statement";
import { switchKind } from "./switch";
import { transferKind } from "./transfer";
import { trueFalseKind } from "./true-false";
import type { FlowKindDefinition } from "./types";

export type {
	FlowCompileCtx,
	FlowCompileResult,
	FlowDecompileResult,
	FlowKindDefinition,
	FlowKindSubPanel,
	FlowNodeEditorComponent,
	FlowNodeEditorProps,
} from "./types";

/**
 * The ordered node-kind registry — the single source of truth for every
 * editable flow node kind. FlowCanvas (rendering, palette, edge labels),
 * NodeEditorPanel (editor dispatch + sheet copy), the compiler (compile loop),
 * the validator (per-kind checks) and the canvas zod schema all read from here.
 *
 * Order matters only cosmetically (canvas doc union + validation grouping);
 * it mirrors the original hand-written order for a byte-identical schema.
 *
 * Add a node kind = add one file under kinds/ + one entry in this list.
 */
// Entries are heterogeneous in their `TData` (invariant in the function params);
// `<any>` widens them into one list, exactly like the old kind-meta table did.
export const FLOW_KIND_LIST: FlowKindDefinition<any>[] = [
	agentKind,
	objectiveKind,
	conversationKind,
	trueFalseKind,
	switchKind,
	statementKind,
	scenarioKind,
	transferKind,
	setFieldKind,
	modifyTagsKind,
	bookingKind,
];

/** Keyed lookup over the registry list. */
export const FLOW_KINDS = Object.fromEntries(
	FLOW_KIND_LIST.map((entry) => [entry.kind, entry]),
) as Record<FlowNodeKind, FlowKindDefinition>;

export function isFlowNodeKind(type: string | undefined): type is FlowNodeKind {
	return !!type && type in FLOW_KINDS;
}

/** Repaired data for a persisted node whose `data` is missing. */
export function fallbackDataFor(kind: FlowNodeKind, bookingToolIds: string[]): FlowNodeData {
	const entry = FLOW_KINDS[kind];
	return (entry.fallbackData ?? entry.newData)(bookingToolIds);
}

/**
 * The canvas document schema — the editable kinds' node schemas are derived
 * from the registry (each entry's `schema` becomes `data`), with the fixed
 * Start node prepended. Persisted verbatim at config.canvas.
 */
export const canvasDocSchema = z.object({
	version: z.literal(1),
	nodes: z.array(
		z.discriminatedUnion("type", [
			startCanvasNodeSchema,
			...FLOW_KIND_LIST.map((entry) =>
				z.object({
					id: z.string(),
					type: z.literal(entry.kind),
					position: positionSchema,
					data: entry.schema.optional(),
				}),
			),
			// The registry list is non-empty and each option carries a literal
			// `type` discriminator; the cast satisfies discriminatedUnion's
			// static tuple signature (runtime introspection is unaffected).
			// oxlint-disable-next-line no-explicit-any -- dynamic option list
		] as any),
	),
	edges: z.array(canvasEdgeSchema),
	viewport: canvasViewportSchema,
});
