import { createHmac, timingSafeEqual } from "node:crypto";

import {
	executeBookAppointment,
	executeCheckAvailability,
} from "@repo/api/modules/crm/lib/calendar";
import {
	executeAddTag,
	executeMoveStage,
	executeRemoveTag,
	executeUpdateContact,
	resolveContactId,
} from "@repo/api/modules/crm/lib/contact-tools";
import { seenToolSignatures } from "@repo/api/modules/crm/lib/ghl-webhook";
import { type HttpTraceEntry, withHttpTrace } from "@repo/api/modules/crm/lib/http-trace";
import { GhlApiError } from "@repo/api/modules/crm/lib/providers/ghl-client";
import { resolveCrmProvider } from "@repo/api/modules/crm/lib/resolve";
import { resolveSourceIdForAgent } from "@repo/api/modules/crm/lib/resolve-source";
import { decryptSourceSecret } from "@repo/api/modules/sources/lib/config-crypto";
import { gatewayFetch } from "@repo/api/modules/voiceagents/lib/gateway";
import { getCrmLiveToolByName } from "@repo/database";

/**
 * Live CRM tool invocations from the voice worker (tools-as-webhooks). The
 * worker POSTs here mid-call, signed with the per-tool secret issued at
 * registration (see packages/api/modules/crm/lib/live-tools.ts). Tool names
 * are global (they're the LLM's function names); WHICH Source's CRM an
 * invocation acts on comes from the call's metadata.source_id — set when the
 * call is created — falling back to the agent's sole enabled attached source.
 * Ambiguous calls (multi-source agent, no source_id) are refused verbally,
 * never guessed: acting on the wrong sub-account would bleed data across
 * locations.
 *
 * Business failures return 200 with {result:{error,...}} — the worker treats
 * any non-2xx as a hard tool failure, and we prefer handing the LLM a spoken
 * recovery message instead.
 *
 * This static route wins over the /api/[[...rest]] catch-all.
 *
 * This file is intentionally a thin verify+dispatch shell — per-tool
 * handler logic lives in packages/api/modules/crm/lib (contact-tools.ts,
 * calendar.ts, spoken-time.ts).
 */

const TOLERANCE_SECONDS = 300;

interface ToolInvocation {
	tool: string;
	call_id: string;
	agent_id: string;
	metadata: Record<string, unknown> | null;
	arguments: Record<string, unknown>;
}

function verify(secret: string, timestamp: string | null, signature: string | null, body: string) {
	if (!timestamp || !signature) return false;
	const age = Math.abs(Date.now() / 1000 - Number(timestamp));
	if (!Number.isFinite(age) || age > TOLERANCE_SECONDS) return false;
	const expected = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
	const received = signature.replace(/^hmac-sha256=/, "");
	if (expected.length !== received.length) return false;
	return timingSafeEqual(Buffer.from(expected), Buffer.from(received));
}

function toolResult(result: unknown): Response {
	return Response.json({ result });
}

/**
 * Which Source this invocation acts on: explicit metadata.source_id wins
 * (stamped at call creation by sessions/trigger routes); otherwise an agent
 * with exactly one enabled attached Source resolves unambiguously. See
 * resolveSourceIdForAgent for the shared rule.
 */
async function resolveSourceId(invocation: ToolInvocation): Promise<string | null> {
	const explicit = invocation.metadata?.source_id;
	return resolveSourceIdForAgent({
		explicitSourceId: typeof explicit === "string" ? explicit : null,
		agentId: invocation.agent_id,
	});
}

export async function POST(req: Request): Promise<Response> {
	const raw = await req.text();

	let invocation: ToolInvocation;
	try {
		invocation = JSON.parse(raw) as ToolInvocation;
	} catch {
		return Response.json({ error: "invalid JSON" }, { status: 400 });
	}

	const toolName = invocation.tool;
	const liveTool = toolName ? await getCrmLiveToolByName(toolName) : null;
	if (!liveTool) {
		return Response.json({ error: "unknown tool" }, { status: 401 });
	}

	const ok = verify(
		// Stored sealed at rest; legacy plaintext rows pass through unchanged.
		decryptSourceSecret(liveTool.secret),
		req.headers.get("x-voice-timestamp"),
		req.headers.get("x-voice-signature"),
		raw,
	);
	if (!ok) {
		return Response.json({ error: "invalid signature" }, { status: 401 });
	}

	// Replay guard: a re-sent signed invocation reuses its signature (HMAC over
	// timestamp+body). Drop duplicates within the signature-validity window.
	const signature = req.headers.get("x-voice-signature");
	if (signature && seenToolSignatures.add(signature)) {
		return toolResult({ ok: true, duplicate: true });
	}

	// Trace every outbound CRM HTTP exchange this invocation makes and attach
	// it to the call's event log (fire-and-forget — never delays the tool reply).
	const { result: response, entries } = await withHttpTrace(() => dispatchTool(invocation));
	if (entries.length > 0 && invocation.call_id) {
		void flushHttpTrace(invocation.call_id, invocation.tool, entries);
	}
	return response;
}

/** Post collected CRM HTTP traces to the gateway as http.request call events. */
async function flushHttpTrace(
	callId: string,
	tool: string,
	entries: HttpTraceEntry[],
): Promise<void> {
	try {
		await gatewayFetch("POST", `/v1/calls/${encodeURIComponent(callId)}/events`, {
			// The gateway accepts at most 20 events per append.
			events: entries.slice(0, 20).map((e) => ({
				type: "http.request",
				payload: {
					tool,
					method: e.method,
					url: e.url,
					status: e.status,
					ok: e.ok,
					duration_ms: e.durationMs,
					request: e.request,
					response: e.response,
				},
			})),
		});
	} catch (err) {
		console.warn(`[crm-live-tools] http trace flush failed (call ${callId}):`, err);
	}
}

async function dispatchTool(invocation: ToolInvocation): Promise<Response> {
	const toolName = invocation.tool;
	const sourceId = await resolveSourceId(invocation);
	const provider = sourceId ? await resolveCrmProvider(sourceId) : null;
	if (!sourceId || !provider) {
		return toolResult({ error: "no_crm", message: "No CRM connected. Continue without it." });
	}

	const isCalendarTool = toolName === "check_availability" || toolName === "book_appointment";

	try {
		const args = invocation.arguments ?? {};

		// Availability is contact-independent — never force a contact upsert for it.
		if (toolName === "check_availability") {
			return toolResult(
				await executeCheckAvailability(provider, args, invocation.agent_id, sourceId),
			);
		}

		const contactId = await resolveContactId(provider, invocation.metadata);
		if (!contactId) {
			return toolResult({
				error: "no_contact",
				message:
					"No CRM contact for this caller — the value was not saved. Continue the conversation naturally; do NOT repeat your last question.",
			});
		}

		switch (toolName) {
			case "update_contact":
				return toolResult(await executeUpdateContact(provider, contactId, args));
			case "add_tag":
				return toolResult(await executeAddTag(provider, contactId, args));
			case "remove_tag":
				return toolResult(await executeRemoveTag(provider, contactId, args));
			case "move_stage":
				return toolResult(await executeMoveStage(provider, contactId, args));
			case "book_appointment":
				return toolResult(
					await executeBookAppointment(provider, contactId, args, invocation.agent_id, sourceId),
				);
			default:
				return toolResult({ error: "unknown_tool", message: `Unknown tool "${toolName}".` });
		}
	} catch (err) {
		// The marketplace app may lack calendar scopes — recover verbally, don't fail.
		if (
			isCalendarTool &&
			err instanceof GhlApiError &&
			(err.status === 401 || err.status === 403)
		) {
			return toolResult({
				error: "calendar_access",
				message:
					"Calendar access isn't enabled for this account connection yet. Offer to have someone follow up to schedule.",
			});
		}
		console.error(`[crm-live-tools] ${toolName} (call ${invocation.call_id}) failed:`, err);
		return toolResult({
			error: "crm_error",
			message:
				"The CRM update failed. Continue the call and mention a human will follow up. Do NOT repeat your last question.",
		});
	}
}
