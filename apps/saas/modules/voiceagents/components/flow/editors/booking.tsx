"use client";

import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@repo/ui/components/select";
import { Textarea } from "@repo/ui/components/textarea";
import { useState } from "react";

import { useAgentCalendarsQuery } from "../../../lib/api";
import type { BookingNodeData, FlowNodeData } from "../flow-types";
import { AGENT_DEFAULT_CALENDAR, TitleInput, usePatch } from "./shared";

export function BookingNodeEditor({
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
	const patch = usePatch<BookingNodeData>(nodeId, data, onChange);
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

			<TitleInput value={data.title} onChange={(value) => patch({ title: value })} placeholder="Booking" />

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
