import { getAgentSource } from "@repo/database";

import type { CrmCalendar, CrmProvider } from "./provider";
import { formatSpokenSlots, formatSpokenTime } from "./spoken-time";
import { stringArg } from "./tool-args";

/**
 * Calendar tool handlers for live CRM tool invocations (check_availability,
 * book_appointment) — see /api/tools/crm/route.ts for the dispatch shell
 * these are called from.
 */

const DEFAULT_TIMEZONE = "America/Los_Angeles";
const DEFAULT_SEARCH_DAYS = 5;
const MAX_SEARCH_DAYS = 31; // GHL free-slots range limit
const MAX_SPOKEN_SLOTS = 8;
const DAY_MS = 24 * 60 * 60 * 1000;

/** The account's IANA timezone for speech-friendly formatting (best-effort). */
export async function accountTimezone(provider: CrmProvider): Promise<string> {
	try {
		const context = await provider.getAccountContext();
		return context.location_timezone || DEFAULT_TIMEZONE;
	} catch {
		return DEFAULT_TIMEZONE;
	}
}

/**
 * Match a spoken calendar name against the account's calendars. Resolution
 * order: (a) explicit calendar_name argument → (b) the agent's configured
 * booking calendar for this source (verified to still exist) → (c) the sole
 * calendar when there's exactly one → (d) a spoken recovery message. Never a guess.
 */
export async function resolveCalendar(
	provider: CrmProvider,
	calendarName: string,
	agentId: string,
	sourceId: string,
): Promise<{ calendar: CrmCalendar } | { error: string; message: string }> {
	const calendars = await provider.listCalendars();
	if (calendars.length === 0) {
		return {
			error: "calendar_not_found",
			message: "No calendars exist in the CRM. Offer to have someone follow up to schedule.",
		};
	}

	const notFound = {
		error: "calendar_not_found",
		message: `Available calendars: ${calendars.map((c) => c.name).join(", ")}. Ask which one.`,
	};

	// (a) The LLM named a calendar — exact match, then tolerant substring match.
	const wanted = calendarName.trim().toLowerCase();
	if (wanted) {
		let matches = calendars.filter((c) => c.name.toLowerCase() === wanted);
		if (matches.length === 0) {
			matches = calendars.filter(
				(c) => c.name.toLowerCase().includes(wanted) || wanted.includes(c.name.toLowerCase()),
			);
		}
		if (matches.length === 1) return { calendar: matches[0] };
		return notFound;
	}

	// (b) The agent's configured booking calendar for this source, if it still exists.
	if (agentId) {
		const mapping = await getAgentSource(agentId, sourceId);
		if (mapping?.bookingCalendarId) {
			const configured = calendars.find((c) => c.id === mapping.bookingCalendarId);
			if (configured) return { calendar: configured };
		}
	}

	// (c) Single-calendar accounts need no configuration at all.
	if (calendars.length === 1) return { calendar: calendars[0] };

	return notFound;
}

export async function executeCheckAvailability(
	provider: CrmProvider,
	args: Record<string, unknown>,
	agentId: string,
	sourceId: string,
): Promise<unknown> {
	const resolved = await resolveCalendar(
		provider,
		stringArg(args.calendar_name),
		agentId,
		sourceId,
	);
	if ("error" in resolved) return resolved;

	const fromArg = stringArg(args.from_date);
	const from = fromArg ? new Date(fromArg) : new Date();
	if (Number.isNaN(from.getTime())) {
		return { error: "bad_arguments", message: "from_date is not a valid ISO date." };
	}
	const days =
		typeof args.days === "number" && Number.isFinite(args.days)
			? Math.min(Math.max(Math.round(args.days), 1), MAX_SEARCH_DAYS)
			: DEFAULT_SEARCH_DAYS;
	const to = new Date(from.getTime() + days * DAY_MS);

	const available = await provider.getAvailability({
		calendarId: resolved.calendar.id,
		fromISO: from.toISOString(),
		toISO: to.toISOString(),
	});
	if (available.length === 0) {
		return { error: "no_slots", message: "No open slots in that range. Try more days ahead." };
	}

	const timezone = await accountTimezone(provider);
	const slots = available.slice(0, MAX_SPOKEN_SLOTS).map((s) => s.startISO);
	return {
		calendar: resolved.calendar.name,
		slots,
		spoken: formatSpokenSlots(slots, timezone),
	};
}

export async function executeBookAppointment(
	provider: CrmProvider,
	contactId: string,
	args: Record<string, unknown>,
	agentId: string,
	sourceId: string,
): Promise<unknown> {
	const startTime = stringArg(args.start_time);
	if (!startTime || Number.isNaN(Date.parse(startTime))) {
		return {
			error: "bad_arguments",
			message: "start_time must be an exact ISO 8601 time from check_availability.",
		};
	}

	const resolved = await resolveCalendar(
		provider,
		stringArg(args.calendar_name),
		agentId,
		sourceId,
	);
	if ("error" in resolved) return resolved;

	const title = stringArg(args.title) || "Phone consultation — voice agent booking";
	const booked = await provider.bookAppointment({
		calendarId: resolved.calendar.id,
		contactId,
		startISO: startTime,
		title,
	});

	const timezone = await accountTimezone(provider);
	return `Booked for ${formatSpokenTime(booked.startISO, timezone)}. Confirmation id ${booked.id}.`;
}
