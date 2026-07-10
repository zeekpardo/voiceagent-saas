/**
 * GoHighLevel API client — transport layer adapted from the proven
 * MinistryFlow integration (base URL, Version header, throttle, retry on
 * 429/5xx). Auth here is a Private Integration token (Location-scoped),
 * so there is no OAuth refresh path; swap in the OAuth TokenManager when
 * this ships to the GHL marketplace.
 */

const GHL_API_BASE = "https://services.leadconnectorhq.com";
const API_VERSION = "2021-07-28";
const CALL_DELAY_MS = 350;
const MAX_RETRIES = 3;

export interface GhlCustomFieldDefinition {
	id: string;
	name: string;
	fieldKey: string;
	dataType: string;
	model?: string;
}

export interface GhlCustomFieldValue {
	id: string;
	value: string | string[];
}

export interface GhlContact {
	id: string;
	firstName?: string;
	lastName?: string;
	contactName?: string;
	email?: string;
	phone?: string;
	tags?: string[];
	customFields?: { id: string; value: unknown }[];
}

export interface GhlPipeline {
	id: string;
	name: string;
	stages: { id: string; name: string; position?: number }[];
}

export interface GhlOpportunity {
	id: string;
	name?: string;
	pipelineId?: string;
	pipelineStageId?: string;
	status?: string;
	contactId?: string;
}

export interface GhlLocation {
	id: string;
	name?: string;
	address?: string;
	city?: string;
	state?: string;
	country?: string;
	postalCode?: string;
	phone?: string;
	website?: string;
	timezone?: string;
}

export interface GhlCalendar {
	id: string;
	name: string;
	isActive?: boolean;
}

export interface GhlAppointment {
	id: string;
	calendarId: string;
	locationId: string;
	contactId: string;
	startTime?: string;
	endTime?: string;
	title?: string;
	appointmentStatus?: string;
}

export class GhlApiError extends Error {
	constructor(
		public status: number,
		message: string,
	) {
		super(message);
		this.name = "GhlApiError";
	}
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class GhlClient {
	private lastCallAt = 0;

	constructor(
		private readonly token: string,
		readonly locationId: string,
	) {}

	private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
		// Gentle per-client throttle — GHL rate limits are per location.
		const wait = this.lastCallAt + CALL_DELAY_MS - Date.now();
		if (wait > 0) await sleep(wait);

		for (let attempt = 0; ; attempt++) {
			this.lastCallAt = Date.now();
			const res = await fetch(`${GHL_API_BASE}${path}`, {
				method,
				headers: {
					Authorization: `Bearer ${this.token}`,
					"Content-Type": "application/json",
					Version: API_VERSION,
				},
				...(body !== undefined ? { body: JSON.stringify(body) } : {}),
			});

			if ((res.status === 429 || res.status >= 500) && attempt < MAX_RETRIES) {
				await sleep(1500 * 2 ** attempt);
				continue;
			}
			if (!res.ok) {
				const detail = await res.text().catch(() => "");
				throw new GhlApiError(
					res.status,
					`GHL ${method} ${path} failed (${res.status}): ${detail.slice(0, 300)}`,
				);
			}
			if (res.status === 204) return undefined as T;
			return (await res.json()) as T;
		}
	}

	/** Cheap auth/location validation — also returns the location name. */
	async getLocation(): Promise<{ id: string; name?: string }> {
		const res = await this.request<{ location?: { id: string; name?: string } }>(
			"GET",
			`/locations/${this.locationId}`,
		);
		return res.location ?? { id: this.locationId };
	}

	async getContact(id: string): Promise<GhlContact> {
		const res = await this.request<{ contact: GhlContact }>("GET", `/contacts/${id}`);
		return res.contact;
	}

	/** Lookup-only contact search (never creates). GHL matches query against name/email/phone. */
	async searchContacts(query: string): Promise<GhlContact[]> {
		const res = await this.request<{ contacts?: GhlContact[] }>(
			"GET",
			`/contacts/?locationId=${encodeURIComponent(this.locationId)}&query=${encodeURIComponent(query)}`,
		);
		return res.contacts ?? [];
	}

	/**
	 * Create-or-match by phone: GHL's upsert dedupes on phone/email, so this
	 * returns the existing contact when one matches, or a new bare contact.
	 */
	async upsertContact(data: {
		phone?: string;
		email?: string;
		firstName?: string;
		lastName?: string;
	}): Promise<{ contact: GhlContact; created: boolean }> {
		const res = await this.request<{ contact: GhlContact; new?: boolean }>(
			"POST",
			"/contacts/upsert",
			{
				locationId: this.locationId,
				...data,
			},
		);
		return { contact: res.contact, created: res.new === true };
	}

	async updateContact(
		id: string,
		// Standard contact fields (address1, city, state, postalCode, firstName…)
		// ride the same PUT as customFields/tags.
		data: { customFields?: GhlCustomFieldValue[]; tags?: string[] } & Record<string, unknown>,
	): Promise<void> {
		await this.request("PUT", `/contacts/${id}`, data);
	}

	/** Idempotent server-side tag add — preferred over read-modify-write. */
	async addTags(contactId: string, tags: string[]): Promise<void> {
		if (tags.length === 0) return;
		await this.request("POST", `/contacts/${contactId}/tags`, { tags });
	}

	/** Idempotent server-side tag removal (GHL DELETE /contacts/{id}/tags). */
	async removeTags(contactId: string, tags: string[]): Promise<void> {
		if (tags.length === 0) return;
		await this.request("DELETE", `/contacts/${contactId}/tags`, { tags });
	}

	async createNote(contactId: string, body: string): Promise<void> {
		await this.request("POST", `/contacts/${contactId}/notes`, { body });
	}

	async getCustomFields(): Promise<GhlCustomFieldDefinition[]> {
		const res = await this.request<{ customFields?: GhlCustomFieldDefinition[] }>(
			"GET",
			`/locations/${this.locationId}/customFields?model=contact`,
		);
		return res.customFields ?? [];
	}

	async createCustomField(name: string): Promise<GhlCustomFieldDefinition> {
		const res = await this.request<{ customField: GhlCustomFieldDefinition }>(
			"POST",
			`/locations/${this.locationId}/customFields`,
			{ name, dataType: "TEXT", model: "contact" },
		);
		return res.customField;
	}

	async getLocationDetails(): Promise<GhlLocation> {
		const res = await this.request<{ location?: GhlLocation }>(
			"GET",
			`/locations/${this.locationId}`,
		);
		return res.location ?? { id: this.locationId };
	}

	/** The location's tag library (for tag pickers). */
	async getLocationTags(): Promise<string[]> {
		const res = await this.request<{ tags?: { name: string }[] }>(
			"GET",
			`/locations/${this.locationId}/tags`,
		);
		return (res.tags ?? []).map((t) => t.name);
	}

	async getPipelines(): Promise<GhlPipeline[]> {
		const res = await this.request<{ pipelines?: GhlPipeline[] }>(
			"GET",
			`/opportunities/pipelines?locationId=${this.locationId}`,
		);
		return res.pipelines ?? [];
	}

	async searchOpportunities(contactId: string): Promise<GhlOpportunity[]> {
		const res = await this.request<{ opportunities?: GhlOpportunity[] }>(
			"GET",
			`/opportunities/search?location_id=${this.locationId}&contact_id=${encodeURIComponent(contactId)}`,
		);
		return res.opportunities ?? [];
	}

	async createOpportunity(input: {
		pipelineId: string;
		pipelineStageId: string;
		contactId: string;
		name: string;
	}): Promise<GhlOpportunity> {
		const res = await this.request<{ opportunity: GhlOpportunity }>("POST", "/opportunities/", {
			locationId: this.locationId,
			...input,
			status: "open",
		});
		return res.opportunity;
	}

	async updateOpportunity(
		id: string,
		input: { pipelineStageId?: string; status?: string },
	): Promise<void> {
		await this.request("PUT", `/opportunities/${id}`, input);
	}

	/** The location's calendars. GET /calendars/?locationId={id} → { calendars: [...] } */
	async getCalendars(): Promise<GhlCalendar[]> {
		const res = await this.request<{ calendars?: GhlCalendar[] }>(
			"GET",
			`/calendars/?locationId=${encodeURIComponent(this.locationId)}`,
		);
		return res.calendars ?? [];
	}

	/**
	 * Open slots on a calendar. startDate/endDate are epoch MILLISECONDS (range
	 * max 31 days). Response is keyed by date ("2024-10-28": { slots: [ISO…] });
	 * non-slot keys (e.g. traceId) are filtered out.
	 */
	async getFreeSlots(
		calendarId: string,
		startMs: number,
		endMs: number,
		timezone?: string,
	): Promise<Record<string, { slots: string[] }>> {
		const params = new URLSearchParams({
			startDate: String(startMs),
			endDate: String(endMs),
		});
		if (timezone) params.set("timezone", timezone);
		const res = await this.request<Record<string, unknown>>(
			"GET",
			`/calendars/${encodeURIComponent(calendarId)}/free-slots?${params.toString()}`,
		);
		const out: Record<string, { slots: string[] }> = {};
		for (const [key, value] of Object.entries(res)) {
			const slots = (value as { slots?: unknown })?.slots;
			if (Array.isArray(slots)) {
				out[key] = { slots: slots.filter((s): s is string => typeof s === "string") };
			}
		}
		return out;
	}

	/**
	 * Book an appointment. POST /calendars/events/appointments — required:
	 * calendarId, locationId, contactId, startTime (ISO with offset). endTime
	 * defaults to the calendar's slot duration when omitted. Response is the
	 * appointment object itself (not wrapped).
	 */
	async createAppointment(input: {
		calendarId: string;
		contactId: string;
		startTime: string;
		endTime?: string;
		title?: string;
	}): Promise<GhlAppointment> {
		return await this.request<GhlAppointment>("POST", "/calendars/events/appointments", {
			calendarId: input.calendarId,
			locationId: this.locationId,
			contactId: input.contactId,
			startTime: input.startTime,
			...(input.endTime ? { endTime: input.endTime } : {}),
			...(input.title ? { title: input.title } : {}),
			appointmentStatus: "confirmed",
		});
	}
}
