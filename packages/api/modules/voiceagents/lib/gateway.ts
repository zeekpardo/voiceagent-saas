import { ORPCError } from "@orpc/server";

/**
 * Server-side client for the voice agent engine (agent-gateway).
 * The vk_live_ key stays here — it never reaches the browser; the UI talks
 * to these oRPC procedures, which proxy the gateway.
 */

const gatewayUrl = () => process.env.VOICE_GATEWAY_URL ?? "http://localhost:8787";
const gatewayKey = () => process.env.VOICE_GATEWAY_API_KEY as string;

export async function gatewayFetch<T>(
	method: string,
	path: string,
	body?: unknown,
): Promise<T> {
	if (!gatewayKey()) {
		throw new ORPCError("INTERNAL_SERVER_ERROR", {
			message: "VOICE_GATEWAY_API_KEY is not configured",
		});
	}
	const res = await fetch(`${gatewayUrl().replace(/\/$/, "")}${path}`, {
		method,
		headers: {
			Authorization: `Bearer ${gatewayKey()}`,
			...(body !== undefined ? { "Content-Type": "application/json" } : {}),
		},
		...(body !== undefined ? { body: JSON.stringify(body) } : {}),
	});
	const data = (await res.json().catch(() => ({}))) as T & {
		error?: { code?: string; message?: string };
	};
	if (!res.ok) {
		throw new ORPCError(res.status === 404 ? "NOT_FOUND" : "BAD_REQUEST", {
			message: data.error?.message ?? `Voice gateway request failed (${res.status})`,
		});
	}
	return data;
}
