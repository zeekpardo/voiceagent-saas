import { customFieldVariableName } from "@repo/api/modules/crm/lib/field-mapping";
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
} from "./compile";

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
	"location_name",
	"location_address",
	"location_city",
	"location_state",
	"location_postal_code",
	"location_full_address",
	"location_phone",
	"location_website",
	"location_timezone",
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
	"location.name": "location_name",
	"location.address": "location_address",
	"location.city": "location_city",
	"location.state": "location_state",
	"location.postal_code": "location_postal_code",
	"location.phone": "location_phone",
	"location.website": "location_website",
	"location.timezone": "location_timezone",
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

/**
 * A unified-source field option → the runtime variable its chip interpolates
 * to: standard fields via the KEY_TO_RUNTIME_VARIABLE table, CUSTOM fields via
 * the shared per-source derivation (dispatch merges their values under the same
 * names — see contact-state.ts customFieldVariables). Undefined = no runtime
 * variable exists for that field, so no chip is offered.
 */
export function fieldRuntimeVariable(field: { key: string; kind?: string }): string | undefined {
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
	fields: { key: string; kind?: string }[] = [],
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
