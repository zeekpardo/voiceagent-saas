"use client";

import { readCustomVariableDefs } from "@repo/api/modules/voiceagents/lib/custom-variables";
import { cn } from "@repo/ui";
import { Input } from "@repo/ui/components/input";
import type { JSONContent } from "@tiptap/core";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";
import { useContactFieldsQuery } from "@voiceagents/lib/contact-fields-api";
import {
	ChevronDownIcon,
	DatabaseIcon,
	FingerprintIcon,
	type LucideIcon,
	MapPinIcon,
	PlusIcon,
	SearchIcon,
	UserIcon,
	WorkflowIcon,
} from "lucide-react";
import {
	type ComponentProps,
	useCallback,
	useEffect,
	useId,
	useMemo,
	useRef,
	useState,
} from "react";

import { useAgentQuery } from "../../lib/api";
import {
	MENTION_CHAR_VARIABLE,
	prettifyVariable,
	textToTiptapDoc,
	tiptapToText,
} from "./compile/text";
import { useFieldFocus } from "./field-focus-context";
import { useFlowNodes } from "./flow-nodes-context";
import {
	createVariablePillExtension,
	fieldRuntimeVariable,
	type MentionItem,
	nodeResultEntries,
	type VariablePillMeta,
} from "./mentions";

/**
 * CloseBot-style field picker: search + collapsible Contact/Location/Custom
 * Values/Source groups of insertable `{{variable}}` tokens, hosted inside the
 * node editor's "Fields & variables" rail panel (see NodeEditorPanel) rather
 * than a floating popover.
 *
 * Groups:
 *  - Contact — the unified field catalog (standard contact fields AND the
 *    source's resolved CRM custom fields) via useContactFieldsQuery; each entry
 *    maps to the runtime variable its value is dispatched under
 *    (fieldRuntimeVariable — custom fields included since the dispatch merge
 *    exposes them as {{contact_<slug>}}).
 *  - Location — the connected sub-account's own details (name/address/business
 *    profile/current time), also via useContactFieldsQuery (namespace
 *    "location"); resolved by getAccountContext() at dispatch.
 *  - Custom Values — this sub-account's GHL Custom Values (Settings → Custom
 *    Values, location-level key/value settings distinct from contact custom
 *    fields), via useContactFieldsQuery (namespace "customValue"); resolved
 *    the same way, folded into getAccountContext() at dispatch.
 *  - Source — the agent's Job Flow Variables (customVariables), whose values
 *    come from the source page's per-source overrides.
 *
 * The inserted token is the SAME `{{name}}` text the @-mention chips serialize
 * to, so compile/runtime are untouched. The panel is purely additive — the
 * @-trigger keeps working everywhere it already does.
 *
 * Reusable by design: `FieldsPanel` renders the search+groups content and
 * inserts into whichever field was last focused (via FieldFocusContext).
 * `FieldPickerTextarea` / `FieldPickerInput` wrap the shadcn primitives,
 * registering themselves with that context and overlaying a small "+" button
 * that opens the rail panel — attach to any editor field whose compiled
 * output supports {{var}} interpolation.
 */

interface FieldPickerEntry {
	/** Runtime variable name — picking inserts `{{name}}`. */
	name: string;
	/** Thin remainder of the chip, e.g. the field's display label. */
	label: string;
	/** Muted helper (the literal token or the variable's description). */
	sub?: string;
}

interface FieldPickerGroupDef {
	label: string;
	icon: LucideIcon;
	entries: FieldPickerEntry[];
}

/**
 * Data hook shared by the rail panel: the same Contact/Source grouping logic
 * that used to live inline in the floating popover's trigger component.
 */
function useFieldPickerGroups(agentId: string) {
	// Both queries are already warm on the agent page (flow tab / settings), so
	// opening the panel is instant; keyed per agent so custom fields + variables
	// track the agent's connected source.
	const { data: fieldsData, isLoading } = useContactFieldsQuery(agentId);
	const { data: agent } = useAgentQuery(agentId);
	// Live canvas nodes (Nodes group) — empty outside a FlowNodesProvider.
	const { nodes: flowNodes, currentNodeId } = useFlowNodes();

	const groups = useMemo<FieldPickerGroupDef[]>(() => {
		const byNamespace: Record<"contact" | "location" | "customValue", FieldPickerEntry[]> = {
			contact: [],
			location: [],
			customValue: [],
		};
		const seen = new Set<string>();
		for (const field of fieldsData?.fields ?? []) {
			const namespace = field.namespace ?? "contact";
			if (namespace !== "contact" && namespace !== "location" && namespace !== "customValue") {
				continue;
			}
			const name = fieldRuntimeVariable(field);
			if (!name || seen.has(name)) {
				continue;
			}
			seen.add(name);
			byNamespace[namespace].push({ name, label: field.label, sub: `{{${name}}}` });
		}
		const source: FieldPickerEntry[] = readCustomVariableDefs(agent?.config).map((v) => ({
			name: v.name,
			label: v.name,
			sub: v.description || `{{${v.name}}}`,
		}));
		const defs: FieldPickerGroupDef[] = [];
		if (byNamespace.contact.length > 0) {
			defs.push({ label: "Contact", icon: UserIcon, entries: byNamespace.contact });
		}
		if (byNamespace.location.length > 0) {
			defs.push({ label: "Location", icon: MapPinIcon, entries: byNamespace.location });
		}
		if (byNamespace.customValue.length > 0) {
			defs.push({
				label: "Custom Value",
				icon: FingerprintIcon,
				entries: byNamespace.customValue,
			});
		}
		if (source.length > 0) {
			defs.push({ label: "Source", icon: DatabaseIcon, entries: source });
		}
		// Nodes — each prior flow node's runtime outcome (CloseBot "Nodes" Tier 1).
		// The picker shows `<NodeTitle>.Result` but inserts the ID-based token so a
		// title rename never breaks references. Listed last (they resolve at call
		// time, unlike the always-known contact/location fields).
		const nodeEntries = nodeResultEntries(flowNodes, currentNodeId).map((entry) => ({
			name: entry.name,
			label: `${entry.nodeTitle}.${entry.suffixLabel}`,
			sub: `{{${entry.name}}}`,
		}));
		if (nodeEntries.length > 0) {
			defs.push({ label: "Nodes", icon: WorkflowIcon, entries: nodeEntries });
		}
		return defs;
	}, [fieldsData, agent, flowNodes, currentNodeId]);

	return { groups, isLoading };
}

/**
 * The "Fields & variables" rail panel body: search + collapsible Contact /
 * Source groups of chips. Lives inside NodeEditorPanel's secondary aside;
 * inserts into whichever field was last focused via FieldFocusContext.
 */
export function FieldsPanel({ agentId }: { agentId: string }) {
	const [search, setSearch] = useState("");
	const { groups, isLoading } = useFieldPickerGroups(agentId);
	const fieldFocus = useFieldFocus();

	const query = search.trim().toLowerCase();
	const filtered = groups
		.map((group) => ({
			...group,
			entries: query
				? group.entries.filter(
						(entry) =>
							entry.name.toLowerCase().includes(query) ||
							entry.label.toLowerCase().includes(query) ||
							(entry.sub ?? "").toLowerCase().includes(query),
					)
				: group.entries,
		}))
		.filter((group) => group.entries.length > 0);

	// Native non-passive wheel handler so the list scrolls inside the editor
	// Sheet, whose RemoveScroll would otherwise swallow wheel events (same
	// trick as ContactFieldCombobox).
	const scrollRef = useCallback((el: HTMLDivElement | null) => {
		if (!el) {
			return;
		}
		el.addEventListener(
			"wheel",
			(e) => {
				if (el.scrollHeight <= el.clientHeight) {
					return;
				}
				el.scrollTop += e.deltaY;
				e.preventDefault();
				e.stopPropagation();
			},
			{ passive: false },
		);
	}, []);

	const pick = (entry: FieldPickerEntry) => {
		fieldFocus?.insertIntoLastFocused(`{{${entry.name}}}`);
	};

	return (
		<div className="flex h-full flex-col">
			<div className="mb-1.5 relative shrink-0">
				<SearchIcon className="left-2.5 size-3.5 absolute top-1/2 -translate-y-1/2 text-muted-foreground" />
				<Input
					value={search}
					onChange={(e) => setSearch(e.target.value)}
					placeholder="Search fields..."
					className="h-8 pl-8 text-sm"
				/>
			</div>
			<div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
				{isLoading && groups.length === 0 ? (
					<p className="px-2 py-3 text-xs text-center text-muted-foreground">Loading fields…</p>
				) : filtered.length === 0 ? (
					<p className="px-2 py-3 text-xs text-center text-muted-foreground">
						{groups.length ? `No fields match "${search}"` : "No fields available"}
					</p>
				) : (
					filtered.map((group) => (
						<FieldPickerGroup
							key={group.label}
							group={group}
							onPick={pick}
							searchActive={query.length > 0}
						/>
					))
				)}
			</div>
		</div>
	);
}

/** Small "+" affordance overlaid on a field — opens the rail's fields panel. */
function FieldPickerOpenButton({ onOpen, className }: { onOpen: () => void; className?: string }) {
	return (
		<button
			type="button"
			title="Insert a contact field or variable"
			aria-label="Insert a contact field or variable"
			onClick={onOpen}
			className={cn(
				"size-6 flex items-center justify-center rounded-md border bg-background text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
				className,
			)}
		>
			<PlusIcon className="size-3.5" />
		</button>
	);
}

function FieldPickerGroup({
	group,
	onPick,
	searchActive,
}: {
	group: FieldPickerGroupDef;
	onPick: (entry: FieldPickerEntry) => void;
	/** A search query is active — force-reveal this group's (filtered) matches. */
	searchActive: boolean;
}) {
	// Collapsed by default; an active search force-expands matching groups
	// WITHOUT touching the user's toggle state, so clearing the query restores
	// exactly what was open before.
	const [expanded, setExpanded] = useState(false);
	const open = searchActive || expanded;
	const Icon = group.icon;
	return (
		<div className="mb-1">
			<button
				type="button"
				onClick={() => setExpanded((v) => !v)}
				aria-expanded={open}
				className="gap-2 px-2 py-1.5 flex w-full items-center rounded-md text-left hover:bg-muted/60"
			>
				<Icon className="size-3.5 shrink-0 text-muted-foreground" />
				<span className="font-semibold tracking-wide flex-1 text-[11px] text-muted-foreground uppercase">
					{group.label}
				</span>
				<ChevronDownIcon
					className={cn(
						"size-3.5 shrink-0 text-muted-foreground transition-transform",
						!open && "-rotate-90",
					)}
				/>
			</button>
			{open &&
				group.entries.map((entry) => (
					<button
						key={entry.name}
						type="button"
						onClick={() => onPick(entry)}
						className="gap-2 px-2 py-1.5 flex w-full items-center rounded-md text-left hover:bg-muted/60"
					>
						{/* Chip mirrors the @-mention pill styling (mentions.ts chipStyle). */}
						<span className="px-2 py-0.5 font-mono text-xs min-w-0 border-blue-500/40 bg-blue-500/10 truncate rounded-md border">
							<span className="font-bold text-blue-600 dark:text-blue-400">{group.label}.</span>
							<span className="font-light">{entry.label}</span>
						</span>
						{entry.sub && (
							<span className="font-mono ml-auto shrink-0 truncate text-[11px] text-muted-foreground">
								{entry.sub}
							</span>
						)}
					</button>
				))}
		</div>
	);
}

/** Insert `token` into `value` at the element's cursor, restoring focus after. */
function insertAtCursor(
	el: HTMLTextAreaElement | HTMLInputElement | null,
	value: string,
	token: string,
	onValueChange: (next: string) => void,
) {
	const start = el?.selectionStart ?? value.length;
	const end = el?.selectionEnd ?? value.length;
	onValueChange(value.slice(0, start) + token + value.slice(end));
	// Refocus after React commits the new value (the field may have blurred
	// when the rail panel button/chip was clicked).
	requestAnimationFrame(() => {
		if (!el) {
			return;
		}
		el.focus();
		const cursor = start + token.length;
		el.setSelectionRange(cursor, cursor);
	});
}

interface FieldPickerFieldProps {
	agentId: string;
	value: string;
	onValueChange: (next: string) => void;
}

/** Flatten the picker groups into the @-trigger suggestion list. */
function flattenMentionItems(groups: FieldPickerGroupDef[]): MentionItem[] {
	return groups.flatMap((group) =>
		group.entries.map((entry) => ({
			id: entry.name,
			label: `${group.label}.${entry.label}`,
			sub: `{{${entry.name}}}`,
		})),
	);
}

/** Resolve a token name to its picker group + display label (pill copy). */
function lookupPillMeta(groups: FieldPickerGroupDef[], name: string): VariablePillMeta | undefined {
	for (const group of groups) {
		const hit = group.entries.find((entry) => entry.name === name);
		if (hit) {
			return { group: group.label, label: hit.label };
		}
	}
	return undefined;
}

const TOKEN_ONLY_PATTERN = /^\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}$/;

/**
 * Multi-line field whose `{{tokens}}` render as inline pills (icon + bold
 * group + thin field label), CloseBot-style. A TipTap editor under the hood:
 * the STORED value stays the exact `{{token}}` string (textToTiptapDoc on
 * load, tiptapToText on every change — the same round-trip the agent prompt
 * sections use), pills delete as one unit, and `@` triggers the variables
 * suggestion inline. The "+" overlay opens the rail's Fields panel, which
 * inserts a pill at this field's cursor via FieldFocusContext.
 */
export function FieldPickerTextarea({
	agentId,
	value,
	onValueChange,
	className,
	placeholder,
	rows = 3,
	disabled = false,
}: FieldPickerFieldProps & {
	className?: string;
	placeholder?: string;
	rows?: number;
	disabled?: boolean;
}) {
	const id = useId();
	const fieldFocus = useFieldFocus();
	const { groups } = useFieldPickerGroups(agentId);

	// Refs so the once-created extension + registered insert closure always see
	// the latest catalog/handlers without recreating the editor (recreating it
	// would lose focus and cursor position).
	const groupsRef = useRef(groups);
	groupsRef.current = groups;
	const onValueChangeRef = useRef(onValueChange);
	onValueChangeRef.current = onValueChange;
	const fieldFocusRef = useRef(fieldFocus);
	fieldFocusRef.current = fieldFocus;
	// The last text THIS editor emitted — distinguishes our own onUpdate echo
	// from a genuinely external value change (node switch, undo elsewhere).
	const lastEmittedRef = useRef(value);

	const mentionExtension = useMemo(
		() =>
			createVariablePillExtension({
				getVariables: () => flattenMentionItems(groupsRef.current),
				getMeta: (name) => lookupPillMeta(groupsRef.current, name),
			}),
		[],
	);

	const editor = useEditor({
		extensions: [
			StarterKit.configure({
				heading: false,
				codeBlock: false,
				blockquote: false,
				horizontalRule: false,
				link: false,
			}),
			mentionExtension,
		],
		content: textToTiptapDoc(value) as JSONContent,
		editable: !disabled,
		// Next.js App Router: client-only render to avoid hydration mismatches.
		immediatelyRender: false,
		editorProps: {
			attributes: {
				class: cn(
					"px-3 py-2 pr-10 text-sm leading-relaxed [&_p]:my-0 w-full rounded-md border bg-background focus:ring-1 focus:ring-ring focus:outline-none",
					disabled && "cursor-not-allowed opacity-50",
					className,
				),
				style: `min-height: ${rows * 20 + 18}px`,
			},
		},
		onUpdate: ({ editor: instance }) => {
			const text = tiptapToText(instance.getJSON());
			lastEmittedRef.current = text;
			onValueChangeRef.current(text);
		},
		onFocus: () => fieldFocusRef.current?.focus(id),
	});

	const editorRef = useRef(editor);
	editorRef.current = editor;

	// External value change (not our own echo): rehydrate the doc. Covers node
	// switches re-using this mounted editor and programmatic patches.
	useEffect(() => {
		if (!editor || value === lastEmittedRef.current) {
			return;
		}
		lastEmittedRef.current = value;
		editor.commands.setContent(textToTiptapDoc(value) as JSONContent, { emitUpdate: false });
	}, [editor, value]);

	useEffect(() => {
		editor?.setEditable(!disabled);
	}, [editor, disabled]);

	// Rail-panel insertion target: parse the `{{token}}` and insert a PILL (a
	// mention node) at the cursor — not raw text — then a space, mirroring what
	// the @-suggestion command produces.
	useEffect(() => {
		return fieldFocus?.register(id, {
			insert: (token) => {
				const instance = editorRef.current;
				if (!instance) {
					return;
				}
				const match = TOKEN_ONLY_PATTERN.exec(token);
				if (!match) {
					instance.chain().focus().insertContent(token).run();
					return;
				}
				const name = match[1];
				const meta = lookupPillMeta(groupsRef.current, name);
				instance
					.chain()
					.focus()
					.insertContent([
						{
							type: "mention",
							attrs: {
								id: name,
								label: meta ? `${meta.group}.${meta.label}` : prettifyVariable(name),
								mentionSuggestionChar: MENTION_CHAR_VARIABLE,
							},
						},
						{ type: "text", text: " " },
					])
					.run();
			},
		});
	}, [fieldFocus, id]);

	const editorIsEmpty = useEditorState({
		editor,
		selector: ({ editor: instance }) => instance?.isEmpty ?? true,
	});
	// `editor.isEmpty` goes stale after an external hydration (setContent runs
	// with emitUpdate:false, so useEditorState never re-fires) — which left the
	// placeholder overlapping real content until the first click. Gate on the
	// controlled value too so a hydrated non-empty field never shows it.
	const isEmpty = editorIsEmpty && value.trim().length === 0;

	return (
		<div className="relative w-full">
			<EditorContent editor={editor} />
			{isEmpty && placeholder && (
				<p className="px-3 py-2 inset-x-0 top-0 text-sm pointer-events-none absolute truncate text-muted-foreground">
					{placeholder}
				</p>
			)}
			{!disabled && (
				<FieldPickerOpenButton
					onOpen={() => {
						fieldFocus?.focus(id);
						fieldFocus?.openPanel();
					}}
					className="right-1.5 top-1.5 absolute"
				/>
			)}
		</div>
	);
}

/** Input with the "+" field picker overlaid at its right edge. */
export function FieldPickerInput({
	agentId: _agentId,
	value,
	onValueChange,
	className,
	...props
}: FieldPickerFieldProps & Omit<ComponentProps<typeof Input>, "value" | "onChange">) {
	// The shared Input doesn't forward a ref, so grab the element off the wrapper.
	const wrapRef = useRef<HTMLDivElement>(null);
	const id = useId();
	const fieldFocus = useFieldFocus();

	useEffect(() => {
		return fieldFocus?.register(id, {
			insert: (token) =>
				insertAtCursor(
					wrapRef.current?.querySelector("input") ?? null,
					value,
					token,
					onValueChange,
				),
		});
	}, [fieldFocus, id, value, onValueChange]);

	return (
		<div ref={wrapRef} className="relative w-full">
			<Input
				value={value}
				onChange={(e) => onValueChange(e.target.value)}
				onFocus={() => fieldFocus?.focus(id)}
				className={cn("pr-10", className)}
				{...props}
			/>
			<FieldPickerOpenButton
				onOpen={() => {
					fieldFocus?.focus(id);
					fieldFocus?.openPanel();
				}}
				className="right-1.5 absolute top-1/2 -translate-y-1/2"
			/>
		</div>
	);
}
