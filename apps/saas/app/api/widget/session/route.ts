import { gatewayFetch } from "@repo/api/modules/voiceagents/lib/gateway";
import { createRateLimiter } from "@repo/api/modules/voiceagents/lib/rate-limit";
import { isOriginAllowed, verifyWidgetToken } from "@repo/api/modules/voiceagents/lib/widget-token";

/**
 * Public, token-gated session starter for the embeddable widget. An anonymous
 * visitor on a third-party website POSTs the widget token (baked into the
 * embed snippet) and gets back only the LiveKit join info — never the gateway
 * key. Gating is layered: a valid HMAC token, an Origin that the token pins,
 * and per-IP + per-token rate limits.
 *
 * This static route wins over the /api/[[...rest]] oRPC catch-all.
 */

// Sliding-window limits (single-instance — see rate-limit.ts caveat).
const perIpLimiter = createRateLimiter(5, 10 * 60 * 1000); // 5 starts / 10 min
const perTokenLimiter = createRateLimiter(20, 60 * 60 * 1000); // 20 starts / hour

interface WidgetSessionBody {
	token?: string;
	channel?: "voice" | "text";
	visitor?: { name?: string; email?: string };
}

/**
 * CORS headers for a validated request. Echoes the caller's origin (never a
 * bare "*") when the token pins concrete origins, so cred‑less cross-origin
 * POSTs from the embedding site are accepted while other sites are not.
 */
function corsHeaders(allowOrigin: string): Record<string, string> {
	return {
		"Access-Control-Allow-Origin": allowOrigin,
		"Access-Control-Allow-Methods": "POST, OPTIONS",
		"Access-Control-Allow-Headers": "content-type",
		Vary: "Origin",
	};
}

function clientIp(req: Request): string {
	const fwd = req.headers.get("x-forwarded-for");
	if (fwd) return fwd.split(",")[0]!.trim();
	return req.headers.get("x-real-ip") ?? "unknown";
}

export function OPTIONS(req: Request): Response {
	// Preflight: we can't verify the token body here, so echo the requesting
	// origin. The POST handler does the real token+origin enforcement.
	const origin = req.headers.get("origin");
	return new Response(null, { status: 204, headers: corsHeaders(origin ?? "*") });
}

export async function POST(req: Request): Promise<Response> {
	const origin = req.headers.get("origin");
	const body = (await req.json().catch(() => ({}))) as WidgetSessionBody;

	const token = typeof body.token === "string" ? body.token : "";
	const identity = token ? verifyWidgetToken(token) : null;
	if (!identity) {
		return Response.json({ error: "invalid widget token" }, { status: 401 });
	}

	if (!isOriginAllowed(identity.origins, origin)) {
		return Response.json({ error: "origin not allowed for this widget" }, { status: 403 });
	}

	// Once the origin is validated, all further responses may be read
	// cross-origin, so carry CORS headers. When the token pins concrete origins
	// we echo the request origin; "*" tokens (dev) may fall back to "*".
	const allowOrigin = identity.origins.includes("*") ? (origin ?? "*") : origin!;
	const cors = corsHeaders(allowOrigin);

	// Rate limit: per-IP first (cheapest abuse signal), then per-token.
	const ip = clientIp(req);
	const ipLimit = perIpLimiter.check(`ip:${ip}`);
	const tokenLimit = ipLimit.allowed ? perTokenLimiter.check(`token:${token}`) : ipLimit;
	if (!ipLimit.allowed || !tokenLimit.allowed) {
		const retryAfter = Math.max(ipLimit.retryAfterSeconds, tokenLimit.retryAfterSeconds);
		return Response.json(
			{ error: "rate limit exceeded" },
			{ status: 429, headers: { ...cors, "Retry-After": String(retryAfter) } },
		);
	}

	const channel = body.channel === "text" ? "text" : "voice";
	const visitor = body.visitor ?? {};
	const variables: Record<string, string> = {};
	if (typeof visitor.name === "string" && visitor.name.trim()) {
		variables.caller_name = visitor.name.trim();
		variables.visitor_name = visitor.name.trim();
	}
	if (typeof visitor.email === "string" && visitor.email.trim()) {
		variables.visitor_email = visitor.email.trim();
	}

	try {
		const session = await gatewayFetch<{
			call_id: string;
			room_url: string;
			token: string;
			agent_id: string;
			agent_version: number;
		}>("POST", "/v1/sessions", {
			agent_id: identity.agentId,
			channel,
			...(Object.keys(variables).length > 0 ? { variables } : {}),
			metadata: {
				source: "widget",
				origin: origin ?? "",
				organization_id: identity.organizationId,
			},
		});
		// Return ONLY the LiveKit join info — never the gateway key or agent version.
		return Response.json(
			{ call_id: session.call_id, room_url: session.room_url, token: session.token },
			{ status: 201, headers: cors },
		);
	} catch (err) {
		console.error("[widget-session] gateway session start failed:", err);
		return Response.json({ error: (err as Error).message }, { status: 502, headers: cors });
	}
}
