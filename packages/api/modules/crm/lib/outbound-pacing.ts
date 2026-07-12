/**
 * Outbound send pacing for async messaging. When a single turn yields more than
 * one message (a multi-part reply — e.g. an announced-handoff bridge line
 * followed by the greeting), firing them back-to-back in the same millisecond
 * reads as robotic and can arrive out of order at the carrier. A small delay
 * between consecutive sends reads more human and preserves order.
 *
 * Pure split + a tiny sequencing helper so the route stays declarative and the
 * split is unit-testable.
 */

/**
 * Inter-message delay (ms) inserted BETWEEN consecutive sends of a multi-part
 * reply (never before the first, never after the last). Override with
 * `SMS_INTER_MESSAGE_DELAY_MS`; defaults to 1200ms.
 */
export const INTER_MESSAGE_DELAY_MS = (() => {
	const raw = Number(process.env.SMS_INTER_MESSAGE_DELAY_MS);
	return Number.isFinite(raw) && raw >= 0 ? raw : 1200;
})();

/**
 * Split an agent reply into the message parts to send. A reply separated by a
 * blank line (paragraph break) is treated as multiple messages; an ordinary
 * single-block reply stays ONE message (so existing single-message behavior is
 * unchanged). Trims parts and drops empties.
 */
export function splitOutboundMessages(reply: string): string[] {
	return reply
		.split(/\n\s*\n+/)
		.map((part) => part.trim())
		.filter(Boolean);
}

/**
 * Send `messages` in order, awaiting `send` for each and pausing `delayMs`
 * between consecutive sends (not before the first, not after the last). Returns
 * each send's result in order. `send` failures propagate to the caller.
 */
export async function sendPaced<T>(
	messages: string[],
	send: (text: string, index: number) => Promise<T>,
	delayMs: number = INTER_MESSAGE_DELAY_MS,
	sleepFn: (ms: number) => Promise<void> = (ms) =>
		new Promise((resolve) => setTimeout(resolve, ms)),
): Promise<T[]> {
	const results: T[] = [];
	for (let i = 0; i < messages.length; i++) {
		if (i > 0 && delayMs > 0) await sleepFn(delayMs);
		results.push(await send(messages[i]!, i));
	}
	return results;
}
