"use client";

import type { ContactFieldOption } from "@repo/api/modules/crm/lib/field-mapping";
import { orpcClient } from "@shared/lib/orpc-client";
import { useQuery } from "@tanstack/react-query";

export type { ContactFieldOption };

/**
 * THE single source of truth for the builder's field dropdowns: contact fields
 * (standard catalog + the resolved sub-account's CRM custom fields) plus the
 * fixed LOCATION catalog. Backed by `voiceagents.contactFields.list`, which
 * resolves the Source from the agent (or the org's first Source) and is
 * failure-isolated — a CRM outage still returns the standard + location catalog.
 *
 * Pass an `agentId` to scope custom fields to that agent's Source; omit it to
 * use the org's first connected Source.
 */
export const contactFieldsQueryKey = (agentId?: string) =>
	["voiceagents", "contactFields", agentId ?? "org"] as const;

export function useContactFieldsQuery(agentId?: string) {
	return useQuery({
		queryKey: contactFieldsQueryKey(agentId),
		queryFn: () => orpcClient.voiceagents.contactFields.list({ agentId }),
		staleTime: 60_000,
	});
}
