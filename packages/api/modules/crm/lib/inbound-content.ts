/**
 * Extract the turn text from a GHL InboundMessage payload, tolerating MMS/media
 * messages. An inbound SMS can carry attachments (image/file URLs) with an empty
 * or absent text `body`; without handling that, the turn would either error or
 * dispatch an empty message. Instead we pass the model a short placeholder so the
 * conversation proceeds sensibly ("[the contact sent an image/attachment]"),
 * keeping any caption/text the contact did include.
 *
 * Pure — derives only from the payload — so it's unit-testable and never blocks.
 */

export interface InboundContentInput {
	body?: string;
	/** GHL inbound attachments: an array of media URLs (images, files, …). */
	attachments?: unknown;
}

export interface InboundContent {
	/** The text to run the turn on (never empty when hadMedia is true). */
	text: string;
	/** True when the message carried one or more attachments. */
	hadMedia: boolean;
	/** Number of attachments detected. */
	mediaCount: number;
}

/** Placeholder handed to the model in place of media it can't see. */
const MEDIA_PLACEHOLDER = "[the contact sent an image/attachment]";

/** Count usable attachment entries (URL strings, or objects with a url/link). */
function countAttachments(attachments: unknown): number {
	if (!Array.isArray(attachments)) return 0;
	return attachments.filter((a) => {
		if (typeof a === "string") return a.trim().length > 0;
		if (a && typeof a === "object") {
			const rec = a as Record<string, unknown>;
			return typeof rec.url === "string" || typeof rec.link === "string";
		}
		return false;
	}).length;
}

/**
 * Build the turn content from the inbound payload. Combines any caption/body
 * text with a media placeholder so an MMS-only message still produces a sensible
 * non-empty turn.
 */
export function extractInboundContent(input: InboundContentInput): InboundContent {
	const text = (input.body ?? "").trim();
	const mediaCount = countAttachments(input.attachments);
	const hadMedia = mediaCount > 0;

	if (!hadMedia) {
		return { text, hadMedia: false, mediaCount: 0 };
	}

	// Media present — prepend the placeholder, keeping any caption the contact
	// typed so the agent can respond to both.
	const combined = text ? `${MEDIA_PLACEHOLDER} ${text}` : MEDIA_PLACEHOLDER;
	return { text: combined, hadMedia: true, mediaCount };
}
