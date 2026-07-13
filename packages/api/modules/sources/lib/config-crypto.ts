import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Encrypts the secret fields inside a Source's `config` blob at rest.
 *
 * A Source (a connected CRM sub-account) stores provider connection data as
 * JSON — for GoHighLevel that is `{ authMode, locationId, accessToken,
 * refreshToken, tokenExpiresAt }`. `accessToken` / `refreshToken` are bearer
 * credentials for the customer's CRM; a DB leak of them is a direct account
 * takeover. We encrypt ONLY those fields (field-level, not blob-level) so the
 * non-secret fields — `locationId` especially — stay readable for queries
 * (`findSourceByLocation`) and debugging.
 *
 * Wire format of an encrypted field value:
 *   enc:v1:<iv_b64>:<ciphertext_b64>:<tag_b64>
 * AES-256-GCM. The `v1` version tag leaves room for future key rotation.
 *
 * Key: env `SOURCE_ENCRYPTION_KEY`, a 32-byte key encoded as base64 (preferred,
 * e.g. `openssl rand -base64 32`) or hex (64 hex chars). Behaviour when the key
 * is missing:
 *   - production (`NODE_ENV === "production"`): throw loudly on first use.
 *   - dev: passthrough (secrets stored in plaintext) with a one-time warning, so
 *     local dev without the key keeps working.
 *
 * Legacy rows written before this feature hold plaintext token values (no
 * `enc:` prefix); `openSourceConfig` / `decryptSourceSecret` accept those
 * transparently, and any write re-seals them. Run `pnpm migrate:source-crypto`
 * (tooling/scripts) to eagerly re-seal all existing rows.
 */

const ALGORITHM = "aes-256-gcm";
const VERSION = "v1";
const ENC_PREFIX = `enc:${VERSION}:`;

/** The config keys that hold secrets and must be sealed. Non-secret keys
 * (locationId, authMode, tokenExpiresAt, …) are left readable. */
const SECRET_CONFIG_KEYS = ["accessToken", "refreshToken"] as const;

let warnedMissingKey = false;

function decodeKey(raw: string): Buffer {
	// 64 hex chars == 32 bytes; otherwise treat as base64.
	const key = /^[0-9a-fA-F]{64}$/.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
	if (key.length !== 32) {
		throw new Error(
			`SOURCE_ENCRYPTION_KEY must decode to 32 bytes (got ${key.length}). Generate one with: openssl rand -base64 32`,
		);
	}
	return key;
}

/**
 * The active encryption key, or `null` when none is configured. Callers decide what
 * a missing key means: the WRITE path (encryptSourceSecret) fails closed unless
 * plaintext is explicitly opted into, while the READ path keeps legacy plaintext
 * working and raises a specific error only for an encrypted value it cannot open.
 */
function resolveKey(): Buffer | null {
	const raw = process.env.SOURCE_ENCRYPTION_KEY?.trim();
	if (raw) return decodeKey(raw);
	return null;
}

/**
 * Encrypt a single secret string. Fails CLOSED when no key is configured: it throws
 * UNLESS the operator explicitly opted into plaintext with ALLOW_PLAINTEXT_SECRETS=1
 * (local dev only). Keying this off an explicit opt-in rather than NODE_ENV avoids
 * the failure mode where a deploy with NODE_ENV unset / "staging" / stripped by the
 * platform silently stores CRM OAuth tokens (account-takeover creds) in cleartext.
 */
export function encryptSourceSecret(plain: string): string {
	const key = resolveKey();
	if (!key) {
		if (process.env.ALLOW_PLAINTEXT_SECRETS === "1") {
			if (!warnedMissingKey) {
				warnedMissingKey = true;
				console.warn(
					"[source-config-crypto] SOURCE_ENCRYPTION_KEY is not set and ALLOW_PLAINTEXT_SECRETS=1 — CRM secrets are stored in PLAINTEXT. Dev only; never set this in production.",
				);
			}
			return plain;
		}
		throw new Error(
			"SOURCE_ENCRYPTION_KEY is required to protect CRM tokens at rest. Generate one with: openssl rand -base64 32 (or set ALLOW_PLAINTEXT_SECRETS=1 for local dev only).",
		);
	}

	const iv = randomBytes(12);
	const cipher = createCipheriv(ALGORITHM, key, iv);
	const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
	const tag = cipher.getAuthTag();
	return `${ENC_PREFIX}${iv.toString("base64")}:${ciphertext.toString("base64")}:${tag.toString(
		"base64",
	)}`;
}

/**
 * Decrypt a value produced by `encryptSourceSecret`. Values without the `enc:`
 * prefix are treated as legacy plaintext and returned as-is (lazy migration).
 * Throws on a tampered payload (GCM tag mismatch) or a malformed envelope.
 */
export function decryptSourceSecret(value: string): string {
	if (!value.startsWith(ENC_PREFIX)) return value; // legacy plaintext

	const key = resolveKey();
	if (!key) {
		throw new Error(
			"SOURCE_ENCRYPTION_KEY is not set but an encrypted source secret was found. Set the key that was used to encrypt it.",
		);
	}

	const [ivB64, ctB64, tagB64] = value.slice(ENC_PREFIX.length).split(":");
	if (!ivB64 || !ctB64 || !tagB64) {
		throw new Error("Malformed encrypted source secret.");
	}

	const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivB64, "base64"));
	decipher.setAuthTag(Buffer.from(tagB64, "base64"));
	const plain = Buffer.concat([
		decipher.update(Buffer.from(ctB64, "base64")),
		decipher.final(), // throws if the auth tag doesn't verify
	]);
	return plain.toString("utf8");
}

/** True if `value` is already an `enc:v1:` envelope. */
function isEncryptedValue(value: unknown): value is string {
	return typeof value === "string" && value.startsWith(ENC_PREFIX);
}

/**
 * Idempotent seal for a single standalone secret string (not a Source config
 * blob) — e.g. the HMAC signing secrets on VoiceEngineWebhook / CrmLiveTool.
 * Already-sealed values pass through untouched, so re-sealing is safe and this
 * cannot double-encrypt. Symmetric with `decryptSourceSecret` on the read side.
 */
export function sealSecret(value: string): string {
	return isEncryptedValue(value) ? value : encryptSourceSecret(value);
}

/**
 * Encrypt the known secret fields of a Source config before it is written to the
 * DB. Idempotent: already-sealed values are left untouched, so re-sealing on
 * every write is safe. Non-secret fields pass through unchanged.
 */
export function sealSourceConfig(config: Record<string, string>): Record<string, string> {
	const out: Record<string, string> = { ...config };
	for (const key of SECRET_CONFIG_KEYS) {
		const value = out[key];
		if (typeof value === "string" && value.length > 0 && !isEncryptedValue(value)) {
			out[key] = encryptSourceSecret(value);
		}
	}
	return out;
}

/**
 * Decrypt the known secret fields of a Source config after it is read from the
 * DB. Legacy plaintext values pass through unchanged.
 */
export function openSourceConfig(config: Record<string, string>): Record<string, string> {
	const out: Record<string, string> = { ...config };
	for (const key of SECRET_CONFIG_KEYS) {
		const value = out[key];
		if (typeof value === "string" && value.length > 0) {
			out[key] = decryptSourceSecret(value);
		}
	}
	return out;
}

/** True if the config holds any non-empty secret field. */
export function configHasSecrets(config: Record<string, string>): boolean {
	return SECRET_CONFIG_KEYS.some(
		(key) => typeof config[key] === "string" && config[key].length > 0,
	);
}

/** True if every non-empty secret field is already sealed. */
export function isSourceConfigSealed(config: Record<string, string>): boolean {
	return SECRET_CONFIG_KEYS.every((key) => {
		const value = config[key];
		return typeof value !== "string" || value.length === 0 || isEncryptedValue(value);
	});
}
