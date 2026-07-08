import { createHmac, timingSafeEqual } from "node:crypto";
import { getAgentSource, getCrmLiveToolByNameAndSource } from "@repo/database";
import type { CrmCalendar, CrmProvider } from "@repo/api/modules/crm/lib/provider";
import { GhlApiError } from "@repo/api/modules/crm/lib/providers/ghl-client";
import { resolveCrmProvider } from "@repo/api/modules/crm/lib/resolve";

/**
 * Live CRM tool invocations from the voice worker (tools-as-webhooks). The
 * worker POSTs here mid-call, signed with the per-tool secret issued at
 * registration (see packages/api/modules/crm/lib/live-tools.ts). Tool names
 * on the gateway are namespaced `${toolName}__${sourceId}` so multiple
 * simultaneously-connected Sources never collide; this route splits that
 * back apart to resolve which Source's CRM to act against.
 *
 * Business failures return 200 with {result:{error,...}} — the worker treats
 * any non-2xx as a hard tool failure, and we prefer handing the LLM a spoken
 * recovery message instead.
 *
 * This static route wins over the /api/[[...rest]] catch-all.
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

/** Strip to digits, assume US when 10 digits, ensure a leading +. */
function normalizePhone(raw: string): string {
	const digits = raw.replace(/\D/g, "");
	if (digits.length === 10) return `+1${digits}`;
	return `+${digits}`;
}

/** Lowercase alphanumerics only — tolerant matching for spoken field names. */
function normalizeName(name: string): string {
	return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** LLM arguments should be strings per the schema, but never trust them. */
function stringArg(value: unknown): string {
	return typeof value === "string" ? value : "";
}

/** Split the gateway's namespaced tool name back into (toolName, sourceId). */
function parseGatewayToolName(gatewayName: string): { toolName: string; sourceId: string } | null {
	const idx = gatewayName.lastIndexOf("__");
	if (idx === -1) return null;
	return { toolName: gatewayName.slice(0, idx), sourceId: gatewayName.slice(idx + 2) };
}

async function resolveContactId(
	provider: CrmProvider,
	metadata: Record<string, unknown> | null,
): Promise<string | null> {
	const contactId = metadata?.crm_contact_id;
	if (typeof contactId === "string" && contactId) return contactId;

	const fromNumber = metadata?.from_number;
	if (typeof fromNumber === "string" && fromNumber) {
		const { id } = await provider.upsertContactByPhone(normalizePhone(fromNumber));
		return id;
	}

	return null;
}

async function executeUpdateContact(
	provider: CrmProvider,
	contactId: string,
	args: Record<string, unknown>,
): Promise<unknown> {
	const fieldName = stringArg(args.field_name);
	const value = stringArg(args.value);
	if (!fieldName) {
		return { error: "bad_arguments", message: "field_name is required." };
	}

	const wanted = normalizeName(fieldName);
	const fields = await provider.listCustomFields();
	let field = fields.find((f) => {
		if (normalizeName(f.name) === wanted) return true;
		const lastKeySegment = f.key?.split(".").pop();
		return lastKeySegment ? normalizeName(lastKeySegment) === wanted : false;
	});

	if (!field) {
		field = await provider.createCustomField(fieldName);
	}

	await provider.updateContactFields(contactId, [{ fieldId: field.id, value }]);
	return `Updated "${field.name}" to "${value}".`;
}

async function executeAddTag(
	provider: CrmProvider,
	contactId: string,
	args: Record<string, unknown>,
): Promise<unknown> {
	const tag = stringArg(args.tag);
	if (!tag) {
		return { error: "bad_arguments", message: "tag is required." };
	}
	await provider.addContactTags(contactId, [tag]);
	return `Added tag "${tag}".`;
}

async function executeMoveStage(
	provider: CrmProvider,
	contactId: string,
	args: Record<string, unknown>,
): Promise<unknown> {
	const pipelineName = stringArg(args.pipeline);
	const stageName = stringArg(args.stage);
	if (!pipelineName || !stageName) {
		return { error: "bad_arguments", message: "pipeline and stage are required." };
	}

	const pipelines = await provider.listPipelines();
	const pipeline = pipelines.find((p) => p.name.toLowerCase() === pipelineName.toLowerCase());
	const stage = pipeline?.stages.find((s) => s.name.toLowerCase() === stageName.toLowerCase());
	if (!pipeline || !stage) {
		return {
			error: "not_found",
			message: `No pipeline/stage named "${pipelineName}" / "${stageName}" in the CRM.`,
		};
	}

	await provider.moveContactToStage(contactId, pipeline.id, stage.id);
	return `Moved contact to ${stage.name} in ${pipeline.name}.`;
}

// ---------------------------------------------------------------- calendar tools

const DEFAULT_TIMEZONE = "America/Los_Angeles";
const DEFAULT_SEARCH_DAYS = 5;
const MAX_SEARCH_DAYS = 31; // GHL free-slots range limit
const MAX_SPOKEN_SLOTS = 8;
const DAY_MS = 24 * 60 * 60 * 1000;

/** The account's IANA timezone for speech-friendly formatting (best-effort). */
async function accountTimezone(provider: CrmProvider): Promise<string> {
	try {
		const context = await provider.getAccountContext();
		return context.location_timezone || DEFAULT_TIMEZONE;
	} catch {
		return DEFAULT_TIMEZONE;
	}
}

/**
 * Match a spoken calendar name against the account's calendars. Resolution
 * order: (a) explicit calendar_name argument → (b) the agent's configured
 * booking calendar for this source (verified to still exist) → (c) the sole
 * calendar when there's exactly one → (d) a spoken recovery message. Never a guess.
 */
async function resolveCalendar(
	provider: CrmProvider,
	calendarName: string,
	agentId: string,
	sourceId: string,
): Promise<{ calendar: CrmCalendar } | { error: string; message: string }> {
	const calendars = await provider.listCalendars();
	if (calendars.length === 0) {
		return {
			error: "calendar_not_found",
			message: "No calendars exist in the CRM. Offer to have someone follow up to schedule.",
		};
	}

	const notFound = {
		error: "calendar_not_found",
		message: `Available calendars: ${calendars.map((c) => c.name).join(", ")}. Ask which one.`,
	};

	// (a) The LLM named a calendar — exact match, then tolerant substring match.
	const wanted = calendarName.trim().toLowerCase();
	if (wanted) {
		let matches = calendars.filter((c) => c.name.toLowerCase() === wanted);
		if (matches.length === 0) {
			matches = calendars.filter(
				(c) => c.name.toLowerCase().includes(wanted) || wanted.includes(c.name.toLowerCase()),
			);
		}
		if (matches.length === 1) return { calendar: matches[0] };
		return notFound;
	}

	// (b) The agent's configured booking calendar for this source, if it still exists.
	if (agentId) {
		const mapping = await getAgentSource(agentId, sourceId);
		if (mapping?.bookingCalendarId) {
			const configured = calendars.find((c) => c.id === mapping.bookingCalendarId);
			if (configured) return { calendar: configured };
		}
	}

	// (c) Single-calendar accounts need no configuration at all.
	if (calendars.length === 1) return { calendar: calendars[0] };

	return notFound;
}

/** "Tuesday, July 14: 10:00 AM, 11:30 AM; Wednesday, July 15: 9:00 AM" */
function formatSpokenSlots(isoSlots: string[], timeZone: string): string {
	const dayFormat = new Intl.DateTimeFormat("en-US", {
		timeZone,
		weekday: "long",
		month: "long",
		day: "numeric",
	});
	const timeFormat = new Intl.DateTimeFormat("en-US", {
		timeZone,
		hour: "numeric",
		minute: "2-digit",
	});
	const byDay = new Map<string, string[]>();
	for (const iso of isoSlots) {
		const date = new Date(iso);
		const day = dayFormat.format(date);
		const times = byDay.get(day) ?? [];
		times.push(timeFormat.format(date));
		byDay.set(day, times);
	}
	return [...byDay.entries()].map(([day, times]) => `${day}: ${times.join(", ")}`).join("; ");
}

function formatSpokenTime(iso: string, timeZone: string): string {
	return new Intl.DateTimeFormat("en-US", {
		timeZone,
		weekday: "long",
		month: "long",
		day: "numeric",
		hour: "numeric",
		minute: "2-digit",
	}).format(new Date(iso));
}

async function executeCheckAvailability(
	provider: CrmProvider,
	args: Record<string, unknown>,
	agentId: string,
	sourceId: string,
): Promise<unknown> {
	const resolved = await resolveCalendar(provider, stringArg(args.calendar_name), agentId, sourceId);
	if ("error" in resolved) return resolved;

	const fromArg = stringArg(args.from_date);
	const from = fromArg ? new Date(fromArg) : new Date();
	if (Number.isNaN(from.getTime())) {
		return { error: "bad_arguments", message: "from_date is not a valid ISO date." };
	}
	const days =
		typeof args.days === "number" && Number.isFinite(args.days)
			? Math.min(Math.max(Math.round(args.days), 1), MAX_SEARCH_DAYS)
			: DEFAULT_SEARCH_DAYS;
	const to = new Date(from.getTime() + days * DAY_MS);

	const available = await provider.getAvailability({
		calendarId: resolved.calendar.id,
		fromISO: from.toISOString(),
		toISO: to.toISOString(),
	});
	if (available.length === 0) {
		return { error: "no_slots", message: "No open slots in that range. Try more days ahead." };
	}

	const timezone = await accountTimezone(provider);
	const slots = available.slice(0, MAX_SPOKEN_SLOTS).map((s) => s.startISO);
	return {
		calendar: resolved.calendar.name,
		slots,
		spoken: formatSpokenSlots(slots, timezone),
	};
}

async function executeBookAppointment(
	provider: CrmProvider,
	contactId: string,
	args: Record<string, unknown>,
	agentId: string,
	sourceId: string,
): Promise<unknown> {
	const startTime = stringArg(args.start_time);
	if (!startTime || Number.isNaN(Date.parse(startTime))) {
		return {
			error: "bad_arguments",
			message: "start_time must be an exact ISO 8601 time from check_availability.",
		};
	}

	const resolved = await resolveCalendar(provider, stringArg(args.calendar_name), agentId, sourceId);
	if ("error" in resolved) return resolved;

	const title = stringArg(args.title) || "Phone consultation — voice agent booking";
	const booked = await provider.bookAppointment({
		calendarId: resolved.calendar.id,
		contactId,
		startISO: startTime,
		title,
	});

	const timezone = await accountTimezone(provider);
	return `Booked for ${formatSpokenTime(booked.startISO, timezone)}. Confirmation id ${booked.id}.`;
}

export async function POST(req: Request): Promise<Response> {
	const raw = await req.text();

	let invocation: ToolInvocation;
	try {
		invocation = JSON.parse(raw) as ToolInvocation;
	} catch {
		return Response.json({ error: "invalid JSON" }, { status: 400 });
	}

	const parsed = invocation.tool ? parseGatewayToolName(invocation.tool) : null;
	if (!parsed) {
		return Response.json({ error: "unknown tool" }, { status: 401 });
	}
	const { toolName, sourceId } = parsed;

	const liveTool = await getCrmLiveToolByNameAndSource(toolName, sourceId);
	if (!liveTool) {
		return Response.json({ error: "unknown tool" }, { status: 401 });
	}

	const ok = verify(
		liveTool.secret,
		req.headers.get("x-voice-timestamp"),
		req.headers.get("x-voice-signature"),
		raw,
	);
	if (!ok) {
		return Response.json({ error: "invalid signature" }, { status: 401 });
	}

	const provider = await resolveCrmProvider(sourceId);
	if (!provider) {
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
			return toolResult({ error: "no_contact", message: "No CRM contact for this caller." });
		}

		switch (toolName) {
			case "update_contact":
				return toolResult(await executeUpdateContact(provider, contactId, args));
			case "add_tag":
				return toolResult(await executeAddTag(provider, contactId, args));
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
		if (isCalendarTool && err instanceof GhlApiError && (err.status === 401 || err.status === 403)) {
			return toolResult({
				error: "calendar_access",
				message:
					"Calendar access isn't enabled for this account connection yet. Offer to have someone follow up to schedule.",
			});
		}
		console.error(`[crm-live-tools] ${toolName} (call ${invocation.call_id}) failed:`, err);
		return toolResult({
			error: "crm_error",
			message: "The CRM update failed. Continue the call and mention a human will follow up.",
		});
	}
}
