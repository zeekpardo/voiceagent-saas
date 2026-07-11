"use client";

import type {
	WidgetAppearance,
	WidgetBehavior,
	WidgetTargeting,
} from "@repo/api/modules/voiceagents/lib/widget-config";
import type { GatewayCall } from "@repo/api/modules/voiceagents/procedures/calls";
import { orpcClient } from "@shared/lib/orpc-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export const sourcesQueryKey = ["sources"] as const;
export const sourceProvidersQueryKey = ["sources", "providers"] as const;
export const agentSourcesQueryKey = (agentId: string) =>
	["voiceagents", "agents", agentId, "sources"] as const;
export const sourceAgentIdsQueryKey = (sourceId: string) =>
	["sources", sourceId, "agents"] as const;

export function useSourcesQuery() {
	return useQuery({ queryKey: sourcesQueryKey, queryFn: () => orpcClient.sources.list() });
}

/** Ids of the agents already attached to this source — powers the "attached"
 * hint on the Website Widget tab's agent picker. */
export function useSourceAgentIdsQuery(sourceId: string) {
	return useQuery({
		queryKey: sourceAgentIdsQueryKey(sourceId),
		queryFn: () => orpcClient.sources.agents({ sourceId }),
	});
}

/**
 * Single-source lookup for the detail page. There's no dedicated get-by-id
 * procedure, so this derives from the same org-scoped list the table uses.
 */
export function useSourceQuery(sourceId: string) {
	const query = useSourcesQuery();
	return {
		...query,
		data: query.data?.find((source) => source.id === sourceId),
	};
}

export function useSourceProvidersQuery() {
	return useQuery({
		queryKey: sourceProvidersQueryKey,
		queryFn: () => orpcClient.sources.providers(),
	});
}

export function useConnectSourceMutation() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (input: { name?: string; providerType: string; config: Record<string, string> }) =>
			orpcClient.sources.connect(input),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: sourcesQueryKey }),
	});
}

export function useDisconnectSourceMutation() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (id: string) => orpcClient.sources.disconnect({ id }),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: sourcesQueryKey }),
	});
}

export function useSourceOauthUrlMutation() {
	return useMutation({
		mutationFn: (providerType: string) => orpcClient.sources.oauthUrl({ providerType }),
	});
}

// ---------------------------------------------------------------- agent <-> source attachment

export function useAgentSourcesQuery(agentId: string) {
	return useQuery({
		queryKey: agentSourcesQueryKey(agentId),
		queryFn: () => orpcClient.voiceagents.sources.list({ agentId }),
	});
}

export function useAttachSourceMutation(agentId: string) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (sourceId: string) => orpcClient.voiceagents.sources.attach({ agentId, sourceId }),
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: agentSourcesQueryKey(agentId) });
			void queryClient.invalidateQueries({ queryKey: sourcesQueryKey });
		},
	});
}

export function useDetachSourceMutation(agentId: string) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (sourceId: string) => orpcClient.voiceagents.sources.detach({ agentId, sourceId }),
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: agentSourcesQueryKey(agentId) });
			void queryClient.invalidateQueries({ queryKey: sourcesQueryKey });
		},
	});
}

export function useAutoMapSourceMutation(agentId: string) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (sourceId: string) => orpcClient.voiceagents.sources.autoMap({ agentId, sourceId }),
		onSuccess: () =>
			void queryClient.invalidateQueries({ queryKey: agentSourcesQueryKey(agentId) }),
	});
}

export function useSaveSourceMappingMutation(agentId: string) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (input: {
			sourceId: string;
			enabled: boolean;
			fieldMappings: {
				extractField: string;
				/** Unified target key, e.g. "contact.email" or "contact.pool". */
				contactField?: string;
				/** Display label captured at pick time. */
				contactFieldLabel?: string;
				// Legacy shapes, still accepted for older saved mappings:
				crmFieldId?: string;
				crmFieldName?: string;
				standardField?: string;
			}[];
			tagFilters?: { tag: string; mode: "is" | "is_not" }[];
			/** Omni-channel text channels this agent monitors for this source. */
			channels?: ("sms" | "email" | "whatsapp" | "ig" | "fb" | "live_chat" | "gmb" | "custom")[];
			tagRules: { extractField: string; equals: string; tag: string }[];
			stageRules: {
				extractField: string;
				equals: string;
				pipelineId: string;
				stageId: string;
				pipelineName?: string;
				stageName?: string;
			}[];
			/** Optional: Call-notes moved to the agent Preferences panel; when
			 *  omitted the server preserves the existing per-source value. */
			writeNote?: boolean;
			/** Job Flow Variables — per-source value overrides ({ name: value }).
			 *  Omit to preserve the stored map. */
			variableValues?: Record<string, string>;
			bookingCalendarId?: string | null;
			bookingCalendarName?: string | null;
		}) => orpcClient.voiceagents.sources.saveMapping({ agentId, ...input }),
		onSuccess: () =>
			void queryClient.invalidateQueries({ queryKey: agentSourcesQueryKey(agentId) }),
	});
}

export function useSourceTriggerUrlQuery(agentId: string, sourceId: string | null) {
	return useQuery({
		queryKey: ["voiceagents", "agents", agentId, "sources", sourceId, "triggerUrl"] as const,
		queryFn: () => orpcClient.voiceagents.triggerUrl({ agentId, sourceId: sourceId! }),
		enabled: !!sourceId,
		staleTime: Number.POSITIVE_INFINITY, // deterministic per (agent, source)
	});
}

// ---------------------------------------------------------------- per-source CRM directory

export function useSourceCustomFieldsQuery(sourceId: string | null) {
	return useQuery({
		queryKey: ["sources", sourceId, "customFields"] as const,
		queryFn: () => orpcClient.sources.customFields.list({ sourceId: sourceId! }),
		enabled: !!sourceId,
	});
}

export function useCreateSourceFieldMutation(sourceId: string) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (name: string) => orpcClient.sources.customFields.create({ sourceId, name }),
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: ["sources", sourceId, "customFields"] });
			// New custom fields must also show up in the ContactFieldPicker's list.
			void queryClient.invalidateQueries({ queryKey: ["sources", sourceId, "contactFields"] });
		},
	});
}

export function useSourceTagsQuery(sourceId: string | null) {
	return useQuery({
		queryKey: ["sources", sourceId, "tags"] as const,
		queryFn: () => orpcClient.sources.tags.list({ sourceId: sourceId! }),
		enabled: !!sourceId,
	});
}

export interface ContactFieldOption {
	key: string;
	label: string;
	kind: "standard" | "custom";
}

/** Unified list of writable contact fields (standard + custom) for a source — powers the ContactFieldPicker. */
export function useSourceContactFieldsQuery(sourceId: string | null) {
	return useQuery({
		queryKey: ["sources", sourceId, "contactFields"] as const,
		queryFn: () => orpcClient.voiceagents.sources.contactFields({ sourceId: sourceId! }),
		enabled: !!sourceId,
	});
}

export function useSourcePipelinesQuery(sourceId: string | null) {
	return useQuery({
		queryKey: ["sources", sourceId, "pipelines"] as const,
		queryFn: () => orpcClient.sources.pipelines.list({ sourceId: sourceId! }),
		enabled: !!sourceId,
	});
}

export function useSourceCalendarsQuery(sourceId: string | null) {
	return useQuery({
		queryKey: ["sources", sourceId, "calendars"] as const,
		queryFn: () => orpcClient.sources.calendars.list({ sourceId: sourceId! }),
		enabled: !!sourceId,
	});
}

// ---------------------------------------------------------------- source phone numbers

export const sourceNumbersQueryKey = (sourceId: string) =>
	["sources", sourceId, "numbers"] as const;

/** The phone numbers mapped to a source, enriched with engine routing data. */
export function useSourceNumbersQuery(sourceId: string) {
	return useQuery({
		queryKey: sourceNumbersQueryKey(sourceId),
		queryFn: () => orpcClient.sources.numbers.list({ sourceId }),
	});
}

export interface SearchNumbersInput {
	sourceId: string;
	country?: string;
	areaCode?: string;
	contains?: string;
	limit?: number;
}

/** Imperative search for purchasable numbers — driven by the buy dialog. */
export function useSearchNumbersMutation() {
	return useMutation({
		mutationFn: (input: SearchNumbersInput) => orpcClient.sources.numbers.available(input),
	});
}

export function usePurchaseNumberMutation(sourceId: string) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (input: { number: string; inboundAgentId?: string | null; label?: string }) =>
			orpcClient.sources.numbers.purchase({ sourceId, ...input }),
		onSuccess: () =>
			void queryClient.invalidateQueries({ queryKey: sourceNumbersQueryKey(sourceId) }),
	});
}

export function useReleaseNumberMutation(sourceId: string) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (id: string) => orpcClient.sources.numbers.release({ sourceId, id }),
		onSuccess: () =>
			void queryClient.invalidateQueries({ queryKey: sourceNumbersQueryKey(sourceId) }),
	});
}

// ---------------------------------------------------------------- usage

/** Last-N-days call usage for a single source (detail page card). */
export function useSourceUsageQuery(sourceId: string, days = 30) {
	return useQuery({
		queryKey: ["sources", sourceId, "usage", days] as const,
		queryFn: () => orpcClient.sources.usage({ sourceId, days }),
	});
}

/** Org-wide per-source usage — admin only; the server enforces the role check too. */
export function useSourceUsageSummaryQuery(days = 30, enabled = true) {
	return useQuery({
		queryKey: ["sources", "usageSummary", days] as const,
		queryFn: () => orpcClient.sources.usageSummary({ days }),
		enabled,
	});
}

// ---------------------------------------------------------------- concurrency limits (platform admin only)

export const limitsQueryKey = ["sources", "limits"] as const;

/** Configured concurrency limits (project/agent/group). Platform-admin only
 * — the server enforces the role check too; pass `enabled: false` for
 * non-admins to skip the request entirely. */
export function useLimitsQuery(enabled = true) {
	return useQuery({
		queryKey: limitsQueryKey,
		queryFn: () => orpcClient.sources.limits.list(),
		enabled,
	});
}

export function useSetLimitMutation() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (input: {
			scope: "project" | "agent" | "group";
			ref?: string;
			maxConcurrent: number | null;
		}) => orpcClient.sources.limits.set(input),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: limitsQueryKey }),
	});
}

/**
 * Match the selected call to a CRM contact (by stored contact id, else by
 * the human's phone number). Resolves which Source via the call's
 * metadata.source_id, falling back to the agent's sole attached source.
 */
export function useContactMatchQuery(call: GatewayCall | null) {
	const contactId = call?.metadata?.crm_contact_id;
	const sourceId = call?.metadata?.source_id;
	const phone = call ? (call.direction === "outbound" ? call.to_number : call.from_number) : null;

	return useQuery({
		queryKey: ["sources", "contactMatch", call?.id ?? "none"] as const,
		queryFn: () =>
			orpcClient.sources.matchContact({
				contactId: contactId || undefined,
				phone: contactId ? undefined : (phone ?? undefined),
				callId: call?.id,
				sourceId,
				agentId: call?.agent_id,
			}),
		enabled: !!call && (!!contactId || !!phone),
		staleTime: 5 * 60 * 1000,
	});
}

// ---------------------------------------------------------------- website widgets (Studio)

/** A saved Website Widget as served by the oRPC `sources.widgets` procedures. */
export interface SourceWidgetDto {
	id: string;
	sourceId: string;
	agentId: string;
	name: string;
	enabled: boolean;
	token: string;
	origins: string[];
	appearance: WidgetAppearance;
	targeting: WidgetTargeting;
	behavior: WidgetBehavior;
	createdAt: string | Date;
	updatedAt: string | Date;
}

export const sourceWidgetsQueryKey = (sourceId: string) =>
	["sources", sourceId, "widgets"] as const;

export function useSourceWidgetsQuery(sourceId: string) {
	return useQuery({
		queryKey: sourceWidgetsQueryKey(sourceId),
		queryFn: () => orpcClient.sources.widgets.list({ sourceId }),
	});
}

export function useCreateWidgetMutation(sourceId: string) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (input: { agentId: string; name: string }) =>
			orpcClient.sources.widgets.create({ sourceId, ...input }),
		onSuccess: () =>
			void queryClient.invalidateQueries({ queryKey: sourceWidgetsQueryKey(sourceId) }),
	});
}

export interface UpdateWidgetInput {
	id: string;
	name?: string;
	agentId?: string;
	enabled?: boolean;
	origins?: string[];
	appearance?: Partial<WidgetAppearance>;
	targeting?: WidgetTargeting;
	behavior?: WidgetBehavior;
}

export function useUpdateWidgetMutation(sourceId: string) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (input: UpdateWidgetInput) => orpcClient.sources.widgets.update(input),
		onSuccess: () =>
			void queryClient.invalidateQueries({ queryKey: sourceWidgetsQueryKey(sourceId) }),
	});
}

export function useRemoveWidgetMutation(sourceId: string) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (id: string) => orpcClient.sources.widgets.remove({ id }),
		onSuccess: () =>
			void queryClient.invalidateQueries({ queryKey: sourceWidgetsQueryKey(sourceId) }),
	});
}
