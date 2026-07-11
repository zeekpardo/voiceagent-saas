"use client";

import { readCustomVariableDefs } from "@repo/api/modules/voiceagents/lib/custom-variables";
import { cn } from "@repo/ui";
import { Input } from "@repo/ui/components/input";
import { Textarea } from "@repo/ui/components/textarea";
import { useContactFieldsQuery } from "@voiceagents/lib/contact-fields-api";
import {
	ChevronDownIcon,
	DatabaseIcon,
	type LucideIcon,
	PlusIcon,
	SearchIcon,
	UserIcon,
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
import { useFieldFocus } from "./field-focus-context";
import { fieldRuntimeVariable } from "./mentions";

/**
 * CloseBot-style field picker: search + collapsible Contact/Source groups of
 * insertable `{{variable}}` tokens, hosted inside the node editor's "Fields &
 * variables" rail panel (see NodeEditorPanel) rather than a floating popover.
 *
 * Groups:
 *  - Contact — the unified field catalog (standard contact fields AND the
 *    source's resolved CRM custom fields) via useContactFieldsQuery; each entry
 *    maps to the runtime variable its value is dispatched under
 *    (fieldRuntimeVariable — custom fields included since the dispatch merge
 *    exposes them as {{contact_<slug>}}).
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

	const groups = useMemo<FieldPickerGroupDef[]>(() => {
		const contact: FieldPickerEntry[] = [];
		const seen = new Set<string>();
		for (const field of fieldsData?.fields ?? []) {
			if ((field.namespace ?? "contact") !== "contact") {
				continue;
			}
			const name = fieldRuntimeVariable(field);
			if (!name || seen.has(name)) {
				continue;
			}
			seen.add(name);
			contact.push({ name, label: field.label, sub: `{{${name}}}` });
		}
		const source: FieldPickerEntry[] = readCustomVariableDefs(agent?.config).map((v) => ({
			name: v.name,
			label: v.name,
			sub: v.description || `{{${v.name}}}`,
		}));
		const defs: FieldPickerGroupDef[] = [];
		if (contact.length > 0) {
			defs.push({ label: "Contact", icon: UserIcon, entries: contact });
		}
		if (source.length > 0) {
			defs.push({ label: "Source", icon: DatabaseIcon, entries: source });
		}
		return defs;
	}, [fieldsData, agent]);

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
						<FieldPickerGroup key={group.label} group={group} onPick={pick} />
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
}: {
	group: FieldPickerGroupDef;
	onPick: (entry: FieldPickerEntry) => void;
}) {
	const [expanded, setExpanded] = useState(true);
	const Icon = group.icon;
	return (
		<div className="mb-1">
			<button
				type="button"
				onClick={() => setExpanded((v) => !v)}
				aria-expanded={expanded}
				className="gap-2 px-2 py-1.5 flex w-full items-center rounded-md text-left hover:bg-muted/60"
			>
				<Icon className="size-3.5 shrink-0 text-muted-foreground" />
				<span className="font-semibold tracking-wide flex-1 text-[11px] text-muted-foreground uppercase">
					{group.label}
				</span>
				<ChevronDownIcon
					className={cn(
						"size-3.5 shrink-0 text-muted-foreground transition-transform",
						!expanded && "-rotate-90",
					)}
				/>
			</button>
			{expanded &&
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

/** Textarea with the "+" field picker overlaid in its top-right corner. */
export function FieldPickerTextarea({
	agentId: _agentId,
	value,
	onValueChange,
	className,
	...props
}: FieldPickerFieldProps & Omit<ComponentProps<typeof Textarea>, "value" | "onChange">) {
	const ref = useRef<HTMLTextAreaElement>(null);
	const id = useId();
	const fieldFocus = useFieldFocus();

	// Re-register on every render so the closure always inserts against the
	// latest `value`/`onValueChange` (list rows re-key by id, not by index).
	useEffect(() => {
		return fieldFocus?.register(id, {
			insert: (token) => insertAtCursor(ref.current, value, token, onValueChange),
		});
	}, [fieldFocus, id, value, onValueChange]);

	return (
		<div className="relative w-full">
			<Textarea
				ref={ref}
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
				className="right-1.5 top-1.5 absolute"
			/>
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
