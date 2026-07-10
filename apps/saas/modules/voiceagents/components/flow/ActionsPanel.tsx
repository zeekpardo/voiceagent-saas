"use client";

import { cn } from "@repo/ui";
import { Input } from "@repo/ui/components/input";
import {
	AngryIcon,
	BotIcon,
	CalendarCheckIcon,
	CornerUpRightIcon,
	FormInputIcon,
	GraduationCapIcon,
	type LucideIcon,
	MessageSquareIcon,
	MessagesSquareIcon,
	PhoneForwardedIcon,
	SearchIcon,
	SplitIcon,
	TagsIcon,
	WorkflowIcon,
} from "lucide-react";
import { useState } from "react";

import type { FlowPaletteKind } from "./flow-types";
import { FLOW_NODE_DRAG_TYPE } from "./flow-types";

interface ActionItem {
	kind: FlowPaletteKind;
	title: string;
	subtitle: string;
	icon: LucideIcon;
	tileClassName: string;
}

interface ActionSection {
	label: string;
	items: ActionItem[];
}

const AGENT_TILE = "bg-gradient-to-br from-blue-500 to-purple-500";
const OBJECTIVE_TILE = "bg-gradient-to-br from-emerald-500 to-teal-500";
const ACTION_TILE = "bg-gradient-to-br from-orange-500 to-amber-500";
const BRANCH_TILE = "bg-gradient-to-br from-pink-500 to-rose-500";
const SCENARIO_TILE = "bg-gradient-to-br from-amber-500 to-orange-500";
const TRANSFER_TILE = "bg-gradient-to-br from-teal-500 to-cyan-500";

const ACTION_SECTIONS: ActionSection[] = [
	{
		label: "General",
		items: [
			{
				kind: "agent",
				title: "Agent",
				subtitle: "Tell it what you want it to do",
				icon: BotIcon,
				tileClassName: AGENT_TILE,
			},
			{
				kind: "objective",
				title: "Objective",
				subtitle: "Gather info from the caller and update fields",
				icon: GraduationCapIcon,
				tileClassName: OBJECTIVE_TILE,
			},
			{
				kind: "conversation",
				title: "Conversation",
				subtitle: "Open-ended chat, then wrap up",
				icon: MessagesSquareIcon,
				tileClassName: OBJECTIVE_TILE,
			},
			{
				kind: "statement",
				title: "Statement",
				subtitle: "Say something, then move on",
				icon: MessageSquareIcon,
				tileClassName: AGENT_TILE,
			},
			{
				kind: "transfer",
				title: "Transfer",
				subtitle: "Hold music, then a different voice takes over",
				icon: PhoneForwardedIcon,
				tileClassName: TRANSFER_TILE,
			},
		],
	},
	{
		label: "Branch",
		items: [
			{
				kind: "truefalse",
				title: "True/False",
				subtitle: "Check the conversation — branch one of two ways",
				icon: SplitIcon,
				tileClassName: BRANCH_TILE,
			},
			{
				kind: "switch",
				title: "Switch",
				subtitle: "Check the conversation — split one of many ways",
				icon: WorkflowIcon,
				tileClassName: BRANCH_TILE,
			},
		],
	},
	{
		label: "Integrations",
		items: [
			{
				kind: "booking",
				title: "Booking",
				subtitle: "Conversationally book an appointment",
				icon: CalendarCheckIcon,
				tileClassName: AGENT_TILE,
			},
			{
				kind: "set_field",
				title: "Set Field",
				subtitle: "Update a CRM field value, then move on",
				icon: FormInputIcon,
				tileClassName: ACTION_TILE,
			},
			{
				kind: "modify_tags",
				title: "Modify Tags",
				subtitle: "Add or remove contact tags, then move on",
				icon: TagsIcon,
				tileClassName: ACTION_TILE,
			},
		],
	},
	{
		label: "Scenarios",
		items: [
			{
				kind: "scenario",
				title: "Custom Scenario",
				subtitle: "Detect something and jump",
				icon: CornerUpRightIcon,
				tileClassName: SCENARIO_TILE,
			},
			{
				kind: "scenario_aggression",
				title: "Aggression Detected",
				subtitle: "The caller is angry, hostile, cursing, or verbally aggressive",
				icon: AngryIcon,
				tileClassName: SCENARIO_TILE,
			},
		],
	},
];

/**
 * The Actions aside: a searchable palette of node types. Click a row to drop
 * the node near the canvas center, or drag it onto the canvas CloseBot-style.
 */
export function ActionsPanel({ onAdd }: { onAdd: (kind: FlowPaletteKind) => void }) {
	const [query, setQuery] = useState("");
	const needle = query.trim().toLowerCase();

	const sections = ACTION_SECTIONS.map((section) => ({
		...section,
		items: section.items.filter(
			(item) =>
				!needle ||
				item.title.toLowerCase().includes(needle) ||
				item.subtitle.toLowerCase().includes(needle),
		),
	})).filter((section) => section.items.length > 0);

	return (
		<div className="flex flex-col gap-5">
			<div className="relative">
				<SearchIcon className="-translate-y-1/2 absolute top-1/2 left-3 size-4 text-muted-foreground" />
				<Input
					value={query}
					onChange={(e) => setQuery(e.target.value)}
					placeholder="Search actions…"
					className="pl-9"
				/>
			</div>

			{sections.length === 0 ? (
				<p className="py-4 text-sm text-muted-foreground">No actions match “{query}”.</p>
			) : (
				sections.map((section) => (
					<div key={section.label} className="flex flex-col gap-1">
						<p className="mb-1 font-medium text-muted-foreground text-xs uppercase tracking-wider">
							{section.label}
						</p>
						{section.items.map((item) => (
							<ActionRow key={item.kind} item={item} onAdd={onAdd} />
						))}
					</div>
				))
			)}
		</div>
	);
}

function ActionRow({ item, onAdd }: { item: ActionItem; onAdd: (kind: FlowPaletteKind) => void }) {
	const Icon = item.icon;
	return (
		<button
			type="button"
			draggable
			onDragStart={(event) => {
				event.dataTransfer.setData(FLOW_NODE_DRAG_TYPE, item.kind);
				event.dataTransfer.effectAllowed = "move";
			}}
			onClick={() => onAdd(item.kind)}
			className="-mx-2 flex cursor-grab items-center gap-3 rounded-lg p-2 text-left transition-colors hover:bg-accent active:cursor-grabbing"
		>
			<span
				className={cn(
					"flex size-10 shrink-0 items-center justify-center rounded-xl text-white shadow-sm",
					item.tileClassName,
				)}
			>
				<Icon className="size-5" />
			</span>
			<span className="min-w-0">
				<span className="block font-medium text-sm">{item.title}</span>
				<span className="block truncate text-muted-foreground text-xs">{item.subtitle}</span>
			</span>
		</button>
	);
}
