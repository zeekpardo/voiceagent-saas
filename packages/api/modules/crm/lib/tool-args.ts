/** LLM arguments should be strings per the schema, but never trust them. */
export function stringArg(value: unknown): string {
	return typeof value === "string" ? value : "";
}
