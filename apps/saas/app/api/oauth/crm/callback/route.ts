import { ensureCrmLiveTools } from "@repo/api/modules/crm/lib/live-tools";
import { verifyOauthState } from "@repo/api/modules/crm/lib/oauth-state";
import { getCrmRegistration } from "@repo/api/modules/crm/lib/resolve";
import { ensureVoiceWebhook } from "@repo/api/modules/crm/lib/webhook-registration";
import { createSource } from "@repo/database";

/**
 * Neutral CRM OAuth callback (the popup lands here). The path deliberately
 * contains no CRM brand names — providers reject redirect URLs containing
 * their trademarks. The signed `state` carries which provider, user, and
 * organization this new Source belongs to. Exchanges the code, creates the
 * Source, and posts OAUTH_CALLBACK_COMPLETE back to the opener.
 */

function popupResponse(success: boolean, error?: string): Response {
	const payload = JSON.stringify({ type: "OAUTH_CALLBACK_COMPLETE", success, error });
	return new Response(
		`<!doctype html><html><body style="font-family:system-ui;text-align:center;padding-top:80px">
			<p>${success ? "✅ Connected — you can close this window." : `❌ ${error ?? "Connection failed"}`}</p>
			<script>
				if (window.opener) { window.opener.postMessage(${payload}, "*"); }
				setTimeout(() => window.close(), ${success ? 800 : 4000});
			</script>
		</body></html>`,
		{ status: success ? 200 : 400, headers: { "Content-Type": "text/html" } },
	);
}

export async function GET(req: Request): Promise<Response> {
	const url = new URL(req.url);
	const code = url.searchParams.get("code");
	const state = url.searchParams.get("state");
	if (!code || !state) return popupResponse(false, "Missing code or state");

	const verified = verifyOauthState(state);
	if (!verified) return popupResponse(false, "Invalid or expired state — try connecting again");

	const registration = getCrmRegistration(verified.providerType);
	if (!registration?.oauth) return popupResponse(false, "OAuth is not configured for this CRM");

	try {
		const { config } = await registration.oauth.exchangeCode(code);

		// Validate + get a display name for the connected account.
		const provider = registration.create(config);
		const { accountName } = await provider.validateConnection();

		await createSource({
			organizationId: verified.organizationId,
			name: accountName || registration.label,
			providerType: verified.providerType,
			accountName,
			config,
		});
		await ensureVoiceWebhook();

		// Register the live in-call CRM tools (best-effort — the connection works without them).
		await ensureCrmLiveTools(verified.userId).catch((err) => {
			console.warn("[crm-oauth] live tool registration failed:", err);
		});

		return popupResponse(true);
	} catch (err) {
		console.error(`[crm-oauth] ${verified.providerType} callback failed:`, err);
		return popupResponse(false, err instanceof Error ? err.message : "Connection failed");
	}
}
