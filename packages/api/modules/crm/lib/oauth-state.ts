import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Signed OAuth `state`: carries the connecting user's id, their active
 * organization id, and the provider type through the popup round-trip, so one
 * neutral callback route (/api/oauth/crm/callback — no CRM brand names
 * allowed in redirect URLs) can attribute the resulting Source without
 * relying on cookies. HMAC-signed with the auth secret, 10-minute expiry.
 */

const TTL_MS = 10 * 60 * 1000;

function secret(): string {
	const s = process.env.BETTER_AUTH_SECRET;
	if (!s) throw new Error("BETTER_AUTH_SECRET is required for OAuth state signing");
	return s;
}

function sign(payload: string): string {
	return createHmac("sha256", secret()).update(payload).digest("base64url");
}

function b64(s: string): string {
	return Buffer.from(s).toString("base64url");
}

function unb64(s: string): string {
	return Buffer.from(s, "base64url").toString();
}

export function createOauthState(userId: string, organizationId: string, providerType: string): string {
	const payload = `${b64(userId)}.${b64(organizationId)}.${b64(providerType)}.${Date.now() + TTL_MS}`;
	return `${payload}.${sign(payload)}`;
}

export function verifyOauthState(
	state: string,
): { userId: string; organizationId: string; providerType: string } | null {
	const parts = state.split(".");
	if (parts.length !== 5) return null;
	const [userB64, orgB64, providerB64, expires, signature] = parts as [
		string,
		string,
		string,
		string,
		string,
	];
	const payload = `${userB64}.${orgB64}.${providerB64}.${expires}`;
	const expected = sign(payload);
	if (expected.length !== signature.length) return null;
	if (!timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) return null;
	if (Date.now() > Number(expires)) return null;
	return {
		userId: unb64(userB64),
		organizationId: unb64(orgB64),
		providerType: unb64(providerB64),
	};
}
