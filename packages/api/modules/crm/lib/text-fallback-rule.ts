import { readChannelMode, readTextFallback } from "../../voiceagents/lib/channel-mode";
import { isMessageChannel } from "./channels";

/**
 * The pure decision for the voice-fail → text fallback, split out from the
 * IO-heavy pipeline (text-fallback.ts) so it's unit-testable without pulling in
 * the database/gateway. See `runTextFallback` for the orchestration.
 */

/** Call end reasons that mean "never connected" — the fallback triggers. */
export const FALLBACK_END_REASONS = new Set([
	"no_answer",
	"failed",
	"busy",
	"canceled",
	"queue_expired",
]);

/**
 * Every condition must hold for a text fallback to fire:
 *  - the call was OUTBOUND (never fall back for inbound),
 *  - it ended for a "didn't connect" reason,
 *  - the agent enabled `channels.textFallback`,
 *  - the agent isn't voice-only (mode "voice" has no text channel to use),
 *  - the source mapping has at least one text channel enabled to send on.
 */
export function shouldTextFallback(input: {
	endReason: string | undefined;
	direction: string | null | undefined;
	config: unknown;
	mappingChannels: unknown;
}): boolean {
	if (input.direction !== "outbound") return false;
	if (!input.endReason || !FALLBACK_END_REASONS.has(input.endReason)) return false;
	if (!readTextFallback(input.config)) return false;
	if (readChannelMode(input.config) === "voice") return false;
	const channels = Array.isArray(input.mappingChannels)
		? input.mappingChannels.filter(isMessageChannel)
		: [];
	return channels.length > 0;
}
