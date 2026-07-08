import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Signed, non-expiring trigger token: identifies (agent, source) inside a
 * webhook URL that a CRM automation calls to start a voice call. The token
 * pins the URL to one Source, so the resulting call's metadata carries which
 * Source triggered it (crm sync + live-tools resolve unambiguously). Unlike
 * OAuth state, these live inside saved workflows, so they carry no TTL —
 * rotating BETTER_AUTH_SECRET revokes them all.
 */

function secret(): string {
	const s = process.env.BETTER_AUTH_SECRET;
	if (!s) throw new Error("BETTER_AUTH_SECRET is required for trigger token signing");
	return s;
}

function sign(payload: string): string {
	return createHmac("sha256", secret()).update(`voice-trigger.${payload}`).digest("base64url");
}

export function createTriggerToken(agentId: string, sourceId: string): string {
	const payload = `${Buffer.from(agentId).toString("base64url")}.${Buffer.from(sourceId).toString("base64url")}`;
	return `${payload}.${sign(payload)}`;
}

export function verifyTriggerToken(token: string): { agentId: string; sourceId: string } | null {
	const parts = token.split(".");
	if (parts.length !== 3) return null;
	const [agentB64, sourceB64, signature] = parts as [string, string, string];
	const expected = sign(`${agentB64}.${sourceB64}`);
	if (expected.length !== signature.length) return null;
	if (!timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) return null;
	return {
		agentId: Buffer.from(agentB64, "base64url").toString(),
		sourceId: Buffer.from(sourceB64, "base64url").toString(),
	};
}
