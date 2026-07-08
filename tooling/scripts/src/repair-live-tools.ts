import { ensureCrmLiveTools } from "@repo/api/modules/crm/lib/live-tools";
import { db, getCrmLiveTools } from "@repo/database";
import { logger } from "@repo/logs";

/**
 * One-time repair after the live-tools naming round-trip: gateway tools were
 * briefly registered under per-source names (`update_contact__<sourceId>`),
 * which broke the LLM-facing function names. Re-registers them under the
 * clean global names, remaps every agent config that references the old tool
 * ids (toolIds, flow nodes and the builder canvas), and deletes the old
 * gateway registrations. Idempotent: with no id changes it just re-ensures.
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
	if (!res.ok) throw new Error(`${method} ${path} failed (${res.status}): ${await res.text()}`);
	return (await res.json()) as T;
}

async function main() {
	if (!gatewayKey) {
		logger.error("VOICE_GATEWAY_API_KEY is not configured.");
		process.exitCode = 1;
		return;
	}

	const member = await db.member.findFirst({ orderBy: { createdAt: "asc" } });
	if (!member) {
		logger.error("No organization member found to own the tool registrations.");
		process.exitCode = 1;
		return;
	}

	// Current gateway registrations these rows point at (possibly the
	// namespaced ones) — captured before ensure overwrites the rows.
	const oldRows = await getCrmLiveTools();
	const oldIdByName = new Map(oldRows.map((r) => [r.name, r.toolId]));

	// Gateway names actually in use — detect whether the stored ids are stale
	// (i.e. registered under namespaced names that must be replaced).
	const { tools: gatewayTools } = await gateway<{ tools: { id: string; name: string }[] }>(
		"GET",
		"/v1/tools",
	);
	const gatewayNameById = new Map(gatewayTools.map((t) => [t.id, t.name]));

	const staleIds = [...oldIdByName.entries()].filter(([name, toolId]) => {
		const registeredName = gatewayNameById.get(toolId);
		return registeredName !== undefined && registeredName !== name;
	});

	if (staleIds.length === 0) {
		logger.info("Registered tool names already match — re-ensuring only.");
		await ensureCrmLiveTools(member.userId);
		logger.success("Done.");
		return;
	}

	// Rows still hold the namespaced registrations — drop them so ensure
	// creates fresh global-named tools instead of patching the wrong ones.
	await db.crmLiveTool.deleteMany({});
	logger.info(`Re-registering ${staleIds.length} tool(s) under their global names…`);
	const newTools = await ensureCrmLiveTools(member.userId);
	const newIdByName = new Map(newTools.map((t) => [t.name, t.id]));

	const idMap = new Map<string, string>();
	for (const [name, oldId] of staleIds) {
		const newId = newIdByName.get(name);
		if (newId) idMap.set(oldId, newId);
	}

	const { agents } = await gateway<{ agents: { id: string; name: string; config: unknown }[] }>(
		"GET",
		"/v1/agents",
	);
	for (const agent of agents) {
		let json = JSON.stringify(agent.config);
		let changed = false;
		for (const [oldId, newId] of idMap) {
			if (json.includes(oldId)) {
				json = json.split(oldId).join(newId);
				changed = true;
			}
		}
		if (!changed) continue;
		await gateway("PATCH", `/v1/agents/${encodeURIComponent(agent.id)}`, JSON.parse(json));
		logger.success(`Remapped tool ids on agent "${agent.name}" (${agent.id}).`);
	}

	for (const [name, oldId] of staleIds) {
		await gateway("DELETE", `/v1/tools/${encodeURIComponent(oldId)}`).catch((err) => {
			logger.warn(`Could not delete old gateway tool ${name} (${oldId}): ${err}`);
		});
		logger.info(`Deleted old gateway tool ${name} (${oldId}).`);
	}
	logger.success("Repair complete.");
}

main()
	.catch((err) => {
		logger.error(err);
		process.exitCode = 1;
	})
	.finally(() => process.exit());
