import type { GatewayCall, GatewayCallEvent } from "@repo/api/modules/voiceagents/procedures/calls";
import { avatarClasses, initials } from "@shared/lib/avatar";

export type Call = GatewayCall;

export { avatarClasses, initials };

function isUsable(value: string | null | undefined): value is string {
	return !!value && value.trim().length > 0 && value.trim().toLowerCase() !== "unknown";
}

/** Human phone number for the call: caller for inbound, callee for outbound. */
export function callPhoneNumber(call: Call): string | null {
	const number = call.direction === "outbound" ? call.to_number : call.from_number;
	return isUsable(number) ? number : null;
}

/** Caller name → phone number → "Web test". */
export function callDisplayName(call: Call): string {
	const name = call.extracted?.caller_name;
	if (isUsable(name)) {
		return name;
	}
	return callPhoneNumber(call) ?? "Web test";
}

/** "8 min", "2 hr", "Jul 4" — no date lib. */
export function relativeTime(iso: string, now: Date = new Date()): string {
	const date = new Date(iso);
	const diffMs = now.getTime() - date.getTime();
	const diffMin = Math.floor(diffMs / 60_000);
	if (diffMin < 1) {
		return "now";
	}
	if (diffMin < 60) {
		return `${diffMin} min`;
	}
	const diffHr = Math.floor(diffMin / 60);
	if (diffHr < 24) {
		return `${diffHr} hr`;
	}
	const sameYear = date.getFullYear() === now.getFullYear();
	return date.toLocaleDateString(undefined, {
		month: "short",
		day: "numeric",
		...(sameYear ? {} : { year: "numeric" }),
	});
}

/** 76 → "1m 16s", 3675 → "1h 1m". */
export function formatDuration(seconds: number | null): string | null {
	if (seconds == null) {
		return null;
	}
	if (seconds < 60) {
		return `${seconds}s`;
	}
	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) {
		return `${minutes}m ${seconds % 60}s`;
	}
	return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

/** callback_number → "Callback Number". */
export function prettifyKey(key: string): string {
	return key
		.split("_")
		.filter(Boolean)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(" ");
}

/** Extracted entries worth showing (drops empty / "unknown" values). */
export function usableExtractedEntries(
	extracted: Record<string, string> | null | undefined,
): [string, string][] {
	if (!extracted) {
		return [];
	}
	return Object.entries(extracted).filter(([, value]) => isUsable(value));
}

/**
 * The fields the OBJECTIVE nodes captured during the call, derived from the
 * call's `flow.objective` engine events (each payload carries the objective
 * `key` + its `answer`). Later events for the same key win (corrections ripple
 * in after the first completion). Empty / "unknown" / "N/A" answers are dropped.
 */
export function capturedFromEvents(
	events: GatewayCallEvent[] | null | undefined,
): [string, string][] {
	if (!events?.length) {
		return [];
	}
	const byKey = new Map<string, string>();
	for (const e of events) {
		if (e.type !== "flow.objective") continue;
		const key = e.payload.key;
		const answer = e.payload.answer;
		if (typeof key !== "string" || typeof answer !== "string") continue;
		if (!isUsable(answer) || answer.trim().toUpperCase() === "N/A") continue;
		byKey.set(key, answer.trim());
	}
	return [...byKey.entries()];
}

/**
 * Normalize a transcript turn timestamp to an absolute Date. Handles epoch
 * ms, epoch seconds, and offsets in seconds relative to the call start.
 */
export function turnTimestamp(ts: number | undefined, startedAt: string | null): Date | null {
	if (ts == null) {
		return null;
	}
	if (ts > 1e12) {
		return new Date(ts);
	}
	if (ts > 1e9) {
		return new Date(ts * 1000);
	}
	if (startedAt) {
		return new Date(new Date(startedAt).getTime() + ts * 1000);
	}
	return null;
}

export function formatClockTime(date: Date): string {
	return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export function formatDateTime(iso: string): string {
	return new Date(iso).toLocaleString(undefined, {
		month: "short",
		day: "numeric",
		hour: "numeric",
		minute: "2-digit",
	});
}

export const STATUS_DOT_CLASSES: Record<string, string> = {
	completed: "bg-emerald-500",
	active: "bg-sky-500",
	queued: "bg-amber-400",
	no_answer: "bg-amber-500",
	failed: "bg-red-500",
	canceled: "bg-muted-foreground",
};

export const STATUS_BADGE: Record<string, "success" | "info" | "warning" | "error"> = {
	completed: "success",
	active: "info",
	queued: "warning",
	no_answer: "warning",
	failed: "error",
	canceled: "warning",
};
