import { generateKeyPairSync, createSign } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { isTimestampFresh, LruSet, verifyGhlWebhookSignature } from "./ghl-webhook";

const ENV_KEY = "GHL_WEBHOOK_PUBLIC_KEY";

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const publicPem = publicKey.export({ type: "spki", format: "pem" }).toString();

function sign(body: string): string {
	const signer = createSign("SHA256");
	signer.update(body);
	signer.end();
	return signer.sign(privateKey, "base64");
}

describe("verifyGhlWebhookSignature", () => {
	beforeEach(() => {
		process.env[ENV_KEY] = publicPem;
	});
	afterEach(() => {
		delete process.env[ENV_KEY];
	});

	it("accepts a valid RSA-SHA256 signature over the raw body", () => {
		const body = JSON.stringify({ type: "InboundMessage", webhookId: "wh_1" });
		expect(verifyGhlWebhookSignature(body, sign(body))).toBe(true);
	});

	it("rejects a signature over a different body (tamper)", () => {
		const body = JSON.stringify({ type: "InboundMessage", webhookId: "wh_1" });
		const tampered = JSON.stringify({ type: "InboundMessage", webhookId: "wh_2" });
		expect(verifyGhlWebhookSignature(tampered, sign(body))).toBe(false);
	});

	it("rejects a missing or garbage signature", () => {
		const body = "{}";
		expect(verifyGhlWebhookSignature(body, null)).toBe(false);
		expect(verifyGhlWebhookSignature(body, "not-base64-🚫")).toBe(false);
	});

	it("fails closed when no public key is configured", () => {
		delete process.env[ENV_KEY];
		const body = "{}";
		expect(verifyGhlWebhookSignature(body, sign(body))).toBe(false);
	});
});

describe("isTimestampFresh", () => {
	it("accepts a recent timestamp and rejects a stale one", () => {
		expect(isTimestampFresh(new Date().toISOString())).toBe(true);
		expect(isTimestampFresh(Date.now())).toBe(true);
		const old = new Date(Date.now() - 10 * 60 * 1000).toISOString();
		expect(isTimestampFresh(old)).toBe(false);
	});

	it("treats missing/unparseable timestamps as stale", () => {
		expect(isTimestampFresh(undefined)).toBe(false);
		expect(isTimestampFresh(null)).toBe(false);
		expect(isTimestampFresh("not a date")).toBe(false);
	});

	it("honors a custom tolerance", () => {
		const t = new Date(Date.now() - 30 * 1000).toISOString();
		expect(isTimestampFresh(t, 10)).toBe(false);
		expect(isTimestampFresh(t, 60)).toBe(true);
	});
});

describe("LruSet", () => {
	it("reports first-seen vs duplicate keys", () => {
		const set = new LruSet(10);
		expect(set.add("a")).toBe(false); // first
		expect(set.add("a")).toBe(true); // duplicate
		expect(set.has("a")).toBe(true);
		expect(set.has("b")).toBe(false);
	});

	it("evicts the oldest key past capacity", () => {
		const set = new LruSet(2);
		set.add("a");
		set.add("b");
		set.add("c"); // evicts "a"
		expect(set.has("a")).toBe(false);
		expect(set.has("b")).toBe(true);
		expect(set.has("c")).toBe(true);
	});
});
