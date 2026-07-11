/**
 * Channel-mode helpers shared by every entry point that has to honor an agent's
 * `channels.mode` preference (CRM trigger, omni-channel inbound resolution,
 * widget + test sessions). Pure and dependency-free so it's trivially testable.
 *
 * `mode` restricts which session channels an agent will run:
 *  - "both" (default) — voice AND text,
 *  - "voice"          — voice only (text sessions rejected),
 *  - "text"           — text only (voice calls rejected / redirected to text).
 */

export type ChannelMode = "voice" | "text" | "both";

/** The two runtime session channels (widget/test/engine sessions). */
export type SessionChannel = "voice" | "text";

/** Read a normalized mode off an agent config document (defaults to "both"). */
export function readChannelMode(config: unknown): ChannelMode {
	const mode = (config as { channels?: { mode?: unknown } } | undefined)?.channels?.mode;
	return mode === "voice" || mode === "text" ? mode : "both";
}

/** Read the `channels.textFallback` flag off an agent config (defaults false). */
export function readTextFallback(config: unknown): boolean {
	return (
		(config as { channels?: { textFallback?: unknown } } | undefined)?.channels?.textFallback ===
		true
	);
}

/** The session channels an agent in `mode` is allowed to run. */
export function allowedSessionChannels(mode: ChannelMode): SessionChannel[] {
	if (mode === "voice") return ["voice"];
	if (mode === "text") return ["text"];
	return ["voice", "text"];
}

/** Whether an agent in `mode` may run a session on `channel`. */
export function isChannelAllowed(mode: ChannelMode, channel: SessionChannel): boolean {
	return allowedSessionChannels(mode).includes(channel);
}
