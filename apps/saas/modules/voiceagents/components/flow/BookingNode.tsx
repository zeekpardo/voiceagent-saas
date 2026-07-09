"use client";

import type { Node, NodeProps } from "@xyflow/react";
import { CalendarCheckIcon } from "lucide-react";

import type { BookingNodeData } from "./flow-types";
import { BOOKING_BOOKED_HANDLE_ID, BOOKING_FAILED_HANDLE_ID } from "./flow-types";
import { FlowNodeShell, nodeTraceProps } from "./FlowNodeShell";

export type BookingRFNode = Node<BookingNodeData, "booking">;

const SOURCE_HANDLES = [
	{ id: BOOKING_BOOKED_HANDLE_ID, name: "Booked" },
	{ id: BOOKING_FAILED_HANDLE_ID, name: "No time worked" },
];

/**
 * A Booking node: conversationally books an appointment on a calendar, then
 * branches on the outcome (booked, or no slot worked / calendar unavailable).
 * It runs as an agent under the hood, gated to the CRM booking tools.
 */
export function BookingNode({ id, data, selected }: NodeProps<BookingRFNode>) {
	return (
		<FlowNodeShell
			id={id}
			selected={selected}
			title={data.title}
			fallbackTitle="Booking"
			icon={CalendarCheckIcon}
			borderClassName="bg-gradient-to-br from-sky-500/70 to-indigo-500/70"
			tileClassName="bg-gradient-to-br from-sky-500 to-indigo-500"
			handleClassName="!bg-indigo-500"
			targetHandleClassName="!bg-sky-500"
			sourceHandles={SOURCE_HANDLES}
			{...nodeTraceProps(data)}
		/>
	);
}
