import type {
	CrmCalendar,
	CrmCustomFieldDef,
	CrmFieldWrite,
	CrmPipeline,
	CrmProvider,
} from "../provider";
import { normalizeName } from "../normalize";
import { type CrmProviderContext, registerCrmProvider } from "../registry";
import { GhlClient } from "./ghl-client";
import { exchangeGhlCode, getGhlAuthUrl, ghlOauthConfigured, refreshGhlToken } from "./ghl-oauth";

/**
 * GoHighLevel — the first CRM provider. Maps the neutral CrmProvider surface
 * onto the GHL v2 API (transport in ghl-client.ts).
 *
 * Two auth modes, chosen at registration time by env presence:
 *  - marketplace OAuth (config: { authMode: "oauth", locationId, accessToken,
 *    refreshToken, tokenExpiresAt }) — tokens rotate; rotated tokens are
 *    persisted through ctx.persist.
 *  - Private Integration token (config: { locationId, accessToken }).
 */

const REFRESH_BUFFER_MS = 5 * 60 * 1000;

export class GoHighLevelProvider implements CrmProvider {
	readonly type = "gohighlevel";
	private client: GhlClient;
	private refreshing: Promise<void> | null = null;

	constructor(
		private config: Record<string, string>,
		private readonly ctx?: CrmProviderContext,
	) {
		this.client = new GhlClient(config.accessToken ?? "", config.locationId ?? "");
	}

	/** Proactively rotate OAuth tokens near expiry (PIT tokens never rotate). */
	private async ensureFreshToken(): Promise<void> {
		if (this.config.authMode !== "oauth" || !this.config.refreshToken) return;
		const expiresAt = Date.parse(this.config.tokenExpiresAt ?? "");
		if (Number.isFinite(expiresAt) && Date.now() < expiresAt - REFRESH_BUFFER_MS) return;

		this.refreshing ??= (async () => {
			const tokens = await refreshGhlToken(this.config.refreshToken!);
			this.config = {
				...this.config,
				accessToken: tokens.access_token,
				refreshToken: tokens.refresh_token,
				tokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
			};
			this.client = new GhlClient(this.config.accessToken!, this.config.locationId ?? "");
			await this.ctx?.persist?.(this.config);
		})();
		try {
			await this.refreshing;
		} finally {
			this.refreshing = null;
		}
	}

	async validateConnection() {
		await this.ensureFreshToken();
		const location = await this.client.getLocation();
		return { accountName: location.name };
	}

	async listCustomFields(): Promise<CrmCustomFieldDef[]> {
		await this.ensureFreshToken();
		const fields = await this.client.getCustomFields();
		return fields.map((f) => ({ id: f.id, name: f.name, key: f.fieldKey }));
	}

	async createCustomField(name: string): Promise<CrmCustomFieldDef> {
		await this.ensureFreshToken();
		const f = await this.client.createCustomField(name);
		return { id: f.id, name: f.name, key: f.fieldKey };
	}

	async updateContactFields(contactId: string, fields: CrmFieldWrite[]): Promise<void> {
		await this.ensureFreshToken();
		await this.client.updateContact(contactId, {
			customFields: fields.map((f) => ({ id: f.fieldId, value: f.value })),
		});
	}

	async updateContactStandard(contactId: string, fields: Record<string, string>): Promise<void> {
		await this.ensureFreshToken();
		await this.client.updateContact(contactId, fields);
	}

	async addContactTags(contactId: string, tags: string[]): Promise<void> {
		await this.ensureFreshToken();
		await this.client.addTags(contactId, tags);
	}

	async removeContactTags(contactId: string, tags: string[]): Promise<void> {
		await this.ensureFreshToken();
		await this.client.removeTags(contactId, tags);
	}

	async createContactNote(contactId: string, body: string): Promise<void> {
		await this.ensureFreshToken();
		await this.client.createNote(contactId, body);
	}

	async upsertContactByPhone(phone: string): Promise<{ id: string; created: boolean }> {
		await this.ensureFreshToken();
		const { contact, created } = await this.client.upsertContact({ phone });
		return { id: contact.id, created };
	}

	async findContactByPhone(phone: string): Promise<{ id: string; name: string | null } | null> {
		const digits = phone.replace(/\D/g, "").slice(-10);
		if (!digits) return null;
		await this.ensureFreshToken();
		const contacts = await this.client.searchContacts(phone);
		const match = contacts.find((c) => (c.phone ?? "").replace(/\D/g, "").endsWith(digits));
		if (!match) return null;
		const name =
			match.contactName || [match.firstName, match.lastName].filter(Boolean).join(" ") || null;
		return { id: match.id, name };
	}

	contactUrl(contactId: string): string | null {
		const locationId = this.config.locationId;
		return locationId
			? `https://app.gohighlevel.com/v2/location/${locationId}/contacts/detail/${contactId}`
			: null;
	}

	async listTags(): Promise<string[]> {
		await this.ensureFreshToken();
		return this.client.getLocationTags();
	}

	async listPipelines(): Promise<CrmPipeline[]> {
		await this.ensureFreshToken();
		const pipelines = await this.client.getPipelines();
		return pipelines.map((p) => ({
			id: p.id,
			name: p.name,
			stages: (p.stages ?? []).map((s) => ({ id: s.id, name: s.name })),
		}));
	}

	async moveContactToStage(contactId: string, pipelineId: string, stageId: string): Promise<void> {
		await this.ensureFreshToken();
		const opportunities = await this.client.searchOpportunities(contactId);
		const existing = opportunities.find((o) => o.pipelineId === pipelineId);
		if (existing) {
			await this.client.updateOpportunity(existing.id, { pipelineStageId: stageId });
			return;
		}
		const contact = await this.client.getContact(contactId);
		const name =
			contact.contactName ||
			[contact.firstName, contact.lastName].filter(Boolean).join(" ") ||
			"Voice agent lead";
		await this.client.createOpportunity({ pipelineId, pipelineStageId: stageId, contactId, name });
	}

	async getContactContext(contactId: string): Promise<Record<string, string>> {
		await this.ensureFreshToken();
		const c = (await this.client.getContact(contactId)) as unknown as Record<string, unknown> & {
			tags?: string[];
		};
		const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
		const firstName = str(c.firstName);
		const lastName = str(c.lastName);
		const entries: Record<string, string | undefined> = {
			contact_first_name: firstName,
			contact_last_name: lastName,
			contact_full_name:
				str(c.contactName) ?? [firstName, lastName].filter(Boolean).join(" ") ?? undefined,
			contact_email: str(c.email),
			contact_phone: str(c.phone),
			contact_company: str(c.companyName),
			contact_address: str(c.address1),
			contact_city: str(c.city),
			contact_state: str(c.state),
			contact_postal_code: str(c.postalCode),
			contact_full_address: [str(c.address1), str(c.city), str(c.state), str(c.postalCode)]
				.filter(Boolean)
				.join(", "),
			contact_tags: (c.tags ?? []).join(", "),
			contact_source: str(c.source),
			contact_timezone: str(c.timezone),
		};
		return Object.fromEntries(
			Object.entries(entries).filter(([, v]) => v != null && v !== "") as [string, string][],
		);
	}

	async getContactFieldValues(contactId: string): Promise<Record<string, string>> {
		await this.ensureFreshToken();
		const c = (await this.client.getContact(contactId)) as unknown as Record<string, unknown> & {
			customFields?: { id: string; value: unknown }[];
		};
		const str = (v: unknown): string | undefined => {
			if (typeof v === "string") return v.trim() || undefined;
			if (typeof v === "number") return String(v);
			if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean).join(", ") || undefined;
			return undefined;
		};
		const out: Record<string, string> = {};
		const set = (key: string, v: unknown) => {
			const s = str(v);
			if (s) out[key] = s;
		};
		// Standard slots, keyed the catalog way (contact.first_name, …).
		set("contact.first_name", c.firstName);
		set("contact.last_name", c.lastName);
		set(
			"contact.name",
			c.contactName ?? [str(c.firstName), str(c.lastName)].filter(Boolean).join(" ") ?? undefined,
		);
		set("contact.email", c.email);
		set("contact.phone", c.phone);
		set("contact.address1", c.address1);
		set("contact.city", c.city);
		set("contact.state", c.state);
		set("contact.postal_code", c.postalCode);
		set("contact.country", c.country);
		set("contact.website", c.website);
		// Custom fields: resolve each value's field id to the unified key the
		// mapping catalog uses (fieldKey, else contact.<normalized name>).
		const values = c.customFields ?? [];
		if (values.length > 0) {
			const defs = await this.client.getCustomFields();
			const byId = new Map(defs.map((d) => [d.id, d]));
			for (const cf of values) {
				const def = byId.get(cf.id);
				if (!def) continue;
				set(def.fieldKey || `contact.${normalizeName(def.name)}`, cf.value);
			}
		}
		return out;
	}

	/** IANA timezone of the connected location — cached per provider instance. */
	private timezonePromise: Promise<string> | null = null;

	private locationTimezone(): Promise<string> {
		this.timezonePromise ??= (async () => {
			const location = await this.client.getLocationDetails();
			return location.timezone?.trim() || "America/Los_Angeles";
		})();
		return this.timezonePromise;
	}

	async listCalendars(): Promise<CrmCalendar[]> {
		await this.ensureFreshToken();
		const calendars = await this.client.getCalendars();
		return calendars
			.filter((c) => c.isActive !== false)
			.map((c) => ({ id: c.id, name: c.name }));
	}

	async getAvailability(input: {
		calendarId: string;
		fromISO: string;
		toISO: string;
	}): Promise<{ startISO: string }[]> {
		await this.ensureFreshToken();
		const timezone = await this.locationTimezone();
		const byDate = await this.client.getFreeSlots(
			input.calendarId,
			Date.parse(input.fromISO),
			Date.parse(input.toISO),
			timezone,
		);
		return Object.values(byDate)
			.flatMap((d) => d.slots)
			.sort((a, b) => Date.parse(a) - Date.parse(b))
			.map((startISO) => ({ startISO }));
	}

	async bookAppointment(input: {
		calendarId: string;
		contactId: string;
		startISO: string;
		title: string;
	}): Promise<{ id: string; startISO: string }> {
		await this.ensureFreshToken();
		const appointment = await this.client.createAppointment({
			calendarId: input.calendarId,
			contactId: input.contactId,
			startTime: input.startISO,
			title: input.title,
		});
		return { id: appointment.id, startISO: appointment.startTime ?? input.startISO };
	}

	async getAccountContext(): Promise<Record<string, string>> {
		await this.ensureFreshToken();
		const l = await this.client.getLocationDetails();
		const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
		const entries: Record<string, string | undefined> = {
			location_name: str(l.name),
			location_address: str(l.address),
			location_city: str(l.city),
			location_state: str(l.state),
			location_postal_code: str(l.postalCode),
			location_full_address: [str(l.address), str(l.city), str(l.state), str(l.postalCode)]
				.filter(Boolean)
				.join(", "),
			location_phone: str(l.phone),
			location_website: str(l.website),
			location_timezone: str(l.timezone),
		};
		return Object.fromEntries(
			Object.entries(entries).filter(([, v]) => v != null && v !== "") as [string, string][],
		);
	}
}

const oauthEnabled = ghlOauthConfigured();

registerCrmProvider({
	type: "gohighlevel",
	label: "GoHighLevel",
	description: oauthEnabled
		? "Connect your GHL sub-account — the agent updates contact custom fields, tags, and notes after every call."
		: "Update contact custom fields, tags, and notes in a GHL sub-account.",
	// Marketplace OAuth when app credentials are configured; PIT fallback otherwise.
	authType: oauthEnabled ? "oauth" : "apiKey",
	connectFields: [
		{
			name: "locationId",
			label: "Location ID",
			placeholder: "e.g. ve9EPM428h8vShlRW1KT",
			help: "Settings → Business Profile",
		},
		{
			name: "accessToken",
			label: "Private Integration token",
			placeholder: "pit-…",
			help: "Settings → Private Integrations — scopes: contacts (r/w), custom fields (r/w), locations (r), tags (r/w), opportunities (r/w)",
			secret: true,
		},
	],
	oauth: {
		getAuthUrl: getGhlAuthUrl,
		async exchangeCode(code: string) {
			const tokens = await exchangeGhlCode(code);
			if (!tokens.locationId) {
				throw new Error("GHL did not return a locationId — install on a sub-account (location)");
			}
			return {
				config: {
					authMode: "oauth",
					locationId: tokens.locationId,
					...(tokens.companyId ? { companyId: tokens.companyId } : {}),
					accessToken: tokens.access_token,
					refreshToken: tokens.refresh_token,
					tokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
				},
			};
		},
	},
	create: (config, ctx) => new GoHighLevelProvider(config, ctx),
});
