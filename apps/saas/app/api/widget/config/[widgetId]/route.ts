import { sanitizeWidgetConfig } from "@repo/api/modules/voiceagents/lib/widget-config";
import { getEnabledSourceWidget } from "@repo/database";

/**
 * PUBLIC config-by-ID endpoint for the embeddable widget. The loader
 * (/widget.js, data-widget-id path) GETs this to learn a widget's appearance /
 * targeting / behavior WITHOUT the customer re-pasting their snippet — editing a
 * widget goes live here.
 *
 * The payload is intentionally NON-secret render config only — it does NOT
 * include the session token. Because this endpoint is fully CORS-open
 * (Access-Control-Allow-Origin: *), anything it returns is readable cross-origin
 * by anyone who learns the widgetId; the token is the credential the
 * origin-pinned /api/widget/session route accepts, so it must not travel through
 * a wildcard-CORS response. The iframe (/widget/embed) resolves the token
 * server-side from the same widgetId on our own origin instead. Response is
 * cacheable for 60s. Disabled or missing widgets 404 (indistinguishably).
 */

const CORS: Record<string, string> = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Methods": "GET, OPTIONS",
	"Access-Control-Allow-Headers": "content-type",
};

export function OPTIONS(): Response {
	return new Response(null, { status: 204, headers: CORS });
}

export async function GET(
	_req: Request,
	{ params }: { params: Promise<{ widgetId: string }> },
): Promise<Response> {
	const { widgetId } = await params;
	const widget = await getEnabledSourceWidget(widgetId);
	if (!widget) {
		return Response.json({ error: "widget not found" }, { status: 404, headers: CORS });
	}
	return Response.json(sanitizeWidgetConfig(widget), {
		status: 200,
		headers: { ...CORS, "Cache-Control": "public, max-age=60" },
	});
}
