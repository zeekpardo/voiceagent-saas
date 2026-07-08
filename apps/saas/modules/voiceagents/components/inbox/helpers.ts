import type { GatewayCall } from "@repo/api/modules/voiceagents/procedures/calls";

export type Call = GatewayCall;

/** Pastel avatar palettes that hold up in both light and dark mode. */
const AVATAR_PALETTES = [
	"bg-rose-200 text-rose-900 dark:bg-rose-950 dark:text-rose-200",
	"bg-orange-200 text-orange-900 dark:bg-orange-950 dark:text-orange-200",
	"bg-amber-200 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
	"bg-emerald-200 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
	"bg-teal-200 text-teal-900 dark:bg-teal-950 dark:text-teal-200",
	"bg-sky-200 text-sky-900 dark:bg-sky-950 dark:text-sky-200",
	"bg-indigo-200 text-indigo-900 dark:bg-indigo-950 dark:text-indigo-200",
	"bg-fuchsia-200 text-fuchsia-900 dark:bg-fuchsia-950 dark:text-fuchsia-200",
] as const;

/** Deterministic pastel classes from a hash of the identity string. */
export function avatarClasses(identity: string): string {
	let hash = 0;
	for (let i = 0; i < identity.length; i++) {
		hash = (hash * 31 + identity.charCodeAt(i)) | 0;
	}
	return AVATAR_PALETTES[Math.abs(hash) % AVATAR_PALETTES.length];
}

/** "Jane Doe" → "JD", "+15551234567" → "+1", "Web test" → "WT". */
export function initials(name: string): string {
	const words = name.split(/\s+/).filter(Boolean);
	if (words.length >= 2) {
		return `${words[0][0]}${words[1][0]}`.toUpperCase();
	}
	return name.slice(0, 2).toUpperCase();
}

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
