import { normalizeEmail, normalizeName, normalizePhone, normalizeZip } from "./normalize";

export { normalizeName };

/**
 * The single source of truth for GHL *standard* contact fields (the real
 * firstName/email/phone/address slots), keyed the CloseBot way (`contact.*`).
 *
 * ONE catalog drives everything so nothing drifts:
 *   - the field-picker UI (label + key, via STANDARD_CONTACT_FIELDS)
 *   - the write resolver, matched by key OR spoken name (toStandardWrite)
 * Both the mid-call live-tools route and the post-call sync resolve through
 * here. Lives in the SaaS — the voice engine knows none of this.
 */

const US_STATES = new Set([
	"AL",
	"AK",
	"AZ",
	"AR",
	"CA",
	"CO",
	"CT",
	"DE",
	"FL",
	"GA",
	"HI",
	"ID",
	"IL",
	"IN",
	"IA",
	"KS",
	"KY",
	"LA",
	"ME",
	"MD",
	"MA",
	"MI",
	"MN",
	"MS",
	"MO",
	"MT",
	"NE",
	"NV",
	"NH",
	"NJ",
	"NM",
	"NY",
	"NC",
	"ND",
	"OH",
	"OK",
	"OR",
	"PA",
	"RI",
	"SC",
	"SD",
	"TN",
	"TX",
	"UT",
	"VT",
	"VA",
	"WA",
	"WV",
	"WI",
	"WY",
	"DC",
]);

/** Full state name -> 2-letter code, so "California" resolves as well as "CA". */
const US_STATE_NAMES: Record<string, string> = {
	alabama: "AL",
	alaska: "AK",
	arizona: "AZ",
	arkansas: "AR",
	california: "CA",
	colorado: "CO",
	connecticut: "CT",
	delaware: "DE",
	florida: "FL",
	georgia: "GA",
	hawaii: "HI",
	idaho: "ID",
	illinois: "IL",
	indiana: "IN",
	iowa: "IA",
	kansas: "KS",
	kentucky: "KY",
	louisiana: "LA",
	maine: "ME",
	maryland: "MD",
	massachusetts: "MA",
	michigan: "MI",
	minnesota: "MN",
	mississippi: "MS",
	missouri: "MO",
	montana: "MT",
	nebraska: "NE",
	nevada: "NV",
	"new hampshire": "NH",
	"new jersey": "NJ",
	"new mexico": "NM",
	"new york": "NY",
	"north carolina": "NC",
	"north dakota": "ND",
	ohio: "OH",
	oklahoma: "OK",
	oregon: "OR",
	pennsylvania: "PA",
	"rhode island": "RI",
	"south carolina": "SC",
	"south dakota": "SD",
	tennessee: "TN",
	texas: "TX",
	utah: "UT",
	vermont: "VT",
	virginia: "VA",
	washington: "WA",
	"west virginia": "WV",
	wisconsin: "WI",
	wyoming: "WY",
	"district of columbia": "DC",
};

/**
 * Parse a spoken US address into GHL's standard slots. Handles both 2-letter
 * codes ("CA") and full names ("California"), comma or space separators.
 * "123 H Street, Bakersfield, California 92308" -> {address1, city, state, postalCode}.
 */
export function parseAddress(raw: string): Record<string, string> {
	const out: Record<string, string> = {};
	let rest = raw.trim();

	const zipMatch = rest.match(/\b(\d{5})(?:-\d{4})?\b\s*$/);
	if (zipMatch) {
		out.postalCode = zipMatch[1];
		rest = rest.slice(0, zipMatch.index).trim().replace(/,\s*$/, "");
	}

	const stateMatch = rest.match(/[,\s]([A-Za-z]{2})\s*$/);
	if (stateMatch && US_STATES.has(stateMatch[1].toUpperCase())) {
		out.state = stateMatch[1].toUpperCase();
		rest = rest.slice(0, stateMatch.index).trim().replace(/,\s*$/, "");
	} else {
		const lower = rest.toLowerCase();
		for (const [name, code] of Object.entries(US_STATE_NAMES)) {
			if (lower.endsWith(name) && /[,\s]/.test(rest[rest.length - name.length - 1] ?? " ")) {
				out.state = code;
				rest = rest
					.slice(0, rest.length - name.length)
					.trim()
					.replace(/,\s*$/, "");
				break;
			}
		}
	}

	const parts = rest
		.split(",")
		.map((p) => p.trim())
		.filter(Boolean);
	if (parts.length >= 2) {
		out.city = parts[parts.length - 1];
		out.address1 = parts.slice(0, -1).join(", ");
	} else if (parts.length === 1 && parts[0]) {
		out.address1 = parts[0];
	}
	return out;
}

/** "John Smith" / "Maria de la Cruz" → firstName + lastName (rest). */
export function parseName(raw: string): Record<string, string> {
	const tokens = raw.trim().split(/\s+/).filter(Boolean);
	if (tokens.length === 0) return {};
	if (tokens.length === 1) return { firstName: tokens[0] };
	return { firstName: tokens[0], lastName: tokens.slice(1).join(" ") };
}

interface StandardFieldDef {
	/** CloseBot-style stable key stored in mappings, e.g. "contact.email". */
	key: string;
	/** Human label for the picker, e.g. "Email". */
	label: string;
	/** Extra normalized aliases a spoken field_name may arrive as. */
	aliases: string[];
	/** Turn one value into the GHL standard slot(s) it fills. */
	write: (value: string) => Record<string, string>;
}

/**
 * THE catalog. Order = display order in the picker. Composite fields (Full
 * Name / Full Address) fan one value into several slots.
 */
export const STANDARD_CONTACT_FIELDS: StandardFieldDef[] = [
	{
		key: "contact.first_name",
		label: "First Name",
		aliases: ["firstname"],
		write: (v) => ({ firstName: v.trim() }),
	},
	{
		key: "contact.last_name",
		label: "Last Name",
		aliases: ["lastname"],
		write: (v) => ({ lastName: v.trim() }),
	},
	{
		key: "contact.name",
		label: "Full Name",
		aliases: ["fullname", "name"],
		write: (v) => parseName(v),
	},
	{
		key: "contact.email",
		label: "Email",
		aliases: ["email"],
		write: (v) => ({ email: normalizeEmail(v) }),
	},
	{
		key: "contact.phone",
		label: "Phone",
		aliases: ["phone", "phonenumber"],
		write: (v) => ({ phone: normalizePhone(v) }),
	},
	{
		key: "contact.address",
		label: "Full Address",
		aliases: ["fulladdress", "address"],
		write: (v) => parseAddress(v),
	},
	{
		key: "contact.address1",
		label: "Street Address",
		aliases: ["address1", "streetaddress"],
		write: (v) => ({ address1: v.trim() }),
	},
	{ key: "contact.city", label: "City", aliases: ["city"], write: (v) => ({ city: v.trim() }) },
	{ key: "contact.state", label: "State", aliases: ["state"], write: (v) => ({ state: v.trim() }) },
	{
		key: "contact.postal_code",
		label: "Postal Code",
		aliases: ["postalcode", "zip", "zipcode"],
		write: (v) => ({ postalCode: normalizeZip(v) }),
	},
	{
		key: "contact.country",
		label: "Country",
		aliases: ["country"],
		write: (v) => ({ country: v.trim() }),
	},
	{
		key: "contact.website",
		label: "Website",
		aliases: ["website"],
		write: (v) => ({ website: v.trim() }),
	},
];

const STANDARD_BY_MATCH = new Map<string, StandardFieldDef>();
for (const def of STANDARD_CONTACT_FIELDS) {
	STANDARD_BY_MATCH.set(normalizeName(def.key), def); // "contactemail"
	STANDARD_BY_MATCH.set(normalizeName(def.key.split(".").pop() ?? def.key), def); // "email"
	for (const a of def.aliases) STANDARD_BY_MATCH.set(a, def);
}

/** True if a mapping key targets a standard field (vs a custom field). */
export function isStandardFieldKey(keyOrName: string): boolean {
	return STANDARD_BY_MATCH.has(normalizeName(keyOrName));
}

/**
 * If `target` (a `contact.*` key OR a spoken field name) names a standard field
 * or composite, return the standard-slot object to write (values normalized);
 * else null — meaning it's a custom field, resolved by the caller.
 */
export function toStandardWrite(target: string, value: string): Record<string, string> | null {
	const def = STANDARD_BY_MATCH.get(normalizeName(target));
	return def ? def.write(value) : null;
}
