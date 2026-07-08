import { assignAgentToOrganization, db, getAgentOrganizationId } from "@repo/database";
import { logger } from "@repo/logs";

/**
 * One-time migration: agents used to be globally visible (no local ownership
 * record). Assigns every gateway agent that has no AgentOrganization row yet
 * to a target organization, so the Voice Agents list can filter by active org.
 *
 * Usage: pnpm migrate:agent-orgs [organizationSlug]
 * With no argument, requires there to be exactly one organization in the DB.
 */
async function main() {
	const slugArg = process.argv[2];

	const organization = slugArg
		? await db.organization.findUnique({ where: { slug: slugArg } })
		: await pickSoleOrganization();

	if (!organization) {
		logger.error(
			slugArg
				? `No organization with slug "${slugArg}".`
				: "Multiple organizations exist — pass a slug: pnpm migrate:agent-orgs <slug>",
		);
		process.exitCode = 1;
		return;
	}

	const gatewayUrl = (process.env.VOICE_GATEWAY_URL ?? "http://localhost:8787").replace(/\/$/, "");
	const gatewayKey = process.env.VOICE_GATEWAY_API_KEY;
	if (!gatewayKey) {
		logger.error("VOICE_GATEWAY_API_KEY is not configured.");
		process.exitCode = 1;
		return;
	}

	const res = await fetch(`${gatewayUrl}/v1/agents`, {
		headers: { Authorization: `Bearer ${gatewayKey}` },
	});
	if (!res.ok) {
		logger.error(`Gateway request failed (${res.status}): ${await res.text()}`);
		process.exitCode = 1;
		return;
	}
	const { agents } = (await res.json()) as { agents: { id: string; name: string }[] };
	logger.info(`Found ${agents.length} gateway agent(s).`);

	let assigned = 0;
	let skipped = 0;
	for (const agent of agents) {
		const existingOrgId = await getAgentOrganizationId(agent.id);
		if (existingOrgId) {
			logger.info(`Skipping "${agent.name}" (${agent.id}) — already owned.`);
			skipped++;
			continue;
		}
		await assignAgentToOrganization(agent.id, organization.id);
		logger.success(`Assigned "${agent.name}" (${agent.id}) -> ${organization.name}.`);
		assigned++;
	}

	logger.success(`Done. Assigned ${assigned} agent(s), skipped ${skipped} (already owned).`);
}

async function pickSoleOrganization() {
	const organizations = await db.organization.findMany();
	return organizations.length === 1 ? organizations[0] : null;
}

main()
	.catch((err) => {
		logger.error(err);
		process.exitCode = 1;
	})
	.finally(() => process.exit());
