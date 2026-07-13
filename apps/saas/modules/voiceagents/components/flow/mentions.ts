import {
	customFieldVariableName,
	customValueVariableName,
} from "@repo/api/modules/crm/lib/field-mapping";
import type { AnyExtension } from "@tiptap/core";
import { mergeAttributes } from "@tiptap/core";
import { Mention, type MentionNodeAttrs } from "@tiptap/extension-mention";
import type {
	SuggestionKeyDownProps,
	SuggestionOptions,
	SuggestionProps,
} from "@tiptap/suggestion";

import {
	MENTION_CHAR_EXIT,
	MENTION_CHAR_TOOL,
	MENTION_CHAR_VARIABLE,
	prettifyVariable,
	sanitizeExitName,
} from "./compile/text";
import type { FlowNodeKind } from "./flow-types";

/**
 * CloseBot-style mention chips: one Mention extension with three triggers —
 * `@` variables, `@@` tools, `@@@` exits (TipTap v3 `suggestions` array; the
 * trigger `char` is regex-escaped so multi-char strings work). Each chip
 * stores its trigger in attrs.mentionSuggestionChar, which drives both the
 * pill styling here and the plain-text serialization in compile.ts.
 */

export interface MentionItem {
	/** Serialization id: variable name, tool name, or exit name. */
	id: string;
	label: string;
	sub?: string;
}

export interface MentionSources {
	getVariables: () => MentionItem[];
	getTools: () => MentionItem[];
	getExits: () => MentionItem[];
	/** Fired when a tool chip is inserted — auto-check it in the node's tools. */
	onToolInserted?: (toolName: string) => void;
}

/**
 * Runtime dynamic-variable catalog — the EXACT names the platform substitutes
 * at call time. BOTH dispatch paths (builder-test `sessions.ts` and the
 * production trigger `voice-call/[token]/route.ts`) merge only these:
 *   - contact_*  ← GHL getContactContext()  (packages/api/.../providers/gohighlevel.ts:169)
 *   - location_* ← GHL getAccountContext()   (…/gohighlevel.ts:305)
 *   - caller_*   ← dispatch/session (caller_name is set on the test path; caller_number kept as legacy)
 *
 * Names MUST stay byte-identical to that provider code — a mismatch yields a
 * mention chip that silently resolves to nothing at call time. Custom CRM
 * fields are NOT listed here: their variables ({{contact_<custom slug>}}) are
 * derived per-source via customFieldVariableName and merged into the dispatch
 * variables from the contact state (contact-state.ts customFieldVariables), so
 * they are appended dynamically in buildVariableItems instead.
 */
export const RUNTIME_CONTACT_VARIABLES = [
	"contact_first_name",
	"contact_last_name",
	"contact_full_name",
	"contact_email",
	"contact_phone",
	"contact_company",
	"contact_address",
	"contact_city",
	"contact_state",
	"contact_postal_code",
	"contact_full_address",
	"contact_tags",
	"contact_source",
	"contact_timezone",
];

export const RUNTIME_LOCATION_VARIABLES = [
	"location_id",
	"location_name",
	"location_email",
	"location_address",
	"location_city",
	"location_state",
	"location_country",
	"location_postal_code",
	"location_full_address",
	"location_phone",
	"location_website",
	"location_timezone",
	"location_current_date_time",
	"location_business_name",
	"location_business_address",
	"location_business_city",
	"location_business_state",
	"location_business_country",
	"location_business_postal_code",
	"location_business_website",
	"location_business_timezone",
];

export const RUNTIME_CALLER_VARIABLES = ["caller_name", "caller_number"];

export const STANDARD_VARIABLES = [
	...RUNTIME_CONTACT_VARIABLES,
	...RUNTIME_LOCATION_VARIABLES,
	...RUNTIME_CALLER_VARIABLES,
];

/**
 * Unified-field-source key → the runtime variable it interpolates to, for keys
 * the dispatch merge actually emits. This is how the contact-fields source is
 * wired into the mention list: a catalog field becomes a chip only if its key
 * maps to a real runtime variable. Standard keys with no runtime variable
 * (contact.country / contact.website; location.country / location.email /
 * location.id) are absent here, so they are skipped; CUSTOM keys are handled
 * separately in fieldRuntimeVariable. Note the non-1:1 spots vs a naive
 * `key.replace(".","_")`:
 *   contact.name    → contact_full_name   (runtime has no contact_name)
 *   contact.address → contact_full_address (catalog "Full Address" is composite)
 *   contact.address1→ contact_address      (runtime contact_address is the street)
 */
export const KEY_TO_RUNTIME_VARIABLE: Record<string, string> = {
	"contact.first_name": "contact_first_name",
	"contact.last_name": "contact_last_name",
	"contact.name": "contact_full_name",
	"contact.email": "contact_email",
	"contact.phone": "contact_phone",
	"contact.address": "contact_full_address",
	"contact.address1": "contact_address",
	"contact.city": "contact_city",
	"contact.state": "contact_state",
	"contact.postal_code": "contact_postal_code",
	"location.id": "location_id",
	"location.name": "location_name",
	"location.email": "location_email",
	"location.address": "location_address",
	"location.city": "location_city",
	"location.state": "location_state",
	"location.country": "location_country",
	"location.postal_code": "location_postal_code",
	"location.phone": "location_phone",
	"location.website": "location_website",
	"location.timezone": "location_timezone",
	"location.current_date_time": "location_current_date_time",
	"location.business_name": "location_business_name",
	"location.business_address": "location_business_address",
	"location.business_city": "location_business_city",
	"location.business_state": "location_business_state",
	"location.business_country": "location_business_country",
	"location.business_postal_code": "location_business_postal_code",
	"location.business_website": "location_business_website",
	"location.business_timezone": "location_business_timezone",
};

interface ChipStyle {
	prefix: string;
	prefixClass: string;
	chipClass: string;
}

function chipStyle(char: string, id: string, label: string): ChipStyle & { rest: string } {
	if (char === MENTION_CHAR_TOOL) {
		return {
			prefix: "Tool.",
			rest: id,
			prefixClass: "font-bold text-purple-600 dark:text-purple-400",
			chipClass: "border-purple-500/40 bg-purple-500/10",
		};
	}
	if (char === MENTION_CHAR_EXIT) {
		return {
			prefix: "Exit.",
			rest: label || id,
			prefixClass: "font-bold text-amber-600 dark:text-amber-400",
			chipClass: "border-amber-500/40 bg-amber-500/10",
		};
	}
	const pretty = label || prettifyVariable(id);
	const dot = pretty.indexOf(".");
	return {
		prefix: dot > 0 ? pretty.slice(0, dot + 1) : "Var.",
		rest: dot > 0 ? pretty.slice(dot + 1) : pretty,
		prefixClass: "font-bold text-blue-600 dark:text-blue-400",
		chipClass: "border-blue-500/40 bg-blue-500/10",
	};
}

/** The exact text a chip stands for in the compiled prompt. */
function serializeChip(char: string, id: string): string {
	if (char === MENTION_CHAR_TOOL) {
		return id;
	}
	if (char === MENTION_CHAR_EXIT) {
		return `the exit tool "exit_${sanitizeExitName(id)}"`;
	}
	return `{{${id}}}`;
}

/** Block a shorter trigger when it is actually the tail of a longer one (@@ / @@@). */
function allowMention({
	state,
	range,
}: {
	state: { doc: { textBetween: (from: number, to: number, b?: string, l?: string) => string } };
	range: { from: number };
}): boolean {
	const before = state.doc.textBetween(Math.max(0, range.from - 1), range.from, "\n", "\n");
	return before !== "@";
}

type MentionSuggestion = Omit<SuggestionOptions<MentionItem, MentionNodeAttrs>, "editor">;

function filterItems(items: MentionItem[], query: string): MentionItem[] {
	const q = query.toLowerCase();
	return (
		items
			.filter(
				(item) =>
					item.id.toLowerCase().includes(q) ||
					item.label.toLowerCase().includes(q) ||
					(item.sub ?? "").toLowerCase().includes(q),
			)
			// Cap high enough that whole field families stay visible on an empty
			// query — contact vars alone are 14, so a cap of 12 hid every location_*
			// entry below them. The popup scrolls (max-h-64), so a generous cap is fine.
			.slice(0, 60)
	);
}

/** A plain absolutely-positioned dropdown — no tippy.js needed. */
function createDropdownRenderer(
	emptyLabel: string,
	onPick?: (item: MentionItem) => void,
): MentionSuggestion["render"] {
	return () => {
		let container: HTMLDivElement | null = null;
		let items: MentionItem[] = [];
		let selectedIndex = 0;
		let command: (attrs: MentionNodeAttrs) => void = () => undefined;

		const pick = (index: number) => {
			const item = items[index];
			if (!item) {
				return;
			}
			onPick?.(item);
			command({ id: item.id, label: item.label });
		};

		const renderList = () => {
			if (!container) {
				return;
			}
			container.innerHTML = "";
			if (items.length === 0) {
				const empty = document.createElement("div");
				empty.className = "px-2 py-1.5 text-xs opacity-50";
				empty.textContent = emptyLabel;
				container.appendChild(empty);
				return;
			}
			items.forEach((item, index) => {
				const button = document.createElement("button");
				button.type = "button";
				button.className = `flex w-full flex-col items-start gap-0 rounded-sm px-2 py-1.5 text-left text-sm ${
					index === selectedIndex ? "bg-accent text-accent-foreground" : ""
				}`;
				const label = document.createElement("span");
				label.className = "font-medium";
				label.textContent = item.label;
				button.appendChild(label);
				if (item.sub) {
					const sub = document.createElement("span");
					sub.className = "text-xs opacity-60";
					sub.textContent = item.sub;
					button.appendChild(sub);
				}
				button.addEventListener("mousedown", (event) => {
					event.preventDefault();
					pick(index);
				});
				container?.appendChild(button);
			});
		};

		const reposition = (props: SuggestionProps<MentionItem, MentionNodeAttrs>) => {
			if (!container) {
				return;
			}
			const rect = props.clientRect?.();
			if (!rect) {
				return;
			}
			container.style.left = `${rect.left}px`;
			container.style.top = `${rect.bottom + 4}px`;
		};

		return {
			onStart: (props) => {
				container = document.createElement("div");
				// pointer-events-auto: stay clickable inside a modal sheet (Radix
				// disables pointer events on the body); data attribute lets the
				// sheet ignore "outside" clicks that land on the dropdown.
				container.className =
					"pointer-events-auto fixed z-[60] max-h-64 w-72 overflow-y-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md";
				container.dataset.mentionDropdown = "true";
				// Drive scroll ourselves: this fixed popup lives at document.body,
				// so the editor Sheet's RemoveScroll would otherwise swallow wheel
				// events here. Native non-passive listener → always scrollable.
				container.addEventListener(
					"wheel",
					(e) => {
						if (!container || container.scrollHeight <= container.clientHeight) return;
						container.scrollTop += e.deltaY;
						e.preventDefault();
						e.stopPropagation();
					},
					{ passive: false },
				);
				document.body.appendChild(container);
				items = props.items;
				selectedIndex = 0;
				command = props.command;
				renderList();
				reposition(props);
			},
			onUpdate: (props) => {
				items = props.items;
				selectedIndex = Math.min(selectedIndex, Math.max(0, items.length - 1));
				command = props.command;
				renderList();
				reposition(props);
			},
			onKeyDown: ({ event }: SuggestionKeyDownProps) => {
				if (event.key === "ArrowDown") {
					selectedIndex = items.length === 0 ? 0 : (selectedIndex + 1) % items.length;
					renderList();
					return true;
				}
				if (event.key === "ArrowUp") {
					selectedIndex =
						items.length === 0 ? 0 : (selectedIndex - 1 + items.length) % items.length;
					renderList();
					return true;
				}
				if (event.key === "Enter" || event.key === "Tab") {
					if (items.length === 0) {
						return false;
					}
					pick(selectedIndex);
					return true;
				}
				if (event.key === "Escape") {
					container?.remove();
					container = null;
					return true;
				}
				return false;
			},
			onExit: () => {
				container?.remove();
				container = null;
			},
		};
	};
}

/** The configured Mention extension for flow node section editors. */
export function createFlowMentionExtension(sources: MentionSources): AnyExtension {
	const suggestions: MentionSuggestion[] = [
		{
			char: MENTION_CHAR_EXIT,
			allow: allowMention,
			items: ({ query }) => filterItems(sources.getExits(), query),
			render: createDropdownRenderer("No exits on this node yet"),
		},
		{
			char: MENTION_CHAR_TOOL,
			allow: allowMention,
			items: ({ query }) => filterItems(sources.getTools(), query),
			render: createDropdownRenderer("No tools available", (item) =>
				sources.onToolInserted?.(item.id),
			),
		},
		{
			char: MENTION_CHAR_VARIABLE,
			allow: allowMention,
			items: ({ query }) => filterItems(sources.getVariables(), query),
			render: createDropdownRenderer("No variables found"),
		},
	];

	return Mention.configure({
		deleteTriggerWithBackspace: true,
		suggestions,
		renderText: ({ node }) =>
			serializeChip(
				String(node.attrs.mentionSuggestionChar ?? MENTION_CHAR_VARIABLE),
				String(node.attrs.id ?? ""),
			),
		renderHTML: ({ node, options }) => {
			const char = String(node.attrs.mentionSuggestionChar ?? MENTION_CHAR_VARIABLE);
			const { prefix, rest, prefixClass, chipClass } = chipStyle(
				char,
				String(node.attrs.id ?? ""),
				String(node.attrs.label ?? ""),
			);
			return [
				"span",
				mergeAttributes(options.HTMLAttributes, {
					class: `mx-0.5 inline-block rounded-md border px-2 py-0.5 font-mono text-xs align-baseline ${chipClass}`,
				}),
				["span", { class: prefixClass }, prefix],
				rest,
			];
		},
	});
}

/* ----------------------------------------------------------------------------
 * Variables-only pill extension — the single-field editors (Objective /
 * Statement / Conversation / Booking / Set-field / Greeter textareas).
 * -------------------------------------------------------------------------- */

/** Group + display label a pill renders with, resolved from the field catalog. */
export interface VariablePillMeta {
	/** Picker group name — "Contact" / "Location" / "Custom Value" / "Source". */
	group: string;
	/** The field's display label, e.g. "First Name". */
	label: string;
}

export interface VariablePillSources {
	/** The @-trigger suggestion list (same items the rail panel shows). */
	getVariables: () => MentionItem[];
	/**
	 * Resolve a token name to its group + label for pill rendering. Undefined →
	 * generic "Var." pill with the raw name (an unknown token must render, never
	 * crash, and must serialize back to the identical `{{name}}`).
	 */
	getMeta: (name: string) => VariablePillMeta | undefined;
}

const SVG_NS = "http://www.w3.org/2000/svg";

/**
 * Lucide icon shapes per picker group (24×24 stroke icons, path data lifted
 * from lucide-react's user / map-pin / fingerprint / database / braces so the
 * pills match the rail panel's group icons). Kept as plain shape specs because
 * ProseMirror's renderHTML emits DOM specs, not React elements — the namespace
 * prefix ("<ns> <tag>") is what makes ProseMirror create real SVG elements.
 */
const PILL_ICON_SHAPES: Record<string, [string, Record<string, string>][]> = {
	Contact: [
		["path", { d: "M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" }],
		["circle", { cx: "12", cy: "7", r: "4" }],
	],
	Location: [
		["path", { d: "M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" }],
		["circle", { cx: "12", cy: "10", r: "3" }],
	],
	"Custom Value": [
		["path", { d: "M12 10a2 2 0 0 0-2 2c0 1.02-.1 2.51-.26 4" }],
		["path", { d: "M14 13.12c0 2.38 0 6.38-1 8.88" }],
		["path", { d: "M17.29 21.02c.12-.6.43-2.3.5-3.02" }],
		["path", { d: "M2 12a10 10 0 0 1 18-6" }],
		["path", { d: "M2 16h.01" }],
		["path", { d: "M21.8 16c.2-2 .131-5.354 0-6" }],
		["path", { d: "M5 19.5C5.5 18 6 15 6 12a6 6 0 0 1 .34-2" }],
		["path", { d: "M8.65 22c.21-.66.45-1.32.57-2" }],
		["path", { d: "M9 6.8a6 6 0 0 1 9 5.2v2" }],
	],
	Source: [
		["ellipse", { cx: "12", cy: "5", rx: "9", ry: "3" }],
		["path", { d: "M3 5V19A9 3 0 0 0 21 19V5" }],
		["path", { d: "M3 12A9 3 0 0 0 21 12" }],
	],
	Var: [
		["path", { d: "M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5c0 1.1.9 2 2 2h1" }],
		["path", { d: "M16 21h1a2 2 0 0 0 2-2v-5c0-1.1.9-2 2-2a2 2 0 0 1-2-2V5a2 2 0 0 0-2-2h-1" }],
	],
	// lucide "workflow" — the Nodes group (a prior node's runtime outcome).
	Nodes: [
		["rect", { width: "8", height: "8", x: "3", y: "3", rx: "2" }],
		["path", { d: "M7 11v4a2 2 0 0 0 2 2h4" }],
		["rect", { width: "8", height: "8", x: "13", y: "13", rx: "2" }],
	],
};

/** DOM spec for a pill's group icon (namespaced so ProseMirror emits real SVG). */
function pillIconSpec(group: string) {
	const shapes = PILL_ICON_SHAPES[group] ?? PILL_ICON_SHAPES.Var;
	return [
		`${SVG_NS} svg`,
		{
			viewBox: "0 0 24 24",
			fill: "none",
			stroke: "currentColor",
			"stroke-width": "2",
			"stroke-linecap": "round",
			"stroke-linejoin": "round",
			class: "mr-1 inline-block size-3 align-[-1.5px] text-blue-600 dark:text-blue-400",
			"aria-hidden": "true",
		},
		...shapes.map(([tag, attrs]) => [`${SVG_NS} ${tag}`, attrs] as const),
	] as const;
}

/**
 * A Mention extension for the single-field pill editors: ONLY the `@` variable
 * trigger (no @@ tools / @@@ exits — those belong to the agent prompt editors),
 * and pills render CloseBot-style: group icon + bold "Group" + "." + thin field
 * label. Serialization is byte-identical to the shared extension: a pill IS the
 * `{{id}}` string (tiptapToText → serializeMention), so compile/runtime never
 * see the difference.
 *
 * `getMeta` resolves group/label at RENDER time from the live field catalog, so
 * a token typed before the catalog loaded upgrades its pill once data arrives;
 * unknown tokens render as a generic "Var." pill and round-trip untouched.
 */
export function createVariablePillExtension(sources: VariablePillSources): AnyExtension {
	const suggestions: MentionSuggestion[] = [
		{
			char: MENTION_CHAR_VARIABLE,
			allow: allowMention,
			items: ({ query }) => filterItems(sources.getVariables(), query),
			render: createDropdownRenderer("No fields found"),
		},
	];

	return Mention.configure({
		deleteTriggerWithBackspace: true,
		suggestions,
		renderText: ({ node }) => `{{${String(node.attrs.id ?? "")}}}`,
		renderHTML: ({ node, options }) => {
			const id = String(node.attrs.id ?? "");
			const meta = sources.getMeta(id);
			// Fallback: parse the stored label ("Contact.First Name" style from
			// textToTiptapDoc/prettifyVariable) so pills degrade gracefully when the
			// catalog has no entry for the token.
			const fallback = String(node.attrs.label ?? "") || prettifyVariable(id);
			const dot = fallback.indexOf(".");
			const group = meta?.group ?? (dot > 0 ? fallback.slice(0, dot) : "Var");
			const rest = meta?.label ?? (dot > 0 ? fallback.slice(dot + 1) : fallback || id);
			return [
				"span",
				mergeAttributes(options.HTMLAttributes, {
					class:
						"mx-0.5 inline-block rounded-md border border-blue-500/40 bg-blue-500/10 px-2 py-0.5 font-mono text-xs align-baseline",
				}),
				pillIconSpec(group),
				["span", { class: "font-bold text-blue-600 dark:text-blue-400" }, `${group}.`],
				["span", { class: "font-light" }, rest],
			];
		},
	});
}

/**
 * A unified-source field option → the runtime variable its chip interpolates
 * to: standard fields via the KEY_TO_RUNTIME_VARIABLE table, CUSTOM fields via
 * the shared per-source derivation (dispatch merges their values under the same
 * names — see contact-state.ts customFieldVariables). Undefined = no runtime
 * variable exists for that field, so no chip is offered.
 */
export function fieldRuntimeVariable(field: {
	key: string;
	kind?: string;
	namespace?: string;
}): string | undefined {
	if (field.namespace === "customValue") {
		return customValueVariableName(field.key);
	}
	if (field.kind === "custom") {
		return customFieldVariableName(field.key);
	}
	return KEY_TO_RUNTIME_VARIABLE[field.key];
}

/**
 * Build the variable mention list: the runtime dynamic-variable catalog, plus
 * any unified-source contact/location fields that map to a real runtime
 * variable (standard via the table above, custom via fieldRuntimeVariable),
 * plus names already referenced in the config text. Deduped; searchable
 * by label or key (filterItems matches id/label/sub).
 *
 * `fields` comes from the unified contact-fields source (useContactFieldsQuery).
 */
export function buildVariableItems(
	extraNames: string[],
	fields: { key: string; kind?: string; namespace?: string }[] = [],
	customVariables: { name: string; description?: string }[] = [],
): MentionItem[] {
	const fromFields = fields.map(fieldRuntimeVariable).filter((v): v is string => !!v);
	// Agent-level Job Flow Variables — the user's custom {{name}} definitions.
	// Listed first so they surface at the top of the picker, tagged "Custom." for
	// grouping. Their names are excluded from the standard/field list below so a
	// custom name never appears twice (it also can't collide with a runtime
	// variable — the builder blocks that on save).
	const customNames = new Set(customVariables.map((v) => v.name));
	const customItems: MentionItem[] = customVariables.map((v) => ({
		id: v.name,
		label: `Custom.${v.name}`,
		sub: v.description || `{{${v.name}}}`,
	}));
	const names = [...new Set([...STANDARD_VARIABLES, ...fromFields, ...extraNames])].filter(
		(name) => !customNames.has(name),
	);
	return [
		...customItems,
		...names.map((name) => ({
			id: name,
			label: prettifyVariable(name),
			sub: `{{${name}}}`,
		})),
	];
}

/* ----------------------------------------------------------------------------
 * Nodes group (CloseBot "Nodes" variables, Tier 1 — context-feeding only).
 *
 * Each flow node exposes its runtime outcome as insertable {{variables}} so
 * LATER nodes can reference a prior node's result in prompts / statements /
 * entry messages. The picker renders a pretty `<NodeTitle>.Result` label but
 * inserts an ID-BASED token so renaming a node's title never breaks references.
 *
 * TOKEN CONTRACT — identical to the engine's worker/src/flow/context.ts
 * nodeResultVarName() (its `slugify` is byte-identical to sanitizeExitName here):
 *   node_<slug>_result      objective: captured answer(s); agent/conversation: exit taken
 *   node_<slug>_attempts    caller turns spent at the node
 *   node_<slug>_succeeded   "true" | "false"
 *   where slug = sanitizeExitName(nodeId)
 * -------------------------------------------------------------------------- */

export type NodeResultSuffix = "result" | "attempts" | "succeeded";

const NODE_RESULT_SUFFIX_LABEL: Record<NodeResultSuffix, string> = {
	result: "Result",
	attempts: "Attempts",
	succeeded: "Succeeded",
};

/**
 * Which result sub-entries each canvas node kind exposes. Only kinds that
 * resolve to a REAL runtime value at call time are listed — the engine populates
 * a node's variables when it becomes an agent (plain agent, objective,
 * conversation). Deterministic inline kinds (statement / set_field / router-based
 * true-false & switch / transfer / booking …) produce no natural per-node value,
 * so no dead tokens are offered for them.
 */
const NODE_RESULT_KIND_SUFFIXES: Partial<Record<FlowNodeKind, NodeResultSuffix[]>> = {
	agent: ["result", "attempts", "succeeded"],
	objective: ["result", "attempts", "succeeded"],
	conversation: ["result", "attempts", "succeeded"],
};

/** The engine-matching interpolation token for a node outcome (ID-based, stable). */
export function nodeResultVarName(nodeId: string, suffix: NodeResultSuffix): string {
	return `node_${sanitizeExitName(nodeId)}_${suffix}`;
}

/** A node the current flow contains (canvas ref: id + kind + display title). */
export interface FlowNodeRef {
	id: string;
	kind: FlowNodeKind;
	title: string;
}

/** One picker entry for a node-result token (title + suffix carried separately
 * so both the rail-panel and @-mention label shapes can be built from it). */
export interface NodeResultEntry {
	name: string;
	nodeTitle: string;
	suffixLabel: string;
}

/**
 * Structured node-result entries for the flow's nodes. `excludeNodeId` drops the
 * node currently being edited (a node referencing its own result is a no-op that
 * would only confuse). Kinds with no runtime value are skipped.
 */
export function nodeResultEntries(
	nodes: FlowNodeRef[],
	excludeNodeId?: string | null,
): NodeResultEntry[] {
	const entries: NodeResultEntry[] = [];
	for (const node of nodes) {
		const suffixes = NODE_RESULT_KIND_SUFFIXES[node.kind];
		if (!suffixes) {
			continue;
		}
		if (excludeNodeId && node.id === excludeNodeId) {
			continue;
		}
		const title = node.title.trim() || "Untitled node";
		for (const suffix of suffixes) {
			entries.push({
				name: nodeResultVarName(node.id, suffix),
				nodeTitle: title,
				suffixLabel: NODE_RESULT_SUFFIX_LABEL[suffix],
			});
		}
	}
	return entries;
}

/**
 * Node-result mention items for the agent-prompt editors' @-suggestion list +
 * chip rendering (grouped under "Nodes."). The single-field pill editors instead
 * build a FieldPickerGroup from nodeResultEntries directly (see FieldPicker).
 */
export function buildNodeResultItems(
	nodes: FlowNodeRef[],
	excludeNodeId?: string | null,
): MentionItem[] {
	return nodeResultEntries(nodes, excludeNodeId).map((entry) => ({
		id: entry.name,
		label: `Nodes.${entry.nodeTitle}.${entry.suffixLabel}`,
		sub: `{{${entry.name}}}`,
	}));
}
