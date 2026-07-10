import { BookingNode } from "../BookingNode";
import { compileBookingNode, newBookingNodeData } from "../compile/nodes/booking";
import { BookingNodeEditor } from "../editors/booking";
import type { BookingCanvasNodeDoc, BookingNodeData } from "../flow-types";
import { BOOKING_BOOKED_HANDLE_ID, bookingNodeDataSchema } from "../flow-types";
import { defineKind } from "./types";

export const bookingKind = defineKind<BookingNodeData>({
	kind: "booking",
	schema: bookingNodeDataSchema,
	canvasNode: BookingNode,
	editor: ({ agentId, nodeId, data, onChange }) => (
		<BookingNodeEditor
			agentId={agentId}
			nodeId={nodeId}
			data={data as BookingNodeData}
			onChange={onChange}
		/>
	),
	sheetMeta: {
		title: "Edit Booking",
		description:
			"Conversationally book an appointment onto a calendar, then branch on the outcome (booked, or no time worked).",
	},
	newData: (bookingToolIds) => newBookingNodeData(bookingToolIds),
	fallbackData: () => newBookingNodeData([]),
	sourceHandles: () => new Set(),
	edgeLabel: (_data, sourceHandle) =>
		sourceHandle === BOOKING_BOOKED_HANDLE_ID ? "Booked" : "No time worked",
	// A Booking node compiles to an engine agent node; the engine has no booking
	// kind, so it round-trips as an agent node (decompile handled in compile/index).
	compile: (node, { entry, targetOf }) => ({
		node: compileBookingNode(
			node as BookingCanvasNodeDoc & { data: BookingNodeData },
			entry,
			targetOf,
		),
	}),
});
