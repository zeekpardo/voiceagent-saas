import {
	configHasSecrets,
	isSourceConfigSealed,
	sealSourceConfig,
} from "@repo/api/modules/sources/lib/config-crypto";
import { db } from "@repo/database";
import { logger } from "@repo/logs";

/**
 * One-time (idempotent) migration: encrypt the token secrets in every existing
 * Source.config at rest. Legacy rows were written in plaintext before
 * SOURCE_ENCRYPTION_KEY existed; this re-seals them. Safe to re-run — already
 * sealed rows and rows without secrets are skipped.
 *
 * Usage:
 *   1. Set SOURCE_ENCRYPTION_KEY in .env (openssl rand -base64 32).
 *   2. pnpm --filter @repo/scripts migrate:source-crypto
 *      (or from tooling/scripts: pnpm migrate:source-crypto)
 */
async function main() {
	if (!process.env.SOURCE_ENCRYPTION_KEY?.trim()) {
		logger.error(
			"SOURCE_ENCRYPTION_KEY is not set — nothing would be encrypted. Set it (openssl rand -base64 32) and re-run.",
		);
		process.exitCode = 1;
		return;
	}

	const sources = await db.source.findMany();
	logger.info(`Found ${sources.length} source(s).`);

	let sealed = 0;
	let skipped = 0;
	for (const source of sources) {
		const config = source.config as Record<string, string>;
		if (!configHasSecrets(config) || isSourceConfigSealed(config)) {
			skipped++;
			continue;
		}

		const next = sealSourceConfig(config);
		await db.source.update({ where: { id: source.id }, data: { config: next } });
		logger.success(`Sealed source ${source.id} (${source.name}).`);
		sealed++;
	}

	logger.success(`Done. Sealed ${sealed} source(s), skipped ${skipped}.`);
}

main()
	.catch((err) => {
		logger.error(err);
		process.exitCode = 1;
	})
	.finally(() => process.exit());
