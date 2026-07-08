"use client";

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
import { ArrowDownIcon, ArrowUpIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useMemo, useRef } from "react";

import { useAgentCalendarsQuery } from "../../lib/api";
import { MODEL_GROUPS } from "../AgentForm";
import { makeId, textToTiptapDoc } from "./compile";
import type {
	AgentNodeData,
	FlowNodeData,
	FlowNodeKind,
	ScenarioNodeData,
	StatementNodeData,
	SwitchNodeData,
	TrueFalseNodeData,
} from "./flow-types";
import { createFlowMentionExtension, type MentionItem } from "./mentions";
import { SectionEditor } from "./SectionEditor";

const INHERIT_MODEL = "__inherit__";
const AGENT_DEFAULT_CALENDAR = "__agent_default__";

export interface FlowToolOption {
	id: string;
	name: string;
	description: string;
}

const SHEET_META: Record<FlowNodeKind, { title: string; description: string }> = {
	agent: {
		title: "Edit agent node",
		description: "This node's prompt, exits and tools. Type @ for variables, @@ for tools, @@@ for exits.",
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
};

/**
 * Right-side sheet for editing one flow node. Kind-aware: agent nodes get the
 * full prompt/exits/tools/model editor; branch nodes (True/False, Switch) get
 * a condition editor and their paths.
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

	return (
		<Sheet open onOpenChange={(open) => !open && onClose()}>
			<SheetContent
				className="flex w-full flex-col gap-5 overflow-y-auto sm:max-w-xl"
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
				<SheetHeader>
					<SheetTitle>{SHEET_META[nodeType].title}</SheetTitle>
					<SheetDescription>{SHEET_META[nodeType].description}</SheetDescription>
				</SheetHeader>

				{nodeType === "agent" && (
					<AgentNodeEditor
						agentId={agentId}
						nodeId={nodeId}
						data={data as AgentNodeData}
						isEntry={isEntry}
						tools={tools}
						bookingToolIds={bookingToolIds}
						mentionExtension={mentionExtension}
						onChange={onChange}
					/>
				)}
				{nodeType === "truefalse" && (
					<TrueFalseNodeEditor nodeId={nodeId} data={data as TrueFalseNodeData} onChange={onChange} />
				)}
				{nodeType === "switch" && (
					<SwitchNodeEditor nodeId={nodeId} data={data as SwitchNodeData} onChange={onChange} />
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

				<div className="mt-2 flex justify-between border-t pt-4">
					<Button type="button" variant="destructive" size="sm" onClick={() => onDelete(nodeId)}>
						<Trash2Icon className="size-4" /> Delete node
					</Button>
					<Button type="button" variant="outline" size="sm" onClick={onClose}>
						Done
					</Button>
				</div>
			</SheetContent>
		</Sheet>
	);
}

function AgentNodeEditor({
	agentId,
	nodeId,
	data,
	isEntry,
	tools,
	bookingToolIds,
	mentionExtension,
	onChange,
}: {
	agentId: string;
	nodeId: string;
	data: AgentNodeData;
	isEntry: boolean;
	tools: FlowToolOption[];
	bookingToolIds: string[];
	mentionExtension: ReturnType<typeof createFlowMentionExtension>;
	onChange: (nodeId: string, data: FlowNodeData) => void;
}) {
	const patch = (partial: Partial<AgentNodeData>) => onChange(nodeId, { ...data, ...partial });

	// The Booking calendar pin only applies while a booking tool is gated onto
	// this node — fetch the calendar list only then.
	const hasBookingTool = data.toolIds.some((id) => bookingToolIds.includes(id));
	const { data: crmCalendars } = useAgentCalendarsQuery(agentId, hasBookingTool);

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

			<div className="flex flex-col gap-2">
				<Label>Exits</Label>
				<p className="-mt-1 text-xs opacity-50">
					How the conversation leaves this node. Wire an exit on the canvas to send the call to
					another node; leave it unwired to end the call.
				</p>
				{data.exits.map((exit) => (
					<div key={exit.id} className="flex items-start gap-2">
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
							className="max-w-36 font-mono text-sm"
						/>
						<Input
							value={exit.description}
							onChange={(e) =>
								patch({
									exits: data.exits.map((x) =>
										x.id === exit.id ? { ...x, description: e.target.value } : x,
									),
								})
							}
							placeholder="When to take this exit, e.g. the caller wants to book"
						/>
						<Button
							type="button"
							variant="ghost"
							size="icon"
							className="shrink-0"
							onClick={() => patch({ exits: data.exits.filter((x) => x.id !== exit.id) })}
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
						patch({ exits: [...data.exits, { id: makeId("exit"), name: "", description: "" }] })
					}
				>
					<PlusIcon className="size-4" /> Add exit
				</Button>
			</div>

			<div className="flex flex-col gap-2">
				<Label>Tools on this node</Label>
				<p className="-mt-1 text-xs opacity-50">
					Available only while this node is active. Inserting a @@tool chip checks it here
					automatically.
				</p>
				{tools.length === 0 ? (
					<p className="py-2 text-sm opacity-50">No tools registered yet.</p>
				) : (
					tools.map((tool) => {
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
					})
				)}
			</div>

			{hasBookingTool && (
				<div className="flex flex-col gap-4">
					<Label>Booking settings</Label>
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
									Overrides the agent's default booking calendar (CRM sync aside) for this node
									only.
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
			)}

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
			</div>
		</>
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
