import {
	parseWidgetAppearance,
	type WidgetAppearance,
} from "@repo/api/modules/voiceagents/lib/widget-config";
import { getEnabledSourceWidget } from "@repo/database";
import { WidgetApp } from "@voiceagents/components/widget/WidgetApp";
import type { Metadata } from "next";

/**
 * The embeddable widget's iframe document. PUBLIC — it sits outside the
 * (authenticated) route group on purpose: anonymous visitors on third-party
 * websites load it inside an iframe injected by /widget.js. All real access
 * control happens when the app POSTs the widget token to /api/widget/session;
 * this page itself renders nothing sensitive. next.config.ts scopes
 * `frame-ancestors *` to /widget/* so it may be framed anywhere.
 *
 * Two ways to arrive:
 *   - `?widgetId=…` (current) — the saved widget's appearance + token come from
 *     the DB, so Studio edits apply without the customer re-pasting anything.
 *   - `?token=…&style=…&accent=…&visualizer=…&voice=…&chat=…` (legacy) —
 *     appearance is synthesized from query params for pre-Studio installs.
 */

export const metadata: Metadata = {
	title: "Voice assistant",
	robots: { index: false, follow: false },
};

function firstString(value: string | string[] | undefined): string {
	return typeof value === "string" ? value : "";
}

export default async function WidgetEmbedPage({
	searchParams,
}: {
	searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
	const params = await searchParams;
	const widgetId = firstString(params.widgetId);

	if (widgetId) {
		const widget = await getEnabledSourceWidget(widgetId);
		if (widget) {
			const appearance = parseWidgetAppearance(widget.appearance);
			// The loader forwards the token so we don't need a second round-trip;
			// fall back to the stored token if it didn't.
			const token = firstString(params.token) || widget.widgetToken;
			return <WidgetApp token={token} appearance={appearance} />;
		}
	}

	// Legacy query-param path — synthesize an appearance from the flat params.
	const styleParam = firstString(params.style);
	const legacyAppearance: WidgetAppearance = parseWidgetAppearance({
		style:
			styleParam === "card" || styleParam === "panel" || styleParam === "bar"
				? styleParam
				: "bubble",
		accent: firstString(params.accent) || "#6366f1",
		visualizer: firstString(params.visualizer) || "bars",
		voice: firstString(params.voice) !== "false",
		chat: firstString(params.chat) !== "false",
	});

	return <WidgetApp token={firstString(params.token)} appearance={legacyAppearance} />;
}
