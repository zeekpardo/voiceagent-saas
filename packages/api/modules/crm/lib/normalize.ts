/**
 * CRM value normalization — the ONE place spoken/voice values become the
 * canonical form a CRM expects. Every write-path (live tools, post-call sync,
 * and session/trigger contact resolution) MUST go through these so the same
 * caller never resolves to two different contacts, and so field formats are
 * consistent regardless of which path wrote them.
 *
 * This lives in the SaaS on purpose: the voice engine stays a generic runtime
 * and knows nothing about CRM value shapes.
 */

/** Strip to digits, assume US when 10 digits, ensure a leading +. */
export function normalizePhone(raw: string): string {
	const digits = raw.replace(/\D/g, "");
	if (digits.length === 10) return `+1${digits}`;
	return `+${digits}`;
}

/**
 * Turn a spoken email into a real address: "bob at miller dot com" ->
 * "bob@miller.com". STT gives us the words, not the symbols. Already-valid
 * addresses pass through (lowercased).
 */
export function normalizeEmail(raw: string): string {
	const trimmed = raw.trim();
	if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return trimmed.toLowerCase();
	return trimmed
		.toLowerCase()
		.replace(/\s+at\s+/g, "@")
		.replace(/\s+dot\s+/g, ".")
		.replace(/\s+underscore\s+/g, "_")
		.replace(/\s+(?:dash|hyphen)\s+/g, "-")
		.replace(/\s+/g, "");
}

/** Digits only, for ZIP / postal codes spoken as "nine three three oh seven". */
export function normalizeZip(raw: string): string {
	const digits = raw.replace(/\D/g, "");
	return digits || raw.trim();
}

/** Apply the right normalizer for a GHL standard field key; others pass through. */
export function normalizeStandardValue(standardKey: string, value: string): string {
	if (standardKey === "email") return normalizeEmail(value);
	if (standardKey === "phone") return normalizePhone(value);
	if (standardKey === "postalCode") return normalizeZip(value);
	return value;
}
