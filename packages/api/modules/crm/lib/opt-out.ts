/**
 * SMS/async-messaging opt-out (STOP) compliance — a REGULATORY gate that voice
 * never needs. Carriers and GHL treat certain whole-message keywords as opt-out
 * / opt-in commands; when a contact texts one we must stop (or resume) sending
 * agent messages and — critically — NOT generate our own reply (the carrier/CRM
 * sends the compliance confirmation; a second message would be a violation and a
 * double-text).
 *
 * Pure and CRM-neutral so it's trivially unit-testable. The route acts on the
 * classification: opt-out → tag the contact `ai off` (reusing the existing
 * opt-out tag convention) and stop; opt-in → clear the tag and stop; otherwise
 * the turn proceeds normally (unless the contact is already opted out).
 */

/**
 * The tag that marks a contact as opted out of AI automation. This is the SAME
 * convention the outbound trigger and the per-agent `tag is_not "ai off"` filter
 * already use — we reuse it rather than inventing a parallel flag so a STOP here
 * also suppresses outbound calls/texts everywhere that gate is honored.
 */
export const AI_OFF_TAG = "ai off";

export type OptOutIntent = "opt_out" | "opt_in" | null;

/**
 * Whole-message opt-out keywords (carrier/TCPA standard set + common variants).
 * Matched case-insensitively against the trimmed, punctuation-stripped message.
 */
const OPT_OUT_KEYWORDS = new Set([
	"stop",
	"stopall",
	"unsubscribe",
	"cancel",
	"end",
	"quit",
	"optout",
	"opt out",
	"opt-out",
	"revoke",
]);

/** Whole-message opt-BACK-in keywords that re-enable messaging. */
const OPT_IN_KEYWORDS = new Set(["start", "unstop", "yes"]);

/**
 * Normalize a message for keyword matching: trim, lowercase, collapse internal
 * whitespace, and strip surrounding punctuation (so "STOP." / "STOP!" match).
 * Interior characters like the hyphen in "opt-out" are preserved.
 */
function normalizeMessage(text: string): string {
	return text
		.trim()
		.toLowerCase()
		.replace(/\s+/g, " ")
		.replace(/^[\p{P}\p{S}]+|[\p{P}\p{S}]+$/gu, "")
		.trim();
}

/**
 * Classify an inbound message as an opt-out, opt-in, or neither. Only matches
 * when the WHOLE message is a keyword (a genuine command), so "please stop
 * texting me about X" is NOT treated as a keyword opt-out — those are handled by
 * the agent. Returns null for ordinary messages.
 */
export function classifyOptOut(text: string): OptOutIntent {
	const normalized = normalizeMessage(text);
	if (!normalized) return null;
	if (OPT_OUT_KEYWORDS.has(normalized)) return "opt_out";
	if (OPT_IN_KEYWORDS.has(normalized)) return "opt_in";
	return null;
}

/**
 * Whether a contact's current tags (comma-separated CSV, as returned by the CRM
 * context) already mark them opted out. Case-insensitive. Used to gate every
 * inbound turn: an opted-out contact's messages must NOT run the agent until
 * they opt back in.
 */
export function isOptedOut(contactTagsCsv: string | undefined | null): boolean {
	if (!contactTagsCsv) return false;
	return contactTagsCsv
		.split(",")
		.map((t) => t.trim().toLowerCase())
		.includes(AI_OFF_TAG);
}
