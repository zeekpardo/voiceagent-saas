import { createVerify } from "node:crypto";

import { getRedis } from "@repo/utils/lib/redis";

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
// Fetched verbatim from the official docs repo (GoHighLevel/highlevel-api-docs,
// docs/oauth/WebhookAuthentication.md) on 2026-07-11. Watch GHL's channels for
// rotation notices; GHL_WEBHOOK_PUBLIC_KEY env always wins over this default.
const GHL_PUBLISHED_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIICIjANBgkqhkiG9w0BAQEFAAOCAg8AMIICCgKCAgEAokvo/r9tVgcfZ5DysOSC
Frm602qYV0MaAiNnX9O8KxMbiyRKWeL9JpCpVpt4XHIcBOK4u3cLSqJGOLaPuXw6
dO0t6Q/ZVdAV5Phz+ZtzPL16iCGeK9po6D6JHBpbi989mmzMryUnQJezlYJ3DVfB
csedpinheNnyYeFXolrJvcsjDtfAeRx5ByHQmTnSdFUzuAnC9/GepgLT9SM4nCpv
uxmZMxrJt5Rw+VUaQ9B8JSvbMPpez4peKaJPZHBbU3OdeCVx5klVXXZQGNHOs8gF
3kvoV5rTnXV0IknLBXlcKKAQLZcY/Q9rG6Ifi9c+5vqlvHPCUJFT5XUGG5RKgOKU
J062fRtN+rLYZUV+BjafxQauvC8wSWeYja63VSUruvmNj8xkx2zE/Juc+yjLjTXp
IocmaiFeAO6fUtNjDeFVkhf5LNb59vECyrHD2SQIrhgXpO4Q3dVNA5rw576PwTzN
h/AMfHKIjE4xQA1SZuYJmNnmVZLIZBlQAF9Ntd03rfadZ+yDiOXCCs9FkHibELhC
HULgCsnuDJHcrGNd5/Ddm5hxGQ0ASitgHeMZ0kcIOwKDOzOU53lDza6/Y09T7sYJ
PQe7z0cvj7aE4B+Ax1ZoZGPzpJlZtGXCsu9aTEGEnKzmsFqwcSsnw3JB31IGKAyk
T1hhTiaCeIY/OwwwNUY2yvcCAwEAAQ==
-----END PUBLIC KEY-----`;

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

/**
 * Cross-instance de-dupe / replay guard. Backed by shared Redis when REDIS_URL
 * is set (atomic `SET key NX EX ttl`), else the in-memory `LruSet` above
 * UNCHANGED — so local dev / tests / CI (no Redis) keep the exact previous
 * per-instance behavior. Both `add` and `has` are async because a Redis op is.
 *
 * FAIL-OPEN: if a Redis op throws, we log and report "not seen" (add → false,
 * has → false). Dropping a real delivery as a phantom "duplicate" on a Redis
 * blip is worse than occasionally reprocessing one, so we bias to processing.
 */
export class DedupSet {
	private readonly redis = getRedis();
	private readonly memory: LruSet;

	constructor(
		private readonly prefix: string,
		max: number,
		private readonly ttlSeconds: number,
	) {
		this.memory = new LruSet(max);
	}

	private redisKey(key: string): string {
		return `dedup:${this.prefix}:${key}`;
	}

	/** Record `key`. Resolves true if it was ALREADY present (a duplicate). */
	async add(key: string): Promise<boolean> {
		if (!this.redis) {
			return this.memory.add(key);
		}
		try {
			// NX → set only if absent. Reply is "OK" on a fresh set (not a dup),
			// null when the key already existed (a duplicate). Atomic across instances.
			const res = await this.redis.set(this.redisKey(key), "1", "EX", this.ttlSeconds, "NX");
			return res === null;
		} catch (error) {
			console.error(
				`[dedup] redis error for ${this.prefix}.add, failing open (not-duplicate):`,
				error instanceof Error ? error.message : error,
			);
			return false;
		}
	}

	/** Resolves true if `key` has been recorded (and not yet expired). */
	async has(key: string): Promise<boolean> {
		if (!this.redis) {
			return this.memory.has(key);
		}
		try {
			return (await this.redis.exists(this.redisKey(key))) === 1;
		} catch (error) {
			console.error(
				`[dedup] redis error for ${this.prefix}.has, failing open (not-seen):`,
				error instanceof Error ? error.message : error,
			);
			return false;
		}
	}
}

// TTL bounds how long a delivered id / signature is remembered. A generous 24h
// covers realistic redelivery / replay windows (the routes also enforce a short
// timestamp-freshness / signature-validity window upstream).
const DEDUP_TTL_SECONDS = 24 * 60 * 60;

/** Cross-instance de-dupe of delivered webhookIds. */
export const seenWebhookIds = new DedupSet("ghl:webhook", 2000, DEDUP_TTL_SECONDS);

/** Cross-instance record of messageIds WE sent, to skip their echoes. */
export const sentMessageIds = new DedupSet("ghl:sent-msg", 2000, DEDUP_TTL_SECONDS);

/** Cross-instance replay guard for signed voice-engine webhook deliveries,
 * keyed by the engine's per-event id (X-Voice-Event-Id), or the request
 * signature when absent. A re-sent delivery is dropped as a duplicate. */
export const seenVoiceEventIds = new DedupSet("voice:event", 4000, DEDUP_TTL_SECONDS);

/** Cross-instance replay guard for signed live-CRM-tool invocations, keyed by
 * the request HMAC signature (unique per timestamp+body; a replay reuses it). */
export const seenToolSignatures = new DedupSet("tool:sig", 4000, DEDUP_TTL_SECONDS);
