/**
 * Speech-friendly date/time formatting for live CRM tool responses (e.g.
 * check_availability, book_appointment). Kept separate from the calendar
 * tool logic since these are pure formatting helpers.
 */

/** "Tuesday, July 14: 10:00 AM, 11:30 AM; Wednesday, July 15: 9:00 AM" */
export function formatSpokenSlots(isoSlots: string[], timeZone: string): string {
	const dayFormat = new Intl.DateTimeFormat("en-US", {
		timeZone,
		weekday: "long",
		month: "long",
		day: "numeric",
	});
	const timeFormat = new Intl.DateTimeFormat("en-US", {
		timeZone,
		hour: "numeric",
		minute: "2-digit",
	});
	const byDay = new Map<string, string[]>();
	for (const iso of isoSlots) {
		const date = new Date(iso);
		const day = dayFormat.format(date);
		const times = byDay.get(day) ?? [];
		times.push(timeFormat.format(date));
		byDay.set(day, times);
	}
	return [...byDay.entries()].map(([day, times]) => `${day}: ${times.join(", ")}`).join("; ");
}

export function formatSpokenTime(iso: string, timeZone: string): string {
	return new Intl.DateTimeFormat("en-US", {
		timeZone,
		weekday: "long",
		month: "long",
		day: "numeric",
		hour: "numeric",
		minute: "2-digit",
	}).format(new Date(iso));
}
