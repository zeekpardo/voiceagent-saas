import { beforeAll, describe, expect, it } from "vitest";

import { createTriggerToken } from "../../crm/lib/trigger-token";
import { createWidgetToken, isOriginAllowed, verifyWidgetToken } from "./widget-token";

beforeAll(() => {
	process.env.BETTER_AUTH_SECRET = "test-secret-for-widget-tokens";
});

describe("widget token", () => {
	it("round-trips agentId, organizationId, and origins", () => {
		const token = createWidgetToken("agent-1", "org-1", ["https://client-site.com"]);
		const decoded = verifyWidgetToken(token);
		expect(decoded).toEqual({
			agentId: "agent-1",
			organizationId: "org-1",
			origins: ["https://client-site.com"],
		});
	});

	it("supports a wildcard origin entry", () => {
		const token = createWidgetToken("agent-2", "org-2", ["*"]);
		expect(verifyWidgetToken(token)?.origins).toEqual(["*"]);
	});

	it("rejects a tampered payload", () => {
		const token = createWidgetToken("agent-1", "org-1", ["https://client-site.com"]);
		const [payload, sig] = token.split(".") as [string, string];
		// Flip the payload (re-encode a different agent) but keep the old signature.
		const forgedPayload = Buffer.from(
			JSON.stringify({ agentId: "agent-evil", organizationId: "org-1", origins: ["*"] }),
		).toString("base64url");
		expect(verifyWidgetToken(`${forgedPayload}.${sig}`)).toBeNull();
		expect(verifyWidgetToken(`${payload}.deadbeef`)).toBeNull();
	});

	it("rejects a malformed token", () => {
		expect(verifyWidgetToken("")).toBeNull();
		expect(verifyWidgetToken("only-one-part")).toBeNull();
		expect(verifyWidgetToken("a.b.c")).toBeNull();
	});

	it("does not cross-verify with a trigger token (distinct HMAC domain)", () => {
		// Same secret, sibling HMAC helper — the domain prefix must keep them apart.
		const triggerToken = createTriggerToken("agent-1", "source-1");
		expect(verifyWidgetToken(triggerToken)).toBeNull();
	});
});

describe("isOriginAllowed", () => {
	it("allows an exact match", () => {
		expect(isOriginAllowed(["https://a.com", "https://b.com"], "https://b.com")).toBe(true);
	});

	it("rejects a non-listed origin", () => {
		expect(isOriginAllowed(["https://a.com"], "https://evil.com")).toBe(false);
	});

	it("rejects a missing origin when origins are pinned", () => {
		expect(isOriginAllowed(["https://a.com"], null)).toBe(false);
	});

	it("allows any origin (including none) when wildcard is present", () => {
		expect(isOriginAllowed(["*"], "https://anything.com")).toBe(true);
		expect(isOriginAllowed(["*"], null)).toBe(true);
	});

	it("does not treat a subdomain or path as a match", () => {
		expect(isOriginAllowed(["https://a.com"], "https://sub.a.com")).toBe(false);
		expect(isOriginAllowed(["https://a.com"], "https://a.com/path")).toBe(false);
	});
});
