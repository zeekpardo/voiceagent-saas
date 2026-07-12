import {
	composeInstructions,
	type PersonaPromptInput,
} from "@repo/api/modules/voiceagents/lib/persona-prompt";
import { createPersona, getAgentOrganizationId, listPersonas } from "@repo/database";
import { logger } from "@repo/logs";

/**
 * Persona v2 — Phase 2 migration: give every personaless agent a default persona.
 *
 * Background: agents live on the gateway (agt_…), personas live in the SaaS DB
 * (org-scoped) and are attached to an agent via `config.personaId`. Phase 3 will
 * make a persona REQUIRED; this backfill ensures no existing agent breaks by
 * giving each personaless agent a persona populated from its CURRENT identity
 * fields (`config.name` → persona name, `config.responseStyle` → howToRespond,
 * `config.guardrails` → guardrails). Voice/model persona fields (ttsVoice/
 * llmModel) are left null so per-agent config keeps winning at compile time.
 *
 * SAFETY / behavior preservation:
 *   - The agent's already-composed `config.instructions` is NOT recomposed. We
 *     attach `personaId` by re-sending the EXISTING config with that one field
 *     added, so the live prompt is byte-identical after migration. Zero behavior
 *     change at migration time. The persona only takes effect on a future,
 *     deliberate republish (Phase 3, once the per-agent responseStyle/guardrails
 *     fields are retired — see the equivalence note below).
 *
 * Idempotent:
 *   - Agents that already have a `config.personaId` are skipped.
 *   - Agents with no local AgentOrganization row (not owned by this DB) are
 *     skipped — there is no org to scope the persona to.
 *   - If a prior run created the persona but failed before attaching it, a
 *     matching org persona (same name + howToRespond + guardrails) is reused
 *     rather than duplicated.
 *
 * Default is --dry-run: it logs every agent it WOULD migrate, the persona it
 * would create, and an equivalence check — and writes NOTHING. Pass --apply to
 * perform the writes.
 *
 * Usage:
 *   pnpm --filter @repo/scripts migrate:persona-backfill            # dry-run (default)
 *   pnpm --filter @repo/scripts migrate:persona-backfill --apply    # perform writes
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

interface GatewayAgent {
	id: string;
	name: string;
	config: Record<string, unknown>;
}

/** Read a string config field, trimmed, or "" when absent/blank. */
function str(config: Record<string, unknown>, key: string): string {
	const v = config[key];
	return typeof v === "string" ? v.trim() : "";
}

/**
 * Compare the composed prompt WITHOUT the persona (current behavior) to the
 * composed prompt WITH the new persona but the per-agent responseStyle/guardrails
 * retired (Phase-3 semantics). Both use the current compiler, isolating the one
 * effect of the migration. Returns the set of added / removed lines.
 */
function diffLines(before: string, after: string) {
	const beforeSet = new Set(before.split("\n"));
	const afterSet = new Set(after.split("\n"));
	const added = after.split("\n").filter((l) => !beforeSet.has(l) && l.trim() !== "");
	const removed = before.split("\n").filter((l) => !afterSet.has(l) && l.trim() !== "");
	return { added, removed };
}

async function main() {
	const apply = process.argv.includes("--apply");
	const mode = apply ? "APPLY" : "DRY-RUN";

	if (!gatewayKey) {
		logger.error("VOICE_GATEWAY_API_KEY is not configured.");
		process.exitCode = 1;
		return;
	}

	logger.info(`Persona backfill — ${mode}. Gateway: ${gatewayUrl}`);

	const { agents } = await gateway<{ agents: GatewayAgent[] }>("GET", "/v1/agents");
	logger.info(`Found ${agents.length} gateway agent(s).`);

	let migrated = 0;
	let skippedHasPersona = 0;
	let skippedUnowned = 0;
	let equivalenceWarnings = 0;

	for (const agent of agents) {
		const config = (agent.config ?? {}) as Record<string, unknown>;

		// Already has a persona → skip (idempotent).
		if (str(config, "personaId")) {
			skippedHasPersona++;
			continue;
		}

		// No local ownership row → nothing to scope a persona to.
		const organizationId = await getAgentOrganizationId(agent.id);
		if (!organizationId) {
			logger.warn(`Skip "${agent.name}" (${agent.id}) — no AgentOrganization row (unowned).`);
			skippedUnowned++;
			continue;
		}

		const name = str(config, "name") || agent.name.trim() || "Agent";
		const responseStyle = str(config, "responseStyle");
		const guardrails = str(config, "guardrails");
		const goal = str(config, "goal");
		// Agents carry no tone/voice-style words of their own (those live only on
		// personas), so there is nothing to carry → the new persona starts with none.
		const styles: string[] = [];

		const personaInput: PersonaPromptInput = {
			name,
			styles,
			howToRespond: responseStyle,
			guardrails: guardrails || null,
			ttsVoice: null,
			llmModel: null,
		};

		// Equivalence: current compile (no persona) vs Phase-3 compile (persona,
		// per-agent responseStyle/guardrails retired). Isolates the migration's
		// only effect on the same compiler.
		const beforeCompiled = composeInstructions(
			goal,
			null,
			guardrails || null,
			responseStyle || null,
		);
		const afterCompiled = composeInstructions(goal, personaInput, null, null);
		const { added, removed } = diffLines(beforeCompiled, afterCompiled);

		const guardrailsPreserved = guardrails === "" || afterCompiled.includes(guardrails);
		const tonePreserved = responseStyle === "" || afterCompiled.includes(responseStyle);
		// The only expected additions are the persona IDENTITY (and PERSONALITY,
		// but styles is always empty here). Anything else, or any removal, warns.
		const onlyIdentityAdded = added.every(
			(l) => l.startsWith("## IDENTITY") || l.startsWith("You are "),
		);
		const equivalenceOk =
			guardrailsPreserved && tonePreserved && onlyIdentityAdded && removed.length === 0;
		if (!equivalenceOk) {
			equivalenceWarnings++;
		}

		logger.log("");
		logger.info(`Agent "${agent.name}" (${agent.id}) → org ${organizationId}`);
		logger.log(`  persona.name         = ${JSON.stringify(name)}`);
		logger.log(`  persona.styles       = [] (agents carry none)`);
		logger.log(
			`  persona.howToRespond = ${responseStyle ? `${responseStyle.length} chars` : "(empty)"}`,
		);
		logger.log(`  persona.guardrails   = ${guardrails ? `${guardrails.length} chars` : "(none)"}`);
		logger.log(`  persona.ttsVoice/llmModel = null (per-agent config still wins)`);
		logger.log(
			`  equivalence: guardrails=${guardrailsPreserved ? "preserved" : "LOST"} tone=${tonePreserved ? "preserved" : "LOST"}`,
		);
		if (added.length) {
			logger.log(`  added on republish: ${JSON.stringify(added)}`);
		}
		if (removed.length) {
			logger.warn(`  REMOVED on republish (unexpected): ${JSON.stringify(removed)}`);
		}
		if (!equivalenceOk) {
			logger.warn("  ⚠ equivalence check did NOT fully pass — review this agent.");
		}

		if (apply) {
			const existing = (await listPersonas(organizationId)).find(
				(p) =>
					p.name === name &&
					(p.howToRespond ?? "") === responseStyle &&
					(p.guardrails ?? "") === guardrails,
			);
			const persona =
				existing ??
				(await createPersona({
					organizationId,
					name,
					styles,
					howToRespond: responseStyle,
					guardrails: guardrails || null,
					ttsVoice: null,
					llmModel: null,
				}));
			// Attach personaId WITHOUT recomposing: re-send existing config + id.
			// config.instructions is left exactly as-is → live prompt unchanged.
			await gateway("PATCH", `/v1/agents/${encodeURIComponent(agent.id)}`, {
				...config,
				personaId: persona.id,
			});
			logger.success(`  ${existing ? "reused" : "created"} persona ${persona.id} and attached it.`);
		} else {
			logger.log(`  [dry-run] would create persona + PATCH personaId (no recompile).`);
		}

		migrated++;
	}

	logger.log("");
	logger.success(
		`${mode} complete. ${apply ? "Migrated" : "Would migrate"} ${migrated} agent(s); ` +
			`skipped ${skippedHasPersona} (already have a persona), ${skippedUnowned} (unowned). ` +
			`${equivalenceWarnings} equivalence warning(s).`,
	);
}

main()
	.catch((err) => {
		logger.error(err);
		process.exitCode = 1;
	})
	.finally(() => process.exit());
