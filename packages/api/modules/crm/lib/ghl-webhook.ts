import { createVerify } from "node:crypto";

/**
 * GoHighLevel marketplace webhook verification + replay/loop guards.
 *
 * GHL signs the RAW request body with its private key and sends the signature
 * in the `x-wh-signature` header as base64 RSA-SHA256. We verify against GHL's
 * PUBLISHED public key. The signature covers the exact bytes GHL sent, so the
 * caller MUST pass the raw body string (never a re-serialized object).
 */

/**
 * GHL publishes a stable RSA public key that verifies its webhook signatures
 * (it's public key material — it verifies, it never decrypts). Paste the current
 * PEM from the GoHighLevel marketplace docs here, OR — preferred for ops — set
 * it per-environment via `GHL_WEBHOOK_PUBLIC_KEY` (full PEM), which always wins.
 *
 * This default is intentionally EMPTY rather than a guessed key: an incorrect
 * key would silently reject every webhook. With no key configured, verification
 * fails closed and warns once, so a misconfiguration is loud, not silent.
 */
const GHL_PUBLISHED_PUBLIC_KEY = "";

let warnedMissingKey = false;

function publicKey(): string | null {
	const key = process.env.GHL_WEBHOOK_PUBLIC_KEY?.trim() || GHL_PUBLISHED_PUBLIC_KEY;
	if (!key) {
		if (!warnedMissingKey) {
			warnedMissingKey = true;
			console.warn(
				"[ghl-webhook] no public key configured — set GHL_WEBHOOK_PUBLIC_KEY (GHL's published PEM). All webhooks are being rejected until it is set.",
			);
		}
		return null;
	}
	return key;
}

/**
 * Verify the `x-wh-signature` header against the raw body. Returns false (never
 * throws) on a missing/malformed signature or key so the route can 401 cleanly.
 */
export function verifyGhlWebhookSignature(rawBody: string, signature: string | null): boolean {
	if (!signature) return false;
	const key = publicKey();
	if (!key) return false;
	try {
		const verifier = createVerify("SHA256");
		verifier.update(rawBody);
		verifier.end();
		return verifier.verify(key, signature, "base64");
	} catch {
		return false;
	}
}

const DEFAULT_TOLERANCE_SECONDS = 300;

/**
 * Reject webhooks whose `timestamp` is too old (replay guard). GHL sends an ISO
 * timestamp; a missing/unparseable one is treated as stale. Returns true when
 * the event is fresh enough to process.
 */
export function isTimestampFresh(
	timestamp: string | number | undefined | null,
	toleranceSeconds = DEFAULT_TOLERANCE_SECONDS,
): boolean {
	if (timestamp == null) return false;
	const ms = typeof timestamp === "number" ? timestamp : Date.parse(String(timestamp));
	if (!Number.isFinite(ms)) return false;
	const ageSeconds = Math.abs(Date.now() - ms) / 1000;
	return ageSeconds <= toleranceSeconds;
}

/**
 * Tiny in-memory LRU set for de-duplicating webhook deliveries (by `webhookId`)
 * and for loop-avoidance (recording messageIds WE just sent so their echoed
 * OutboundMessage — or a re-delivered InboundMessage — is skipped). Fine for a
 * single process; a shared store is a later concern.
 */
export class LruSet {
	private readonly map = new Map<string, true>();

	constructor(private readonly max = 1000) {}

	/** Record `key`. Returns true if it was ALREADY present (a duplicate). */
	add(key: string): boolean {
		if (this.map.has(key)) {
			// Refresh recency.
			this.map.delete(key);
			this.map.set(key, true);
			return true;
		}
		this.map.set(key, true);
		if (this.map.size > this.max) {
			const oldest = this.map.keys().next().value;
			if (oldest !== undefined) this.map.delete(oldest);
		}
		return false;
	}

	has(key: string): boolean {
		return this.map.has(key);
	}

	get size(): number {
		return this.map.size;
	}
}

/** Process-wide de-dupe of delivered webhookIds. */
export const seenWebhookIds = new LruSet(2000);

/** Process-wide record of messageIds WE sent, to skip their echoes. */
export const sentMessageIds = new LruSet(2000);
