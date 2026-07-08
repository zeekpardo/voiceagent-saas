interface OAuthPopupResult {
	success: boolean;
	error?: string;
}

/**
 * Open an OAuth URL in a centered popup and resolve when the callback page
 * posts `{ type: "OAUTH_CALLBACK_COMPLETE", success, error? }` (or the popup
 * closes). Copied from the proven wabridge implementation.
 */
export function openOAuthPopup(url: string): Promise<OAuthPopupResult> {
	return new Promise((resolve) => {
		const width = 600;
		const height = 750;
		const left = window.screenX + (window.outerWidth - width) / 2;
		const top = window.screenY + (window.outerHeight - height) / 2;

		const popup = window.open(
			url,
			"crm-oauth-popup",
			`width=${width},height=${height},left=${left},top=${top},toolbar=no,menubar=no,scrollbars=yes`,
		);

		if (!popup) {
			resolve({ success: false, error: "Popup blocked — allow popups for this site." });
			return;
		}

		const cleanup = () => {
			window.removeEventListener("message", handleMessage);
			clearInterval(pollTimer);
		};

		const handleMessage = (event: MessageEvent) => {
			if (event.data?.type === "OAUTH_CALLBACK_COMPLETE") {
				cleanup();
				resolve({ success: event.data.success ?? false, error: event.data.error });
			}
		};

		window.addEventListener("message", handleMessage);

		const pollTimer = setInterval(() => {
			if (popup.closed) {
				cleanup();
				resolve({ success: true });
			}
		}, 500);
	});
}
