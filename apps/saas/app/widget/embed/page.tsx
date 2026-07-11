import { WidgetApp } from "@voiceagents/components/widget/WidgetApp";
import type { Metadata } from "next";

/**
 * The embeddable widget's iframe document. PUBLIC — it sits outside the
 * (authenticated) route group on purpose: anonymous visitors on third-party
 * websites load it inside an iframe injected by /widget.js. All real access
 * control happens when the app POSTs the widget token to /api/widget/session;
 * this page itself renders nothing sensitive. next.config.ts scopes
 * `frame-ancestors *` to /widget/* so it may be framed anywhere.
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
	const token = firstString(params.token);
	const styleParam = firstString(params.style);
	const embedStyle =
		styleParam === "card" || styleParam === "panel" || styleParam === "bar" ? styleParam : "bubble";
	const accent = firstString(params.accent) || "#6366f1";

	return <WidgetApp token={token} embedStyle={embedStyle} accent={accent} />;
}
