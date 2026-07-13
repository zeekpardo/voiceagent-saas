/**
 * Extract a safe, log-friendly string from an unknown thrown value.
 *
 * Logs only the error message — never the full error object. Errors from CRM /
 * provider API calls frequently carry the upstream response body (contact phone,
 * email, name, full records) on nested `.response.data` / `.cause` fields, and
 * `console.error("...", err)` serializes all of it into application logs. Passing
 * values through this helper keeps PII out of the logs.
 */
export function errMessage(err: unknown): string {
	if (err instanceof Error) return err.message;
	if (typeof err === "string") return err;
	try {
		return String(err);
	} catch {
		return "unknown error";
	}
}
