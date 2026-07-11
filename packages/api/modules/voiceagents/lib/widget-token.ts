import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Signed, non-expiring widget token: embedded in the <script> snippet a
 * customer pastes onto their own website, it lets an anonymous visitor start
 * a voice/text session with exactly one agent — no logged-in user required.
 *
 * The token pins the (agentId, organizationId) it may start sessions for and
 * the list of website `origins` allowed to use it (public route checks the
 * request Origin against this list; "*" allows any origin, for dev). Because
 * the snippet lives in third-party page source, the token carries no TTL —
 * rotating BETTER_AUTH_SECRET revokes every widget token at once.
 *
 * The HMAC domain prefix ("voice-widget.") is distinct from the trigger
 * token's ("voice-trigger."), so a trigger token can never verify as a widget
 * token or vice-versa even under the same secret.
 */

interface WidgetTokenPayload {
	agentId: string;
	organizationId: string;
	/** Allowed website origins, e.g. ["https://client-site.com"]. "*" = any. */
	origins: string[];
}

function secret(): string {
	const s = process.env.BETTER_AUTH_SECRET;
	if (!s) throw new Error("BETTER_AUTH_SECRET is required for widget token signing");
	return s;
}

function sign(payload: string): string {
	return createHmac("sha256", secret()).update(`voice-widget.${payload}`).digest("base64url");
}

export function createWidgetToken(
	agentId: string,
	organizationId: string,
	origins: string[],
): string {
	const payload: WidgetTokenPayload = { agentId, organizationId, origins };
	const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
	return `${encoded}.${sign(encoded)}`;
}

export function verifyWidgetToken(token: string): WidgetTokenPayload | null {
	const parts = token.split(".");
	if (parts.length !== 2) return null;
	const [encoded, signature] = parts as [string, string];
	const expected = sign(encoded);
	if (expected.length !== signature.length) return null;
	if (!timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) return null;
	try {
		const parsed = JSON.parse(Buffer.from(encoded, "base64url").toString()) as WidgetTokenPayload;
		if (
			typeof parsed?.agentId !== "string" ||
			typeof parsed?.organizationId !== "string" ||
			!Array.isArray(parsed?.origins) ||
			!parsed.origins.every((o) => typeof o === "string")
		) {
			return null;
		}
		return {
			agentId: parsed.agentId,
			organizationId: parsed.organizationId,
			origins: parsed.origins,
		};
	} catch {
		return null;
	}
}

/**
 * Whether a request Origin is permitted by a token's pinned origins. "*" in
 * the list allows any origin (dev/embed-anywhere); otherwise the request must
 * carry an Origin header that exactly matches one entry.
 */
export function isOriginAllowed(origins: string[], origin: string | null): boolean {
	if (origins.includes("*")) return true;
	if (!origin) return false;
	return origins.includes(origin);
}
