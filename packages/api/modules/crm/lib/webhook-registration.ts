import { getVoiceEngineWebhook, saveVoiceEngineWebhook } from "@repo/database";

import { gatewayFetch } from "../../voiceagents/lib/gateway";

/**
 * Register this app as a webhook consumer on the voice engine (idempotent).
 * The engine signs deliveries with the secret it returns at registration;
 * /api/webhooks/voice verifies with the stored copy.
 */
export async function ensureVoiceWebhook(): Promise<void> {
	const base = (process.env.NEXT_PUBLIC_SAAS_URL ?? "http://localhost:3000").replace(/\/$/, "");
	const url = `${base}/api/webhooks/voice`;

	const existing = await getVoiceEngineWebhook(url);
	if (existing) return;

	// Drop any stale registration for this URL (its secret is unrecoverable).
	const { webhooks } = await gatewayFetch<{ webhooks: { id: string; url: string }[] }>(
		"GET",
		"/v1/webhooks",
	);
	for (const wh of webhooks.filter((w) => w.url === url)) {
		await gatewayFetch("DELETE", `/v1/webhooks/${wh.id}`).catch(() => {});
	}

	const created = await gatewayFetch<{ id: string; secret: string }>("POST", "/v1/webhooks", {
		url,
		event_filter: ["call.completed"],
	});
	await saveVoiceEngineWebhook({ url, secret: created.secret, gatewayId: created.id });
}
