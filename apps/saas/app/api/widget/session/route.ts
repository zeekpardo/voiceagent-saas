import { resolveCrmProvider } from "@repo/api/modules/crm/lib/resolve";
import { resolveSourceIdForAgent } from "@repo/api/modules/crm/lib/resolve-source";
import {
	allowedSessionChannels,
	isChannelAllowed,
	readChannelMode,
} from "@repo/api/modules/voiceagents/lib/channel-mode";
import { mergeCustomVariables } from "@repo/api/modules/voiceagents/lib/custom-variables";
import { gatewayFetch } from "@repo/api/modules/voiceagents/lib/gateway";
import { createSharedRateLimiter } from "@repo/api/modules/voiceagents/lib/rate-limit";
import type { GatewayAgent } from "@repo/api/modules/voiceagents/lib/schema";
import { isOriginAllowed, verifyWidgetToken } from "@repo/api/modules/voiceagents/lib/widget-token";
import { auth } from "@repo/auth";
import { getAgentSource, getOrganizationMembership } from "@repo/database";

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

// Fixed-window limits, shared across instances via Redis when REDIS_URL is set
// (else per-instance in-memory — see rate-limit.ts). Distinct namespaces so the
// per-IP and per-token counters never collide in the shared store.
const perIpLimiter = createSharedRateLimiter("widget:ip", 5, 10 * 60 * 1000); // 5 starts / 10 min
const perTokenLimiter = createSharedRateLimiter("widget:token", 20, 60 * 60 * 1000); // 20 / hour

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

/**
 * Best-effort client IP for rate-limit keying. `x-forwarded-for` is an ordered
 * chain "client, proxy1, proxy2, …" where the LEFT-most entries are supplied by
 * the caller and trivially spoofed (prepend a random value each request to roll
 * past the per-IP limiter). We therefore take the RIGHT-most hop — the address
 * the trust boundary directly in front of us actually observed and appended —
 * not `split(",")[0]`.
 *
 * ASSUMPTION: exactly one trusted proxy (Railway's edge) sits in front of this
 * service and appends the real peer IP as the LAST XFF element. If a fleet of N
 * trusted proxies is ever introduced, skip N hops from the right instead of
 * taking a single one. Falls back to `x-real-ip` (proxy-set single value) and
 * then a constant so local dev (no XFF at all) still keys deterministically.
 */
function clientIp(req: Request): string {
	const fwd = req.headers.get("x-forwarded-for");
	if (fwd) {
		const hops = fwd
			.split(",")
			.map((h) => h.trim())
			.filter(Boolean);
		if (hops.length > 0) return hops[hops.length - 1]!;
	}
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
	const secFetchSite = req.headers.get("sec-fetch-site");
	const body = (await req.json().catch(() => ({}))) as WidgetSessionBody;

	const token = typeof body.token === "string" ? body.token : "";
	const identity = token ? verifyWidgetToken(token) : null;
	if (!identity) {
		return Response.json({ error: "invalid widget token" }, { status: 401 });
	}

	const selfOrigin = new URL(req.url).origin;

	// The allow-decision is anchored on the BROWSER-SENT Origin header, never on
	// the client-supplied body.parentOrigin. A genuine embed always sends an
	// Origin on this POST — same-origin fetches from our own iframe included
	// (browsers set Origin on every non-GET/HEAD request) — so a MISSING Origin
	// means a scripted/non-browser client. Reject it up front, otherwise a leaked
	// token could be replayed from a server with a spoofed parentOrigin to satisfy
	// the allowlist. (Previously the code fell back to parentOrigin when no Origin
	// was present, which is exactly that bypass.)
	if (!origin) {
		return Response.json({ error: "origin header required" }, { status: 403 });
	}

	// A same-origin request is our widget iframe (served from selfOrigin) calling
	// this route. Its browser Origin is our own domain and therefore cannot
	// identify the EMBEDDING site, so only here do we consult parentOrigin — the
	// value our own trusted iframe JS computed from ancestorOrigins/referrer. A
	// hit that claims our Origin while Sec-Fetch-Site reports cross-site/none is a
	// forged combination, so it is not treated as same-origin (it then fails the
	// allowlist below like any other outsider).
	//
	// DEFERRED (would break embeds if forced now): parentOrigin is still
	// client-readable, so this same-origin branch remains defense-in-depth atop
	// the signed token rather than a hard guarantee. Fully removing parentOrigin
	// from the decision requires browser-enforced pinning — dynamic
	// `frame-ancestors` on /widget/embed derived from the token's origins (today
	// next.config.ts pins `frame-ancestors *` for /widget/*). Tracked follow-up;
	// closing that needs the CSP change so anonymous embeds keep working.
	const parentOrigin = typeof body.parentOrigin === "string" ? body.parentOrigin : "";
	const sameOriginRequest =
		origin === selfOrigin && secFetchSite !== "cross-site" && secFetchSite !== "none";

	// Which origin to check against the token's allowlist:
	// - same-origin iframe: the iframe-reported parent site, or our own origin
	//   when the embed page was opened top-level (dev preview / no ancestor);
	// - cross-origin direct call (Origin ≠ ours): the caller's real, browser-sent
	//   Origin — a site POSTing here directly must itself be allowlisted;
	//   parentOrigin is ignored.
	const effectiveOrigin = sameOriginRequest ? parentOrigin || selfOrigin : origin;

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
		: await perIpLimiter.check(`ip:${ip}`);
	const tokenLimit = ipLimit.allowed ? await perTokenLimiter.check(`token:${token}`) : ipLimit;
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

	// Account-context hydration: resolve the widget agent's connected Source (an
	// agent with exactly one ENABLED attached Source resolves unambiguously — see
	// resolveSourceIdForAgent) and pull its CRM account context (location_*,
	// customValue.*) plus this source's Job Flow Variable overrides, mirroring the
	// builder test-session and CRM-trigger paths. Best-effort throughout: a CRM
	// hiccup, an unattached source, or a missing mapping must never fail or block
	// starting a widget session — it just means the widget behaves like today.
	const sourceId = await resolveSourceIdForAgent({ agentId: identity.agentId }).catch(() => null);
	const [provider, mapping] = await Promise.all([
		sourceId ? resolveCrmProvider(sourceId).catch(() => null) : Promise.resolve(null),
		sourceId ? getAgentSource(identity.agentId, sourceId).catch(() => null) : Promise.resolve(null),
	]);
	const accountContext = provider
		? await provider.getAccountContext().catch(() => ({}) as Record<string, string>)
		: ({} as Record<string, string>);

	const visitor = body.visitor ?? {};
	const visitorVariables: Record<string, string> = {};
	if (typeof visitor.name === "string" && visitor.name.trim()) {
		visitorVariables.caller_name = visitor.name.trim();
		visitorVariables.visitor_name = visitor.name.trim();
	}
	if (typeof visitor.email === "string" && visitor.email.trim()) {
		visitorVariables.visitor_email = visitor.email.trim();
	}
	// CRM account context is the base; explicit visitor name/email always win —
	// same precedence sessions.ts and the trigger route use for runtime variables.
	const runtimeVariables = { ...accountContext, ...visitorVariables };
	// Fold in per-source Job Flow Variable overrides/defaults (lowest precedence —
	// runtimeVariables above always wins).
	const variables = mergeCustomVariables(agentConfig, mapping, runtimeVariables);

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
