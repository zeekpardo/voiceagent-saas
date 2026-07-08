/**
 * GoHighLevel marketplace-app OAuth (Location-scoped tokens) — flow copied
 * from the proven MinistryFlow implementation. Activates when the env keys
 * are present; until then the GHL provider falls back to Private Integration
 * token auth.
 *
 * Env: GOHIGHLEVEL_CLIENT_ID, GOHIGHLEVEL_CLIENT_SECRET, GOHIGHLEVEL_REDIRECT_URI
 */

const GHL_AUTHORIZE_URL = "https://marketplace.gohighlevel.com/oauth/chooselocation";
const GHL_TOKEN_URL = "https://services.leadconnectorhq.com/oauth/token";

/**
 * Scopes for the voice use case. Must be a subset of the scopes enabled on
 * the marketplace app, or GHL's authorize page rejects with "Invalid scope(s)".
 * Override with GOHIGHLEVEL_SCOPES (space-separated) to match the app config
 * without a code change.
 */
const DEFAULT_SCOPES = [
	"contacts.readonly",
	"contacts.write",
	"locations.readonly",
	"locations/customFields.readonly",
	"locations/customFields.write",
	"locations/tags.readonly",
	"locations/tags.write",
	// Stage reads/moves live under the opportunities scopes — the "pipelines"
	// scope group authorizes none of the endpoints we use (proven empirically).
	"opportunities.readonly",
	"opportunities.write",
	// Booking tools (check_availability / book_appointment).
	"calendars.readonly",
	"calendars/events.readonly",
	"calendars/events.write",
].join(" ");

const scopes = () => process.env.GOHIGHLEVEL_SCOPES?.trim() || DEFAULT_SCOPES;

export interface GhlTokenResponse {
	access_token: string;
	refresh_token: string;
	expires_in: number;
	locationId?: string;
	companyId?: string;
	userId?: string;
}

export function ghlOauthConfigured(): boolean {
	return Boolean(
		process.env.GOHIGHLEVEL_CLIENT_ID &&
			process.env.GOHIGHLEVEL_CLIENT_SECRET &&
			process.env.GOHIGHLEVEL_REDIRECT_URI,
	);
}

export function getGhlAuthUrl(state: string): string {
	const params = new URLSearchParams({
		response_type: "code",
		client_id: process.env.GOHIGHLEVEL_CLIENT_ID as string,
		redirect_uri: process.env.GOHIGHLEVEL_REDIRECT_URI as string,
		scope: scopes(),
		state,
	});
	return `${GHL_AUTHORIZE_URL}?${params.toString()}`;
}

async function tokenRequest(body: URLSearchParams): Promise<GhlTokenResponse> {
	const response = await fetch(GHL_TOKEN_URL, {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body: body.toString(),
	});
	if (!response.ok) {
		const text = await response.text().catch(() => "");
		throw new Error(`GHL token request failed: ${response.status} ${text.slice(0, 300)}`);
	}
	return (await response.json()) as GhlTokenResponse;
}

export async function exchangeGhlCode(code: string): Promise<GhlTokenResponse> {
	return tokenRequest(
		new URLSearchParams({
			grant_type: "authorization_code",
			code,
			client_id: process.env.GOHIGHLEVEL_CLIENT_ID as string,
			client_secret: process.env.GOHIGHLEVEL_CLIENT_SECRET as string,
			redirect_uri: process.env.GOHIGHLEVEL_REDIRECT_URI as string,
			user_type: "Location",
		}),
	);
}

export async function refreshGhlToken(refreshToken: string): Promise<GhlTokenResponse> {
	return tokenRequest(
		new URLSearchParams({
			grant_type: "refresh_token",
			refresh_token: refreshToken,
			client_id: process.env.GOHIGHLEVEL_CLIENT_ID as string,
			client_secret: process.env.GOHIGHLEVEL_CLIENT_SECRET as string,
			user_type: "Location",
		}),
	);
}
