"use client";

import { cn } from "@repo/ui";
import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectLabel,
	SelectTrigger,
	SelectValue,
} from "@repo/ui/components/select";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@repo/ui/components/sheet";
import { Switch } from "@repo/ui/components/switch";
import { Textarea } from "@repo/ui/components/textarea";
import {
	ArrowDownIcon,
	ArrowRightIcon,
	ArrowUpIcon,
	type LucideIcon,
	PlusIcon,
	SearchIcon,
	SettingsIcon,
	Trash2Icon,
	WrenchIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { useAgentCalendarsQuery } from "../../lib/api";
import { MODEL_GROUPS, VOICE_GROUPS } from "../AgentForm";
import { makeId, textToTiptapDoc } from "./compile";
import type {
	AgentNodeData,
	BookingNodeData,
	FlowNodeData,
	FlowNodeKind,
	ModifyTagsNodeData,
	ObjectiveDoc,
	ObjectiveNodeData,
	ScenarioNodeData,
	SetFieldNodeData,
	StatementNodeData,
	SwitchNodeData,
	TransferNodeData,
	TrueFalseNodeData,
} from "./flow-types";
import { OBJECTIVE_OUTPUT_VARIABLES } from "./flow-types";
import { createFlowMentionExtension, type MentionItem } from "./mentions";
import { SectionEditor } from "./SectionEditor";

const INHERIT_MODEL = "__inherit__";
const AGENT_DEFAULT_CALENDAR = "__agent_default__";

export interface FlowToolOption {
	id: string;
	name: string;
	description: string;
}

type AgentSubPanel = "settings" | "tools" | "exits";

const SUB_PANEL_META: Record<AgentSubPanel, { title: string; description: string; icon: LucideIcon }> = {
	settings: {
		title: "Node settings",
		description: "Model override and booking behavior for this stage.",
		icon: SettingsIcon,
	},
	tools: {
		title: "Tools",
		description: "What this node may call while it is active. @@chips check tools automatically.",
		icon: WrenchIcon,
	},
	exits: {
		title: "Exit paths",
		description: "Mention exits in the prompt with @@@ to include them as AI exit choices.",
		icon: ArrowRightIcon,
	},
};

const SHEET_META: Record<FlowNodeKind, { title: string; description: string }> = {
	agent: {
		title: "Edit agent node",
		description:
			"The prompt is the star — type @ for variables, @@ for tools, @@@ for exits. Tools, exits and settings live in the side rail.",
	},
	truefalse: {
		title: "Edit True/False branch",
		description:
			"This node never speaks — the AI checks the conversation against a statement and takes the True or False path.",
	},
	switch: {
		title: "Edit Switch branch",
		description:
			"This node never speaks — the AI checks the conversation against a question and follows the matching case.",
	},
	objective: {
		title: "Edit Objective",
		description:
			"Gather information from the caller, one question at a time. The system verifies each objective as they answer, saves it to the chosen field, and moves on automatically once every objective is met.",
	},
	statement: {
		title: "Edit Statement",
		description:
			"This node speaks its text exactly as written, then the flow continues immediately.",
	},
	scenario: {
		title: "Edit Scenario",
		description:
			"A global detector — checked continuously from every stage. When it matches, the call jumps to the connected node.",
	},
	booking: {
		title: "Edit Booking",
		description:
			"Conversationally book an appointment onto a calendar, then branch on the outcome (booked, or no time worked).",
	},
	set_field: {
		title: "Edit Set Field",
		description:
			"Deterministically write one CRM field, then continue. No conversation — the value is saved silently and the flow moves on.",
	},
	modify_tags: {
		title: "Edit Modify Tags",
		description:
			"Deterministically add or remove contact tags, then continue. No conversation — the tags change silently and the flow moves on.",
	},
	transfer: {
		title: "Edit Transfer",
		description:
			"A simulated warm hand-off: an optional announcement, hold music, then the connected node continues with a new voice.",
	},
};

/**
 * Right-side sheet for editing one flow node. Agent nodes get a CloseBot-style
 * layout: the prompt fills the panel, while tools/exits/settings open as a
 * narrow secondary aside from a mini icon rail on the panel's edge. Branch
 * nodes (True/False, Switch) keep a simple single-column condition editor.
 */
export function NodeEditorPanel({
	agentId,
	nodeId,
	nodeType,
	data,
	isEntry,
	tools,
	bookingToolIds,
	variableItems,
	onChange,
	onDelete,
	onClose,
}: {
	agentId: string;
	nodeId: string | null;
	nodeType: FlowNodeKind | null;
	data: FlowNodeData | null;
	isEntry: boolean;
	tools: FlowToolOption[];
	/** CRM live check_availability / book_appointment tool ids ([] when no CRM). */
	bookingToolIds: string[];
	variableItems: MentionItem[];
	onChange: (nodeId: string, data: FlowNodeData) => void;
	onDelete: (nodeId: string) => void;
	onClose: () => void;
}) {
	// Refs keep the mention extension stable while its suggestion sources stay live.
	const dataRef = useRef(data);
	dataRef.current = data;
	const toolsRef = useRef(tools);
	toolsRef.current = tools;
	const variablesRef = useRef(variableItems);
	variablesRef.current = variableItems;
	const nodeIdRef = useRef(nodeId);
	nodeIdRef.current = nodeId;
	const onChangeRef = useRef(onChange);
	onChangeRef.current = onChange;

	const [subPanel, setSubPanel] = useState<AgentSubPanel | null>(null);
	// Selecting a different node resets the secondary aside.
	// eslint-disable-next-line react-hooks/exhaustive-deps
	useEffect(() => setSubPanel(null), [nodeId]);

	// Enabling a booking tool (via the Tools panel or a @@chip) opens the
	// settings aside so the calendar picker is right there.
	const toolIds = Array.isArray((data as AgentNodeData | null)?.toolIds)
		? (data as AgentNodeData).toolIds
		: [];
	const toolIdsKey = toolIds.join(",");
	const prevToolIdsRef = useRef<{ nodeId: string | null; ids: string[] }>({
		nodeId: null,
		ids: [],
	});
	useEffect(() => {
		const prev = prevToolIdsRef.current;
		if (prev.nodeId === nodeId) {
			const added = toolIds.filter((id) => !prev.ids.includes(id));
			if (added.some((id) => bookingToolIds.includes(id))) {
				setSubPanel("settings");
			}
		}
		prevToolIdsRef.current = { nodeId, ids: toolIds };
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [nodeId, toolIdsKey, bookingToolIds]);

	const mentionExtension = useMemo(
		() =>
			createFlowMentionExtension({
				getVariables: () => variablesRef.current,
				getTools: () =>
					toolsRef.current.map((tool) => ({
						id: tool.name,
						label: tool.name,
						sub: tool.description,
					})),
				getExits: () => {
					const current = dataRef.current;
					const exits = current && Array.isArray(current.exits) ? (current as AgentNodeData).exits : [];
					return exits
						.filter((exit) => exit.name.trim())
						.map((exit) => ({ id: exit.name, label: exit.name, sub: exit.description }));
				},
				onToolInserted: (toolName) => {
					const current = dataRef.current;
					const currentNodeId = nodeIdRef.current;
					const tool = toolsRef.current.find((t) => t.name === toolName);
					if (
						!current ||
						!Array.isArray(current.toolIds) ||
						!currentNodeId ||
						!tool ||
						(current.toolIds as string[]).includes(tool.id)
					) {
						return;
					}
					onChangeRef.current(currentNodeId, {
						...(current as AgentNodeData),
						toolIds: [...(current.toolIds as string[]), tool.id],
					});
				},
			}),
		[],
	);

	if (!nodeId || !nodeType || !data) {
		return null;
	}

	const isAgent = nodeType === "agent";

	const footer = (
		<div className="mt-2 flex justify-between border-t pt-4">
			<Button type="button" variant="destructive" size="sm" onClick={() => onDelete(nodeId)}>
				<Trash2Icon className="size-4" /> Delete node
			</Button>
			<Button type="button" variant="outline" size="sm" onClick={onClose}>
				Done
			</Button>
		</div>
	);

	return (
		<Sheet open onOpenChange={(open) => !open && onClose()}>
			<SheetContent
				// The shared sheet concatenates classes without tailwind-merge, so its
				// default p-6/gap-4/max-w-sm would race ours — force the row layout
				// with important modifiers and pin the width inline.
				className={cn(
					isAgent
						? "flex w-full flex-row !gap-0 overflow-hidden !p-0 transition-[max-width] duration-200"
						: "flex w-full flex-col gap-5 overflow-y-auto",
				)}
				style={{ maxWidth: isAgent ? (subPanel ? 940 : 576) : 576 }}
				onPointerDownOutside={(event) => {
					if ((event.target as HTMLElement | null)?.closest?.("[data-mention-dropdown]")) {
						event.preventDefault();
					}
				}}
				onInteractOutside={(event) => {
					if ((event.target as HTMLElement | null)?.closest?.("[data-mention-dropdown]")) {
						event.preventDefault();
					}
				}}
			>
				{isAgent ? (
					<>
						{/* Mini icon rail — the panel's edge, CloseBot style. */}
						<div className="flex w-12 shrink-0 flex-col items-center border-r bg-muted/40 pt-14">
							{(Object.keys(SUB_PANEL_META) as AgentSubPanel[]).map((key, index) => {
								const meta = SUB_PANEL_META[key];
								const Icon = meta.icon;
								return (
									<div key={key} className="flex w-full flex-col items-center">
										{index > 0 && <div className="h-px w-6 bg-border" />}
										<button
											type="button"
											title={meta.title}
											aria-label={meta.title}
											aria-pressed={subPanel === key}
											onClick={() => setSubPanel((current) => (current === key ? null : key))}
											className={cn(
												"flex w-full items-center justify-center p-2.5 transition-colors",
												subPanel === key
													? "bg-background text-primary"
													: "text-muted-foreground hover:bg-muted hover:text-foreground",
											)}
										>
											<Icon className="size-5" />
										</button>
									</div>
								);
							})}
						</div>

						{/* Secondary aside — one concern at a time. */}
						{subPanel && (
							<div className="flex w-80 shrink-0 flex-col overflow-hidden border-r">
								<div className="shrink-0 border-b px-4 pt-5 pb-3">
									<h3 className="font-semibold text-base">{SUB_PANEL_META[subPanel].title}</h3>
									<p className="mt-0.5 line-clamp-2 text-muted-foreground text-xs">
										{SUB_PANEL_META[subPanel].description}
									</p>
								</div>
								<div className="min-h-0 flex-1 overflow-y-auto p-4">
									{subPanel === "settings" && (
										<AgentSettingsPanel
											agentId={agentId}
											nodeId={nodeId}
											data={data as AgentNodeData}
											bookingToolIds={bookingToolIds}
											onChange={onChange}
										/>
									)}
									{subPanel === "tools" && (
										<AgentToolsPanel
											nodeId={nodeId}
											data={data as AgentNodeData}
											tools={tools}
											onChange={onChange}
										/>
									)}
									{subPanel === "exits" && (
										<AgentExitsPanel
											nodeId={nodeId}
											data={data as AgentNodeData}
											onChange={onChange}
										/>
									)}
								</div>
							</div>
						)}

						{/* Main column — the prompt is the focus. */}
						<div className="flex min-w-0 flex-1 flex-col gap-5 overflow-y-auto p-5">
							<SheetHeader className="p-0">
								<SheetTitle>{SHEET_META.agent.title}</SheetTitle>
								<SheetDescription>{SHEET_META.agent.description}</SheetDescription>
							</SheetHeader>
							<AgentPromptEditor
								nodeId={nodeId}
								data={data as AgentNodeData}
								isEntry={isEntry}
								mentionExtension={mentionExtension}
								onChange={onChange}
							/>
							{footer}
						</div>
					</>
				) : (
					<>
						<SheetHeader>
							<SheetTitle>{SHEET_META[nodeType].title}</SheetTitle>
							<SheetDescription>{SHEET_META[nodeType].description}</SheetDescription>
						</SheetHeader>
						{nodeType === "truefalse" && (
							<TrueFalseNodeEditor nodeId={nodeId} data={data as TrueFalseNodeData} onChange={onChange} />
						)}
						{nodeType === "switch" && (
							<SwitchNodeEditor nodeId={nodeId} data={data as SwitchNodeData} onChange={onChange} />
						)}
						{nodeType === "objective" && (
							<ObjectiveNodeEditor
								nodeId={nodeId}
								data={data as ObjectiveNodeData}
								isEntry={isEntry}
								onChange={onChange}
							/>
						)}
						{nodeType === "statement" && (
							<StatementNodeEditor
								nodeId={nodeId}
								data={data as StatementNodeData}
								onChange={onChange}
							/>
						)}
						{nodeType === "scenario" && (
							<ScenarioNodeEditor nodeId={nodeId} data={data as ScenarioNodeData} onChange={onChange} />
						)}
						{nodeType === "booking" && (
							<BookingNodeEditor
								agentId={agentId}
								nodeId={nodeId}
								data={data as BookingNodeData}
								onChange={onChange}
							/>
						)}
						{nodeType === "set_field" && (
							<SetFieldNodeEditor nodeId={nodeId} data={data as SetFieldNodeData} onChange={onChange} />
						)}
						{nodeType === "modify_tags" && (
							<ModifyTagsNodeEditor
								nodeId={nodeId}
								data={data as ModifyTagsNodeData}
								onChange={onChange}
							/>
						)}
						{nodeType === "transfer" && (
							<TransferNodeEditor nodeId={nodeId} data={data as TransferNodeData} onChange={onChange} />
						)}
						{footer}
					</>
				)}
			</SheetContent>
		</Sheet>
	);
}

/** The main column: title, prompt sections and entry message — nothing else. */
function AgentPromptEditor({
	nodeId,
	data,
	isEntry,
	mentionExtension,
	onChange,
}: {
	nodeId: string;
	data: AgentNodeData;
	isEntry: boolean;
	mentionExtension: ReturnType<typeof createFlowMentionExtension>;
	onChange: (nodeId: string, data: FlowNodeData) => void;
}) {
	const patch = (partial: Partial<AgentNodeData>) => onChange(nodeId, { ...data, ...partial });

	const moveSection = (index: number, delta: number) => {
		const next = [...data.sections];
		const target = index + delta;
		if (target < 0 || target >= next.length) {
			return;
		}
		[next[index], next[target]] = [next[target], next[index]];
		patch({ sections: next });
	};

	return (
		<>
			<p className="text-muted-foreground text-sm">
				Stages inherit the Job information (identity, business info, rules) — write only this
				stage's task here.
			</p>

			<div className="flex flex-col gap-1.5">
				<Label>Title</Label>
				<Input
					value={data.title}
					onChange={(e) => patch({ title: e.target.value })}
					placeholder="Qualify the lead"
				/>
			</div>

			<div className="flex flex-col gap-3">
				<Label>Prompt sections</Label>
				{data.sections.map((section, index) => (
					<div key={section.id} className="flex flex-col gap-2 rounded-lg border p-3">
						<div className="flex items-center gap-2">
							<Input
								value={section.title ?? ""}
								onChange={(e) =>
									patch({
										sections: data.sections.map((s) =>
											s.id === section.id ? { ...s, title: e.target.value || undefined } : s,
										),
									})
								}
								placeholder="Section title (optional)"
								className="h-8 text-sm"
							/>
							<Button
								type="button"
								variant="ghost"
								size="icon"
								className="shrink-0"
								disabled={index === 0}
								onClick={() => moveSection(index, -1)}
							>
								<ArrowUpIcon className="size-4" />
							</Button>
							<Button
								type="button"
								variant="ghost"
								size="icon"
								className="shrink-0"
								disabled={index === data.sections.length - 1}
								onClick={() => moveSection(index, 1)}
							>
								<ArrowDownIcon className="size-4" />
							</Button>
							<Button
								type="button"
								variant="ghost"
								size="icon"
								className="shrink-0"
								disabled={data.sections.length === 1}
								onClick={() =>
									patch({ sections: data.sections.filter((s) => s.id !== section.id) })
								}
							>
								<Trash2Icon className="size-4" />
							</Button>
						</div>
						<SectionEditor
							key={`${nodeId}:${section.id}`}
							initialBody={section.body}
							mentionExtension={mentionExtension}
							onBodyChange={(body) =>
								patch({
									sections: data.sections.map((s) => (s.id === section.id ? { ...s, body } : s)),
								})
							}
						/>
					</div>
				))}
				<Button
					type="button"
					variant="outline"
					size="sm"
					className="self-start"
					onClick={() =>
						patch({
							sections: [...data.sections, { id: makeId("sec"), body: textToTiptapDoc("") }],
						})
					}
				>
					<PlusIcon className="size-4" /> Add section
				</Button>
			</div>

			<div className="flex flex-col gap-1.5">
				<Label className={isEntry ? "opacity-50" : ""}>Entry message</Label>
				<Textarea
					rows={2}
					disabled={isEntry}
					value={data.entryMessage}
					onChange={(e) => patch({ entryMessage: e.target.value })}
					placeholder="Spoken direction when the call moves onto this node"
				/>
				<p className="text-xs opacity-50">
					{isEntry
						? "This is the entry node — the agent's greeting covers the opening, so the entry message is ignored here."
						: "Generated when this node becomes active, e.g. “Let the caller know you're checking the calendar.”"}
				</p>
			</div>
		</>
	);
}

/** Rail panel: which tools this node may call — searchable, with a count footer. */
function AgentToolsPanel({
	nodeId,
	data,
	tools,
	onChange,
}: {
	nodeId: string;
	data: AgentNodeData;
	tools: FlowToolOption[];
	onChange: (nodeId: string, data: FlowNodeData) => void;
}) {
	const patch = (partial: Partial<AgentNodeData>) => onChange(nodeId, { ...data, ...partial });
	const [search, setSearch] = useState("");

	const query = search.trim().toLowerCase();
	const filtered = tools.filter(
		(tool) =>
			!query ||
			tool.name.toLowerCase().includes(query) ||
			tool.description.toLowerCase().includes(query),
	);
	const enabledCount = tools.filter((tool) => data.toolIds.includes(tool.id)).length;

	return (
		<div className="flex h-full flex-col gap-3">
			<div className="relative">
				<SearchIcon className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
				<Input
					value={search}
					onChange={(e) => setSearch(e.target.value)}
					placeholder="Search tools..."
					className="h-8 pl-8 text-sm"
				/>
			</div>
			{tools.length === 0 ? (
				<p className="py-2 text-sm opacity-50">No tools registered yet.</p>
			) : filtered.length === 0 ? (
				<p className="py-2 text-sm opacity-50">No tools match "{search}"</p>
			) : (
				<div className="flex flex-col gap-1.5">
					{filtered.map((tool) => {
						const checked = data.toolIds.includes(tool.id);
						return (
							<div key={tool.id} className="flex items-center gap-3 rounded-lg border p-2.5">
								<Switch
									id={`flow-tool-${tool.id}`}
									checked={checked}
									onCheckedChange={(on) =>
										patch({
											toolIds: on
												? [...data.toolIds, tool.id]
												: data.toolIds.filter((id) => id !== tool.id),
										})
									}
								/>
								<label htmlFor={`flow-tool-${tool.id}`} className="min-w-0 cursor-pointer">
									<span className="block truncate font-mono text-sm">{tool.name}</span>
									<span className="block truncate text-xs opacity-60">{tool.description}</span>
								</label>
							</div>
						);
					})}
				</div>
			)}
			<p className="mt-auto border-t pt-2 text-muted-foreground text-xs">
				{enabledCount} of {tools.length} enabled
			</p>
		</div>
	);
}

/** Rail panel: the ways a conversation leaves this node. */
function AgentExitsPanel({
	nodeId,
	data,
	onChange,
}: {
	nodeId: string;
	data: AgentNodeData;
	onChange: (nodeId: string, data: FlowNodeData) => void;
}) {
	const patch = (partial: Partial<AgentNodeData>) => onChange(nodeId, { ...data, ...partial });

	return (
		<div className="flex flex-col gap-3">
			<Button
				type="button"
				variant="outline"
				size="sm"
				className="w-full"
				onClick={() =>
					patch({ exits: [...data.exits, { id: makeId("exit"), name: "", description: "" }] })
				}
			>
				<PlusIcon className="size-4" /> Add exit
			</Button>
			<p className="text-muted-foreground text-xs">
				Wire an exit on the canvas to send the call to another node; leave it unwired to end the
				call.
			</p>
			{data.exits.map((exit) => (
				<div key={exit.id} className="flex flex-col gap-2 rounded-lg border p-2.5">
					<div className="flex items-center gap-2">
						<Input
							value={exit.name}
							onChange={(e) =>
								patch({
									exits: data.exits.map((x) =>
										x.id === exit.id ? { ...x, name: e.target.value } : x,
									),
								})
							}
							placeholder="qualified"
							className="h-8 font-mono text-sm"
						/>
						<Button
							type="button"
							variant="ghost"
							size="icon"
							className="size-8 shrink-0"
							aria-label={`Remove exit ${exit.name || "unnamed"}`}
							onClick={() => patch({ exits: data.exits.filter((x) => x.id !== exit.id) })}
						>
							<Trash2Icon className="size-4" />
						</Button>
					</div>
					<Textarea
						rows={2}
						value={exit.description}
						onChange={(e) =>
							patch({
								exits: data.exits.map((x) =>
									x.id === exit.id ? { ...x, description: e.target.value } : x,
								),
							})
						}
						placeholder="When to take this exit, e.g. the caller wants to book"
						className="text-sm"
					/>
				</div>
			))}
		</div>
	);
}

/** Rail panel: model override + booking behavior. */
function AgentSettingsPanel({
	agentId,
	nodeId,
	data,
	bookingToolIds,
	onChange,
}: {
	agentId: string;
	nodeId: string;
	data: AgentNodeData;
	bookingToolIds: string[];
	onChange: (nodeId: string, data: FlowNodeData) => void;
}) {
	const patch = (partial: Partial<AgentNodeData>) => onChange(nodeId, { ...data, ...partial });

	// The Booking calendar pin only applies while a booking tool is gated onto
	// this node — fetch the calendar list only then.
	const hasBookingTool = data.toolIds.some((id) => bookingToolIds.includes(id));
	const { data: crmCalendars } = useAgentCalendarsQuery(agentId, hasBookingTool);

	return (
		<div className="flex flex-col gap-5">
			<div className="flex flex-col gap-1.5">
				<Label>Model override</Label>
				<Select
					value={data.model ?? INHERIT_MODEL}
					onValueChange={(value) => patch({ model: value === INHERIT_MODEL ? undefined : value })}
				>
					<SelectTrigger>
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value={INHERIT_MODEL}>Agent default</SelectItem>
						{MODEL_GROUPS.map((group) => (
							<SelectGroup key={group.label}>
								<SelectLabel>{group.label}</SelectLabel>
								{group.models.map((model) => (
									<SelectItem key={model.id} value={model.id}>
										{model.label}
									</SelectItem>
								))}
							</SelectGroup>
						))}
					</SelectContent>
				</Select>
				<p className="text-xs opacity-50">A different brain for just this stage.</p>
			</div>

			{hasBookingTool ? (
				<div className="flex flex-col gap-4">
					<Label>Booking</Label>
					<div className="-mt-2.5 flex flex-col gap-1.5">
						<Label className="text-xs opacity-70">Calendar</Label>
						{crmCalendars && crmCalendars.length === 0 ? (
							<p className="text-sm opacity-50">
								No calendars visible. Enable calendar scopes on your GHL marketplace app
								(calendars.readonly, calendars/events.readonly, calendars/events.write) and
								reconnect.
							</p>
						) : (
							<>
								<Select
									value={data.calendarName ?? AGENT_DEFAULT_CALENDAR}
									onValueChange={(value) =>
										patch({ calendarName: value === AGENT_DEFAULT_CALENDAR ? undefined : value })
									}
								>
									<SelectTrigger>
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value={AGENT_DEFAULT_CALENDAR}>Use agent default</SelectItem>
										{data.calendarName &&
											!crmCalendars?.some((calendar) => calendar.name === data.calendarName) && (
												<SelectItem value={data.calendarName}>{data.calendarName}</SelectItem>
											)}
										{crmCalendars?.map((calendar) => (
											<SelectItem key={calendar.id} value={calendar.name}>
												{calendar.name}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
								<p className="text-xs opacity-50">
									Overrides the agent's default booking calendar for this node only.
								</p>
							</>
						)}
					</div>
					<div className="flex flex-col gap-1.5">
						<Label className="text-xs opacity-70">Appointment title</Label>
						<Input
							value={data.appointmentTitle ?? ""}
							onChange={(e) => patch({ appointmentTitle: e.target.value || undefined })}
							placeholder="Intro call with {{contact_first_name}}"
						/>
						<p className="text-xs opacity-50">Used as the booked appointment's title.</p>
					</div>
					<div className="flex flex-col gap-1.5">
						<Label className="text-xs opacity-70">Tag if booking fails</Label>
						<Input
							value={data.failedBookingTag ?? ""}
							onChange={(e) => patch({ failedBookingTag: e.target.value || undefined })}
							placeholder="booking-failed"
						/>
						<p className="text-xs opacity-50">
							Applied with add_tag when no slot works or booking fails (requires the add_tag tool
							on this node).
						</p>
					</div>
				</div>
			) : (
				<p className="text-muted-foreground text-xs">
					Booking options appear here when a booking tool (check_availability / book_appointment)
					is enabled on this node.
				</p>
			)}
		</div>
	);
}

function TrueFalseNodeEditor({
	nodeId,
	data,
	onChange,
}: {
	nodeId: string;
	data: TrueFalseNodeData;
	onChange: (nodeId: string, data: FlowNodeData) => void;
}) {
	const patch = (partial: Partial<TrueFalseNodeData>) => onChange(nodeId, { ...data, ...partial });

	return (
		<>
			<div className="flex flex-col gap-1.5">
				<Label>Title</Label>
				<Input
					value={data.title}
					onChange={(e) => patch({ title: e.target.value })}
					placeholder="Speaks English?"
				/>
			</div>

			<div className="flex flex-col gap-1.5">
				<Label>Statement to evaluate</Label>
				<Textarea
					rows={3}
					value={data.condition}
					onChange={(e) => patch({ condition: e.target.value })}
					placeholder="The caller has confirmed they speak English"
				/>
				<p className="text-xs opacity-50">
					Written as a statement — the AI reads the conversation and marks it true or false, e.g.
					“The caller has confirmed they speak English.” Wire the True and False handles on the
					canvas; an unwired path ends the call.
				</p>
			</div>
		</>
	);
}

const OBJECTIVE_CUSTOM_FIELD = "__custom__";
const OBJECTIVE_NO_FIELD = "__none__";

function ObjectiveNodeEditor({
	nodeId,
	data,
	isEntry,
	onChange,
}: {
	nodeId: string;
	data: ObjectiveNodeData;
	isEntry: boolean;
	onChange: (nodeId: string, data: FlowNodeData) => void;
}) {
	const patch = (partial: Partial<ObjectiveNodeData>) => onChange(nodeId, { ...data, ...partial });
	const patchObjective = (id: string, partial: Partial<ObjectiveDoc>) =>
		patch({
			objectives: data.objectives.map((o) => (o.id === id ? { ...o, ...partial } : o)),
		});
	const knownField = (field: string) => OBJECTIVE_OUTPUT_VARIABLES.some((v) => v.field === field);

	return (
		<>
			<div className="flex flex-col gap-1.5">
				<Label>Title</Label>
				<Input
					value={data.title}
					onChange={(e) => patch({ title: e.target.value })}
					placeholder="Confirm Contact Info"
				/>
			</div>

			<div className="flex flex-col gap-3">
				<Label>Objectives</Label>
				{data.objectives.map((objective, index) => {
					const isComposite = OBJECTIVE_OUTPUT_VARIABLES.find(
						(v) => v.field === objective.field,
					)?.composite;
					const selectValue = objective.field
						? knownField(objective.field)
							? objective.field
							: OBJECTIVE_CUSTOM_FIELD
						: OBJECTIVE_NO_FIELD;
					return (
						<div
							key={objective.id}
							className="flex flex-col gap-3 rounded-lg border bg-muted/30 p-3"
						>
							<div className="flex items-center justify-between">
								<span className="font-medium text-xs opacity-60">Objective {index + 1}</span>
								{data.objectives.length > 1 && (
									<button
										type="button"
										aria-label="Remove objective"
										onClick={() =>
											patch({ objectives: data.objectives.filter((o) => o.id !== objective.id) })
										}
										className="text-muted-foreground hover:text-destructive"
									>
										<Trash2Icon className="size-4" />
									</button>
								)}
							</div>

							<div className="flex flex-col gap-1.5">
								<Label className="text-xs">Output variable</Label>
								<Select
									value={selectValue}
									onValueChange={(value) => {
										if (value === OBJECTIVE_NO_FIELD) patchObjective(objective.id, { field: "" });
										else if (value === OBJECTIVE_CUSTOM_FIELD)
											patchObjective(objective.id, {
												field: knownField(objective.field) ? "" : objective.field,
											});
										else patchObjective(objective.id, { field: value });
									}}
								>
									<SelectTrigger className="h-9">
										<SelectValue placeholder="Where to save it" />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value={OBJECTIVE_NO_FIELD}>Don't save (gather only)</SelectItem>
										<SelectGroup>
											<SelectLabel>Standard fields</SelectLabel>
											{OBJECTIVE_OUTPUT_VARIABLES.map((v) => (
												<SelectItem key={v.field} value={v.field}>
													{v.label}
													{v.composite ? " — fills all parts" : ""}
												</SelectItem>
											))}
										</SelectGroup>
										<SelectItem value={OBJECTIVE_CUSTOM_FIELD}>Custom field…</SelectItem>
									</SelectContent>
								</Select>
								{selectValue === OBJECTIVE_CUSTOM_FIELD && (
									<Input
										className="mt-1 h-9"
										value={objective.field}
										onChange={(e) => patchObjective(objective.id, { field: e.target.value })}
										placeholder="Exact CRM field name, e.g. Reason for Selling"
									/>
								)}
								{isComposite && (
									<p className="text-xs opacity-50">
										One objective fills every part (street, city, state, zip / first &amp; last name)
										from what the caller says.
									</p>
								)}
							</div>

							<div className="flex flex-col gap-1.5">
								<Label className="text-xs">Short description</Label>
								<Textarea
									rows={2}
									value={objective.description}
									onChange={(e) => patchObjective(objective.id, { description: e.target.value })}
									placeholder="the caller's full property address"
								/>
								<p className="text-xs opacity-50">
									Describe what to <em>find out</em> — "the caller's full address", not "ask for the
									address".
								</p>
							</div>

							<details className="text-xs">
								<summary className="cursor-pointer text-primary">Advanced</summary>
								<div className="mt-2 flex flex-col gap-3">
									<div className="flex flex-col gap-1.5">
										<Label className="text-xs">
											Sensitivity {objective.sensitivity ?? 90} / 100
										</Label>
										<input
											type="range"
											min={10}
											max={100}
											step={5}
											value={objective.sensitivity ?? 90}
											onChange={(e) =>
												patchObjective(objective.id, { sensitivity: Number(e.target.value) })
											}
											className="w-full accent-primary"
										/>
										<p className="opacity-50">
											Higher = stricter before the objective counts as met.
										</p>
									</div>
									<div className="flex flex-col gap-1.5">
										<Label className="text-xs">Max attempts</Label>
										<Input
											type="number"
											min={1}
											max={10}
											className="h-9"
											value={objective.maxAttempts ?? ""}
											onChange={(e) =>
												patchObjective(objective.id, {
													maxAttempts: e.target.value ? Number(e.target.value) : undefined,
												})
											}
											placeholder="Keep trying (default)"
										/>
										<p className="opacity-50">
											Give up and move on after this many caller turns. Leave blank to always wait.
										</p>
									</div>
								</div>
							</details>
						</div>
					);
				})}
				<button
					type="button"
					onClick={() =>
						patch({
							objectives: [
								...data.objectives,
								{ id: makeId("obj"), title: "", description: "", field: "" },
							],
						})
					}
					className="flex items-center gap-2 text-primary text-sm"
				>
					<PlusIcon className="size-4" /> Add objective
				</button>
			</div>

			<div className="flex flex-col gap-1.5">
				<Label className={isEntry ? "opacity-50" : ""}>Entry message</Label>
				<Textarea
					rows={2}
					disabled={isEntry}
					value={data.entryMessage}
					onChange={(e) => patch({ entryMessage: e.target.value })}
					placeholder="Move naturally into collecting these details."
				/>
				<p className="text-xs opacity-50">
					{isEntry
						? "The greeting opens the entry node, so this is ignored here."
						: "Spoken when the flow reaches this node, before the first objective question."}
				</p>
			</div>
		</>
	);
}

function BookingNodeEditor({
	agentId,
	nodeId,
	data,
	onChange,
}: {
	agentId: string;
	nodeId: string;
	data: BookingNodeData;
	onChange: (nodeId: string, data: FlowNodeData) => void;
}) {
	const patch = (partial: Partial<BookingNodeData>) => onChange(nodeId, { ...data, ...partial });
	const { data: crmCalendars } = useAgentCalendarsQuery(agentId, true);
	const [showAdvanced, setShowAdvanced] = useState(
		!!(data.extraPrompt || data.appointmentTitle || data.failedBookingTag),
	);

	return (
		<>
			<div className="flex flex-col gap-1.5">
				<Label>Calendar</Label>
				{crmCalendars && crmCalendars.length === 0 ? (
					<p className="text-sm opacity-50">
						No calendars visible. Enable calendar scopes on your GHL marketplace app and reconnect.
					</p>
				) : (
					<Select
						value={data.calendarName || AGENT_DEFAULT_CALENDAR}
						onValueChange={(value) =>
							patch({ calendarName: value === AGENT_DEFAULT_CALENDAR ? "" : value })
						}
					>
						<SelectTrigger className="h-9">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value={AGENT_DEFAULT_CALENDAR}>Use agent default</SelectItem>
							{data.calendarName &&
								!crmCalendars?.some((c) => c.name === data.calendarName) && (
									<SelectItem value={data.calendarName}>{data.calendarName}</SelectItem>
								)}
							{crmCalendars?.map((c) => (
								<SelectItem key={c.id} value={c.name}>
									{c.name}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				)}
			</div>

			<div className="flex flex-col gap-1.5">
				<Label>Title</Label>
				<Input
					value={data.title}
					onChange={(e) => patch({ title: e.target.value })}
					placeholder="Booking"
				/>
			</div>

			<div className="flex flex-col gap-1.5">
				<Label>Short description</Label>
				<Textarea
					rows={2}
					value={data.description}
					onChange={(e) => patch({ description: e.target.value })}
					placeholder="Book a 30 minute appointment with the contact."
				/>
				<p className="text-xs opacity-50">
					What the agent should book. It offers times, confirms, and books automatically.
				</p>
			</div>

			<div className="flex flex-col gap-2">
				<button
					type="button"
					onClick={() => setShowAdvanced((v) => !v)}
					className="flex w-fit items-center gap-1 text-primary text-sm"
				>
					Advanced settings
				</button>
				{showAdvanced && (
					<div className="flex flex-col gap-3 rounded-lg border bg-muted/30 p-3">
						<div className="flex flex-col gap-1.5">
							<Label className="text-xs">Extra prompt</Label>
							<Textarea
								rows={2}
								value={data.extraPrompt}
								onChange={(e) => patch({ extraPrompt: e.target.value })}
								placeholder="Extra context used only while booking."
							/>
						</div>
						<div className="flex flex-col gap-1.5">
							<Label className="text-xs">Appointment title</Label>
							<Input
								className="h-9"
								value={data.appointmentTitle}
								onChange={(e) => patch({ appointmentTitle: e.target.value })}
								placeholder="Intro call with {{contact_first_name}}"
							/>
						</div>
						<div className="flex flex-col gap-1.5">
							<Label className="text-xs">Tag if booking fails</Label>
							<Input
								className="h-9"
								value={data.failedBookingTag}
								onChange={(e) => patch({ failedBookingTag: e.target.value })}
								placeholder="booking-failed"
							/>
						</div>
					</div>
				)}
			</div>
		</>
	);
}

function SetFieldNodeEditor({
	nodeId,
	data,
	onChange,
}: {
	nodeId: string;
	data: SetFieldNodeData;
	onChange: (nodeId: string, data: FlowNodeData) => void;
}) {
	const patch = (partial: Partial<SetFieldNodeData>) => onChange(nodeId, { ...data, ...partial });
	const knownField = OBJECTIVE_OUTPUT_VARIABLES.some((v) => v.field === data.field);
	const selectValue = data.field ? (knownField ? data.field : OBJECTIVE_CUSTOM_FIELD) : "";

	return (
		<>
			<div className="flex flex-col gap-1.5">
				<Label>Title</Label>
				<Input
					value={data.title}
					onChange={(e) => patch({ title: e.target.value })}
					placeholder="Mark as qualified"
				/>
			</div>

			<div className="flex flex-col gap-1.5">
				<Label>Field</Label>
				<Select
					value={selectValue}
					onValueChange={(value) =>
						patch({ field: value === OBJECTIVE_CUSTOM_FIELD ? (knownField ? "" : data.field) : value })
					}
				>
					<SelectTrigger className="h-9">
						<SelectValue placeholder="Which field to set" />
					</SelectTrigger>
					<SelectContent>
						<SelectGroup>
							<SelectLabel>Standard fields</SelectLabel>
							{OBJECTIVE_OUTPUT_VARIABLES.map((v) => (
								<SelectItem key={v.field} value={v.field}>
									{v.label}
								</SelectItem>
							))}
						</SelectGroup>
						<SelectItem value={OBJECTIVE_CUSTOM_FIELD}>Custom field…</SelectItem>
					</SelectContent>
				</Select>
				{selectValue === OBJECTIVE_CUSTOM_FIELD && (
					<Input
						className="mt-1 h-9"
						value={data.field}
						onChange={(e) => patch({ field: e.target.value })}
						placeholder="Exact CRM field name, e.g. Lead Type"
					/>
				)}
			</div>

			<div className="flex flex-col gap-1.5">
				<Label>Value</Label>
				<Textarea
					rows={2}
					value={data.value}
					onChange={(e) => patch({ value: e.target.value })}
					placeholder="Seller"
				/>
				<p className="text-xs opacity-50">
					Written exactly as typed — supports {"{{variables}}"}. Saved silently, then the flow
					continues.
				</p>
			</div>
		</>
	);
}

function ModifyTagsNodeEditor({
	nodeId,
	data,
	onChange,
}: {
	nodeId: string;
	data: ModifyTagsNodeData;
	onChange: (nodeId: string, data: FlowNodeData) => void;
}) {
	const patch = (partial: Partial<ModifyTagsNodeData>) => onChange(nodeId, { ...data, ...partial });
	const toList = (raw: string) =>
		raw
			.split(",")
			.map((t) => t.trim())
			.filter(Boolean);

	return (
		<>
			<div className="flex flex-col gap-1.5">
				<Label>Title</Label>
				<Input
					value={data.title}
					onChange={(e) => patch({ title: e.target.value })}
					placeholder="Tag as hot lead"
				/>
			</div>

			<div className="flex flex-col gap-1.5">
				<Label>Add tags</Label>
				<Input
					value={data.addTags.join(", ")}
					onChange={(e) => patch({ addTags: toList(e.target.value) })}
					placeholder="hot seller, qualified"
				/>
				<p className="text-xs opacity-50">Comma-separated. Added to the contact silently.</p>
			</div>

			<div className="flex flex-col gap-1.5">
				<Label>Remove tags</Label>
				<Input
					value={data.removeTags.join(", ")}
					onChange={(e) => patch({ removeTags: toList(e.target.value) })}
					placeholder="cold, unqualified"
				/>
				<p className="text-xs opacity-50">
					Comma-separated. Tag removal isn't wired to the CRM yet — adds work today.
				</p>
			</div>
		</>
	);
}

function StatementNodeEditor({
	nodeId,
	data,
	onChange,
}: {
	nodeId: string;
	data: StatementNodeData;
	onChange: (nodeId: string, data: FlowNodeData) => void;
}) {
	const patch = (partial: Partial<StatementNodeData>) => onChange(nodeId, { ...data, ...partial });

	return (
		<>
			<div className="flex flex-col gap-1.5">
				<Label>Title</Label>
				<Input
					value={data.title}
					onChange={(e) => patch({ title: e.target.value })}
					placeholder="Transfer notice"
				/>
			</div>

			<div className="flex flex-col gap-1.5">
				<Label>What to say</Label>
				<Textarea
					rows={4}
					value={data.say}
					onChange={(e) => patch({ say: e.target.value })}
					placeholder="Please hold while I connect you to our booking team."
				/>
				<p className="text-xs opacity-50">
					Spoken exactly as written — supports {"{{variables}}"}. The flow continues immediately to
					the next node. Leave the Next handle unwired to end the call after speaking.
				</p>
			</div>
		</>
	);
}

function ScenarioNodeEditor({
	nodeId,
	data,
	onChange,
}: {
	nodeId: string;
	data: ScenarioNodeData;
	onChange: (nodeId: string, data: FlowNodeData) => void;
}) {
	const patch = (partial: Partial<ScenarioNodeData>) => onChange(nodeId, { ...data, ...partial });

	return (
		<>
			<div className="flex flex-col gap-1.5">
				<Label>Title</Label>
				<Input
					value={data.title}
					onChange={(e) => patch({ title: e.target.value })}
					placeholder="Aggression Detected"
				/>
			</div>

			<div className="flex flex-col gap-1.5">
				<Label>When to jump</Label>
				<Textarea
					rows={4}
					value={data.description}
					onChange={(e) => patch({ description: e.target.value })}
					placeholder="The caller is angry, hostile, cursing, or verbally aggressive"
				/>
				<p className="text-xs opacity-50">
					Checked continuously from every stage — the call jumps to the connected node the moment
					this is detected.
				</p>
			</div>
		</>
	);
}

const KEEP_VOICE = "__keep__";

function TransferNodeEditor({
	nodeId,
	data,
	onChange,
}: {
	nodeId: string;
	data: TransferNodeData;
	onChange: (nodeId: string, data: FlowNodeData) => void;
}) {
	const patch = (partial: Partial<TransferNodeData>) => onChange(nodeId, { ...data, ...partial });

	return (
		<>
			<div className="flex flex-col gap-1.5">
				<Label>Title</Label>
				<Input
					value={data.title}
					onChange={(e) => patch({ title: e.target.value })}
					placeholder="Transfer to booking"
				/>
			</div>

			<div className="flex flex-col gap-1.5">
				<Label>Announcement</Label>
				<Textarea
					rows={2}
					value={data.say}
					onChange={(e) => patch({ say: e.target.value })}
					placeholder="One moment please — let me transfer you to the right person."
				/>
				<p className="text-xs opacity-50">
					Spoken in the current voice right before the hold music. Supports {"{{variables}}"};
					leave empty to jump straight to the music.
				</p>
			</div>

			<div className="flex flex-col gap-1.5">
				<Label>Hold music (seconds)</Label>
				<Input
					type="number"
					min={0}
					max={30}
					step={1}
					value={data.holdSeconds}
					onChange={(e) =>
						patch({ holdSeconds: Math.max(0, Math.min(30, Number(e.target.value) || 0)) })
					}
				/>
				<p className="text-xs opacity-50">
					How long the caller hears hold music before the next "person" picks up. 0 skips the
					music.
				</p>
			</div>

			<div className="flex flex-col gap-1.5">
				<Label>Voice after the transfer</Label>
				<Select
					value={data.voiceId ?? KEEP_VOICE}
					onValueChange={(value) => {
						if (value === KEEP_VOICE) {
							patch({ voiceId: undefined, voiceProvider: undefined });
							return;
						}
						const voice = VOICE_GROUPS.flatMap((group) => group.voices).find(
							(v) => v.id === value,
						);
						patch({ voiceId: value, voiceProvider: voice?.provider });
					}}
				>
					<SelectTrigger>
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value={KEEP_VOICE}>Keep the current voice</SelectItem>
						{VOICE_GROUPS.map((group) => (
							<SelectGroup key={group.provider}>
								<SelectLabel>{group.label}</SelectLabel>
								{group.voices.map((voice) => (
									<SelectItem key={voice.id} value={voice.id}>
										{voice.label}
									</SelectItem>
								))}
							</SelectGroup>
						))}
					</SelectContent>
				</Select>
				<p className="text-xs opacity-50">
					The caller hears this voice from here on — pick a different one so the transfer feels
					like a real hand-off.
				</p>
			</div>
		</>
	);
}

function SwitchNodeEditor({
	nodeId,
	data,
	onChange,
}: {
	nodeId: string;
	data: SwitchNodeData;
	onChange: (nodeId: string, data: FlowNodeData) => void;
}) {
	const patch = (partial: Partial<SwitchNodeData>) => onChange(nodeId, { ...data, ...partial });

	return (
		<>
			<div className="flex flex-col gap-1.5">
				<Label>Title</Label>
				<Input
					value={data.title}
					onChange={(e) => patch({ title: e.target.value })}
					placeholder="Which service?"
				/>
			</div>

			<div className="flex flex-col gap-1.5">
				<Label>Question to evaluate</Label>
				<Textarea
					rows={3}
					value={data.condition}
					onChange={(e) => patch({ condition: e.target.value })}
					placeholder="Which service is the caller asking about?"
				/>
				<p className="text-xs opacity-50">
					The AI reads the conversation and picks the case that best answers this question.
				</p>
			</div>

			<div className="flex flex-col gap-2">
				<Label>Cases</Label>
				<p className="-mt-1 text-xs opacity-50">
					One path per case. Wire each case on the canvas to send the call to another node; leave
					it unwired to end the call. Removing a case removes its edge.
				</p>
				{data.cases.map((switchCase) => (
					<div key={switchCase.id} className="flex items-start gap-2">
						<Input
							value={switchCase.name}
							onChange={(e) =>
								patch({
									cases: data.cases.map((c) =>
										c.id === switchCase.id ? { ...c, name: e.target.value } : c,
									),
								})
							}
							placeholder="Booking"
							className="max-w-36 font-mono text-sm"
						/>
						<Input
							value={switchCase.description}
							onChange={(e) =>
								patch({
									cases: data.cases.map((c) =>
										c.id === switchCase.id ? { ...c, description: e.target.value } : c,
									),
								})
							}
							placeholder="When to pick this case, e.g. the caller wants to book"
						/>
						<Button
							type="button"
							variant="ghost"
							size="icon"
							className="shrink-0"
							onClick={() => patch({ cases: data.cases.filter((c) => c.id !== switchCase.id) })}
						>
							<Trash2Icon className="size-4" />
						</Button>
					</div>
				))}
				<Button
					type="button"
					variant="outline"
					size="sm"
					className="self-start"
					onClick={() =>
						patch({ cases: [...data.cases, { id: makeId("case"), name: "", description: "" }] })
					}
				>
					<PlusIcon className="size-4" /> Add case
				</Button>
			</div>

			<div className="flex items-center gap-3 rounded-lg border p-2.5">
				<Switch
					id="switch-include-otherwise"
					checked={data.includeOtherwise}
					onCheckedChange={(on) => patch({ includeOtherwise: on })}
				/>
				<label htmlFor="switch-include-otherwise" className="min-w-0 cursor-pointer">
					<span className="block text-sm">Include an Otherwise path</span>
					<span className="block text-xs opacity-60">
						Fallback taken when no case matches the conversation.
					</span>
				</label>
			</div>
		</>
	);
}
