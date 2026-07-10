import type { BookingCanvasNodeDoc, BookingNodeData, EngineFlowNode } from "../../flow-types";
import { BOOKING_BOOKED_HANDLE_ID, BOOKING_FAILED_HANDLE_ID } from "../../flow-types";
import { applyBookingPromptExtras } from "../text";

const BOOKING_INSTRUCTIONS =
	"Book the caller into an appointment. Use check_availability to find open times (the agent's configured booking calendar is used automatically). Offer two or three options conversationally — never read a long list. Once they pick one, use book_appointment with that exact slot time and confirm the booked time back to them. If nothing fits or the calendar is unavailable, reassure them someone will call back to schedule, then take the 'No time worked' exit.";

export function compileBookingNode(
	node: BookingCanvasNodeDoc & { data: BookingNodeData },
	entry: string,
	targetOf: (nodeId: string, handleId: string) => string | undefined,
): EngineFlowNode {
	// A Booking node compiles to an AGENT node gated to the CRM booking
	// tools, with the standard book/confirm instructions plus the node's
	// description, extra prompt, and calendar/title/failed-tag settings.
	let instructions = node.data.description.trim()
		? `${node.data.description.trim()}\n\n${BOOKING_INSTRUCTIONS}`
		: BOOKING_INSTRUCTIONS;
	const extraPrompt = node.data.extraPrompt.trim();
	instructions = applyBookingPromptExtras(instructions, {
		calendarName: node.data.calendarName,
		appointmentTitle: node.data.appointmentTitle,
		failedBookingTag: node.data.failedBookingTag,
	});
	if (extraPrompt) {
		instructions += `\n\n${extraPrompt}`;
	}
	return {
		id: node.id,
		name: node.data.title.trim() || undefined,
		instructions,
		entryInstructions: node.id !== entry ? "Offer to get them booked in right now." : undefined,
		toolIds: [...node.data.toolIds],
		exits: [
			{
				name: "Booked",
				description: "The appointment is booked and confirmed.",
				target: targetOf(node.id, BOOKING_BOOKED_HANDLE_ID),
			},
			{
				name: "No time worked",
				description: "No slot worked or the calendar was unavailable; a callback was promised.",
				target: targetOf(node.id, BOOKING_FAILED_HANDLE_ID),
			},
		],
	};
}

/**
 * Fresh Booking node data (CloseBot's dedicated "Booking" node). `liveToolIds`
 * = the CRM live check_availability / book_appointment tool ids, baked in at
 * creation ([] when no CRM is connected — booking won't work until reconnected).
 */
export function newBookingNodeData(liveToolIds: string[]): BookingNodeData {
	return {
		title: "Booking",
		calendarName: "",
		description: "Book a 30 minute appointment with the contact.",
		extraPrompt: "",
		appointmentTitle: "",
		failedBookingTag: "",
		toolIds: [...liveToolIds],
	};
}
