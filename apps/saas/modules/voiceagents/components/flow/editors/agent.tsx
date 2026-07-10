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
import { Switch } from "@repo/ui/components/switch";
import { Textarea } from "@repo/ui/components/textarea";
import { ArrowDownIcon, ArrowUpIcon, PlusIcon, SearchIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";

import { useAgentCalendarsQuery } from "../../../lib/api";
import { MODEL_GROUPS } from "../../AgentForm";
import { makeId, textToTiptapDoc } from "../compile";
import type { AgentNodeData, FlowNodeData } from "../flow-types";
import type { createFlowMentionExtension } from "../mentions";
import { SectionEditor } from "../SectionEditor";
import { AGENT_DEFAULT_CALENDAR, ExitTagConditions, type FlowToolOption, TitleInput, usePatch } from "./shared";

const INHERIT_MODEL = "__inherit__";

/** The main column: title, prompt sections and entry message — nothing else. */
export function AgentPromptEditor({
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
	const patch = usePatch<AgentNodeData>(nodeId, data, onChange);

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

			<TitleInput value={data.title} onChange={(value) => patch({ title: value })} placeholder="Qualify the lead" />

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
export function AgentToolsPanel({
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
	const patch = usePatch<AgentNodeData>(nodeId, data, onChange);
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
export function AgentExitsPanel({
	nodeId,
	data,
	onChange,
}: {
	nodeId: string;
	data: AgentNodeData;
	onChange: (nodeId: string, data: FlowNodeData) => void;
}) {
	const patch = usePatch<AgentNodeData>(nodeId, data, onChange);

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
					<ExitTagConditions
						tagRules={exit.tagRules}
						onChange={(tagRules) =>
							patch({
								exits: data.exits.map((x) => (x.id === exit.id ? { ...x, tagRules } : x)),
							})
						}
					/>
				</div>
			))}
		</div>
	);
}

/** Rail panel: model override + booking behavior. */
export function AgentSettingsPanel({
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
	const patch = usePatch<AgentNodeData>(nodeId, data, onChange);

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
