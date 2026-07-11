import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Per-invocation CRM HTTP tracing for the call "AI logs" panel.
 *
 * /api/tools/crm runs each tool dispatch inside `withHttpTrace`; the GHL
 * client records every outbound CRM request/response into the active trace
 * via `recordHttpTrace`. After the dispatch, the route flushes the collected
 * entries to the gateway as `http.request` call events, so the SaaS logs
 * drawer can show exactly what was sent to / received from the CRM.
 *
 * Secrets NEVER enter a trace: only method, url, status and JSON bodies are
 * recorded — headers (Authorization et al) are never captured. Bodies are
 * capped at HTTP_TRACE_CAP characters.
 */

export const HTTP_TRACE_CAP = 16_384;

export interface HttpTraceEntry {
	method: string;
	url: string;
	status: number | null;
	ok: boolean;
	durationMs: number;
	/** JSON request body (capped), or null for body-less requests. */
	request: unknown;
	/** Parsed JSON response (capped) or the error detail text. */
	response: unknown;
}

const storage = new AsyncLocalStorage<HttpTraceEntry[]>();

/** Cap an arbitrary JSON value; oversized values become a truncated marker. */
export function capTraceValue(value: unknown): unknown {
	if (value === undefined) {
		return null;
	}
	let serialized: string;
	try {
		serialized = JSON.stringify(value) ?? "null";
	} catch {
		return { truncated: true, note: "unserializable value" };
	}
	if (serialized.length <= HTTP_TRACE_CAP) {
		return value;
	}
	return {
		truncated: true,
		cap_chars: HTTP_TRACE_CAP,
		json: `${serialized.slice(0, HTTP_TRACE_CAP)}…`,
	};
}

/** Record one outbound CRM HTTP exchange. No-op outside a withHttpTrace scope. */
export function recordHttpTrace(entry: HttpTraceEntry): void {
	storage.getStore()?.push(entry);
}

/** Run fn with an active trace; returns the collected entries alongside. */
export async function withHttpTrace<T>(
	fn: () => Promise<T>,
): Promise<{ result: T; entries: HttpTraceEntry[] }> {
	const entries: HttpTraceEntry[] = [];
	const result = await storage.run(entries, fn);
	return { result, entries };
}
