import { getPersonaById } from "@repo/database";
import { logger } from "@repo/logs";

/**
 * Persona v2 partial reversal — Phase 3b migration: move each persona's
 * `guardrails` back onto its ATTACHED agents' per-agent `config.guardrails`.
 *
 * Background: the Persona v2 refactor made the persona the source of truth for
 * guardrails (and voice/model). We are partially reversing that — guardrails are
 * once again a per-agent field (surfaced in the agent's "Job Information" tab) and
 * the compiler now sources `## GUARDRAILS` from `config.guardrails` ONLY, never
 * from the persona (see composeInstructions / toGatewayConfig). This backfill
 * preserves each attached agent's guardrails behavior across that compile switch.
 *
 * Agents live on the gateway (agt_…) and reference a persona via
 * `config.personaId`; personas live in the SaaS DB (org-scoped). For every agent
 * with a `personaId`, we look up the persona and copy its non-empty `guardrails`
 * into the agent's `config.guardrails` — but ONLY when the agent has no non-empty
 * `guardrails` of its own (NEVER clobber a per-agent value).
 *
 * VOICE / MODEL — no migration needed. The pre-reversal `applyPersonaVoice`/
 * `applyPersonaModel` were FILL-WHEN-EMPTY: a persona's ttsVoice/llmModel applied
 * only when the agent had left its `tts`/`llm` at the schema defaults (an explicit
 * per-agent pick always won). The agent's own `tts`/`llm` config is therefore
 * already authoritative, so removing the persona voice/model mapping changes no
 * agent that had made an explicit choice. (Agents left at the defaults simply keep
 * the defaults — the intended "agent config is authoritative" behavior.)
 *
 * SAFETY / behavior preservation:
 *   - We do NOT recompose `config.instructions`. We re-send the EXISTING config
 *     with `guardrails` added, so the LIVE prompt is byte-identical after
 *     migration (its already-composed instructions still carry the guardrails the
 *     old compiler emitted). The copied raw `config.guardrails` only takes effect
 *     on a future, deliberate republish — which now sources guardrails from it.
 *
 * Idempotent:
 *   - Agents without a `personaId`, or whose persona is gone / has empty
 *     guardrails, are skipped.
 *   - Agents that already have a non-empty `config.guardrails` are skipped
 *     (never clobbered) — so a second run is a no-op.
 *
 * Default is --dry-run: it logs every agent it WOULD change and writes NOTHING.
 * Pass --apply to perform the writes.
 *
 * Usage:
 *   pnpm --filter @repo/scripts migrate:persona-guardrails            # dry-run (default)
 *   pnpm --filter @repo/scripts migrate:persona-guardrails --apply    # perform writes
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

async function main() {
	const apply = process.argv.includes("--apply");
	const mode = apply ? "APPLY" : "DRY-RUN";

	if (!gatewayKey) {
		logger.error("VOICE_GATEWAY_API_KEY is not configured.");
		process.exitCode = 1;
		return;
	}

	logger.info(`Persona guardrails backfill — ${mode}. Gateway: ${gatewayUrl}`);

	const { agents } = await gateway<{ agents: GatewayAgent[] }>("GET", "/v1/agents");
	logger.info(`Found ${agents.length} gateway agent(s).`);

	let copied = 0;
	let skippedNoPersona = 0;
	let skippedPersonaGone = 0;
	let skippedPersonaNoGuardrails = 0;
	let skippedAgentHasOwn = 0;

	for (const agent of agents) {
		const config = (agent.config ?? {}) as Record<string, unknown>;

		const personaId = str(config, "personaId");
		if (!personaId) {
			skippedNoPersona++;
			continue;
		}

		const persona = await getPersonaById(personaId);
		if (!persona) {
			logger.warn(`Skip "${agent.name}" (${agent.id}) — persona ${personaId} no longer exists.`);
			skippedPersonaGone++;
			continue;
		}

		const personaGuardrails = (persona.guardrails ?? "").trim();
		if (!personaGuardrails) {
			skippedPersonaNoGuardrails++;
			continue;
		}

		const agentGuardrails = str(config, "guardrails");
		if (agentGuardrails) {
			// Agent already has its own guardrails — never clobber.
			logger.log(
				`Skip "${agent.name}" (${agent.id}) — already has ${agentGuardrails.length}-char guardrails.`,
			);
			skippedAgentHasOwn++;
			continue;
		}

		logger.log("");
		logger.info(`Agent "${agent.name}" (${agent.id}) ← persona "${persona.name}" (${personaId})`);
		logger.log(`  would set config.guardrails = ${personaGuardrails.length} chars (was empty)`);

		if (apply) {
			// Attach the guardrails WITHOUT recomposing: re-send existing config +
			// the guardrails field. config.instructions is left exactly as-is → the
			// live prompt is unchanged; the copied field applies on next republish.
			await gateway("PATCH", `/v1/agents/${encodeURIComponent(agent.id)}`, {
				...config,
				guardrails: personaGuardrails,
			});
			logger.success(`  copied persona guardrails onto config.guardrails.`);
		} else {
			logger.log(`  [dry-run] would PATCH config.guardrails (no recompile).`);
		}

		copied++;
	}

	logger.log("");
	logger.success(
		`${mode} complete. ${apply ? "Copied" : "Would copy"} guardrails onto ${copied} agent(s); ` +
			`skipped ${skippedNoPersona} (no persona), ${skippedPersonaGone} (persona gone), ` +
			`${skippedPersonaNoGuardrails} (persona has no guardrails), ` +
			`${skippedAgentHasOwn} (agent already has its own guardrails).`,
	);
}

main()
	.catch((err) => {
		logger.error(err);
		process.exitCode = 1;
	})
	.finally(() => process.exit());
