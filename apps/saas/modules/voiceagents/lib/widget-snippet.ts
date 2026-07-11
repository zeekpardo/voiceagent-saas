/**
 * Client-side composition of the embeddable widget <script> snippet. The
 * server's mint procedure returns a minimal snippet (src + token); the config
 * panel recomposes it here with the merchant's chosen appearance so what they
 * copy matches exactly what they picked. Pure + shared so it's unit-testable.
 */

export type WidgetStyle = "bubble" | "card" | "panel" | "bar";
export type WidgetPosition = "left" | "right";
export type WidgetVisualizer = "bars" | "pulse" | "waveform" | "dots";

/** The two experiences a widget can offer a visitor. Internally the room hook
 *  calls the chat experience "text"; the embed attr/param is "chat". */
export type WidgetChannel = "voice" | "text";

export const WIDGET_VISUALIZERS: readonly WidgetVisualizer[] = [
	"bars",
	"pulse",
	"waveform",
	"dots",
];

export const WIDGET_DEFAULTS = {
	style: "bubble" as WidgetStyle,
	position: "right" as WidgetPosition,
	accent: "#6366f1",
	visualizer: "bars" as WidgetVisualizer,
	voice: true,
	chat: true,
};

export interface WidgetSnippetOptions {
	/** SaaS origin serving /widget.js, e.g. https://app.example.com */
	baseUrl: string;
	token: string;
	style?: WidgetStyle;
	position?: WidgetPosition;
	accent?: string;
	/** CSS selector of the host element — required by the card style. */
	target?: string;
	/** Voice-mode visualizer style (default "bars"). */
	visualizer?: WidgetVisualizer;
	/** Whether the widget offers a voice experience (default true). */
	voice?: boolean;
	/** Whether the widget offers a text/chat experience (default true). */
	chat?: boolean;
}

function escapeAttribute(value: string): string {
	return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
}

/**
 * Build the paste-ready <script> tag. Defaults are omitted so the minimal
 * snippet stays minimal; non-default choices ride along as data attributes
 * the loader reads back off its own script tag.
 */
export function composeWidgetSnippet(options: WidgetSnippetOptions): string {
	const base = options.baseUrl.replace(/\/$/, "");
	const attrs: string[] = [
		`src="${escapeAttribute(base)}/widget.js"`,
		`data-widget-token="${escapeAttribute(options.token)}"`,
	];
	const style = options.style ?? WIDGET_DEFAULTS.style;
	if (style !== WIDGET_DEFAULTS.style) {
		attrs.push(`data-style="${style}"`);
	}
	const position = options.position ?? WIDGET_DEFAULTS.position;
	if (position !== WIDGET_DEFAULTS.position) {
		attrs.push(`data-position="${position}"`);
	}
	const accent = (options.accent ?? WIDGET_DEFAULTS.accent).trim();
	if (accent && accent.toLowerCase() !== WIDGET_DEFAULTS.accent) {
		attrs.push(`data-accent="${escapeAttribute(accent)}"`);
	}
	if (style === "card") {
		attrs.push(`data-target="${escapeAttribute(options.target?.trim() || "#voice-widget")}"`);
	}
	const visualizer = options.visualizer ?? WIDGET_DEFAULTS.visualizer;
	if (visualizer !== WIDGET_DEFAULTS.visualizer) {
		attrs.push(`data-visualizer="${visualizer}"`);
	}
	// Mode toggles ride along only when a mode is turned OFF — the default is
	// "both on", so the minimal snippet stays minimal.
	if (options.voice === false) {
		attrs.push(`data-voice="false"`);
	}
	if (options.chat === false) {
		attrs.push(`data-chat="false"`);
	}
	return `<script ${attrs.join(" ")} async></script>`;
}

/**
 * The paste-ready <script> for a SAVED widget (Studio "Install" section). All
 * appearance/targeting/behavior lives in the widget record, so the snippet is
 * just the loader src + the widget id — editing the widget later goes live
 * without the customer touching this tag again.
 */
export function composeWidgetIdSnippet(options: { baseUrl: string; widgetId: string }): string {
	const base = options.baseUrl.replace(/\/$/, "");
	return `<script src="${escapeAttribute(base)}/widget.js" data-widget-id="${escapeAttribute(
		options.widgetId,
	)}" async></script>`;
}

/**
 * Which channels the widget can actually offer a visitor: the intersection of
 * what the embed enables (its voice/chat attrs) and what the agent allows
 * server-side (`modes` returned by /api/widget/session). Pure so it can be
 * unit-tested and shared by the widget app.
 *
 * `serverModes` is null before the first session attempt tells us the agent's
 * allowed channels — until then we trust the embed's own configuration.
 */
export function resolveWidgetChannels(
	offered: { voice: boolean; chat: boolean },
	serverModes: readonly WidgetChannel[] | null,
): WidgetChannel[] {
	const wanted: WidgetChannel[] = [];
	if (offered.voice) wanted.push("voice");
	if (offered.chat) wanted.push("text");
	if (!serverModes) return wanted;
	return wanted.filter((channel) => serverModes.includes(channel));
}

/** Loose origin check for the allowed-origins editor: "*" or scheme://host[:port]. */
export function isValidWidgetOrigin(value: string): boolean {
	const trimmed = value.trim();
	if (trimmed === "*") return true;
	try {
		const url = new URL(trimmed);
		return (url.protocol === "http:" || url.protocol === "https:") && url.origin === trimmed;
	} catch {
		return false;
	}
}

/**
 * Normalize whatever a user pastes into the allowed-origins editor down to the
 * ORIGIN the browser will actually send: people paste full page URLs
 * ("https://site.com/preview/abc123") or bare domains ("site.com"), but the
 * `Origin` header never carries a path — scheme://host[:port] is all we can
 * (and need to) pin; it covers every page on that site. Returns null for
 * unusable input (no host, unsupported scheme).
 */
export function normalizeWidgetOrigin(value: string): string | null {
	const trimmed = value.trim();
	if (!trimmed) return null;
	if (trimmed === "*") return "*";
	// Bare domains get https:// — nobody embeds a widget on plain http on purpose.
	const candidate = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`;
	try {
		const url = new URL(candidate);
		if (url.protocol !== "http:" && url.protocol !== "https:") return null;
		if (!url.hostname) return null;
		return url.origin;
	} catch {
		return null;
	}
}
