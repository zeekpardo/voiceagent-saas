import { sanitizeWidgetConfig } from "@repo/api/modules/voiceagents/lib/widget-config";
import { getEnabledSourceWidget } from "@repo/database";

/**
 * PUBLIC config-by-ID endpoint for the embeddable widget. The loader
 * (/widget.js, data-widget-id path) and the embed app both GET this to learn a
 * widget's appearance / targeting / behavior + session token WITHOUT the
 * customer re-pasting their snippet — editing a widget goes live here.
 *
 * The payload is not secret: the token is the same public capability that lives
 * in snippets today, and origin pinning still gates actual sessions. So it's
 * fully CORS-open (Access-Control-Allow-Origin: *) and cacheable for 60s.
 * Disabled or missing widgets 404 (indistinguishably).
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
