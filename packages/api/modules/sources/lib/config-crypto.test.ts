import { randomBytes } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
	configHasSecrets,
	decryptSourceSecret,
	encryptSourceSecret,
	isSourceConfigSealed,
	openSourceConfig,
	sealSourceConfig,
} from "./config-crypto";

const KEY_B64 = randomBytes(32).toString("base64");

const ENV_KEY = "SOURCE_ENCRYPTION_KEY";

describe("config-crypto with a configured key", () => {
	beforeEach(() => {
		process.env[ENV_KEY] = KEY_B64;
	});
	afterEach(() => {
		delete process.env[ENV_KEY];
		vi.restoreAllMocks();
	});

	it("round-trips a secret", () => {
		const plain = "ghl-access-token-abc123";
		const sealed = encryptSourceSecret(plain);
		expect(sealed.startsWith("enc:v1:")).toBe(true);
		expect(sealed).not.toContain(plain);
		expect(decryptSourceSecret(sealed)).toBe(plain);
	});

	it("produces a fresh IV each time (ciphertext differs, plaintext matches)", () => {
		const a = encryptSourceSecret("same-secret");
		const b = encryptSourceSecret("same-secret");
		expect(a).not.toBe(b);
		expect(decryptSourceSecret(a)).toBe("same-secret");
		expect(decryptSourceSecret(b)).toBe("same-secret");
	});

	it("detects tampering via the GCM auth tag", () => {
		const sealed = encryptSourceSecret("secret");
		const [prefix, version, iv, ct, tag] = sealed.split(":");
		// Flip a byte in the ciphertext.
		const buf = Buffer.from(ct, "base64");
		buf[0] ^= 0xff;
		const tampered = [prefix, version, iv, buf.toString("base64"), tag].join(":");
		expect(() => decryptSourceSecret(tampered)).toThrow();
	});

	it("throws on a malformed envelope", () => {
		expect(() => decryptSourceSecret("enc:v1:only-one-part")).toThrow();
	});

	it("passes through legacy plaintext (no enc: prefix)", () => {
		expect(decryptSourceSecret("legacy-plaintext-token")).toBe("legacy-plaintext-token");
	});

	it("seals only the secret fields and leaves the rest readable", () => {
		const config = {
			authMode: "oauth",
			locationId: "loc_123",
			accessToken: "access-abc",
			refreshToken: "refresh-xyz",
			tokenExpiresAt: "2026-01-01T00:00:00.000Z",
		};
		const sealed = sealSourceConfig(config);

		expect(sealed.locationId).toBe("loc_123");
		expect(sealed.authMode).toBe("oauth");
		expect(sealed.tokenExpiresAt).toBe("2026-01-01T00:00:00.000Z");
		expect(sealed.accessToken.startsWith("enc:v1:")).toBe(true);
		expect(sealed.refreshToken.startsWith("enc:v1:")).toBe(true);

		expect(openSourceConfig(sealed)).toEqual(config);
	});

	it("sealSourceConfig is idempotent", () => {
		const once = sealSourceConfig({ accessToken: "abc" });
		const twice = sealSourceConfig(once);
		expect(twice.accessToken).toBe(once.accessToken);
		expect(openSourceConfig(twice).accessToken).toBe("abc");
	});

	it("opens a config with legacy plaintext secrets unchanged", () => {
		const legacy = { locationId: "loc_1", accessToken: "plain-token" };
		expect(openSourceConfig(legacy)).toEqual(legacy);
	});

	it("reports secret presence and sealed status", () => {
		expect(configHasSecrets({ locationId: "loc_1" })).toBe(false);
		expect(configHasSecrets({ accessToken: "abc" })).toBe(true);

		expect(isSourceConfigSealed({ accessToken: "plain" })).toBe(false);
		expect(isSourceConfigSealed(sealSourceConfig({ accessToken: "plain" }))).toBe(true);
		// No secrets at all counts as sealed (nothing to protect).
		expect(isSourceConfigSealed({ locationId: "loc_1" })).toBe(true);
	});
});

describe("config-crypto without a key (dev passthrough)", () => {
	beforeEach(() => {
		delete process.env[ENV_KEY];
		// vitest runs with NODE_ENV=test, so this is the dev/non-prod branch.
		vi.spyOn(console, "warn").mockImplementation(() => {});
	});
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("stores secrets as plaintext and round-trips them", () => {
		const sealed = sealSourceConfig({ accessToken: "abc" });
		expect(sealed.accessToken).toBe("abc");
		expect(openSourceConfig(sealed).accessToken).toBe("abc");
	});

	it("throws in production when the key is missing", () => {
		const prev = process.env.NODE_ENV;
		vi.stubEnv("NODE_ENV", "production");
		try {
			expect(() => encryptSourceSecret("abc")).toThrow(/SOURCE_ENCRYPTION_KEY is required/);
		} finally {
			vi.stubEnv("NODE_ENV", prev ?? "test");
		}
	});
});
