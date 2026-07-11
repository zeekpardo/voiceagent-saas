import {
	allowedSessionChannels,
	isChannelAllowed,
	readChannelMode,
} from "@repo/api/modules/voiceagents/lib/channel-mode";
import { gatewayFetch } from "@repo/api/modules/voiceagents/lib/gateway";
import { createRateLimiter } from "@repo/api/modules/voiceagents/lib/rate-limit";
import type { GatewayAgent } from "@repo/api/modules/voiceagents/lib/schema";
import { isOriginAllowed, verifyWidgetToken } from "@repo/api/modules/voiceagents/lib/widget-token";
import { auth } from "@repo/auth";
import { getOrganizationMembership } from "@repo/database";

/**
 * Public, token-gated session starter for the embeddable widget. An anonymous
 * visitor on a third-party website POSTs the widget token (baked into the
 * embed snippet) and gets back only the LiveKit join info — never the gateway
 * key. Gating is layered: a valid HMAC token, an Origin that the token pins,
 * and per-IP + per-token rate limits.
 *
 * One deliberate exception to origin pinning: the Studio's "Live test" pane
 * embeds the widget on OUR OWN origin, which is typically not on a widget's
 * allowlist. A same-origin request that carries a valid authenticated app
 * session belonging to a member of the widget's organization is allowed
 * regardless of the origins list (and skips the per-IP limiter so repeated
 * testing isn't throttled — the per-token limiter still applies). Anonymous
 * same-origin requests get no such bypass.
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
	/** The EMBEDDING page's origin, reported by the iframe app (ancestorOrigins /
	 * referrer). The iframe itself is served from OUR origin, so the request's
	 * Origin header can never identify the customer site — this field can. */
	parentOrigin?: string;
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

/**
 * Whether the request carries a valid app session for a member of the
 * organization that owns the widget token. Same-origin fetches from the
 * Studio send auth cookies automatically; anonymous requests (no/invalid
 * cookies) resolve to false. Best-effort: any auth error means "not an owner".
 */
async function isAuthenticatedOwner(req: Request, organizationId: string): Promise<boolean> {
	if (!req.headers.get("cookie")) return false;
	try {
		const session = await auth.api.getSession({ headers: req.headers });
		if (!session?.user) return false;
		const membership = await getOrganizationMembership(organizationId, session.user.id);
		return membership !== null;
	} catch {
		return false;
	}
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

	// Which origin to check against the token's allowlist:
	// - Cross-origin API call (Origin ≠ ours): the request Origin — a site
	//   calling this route directly must itself be allowlisted.
	// - Same-origin (the iframe app) or no Origin: the iframe reports the
	//   EMBEDDING page's origin as body.parentOrigin (ancestorOrigins/referrer);
	//   with no parent (the embed page opened top-level, e.g. dev preview) we
	//   check our own origin. parentOrigin is client-supplied — the signed token
	//   remains the real credential; origin pinning is defense-in-depth. True
	//   browser-enforced pinning (dynamic frame-ancestors from the token) is a
	//   tracked follow-up.
	const selfOrigin = new URL(req.url).origin;
	const parentOrigin = typeof body.parentOrigin === "string" ? body.parentOrigin : "";
	const effectiveOrigin =
		origin && origin !== selfOrigin ? origin : parentOrigin || origin || selfOrigin;

	// Studio live-test bypass: when the effective origin is our own app (the
	// editor's iframe reports OUR origin as its parent), an authenticated member
	// of the widget's organization may test it regardless of the origins list.
	// Only consulted for same-origin requests, so third-party sites can never
	// reach this path — and anonymous same-origin requests still need the
	// origin to be allowlisted.
	const studioOwner =
		effectiveOrigin === selfOrigin && (await isAuthenticatedOwner(req, identity.organizationId));

	if (!studioOwner && !isOriginAllowed(identity.origins, effectiveOrigin)) {
		return Response.json(
			{ error: "origin not allowed for this widget", origin: effectiveOrigin },
			{ status: 403 },
		);
	}

	// Once the origin is validated, all further responses may be read
	// cross-origin, so carry CORS headers. When the token pins concrete origins
	// we echo the request origin; "*" tokens (dev) may fall back to "*".
	const allowOrigin = identity.origins.includes("*") ? (origin ?? "*") : (origin ?? selfOrigin);
	const cors = corsHeaders(allowOrigin);

	// Rate limit: per-IP first (cheapest abuse signal), then per-token.
	// Authenticated studio testers skip the per-IP limiter (5/10min would make
	// iterating on a widget miserable) but stay subject to the per-token one.
	const ip = clientIp(req);
	const ipLimit = studioOwner
		? { allowed: true as const, retryAfterSeconds: 0 }
		: perIpLimiter.check(`ip:${ip}`);
	const tokenLimit = ipLimit.allowed ? perTokenLimiter.check(`token:${token}`) : ipLimit;
	if (!ipLimit.allowed || !tokenLimit.allowed) {
		const retryAfter = Math.max(ipLimit.retryAfterSeconds, tokenLimit.retryAfterSeconds);
		return Response.json(
			{ error: "rate limit exceeded" },
			{ status: 429, headers: { ...cors, "Retry-After": String(retryAfter) } },
		);
	}

	const channel = body.channel === "text" ? "text" : "voice";

	// Channel-mode enforcement: read the agent's allowed channels and reject a
	// disallowed one with 409 (best-effort — a config hiccup shouldn't hard-fail
	// the session; the engine revalidates too). `modes` rides on every response so
	// the widget UI can adapt (hide the disallowed mode button).
	const agentConfig = await gatewayFetch<GatewayAgent>(
		"GET",
		`/v1/agents/${encodeURIComponent(identity.agentId)}`,
	)
		.then((a) => a.config)
		.catch(() => undefined);
	const modes = allowedSessionChannels(readChannelMode(agentConfig));
	if (agentConfig && !isChannelAllowed(readChannelMode(agentConfig), channel)) {
		return Response.json(
			{ error: `this agent does not accept ${channel} sessions`, modes },
			{ status: 409, headers: cors },
		);
	}

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
		// `modes` lets the widget UI adapt (show only the allowed channel buttons).
		return Response.json(
			{ call_id: session.call_id, room_url: session.room_url, token: session.token, modes },
			{ status: 201, headers: cors },
		);
	} catch (err) {
		console.error("[widget-session] gateway session start failed:", err);
		return Response.json({ error: (err as Error).message }, { status: 502, headers: cors });
	}
}
