import { createHmac, timingSafeEqual } from "node:crypto";
import { db } from "@repo/database";
import { type CallCompletedEvent, syncCallToCrm } from "@repo/api/modules/crm/lib/sync";

/**
 * Voice engine events in (call.completed). HMAC-verified with the secret the
 * gateway issued at registration. A non-2xx response makes the gateway retry
 * with backoff, so transient CRM failures self-heal.
 *
 * This static route wins over the /api/[[...rest]] catch-all.
 */

const TOLERANCE_SECONDS = 300;

function verify(secret: string, timestamp: string | null, signature: string | null, body: string) {
	if (!timestamp || !signature) return false;
	const age = Math.abs(Date.now() / 1000 - Number(timestamp));
	if (!Number.isFinite(age) || age > TOLERANCE_SECONDS) return false;
	const expected = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
	const received = signature.replace(/^hmac-sha256=/, "");
	if (expected.length !== received.length) return false;
	return timingSafeEqual(Buffer.from(expected), Buffer.from(received));
}

export async function POST(req: Request): Promise<Response> {
	const raw = await req.text();

	const webhook = await db.voiceEngineWebhook.findFirst({ orderBy: { createdAt: "desc" } });
	if (!webhook) {
		// Nothing registered → nothing expected; don't invite retries.
		return Response.json({ received: true, skipped: "no webhook registered" });
	}

	const ok = verify(
		webhook.secret,
		req.headers.get("x-voice-timestamp"),
		req.headers.get("x-voice-signature"),
		raw,
	);
	if (!ok) {
		return Response.json({ error: "invalid signature" }, { status: 401 });
	}

	const event = JSON.parse(raw) as CallCompletedEvent;
	if (event.type !== "call.completed") {
		return Response.json({ received: true });
	}

	try {
		const result = await syncCallToCrm(event);
		if (result.skipped) {
			console.info(`[crm-sync] call ${event.call_id}: skipped — ${result.skipped}`);
		} else {
			console.info(
				`[crm-sync] call ${event.call_id} → ${result.provider} contact ${result.contactId}: ${result.fieldsUpdated} fields, tags [${result.tagsAdded?.join(", ")}]`,
			);
		}
		return Response.json({ received: true, ...result });
	} catch (err) {
		console.error(`[crm-sync] call ${event.call_id} failed:`, err);
		const status = (err as { status?: number }).status;
		// 4xx from the CRM (bad token, missing contact) won't heal on retry — ack it.
		if (typeof status === "number" && status < 500 && status !== 429) {
			return Response.json({ received: true, error: (err as Error).message });
		}
		return Response.json({ error: "sync failed, retry" }, { status: 500 });
	}
}
