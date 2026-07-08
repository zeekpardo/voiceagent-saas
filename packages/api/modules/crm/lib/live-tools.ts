import { getCrmLiveToolByNameAndSource, upsertCrmLiveToolForSource } from "@repo/database";

import { gatewayFetch } from "../../voiceagents/lib/gateway";

/**
 * Live CRM tools (tools-as-webhooks): gateway-registered LLM tools the
 * voice agent can call MID-CALL to read/write a source's CRM (contact
 * updates, tags, stage moves, calendar availability + booking). The gateway
 * signs each invocation with a per-tool secret; /api/tools/crm verifies and
 * executes against the resolved CrmProvider.
 *
 * Tool names are namespaced per Source on the gateway (`${name}__${sourceId}`)
 * so multiple simultaneously-connected Sources never collide.
 */

interface LiveToolDef {
	name: string;
	description: string;
	jsonSchema: Record<string, unknown>;
}

interface GatewayTool {
	id: string;
	name: string;
	secret?: string;
}

export const LIVE_TOOL_DEFS: LiveToolDef[] = [
	{
		name: "update_contact",
		description:
			"Update a field on the CRM contact record for this caller. Use the field's human name (e.g. 'Speaks English', 'Callback Number').",
		jsonSchema: {
			type: "object",
			properties: {
				field_name: { type: "string", description: "Human name of the CRM field" },
				value: { type: "string" },
			},
			required: ["field_name", "value"],
			additionalProperties: false,
		},
	},
	{
		name: "add_tag",
		description: "Add a tag to the CRM contact for this caller. Tags are idempotent.",
		jsonSchema: {
			type: "object",
			properties: {
				tag: { type: "string" },
			},
			required: ["tag"],
			additionalProperties: false,
		},
	},
	{
		name: "move_stage",
		description:
			"Move this caller's opportunity to a pipeline stage in the CRM (creates the opportunity if missing). Use the pipeline and stage display names.",
		jsonSchema: {
			type: "object",
			properties: {
				pipeline: { type: "string" },
				stage: { type: "string" },
			},
			required: ["pipeline", "stage"],
			additionalProperties: false,
		},
	},
	{
		name: "check_availability",
		description:
			"Check open appointment slots on the calendar. Returns the next available times. Use before offering or booking a time.",
		jsonSchema: {
			type: "object",
			properties: {
				calendar_name: {
					type: "string",
					description: "optional — the calendar's name; omit if there is only one",
				},
				from_date: {
					type: "string",
					description: "ISO date to search from, defaults to today",
				},
				days: {
					type: "number",
					description: "how many days ahead to search, default 5",
				},
			},
			required: [],
			additionalProperties: false,
		},
	},
	{
		name: "book_appointment",
		description:
			"Book the caller into an appointment slot. Only use a start time you confirmed via check_availability and that the caller agreed to.",
		jsonSchema: {
			type: "object",
			properties: {
				start_time: {
					type: "string",
					description: "exact ISO 8601 start time of the chosen slot",
				},
				calendar_name: {
					type: "string",
					description: "optional — the calendar's name; omit if there is only one",
				},
				title: {
					type: "string",
					description: "optional appointment title",
				},
			},
			required: ["start_time"],
			additionalProperties: false,
		},
	},
];

function toolEndpointUrl(): string {
	const base = (process.env.NEXT_PUBLIC_SAAS_URL ?? "http://localhost:3000").replace(/\/$/, "");
	return `${base}/api/tools/crm`;
}

/** The gateway-registered tool name for a (def, source) pair — globally unique. */
function gatewayToolName(defName: string, sourceId: string): string {
	return `${defName}__${sourceId}`;
}

/**
 * Register the live CRM tools for a Source on the gateway (idempotent) and
 * persist their signing secrets. Safe to call on every Source connect.
 */
export async function ensureCrmLiveTools(
	sourceId: string,
	userId: string,
): Promise<{ id: string; name: string; description: string }[]> {
	const endpointUrl = toolEndpointUrl();
	const result: { id: string; name: string; description: string }[] = [];

	for (const def of LIVE_TOOL_DEFS) {
		const gatewayName = gatewayToolName(def.name, sourceId);
		const existing = await getCrmLiveToolByNameAndSource(def.name, sourceId);

		if (existing) {
			// We already hold the secret — keep the gateway copy current (best-effort).
			await gatewayFetch("PATCH", `/v1/tools/${existing.toolId}`, {
				description: def.description,
				json_schema: def.jsonSchema,
				endpoint_url: endpointUrl,
				enabled: true,
			}).catch((err) => {
				console.warn(`[crm-live-tools] patch ${gatewayName} failed:`, err);
			});
			result.push({ id: existing.toolId, name: def.name, description: def.description });
			continue;
		}

		const created = await createGatewayTool(def, gatewayName, endpointUrl);
		await upsertCrmLiveToolForSource({
			userId,
			sourceId,
			name: def.name,
			toolId: created.id,
			secret: created.secret,
		});
		result.push({ id: created.id, name: def.name, description: def.description });
	}

	return result;
}

async function createGatewayTool(
	def: LiveToolDef,
	gatewayName: string,
	endpointUrl: string,
): Promise<{ id: string; secret: string }> {
	const body = {
		name: gatewayName,
		description: def.description,
		json_schema: def.jsonSchema,
		endpoint_url: endpointUrl,
		timeout_ms: 8000,
		enabled: true,
	};

	try {
		return await gatewayFetch<{ id: string; secret: string }>("POST", "/v1/tools", body);
	} catch {
		// "A tool named X already exists" — a stale registration without a stored
		// secret. The secret is unrecoverable (returned only on create), so delete
		// the gateway tool and recreate it.
		const { tools } = await gatewayFetch<{ tools: GatewayTool[] }>("GET", "/v1/tools");
		const stale = tools.find((t) => t.name === gatewayName);
		if (!stale) throw new Error(`Gateway rejected tool "${gatewayName}" and it is not listed`);
		await gatewayFetch("DELETE", `/v1/tools/${stale.id}`);
		return await gatewayFetch<{ id: string; secret: string }>("POST", "/v1/tools", body);
	}
}
