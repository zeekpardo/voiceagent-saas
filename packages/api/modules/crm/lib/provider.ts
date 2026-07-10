/**
 * CRM-agnostic provider surface for the voice agent engine (pattern lifted
 * from wabridge's packages/crm). These deliberately carry no vendor naming:
 * they describe what the voice→CRM sync needs from ANY CRM, so a new provider
 * can be added without touching callers.
 */

/** A contact custom field definition, independent of the backing CRM. */
export interface CrmCustomFieldDef {
	id: string;
	name: string;
	/** The CRM's stable key for the field, when it has one. */
	key?: string;
	/** The CRM's data type for the field (e.g. "TEXT", "SINGLE_OPTIONS"), when known. */
	dataType?: string;
	/** Picklist values, when the field is a single/multi-select and the CRM exposes them. */
	options?: string[];
}

/** A field value write: { fieldId, value } in the provider's id space. */
export interface CrmFieldWrite {
	fieldId: string;
	value: string;
}

export interface CrmProvider {
	/** Stable provider discriminator, e.g. "gohighlevel". */
	readonly type: string;

	/** Validate the stored connection; returns a display name for the account. */
	validateConnection(): Promise<{ accountName?: string }>;

	/** The custom fields available on contacts (for the mapping UI). */
	listCustomFields(): Promise<CrmCustomFieldDef[]>;

	/** Create a text custom field on contacts. */
	createCustomField(name: string): Promise<CrmCustomFieldDef>;

	/** Write custom field values onto a contact. */
	updateContactFields(contactId: string, fields: CrmFieldWrite[]): Promise<void>;

	/** Write STANDARD contact fields (address1, city, state, postalCode,
	 * firstName, lastName, email, phone…) directly onto the contact record. */
	updateContactStandard(contactId: string, fields: Record<string, string>): Promise<void>;

	/** Additively apply tags (idempotent — never clobbers the CRM's tag set). */
	addContactTags(contactId: string, tags: string[]): Promise<void>;

	/** Remove tags from the contact (idempotent — absent tags are a no-op). */
	removeContactTags(contactId: string, tags: string[]): Promise<void>;

	/** Drop a note onto the contact's timeline. */
	createContactNote(contactId: string, body: string): Promise<void>;

	/** Deep link to the contact in the CRM, or null when not resolvable. */
	contactUrl(contactId: string): string | null;

	/**
	 * Find the contact matching a phone number, creating a bare contact when
	 * none exists — the mechanism that lets phone calls sync with zero setup.
	 */
	upsertContactByPhone(phone: string): Promise<{ id: string; created: boolean }>;

	/**
	 * LOOKUP-ONLY phone match for display purposes (inbox contact chip).
	 * Never creates anything — returns null when no contact matches.
	 */
	findContactByPhone(phone: string): Promise<{ id: string; name: string | null } | null>;

	/** The CRM's tag library — options for tag pickers. */
	listTags(): Promise<string[]>;

	/** Pipelines + their stages (for stage-move rules). */
	listPipelines(): Promise<CrmPipeline[]>;

	/**
	 * Move the contact's opportunity in a pipeline to a stage, creating the
	 * opportunity if the contact has none in that pipeline.
	 */
	moveContactToStage(contactId: string, pipelineId: string, stageId: string): Promise<void>;

	/**
	 * Flat variable map about the CONTACT for prompt interpolation
	 * (contact_first_name, contact_full_address, contact_tags, …).
	 */
	getContactContext(contactId: string): Promise<Record<string, string>>;

	/**
	 * The contact's current field values keyed by unified `contact.*` key
	 * (standard slots AND custom fields), for building the KNOWN CONTACT INFO
	 * prompt block (contact state). Only present, non-empty values appear —
	 * an absent key means the CRM has no value (renders UNRESOLVED). Keys line
	 * up with the field-mapping catalog so a mapped target resolves here.
	 */
	getContactFieldValues(contactId: string): Promise<Record<string, string>>;

	/**
	 * Flat variable map about the connected ACCOUNT/location
	 * (location_name, location_address, …) — what makes one agent reusable
	 * across many subaccounts.
	 */
	getAccountContext(): Promise<Record<string, string>>;

	/** The bookable calendars on the connected account. */
	listCalendars(): Promise<CrmCalendar[]>;

	/**
	 * Open appointment slots on a calendar in [fromISO, toISO), ascending.
	 * Slot times are ISO 8601 with the account's local offset.
	 */
	getAvailability(input: {
		calendarId: string;
		fromISO: string;
		toISO: string;
	}): Promise<{ startISO: string }[]>;

	/** Book the contact into a calendar slot; returns the CRM's appointment id. */
	bookAppointment(input: {
		calendarId: string;
		contactId: string;
		startISO: string;
		title: string;
	}): Promise<{ id: string; startISO: string }>;
}

export interface CrmCalendar {
	id: string;
	name: string;
}

export interface CrmPipeline {
	id: string;
	name: string;
	stages: { id: string; name: string }[];
}
