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

export const STANDARD_VARIABLES = [
	"contact_first_name",
	"contact_last_name",
	"contact_full_name",
	"contact_email",
	"contact_phone",
	"contact_full_address",
	"contact_tags",
	"location_name",
	"location_address",
	"location_phone",
	"caller_number",
];

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
	return items
		.filter(
			(item) =>
				item.id.toLowerCase().includes(q) ||
				item.label.toLowerCase().includes(q) ||
				(item.sub ?? "").toLowerCase().includes(q),
		)
		.slice(0, 12);
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

/** Build the variable mention list: standard set + names found in existing config text. */
export function buildVariableItems(extraNames: string[]): MentionItem[] {
	const names = [...new Set([...STANDARD_VARIABLES, ...extraNames])];
	return names.map((name) => ({
		id: name,
		label: prettifyVariable(name),
		sub: `{{${name}}}`,
	}));
}
