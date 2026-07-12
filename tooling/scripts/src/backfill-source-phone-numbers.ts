import {
	createSourcePhoneNumber,
	findSourcePhoneNumberByE164,
	listAgentSources,
	listAllSources,
} from "@repo/database";
import { logger } from "@repo/logs";

/**
 * Backfill: nest every gateway-provisioned phone number under a Source by
 * creating the matching `SourcePhoneNumber` row.
 *
 * Background: numbers are provisioned on the voice gateway (GET /v1/numbers),
 * while the SaaS DB owns the number↔source mapping (`SourcePhoneNumber`, which is
 * source-scoped → org-scoped). Historically numbers were bought before that
 * mapping table existed, so `source_phone_number` can be empty even though live
 * numbers route calls. This script creates the missing mapping rows so the
 * source-page "manage numbers" UI shows them.
 *
 * Row shape mirrors `purchaseNumberForSource`
 * (packages/api/modules/sources/procedures/numbers.ts):
 *   sourceId       — the owning Source
 *   e164           — gateway number.e164 (globally @unique)
 *   providerRef    — gateway number.id (the unique per-number engine handle, e.g.
 *                    num_…). NOTE: we deliberately do NOT use number.provider_ref
 *                    here — for these Telnyx numbers provider_ref is the provider
 *                    NAME ("telnyx"), which is non-unique and would break the
 *                    release/re-route path that keys off providerRef. The engine id
 *                    is the unique handle the release endpoint expects.
 *   inboundAgentId — gateway number.inbound_agent_id
 *   label          — gateway number.inbound_agent_name ?? e164 (sensible default)
 *
 * Source resolution (never guesses):
 *   - Exactly ONE Source exists → attach every number to it.
 *   - Multiple Sources → resolve per-number via the number's inbound_agent_id →
 *     its attached Source(s). Exactly one attached source → use it; zero, many,
 *     or no inbound agent → flag AMBIGUOUS and skip (leave for a human).
 *   - Zero Sources → nothing to attach; abort.
 *
 * Idempotent: a number whose e164 already exists as a SourcePhoneNumber (in any
 * source) is skipped.
 *
 * Default is --dry-run: logs every row it WOULD create and writes NOTHING. Pass
 * --apply to perform the writes.
 *
 * Usage:
 *   pnpm --filter @repo/scripts migrate:source-phone-numbers            # dry-run (default)
 *   pnpm --filter @repo/scripts migrate:source-phone-numbers --apply    # perform writes
 */

const gatewayUrl = (process.env.VOICE_GATEWAY_URL ?? "http://localhost:8787").replace(/\/$/, "");
const gatewayKey = process.env.VOICE_GATEWAY_API_KEY;

async function gateway<T>(method: string, path: string, body?: unknown): Promise<T> {
	const res = await fetch(`${gatewayUrl}${path}`, {
		method,
		headers: {
			Authorization: `Bearer ${gatewayKey}`,
			...(body !== undefined ? { "Content-Type": "application/json" } : {}),
		},
		...(body !== undefined ? { body: JSON.stringify(body) } : {}),
	});
	if (!res.ok) {
		throw new Error(`${method} ${path} failed (${res.status}): ${await res.text()}`);
	}
	return (await res.json()) as T;
}

interface GatewayNumber {
	id: string;
	e164: string;
	provider_ref: string;
	inbound_agent_id: string | null;
	inbound_agent_name: string | null;
	created_at: string;
}

async function main() {
	const apply = process.argv.includes("--apply");
	const mode = apply ? "APPLY" : "DRY-RUN";

	if (!gatewayKey) {
		logger.error("VOICE_GATEWAY_API_KEY is not configured.");
		process.exitCode = 1;
		return;
	}

	logger.info(`Source-phone-number backfill — ${mode}. Gateway: ${gatewayUrl}`);

	const sources = await listAllSources();
	if (sources.length === 0) {
		logger.error("No Source rows exist — nothing to attach numbers to. Aborting.");
		process.exitCode = 1;
		return;
	}
	const soleSource = sources.length === 1 ? sources[0] : null;
	logger.info(
		soleSource
			? `Single source "${soleSource.name}" (${soleSource.id}) — every number attaches to it.`
			: `${sources.length} sources — resolving each number by its inbound agent.`,
	);

	const { numbers } = await gateway<{ numbers: GatewayNumber[] }>("GET", "/v1/numbers");
	logger.info(`Found ${numbers.length} gateway number(s).`);

	let created = 0;
	let skippedExisting = 0;
	let skippedAmbiguous = 0;

	for (const number of numbers) {
		// Idempotent: already mapped (in any source) → skip.
		const existing = await findSourcePhoneNumberByE164(number.e164);
		if (existing) {
			logger.log(
				`  skip ${number.e164} — already mapped to source ${existing.sourceId} (${existing.id}).`,
			);
			skippedExisting++;
			continue;
		}

		// Resolve the owning source.
		let sourceId: string;
		let sourceName: string;
		if (soleSource) {
			sourceId = soleSource.id;
			sourceName = soleSource.name;
		} else {
			if (!number.inbound_agent_id) {
				logger.warn(`  AMBIGUOUS ${number.e164} — no inbound agent to resolve a source. Skipping.`);
				skippedAmbiguous++;
				continue;
			}
			const attached = await listAgentSources(number.inbound_agent_id);
			if (attached.length !== 1) {
				logger.warn(
					`  AMBIGUOUS ${number.e164} — inbound agent ${number.inbound_agent_id} has ${attached.length} attached source(s); cannot pick one. Skipping.`,
				);
				skippedAmbiguous++;
				continue;
			}
			sourceId = attached[0].sourceId;
			sourceName = attached[0].source.name;
		}

		// The unique per-number engine handle (num_…). NOT number.provider_ref,
		// which is the provider NAME ("telnyx") and non-unique — release/re-route
		// keys off providerRef, so it must be the unique engine id.
		const providerRef = number.id || null;
		const label = number.inbound_agent_name || number.e164;

		logger.log("");
		logger.info(`Number ${number.e164} → source "${sourceName}" (${sourceId})`);
		logger.log(`  e164           = ${number.e164}`);
		logger.log(`  providerRef    = ${JSON.stringify(providerRef)}`);
		logger.log(`  inboundAgentId = ${JSON.stringify(number.inbound_agent_id)}`);
		logger.log(`  label          = ${JSON.stringify(label)}`);

		if (apply) {
			const row = await createSourcePhoneNumber({
				sourceId,
				e164: number.e164,
				providerRef,
				label,
				inboundAgentId: number.inbound_agent_id ?? null,
			});
			logger.success(`  created SourcePhoneNumber ${row.id}.`);
		} else {
			logger.log(`  [dry-run] would create SourcePhoneNumber.`);
		}

		created++;
	}

	logger.log("");
	logger.success(
		`${mode} complete. ${apply ? "Created" : "Would create"} ${created} row(s); ` +
			`skipped ${skippedExisting} (already mapped), ${skippedAmbiguous} (ambiguous source).`,
	);
}

main()
	.catch((err) => {
		logger.error(err);
		process.exitCode = 1;
	})
	.finally(() => process.exit());
