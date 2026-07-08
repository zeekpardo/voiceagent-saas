import type { CrmProvider } from "./provider";

/**
 * The ONE extension point for adding a CRM (wabridge pattern): append a
 * registration — its connect-form fields, validation, and provider factory —
 * and every downstream caller (sync, mapping UI, connect cards) stays
 * vendor-agnostic.
 */

/** A field the connect dialog renders for this provider (apiKey auth). */
export interface ConnectField {
	name: string;
	label: string;
	placeholder?: string;
	help?: string;
	secret?: boolean;
}

/** Runtime services handed to a provider (e.g. persisting rotated tokens). */
export interface CrmProviderContext {
	persist?: (config: Record<string, string>) => Promise<void>;
}

export interface CrmProviderRegistration {
	/** Stable id, e.g. "gohighlevel". Matches CrmProvider.type. */
	type: string;
	/** Human label for the connect UI, e.g. "GoHighLevel". */
	label: string;
	/** Short description shown on the provider card. */
	description: string;
	/** How a user authenticates this CRM (drives the connect flow). */
	authType: "apiKey" | "oauth";
	/** Fields the connect dialog collects (apiKey auth). */
	connectFields: ConnectField[];
	/** OAuth flow hooks (marketplace-app auth). */
	oauth?: {
		getAuthUrl(state: string): string;
		/** Exchange the callback code for a stored connection config. */
		exchangeCode(code: string): Promise<{ config: Record<string, string> }>;
	};
	/** Build a live provider from a stored connection config. */
	create(config: Record<string, string>, ctx?: CrmProviderContext): CrmProvider;
}

const REGISTRY: CrmProviderRegistration[] = [];

export function registerCrmProvider(registration: CrmProviderRegistration): void {
	if (REGISTRY.some((r) => r.type === registration.type)) return;
	REGISTRY.push(registration);
}

/** Metadata for every registered CRM — drives the "connect a CRM" cards. */
export function listCrmProviders(): ReadonlyArray<Omit<CrmProviderRegistration, "create">> {
	return REGISTRY.map(({ create, ...meta }) => meta);
}

export function getCrmRegistration(type: string): CrmProviderRegistration | null {
	return REGISTRY.find((r) => r.type === type) ?? null;
}
