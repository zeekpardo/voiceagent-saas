"use client";

import type {
	AgentConfigInput,
	CustomVariableDef,
	GatewayAgent,
} from "@repo/api/modules/voiceagents/lib/schema";
import { orpcClient } from "@shared/lib/orpc-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { toFormValues } from "./agent-form-mapping";

export const voiceAgentsQueryKey = ["voiceagents", "agents"] as const;
export const agentQueryKey = (id: string) => ["voiceagents", "agents", id] as const;
export const transcriptQueryKey = (callId: string) =>
	["voiceagents", "transcript", callId] as const;

export function useAgentsQuery() {
	return useQuery({
		queryKey: voiceAgentsQueryKey,
		queryFn: () => orpcClient.voiceagents.agents.list(),
	});
}

export function useAgentQuery(id: string) {
	return useQuery({
		queryKey: agentQueryKey(id),
		queryFn: () => orpcClient.voiceagents.agents.get({ id }),
	});
}

export function useCreateAgentMutation() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (config: AgentConfigInput) => orpcClient.voiceagents.agents.create(config),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: voiceAgentsQueryKey }),
	});
}

export function useUpdateAgentMutation(id: string) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (config: AgentConfigInput) => orpcClient.voiceagents.agents.update({ id, config }),
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: voiceAgentsQueryKey });
			void queryClient.invalidateQueries({ queryKey: agentQueryKey(id) });
		},
	});
}

/**
 * Persist the agent's Job Flow Variable DEFINITIONS. Rides the existing agent
 * update path (rebuild the full config with toFormValues + swap customVariables)
 * so it round-trips every other field untouched, exactly like the persona attach
 * mutation. Publishes a new agent version immediately.
 */
export function useSaveCustomVariablesMutation(id: string) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({
			agent,
			customVariables,
		}: {
			agent: GatewayAgent;
			customVariables: CustomVariableDef[];
		}) =>
			orpcClient.voiceagents.agents.update({
				id,
				config: { ...toFormValues(agent), customVariables },
			}),
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: voiceAgentsQueryKey });
			void queryClient.invalidateQueries({ queryKey: agentQueryKey(id) });
		},
	});
}

export function useDeleteAgentMutation() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (id: string) => orpcClient.voiceagents.agents.delete({ id }),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: voiceAgentsQueryKey }),
	});
}

export const toolsQueryKey = ["voiceagents", "tools"] as const;

export function useToolsQuery() {
	return useQuery({
		queryKey: toolsQueryKey,
		queryFn: () => orpcClient.voiceagents.tools.list(),
	});
}

export function useCreateToolMutation() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (input: {
			name: string;
			description: string;
			endpointUrl: string;
			timeoutMs: number;
			parameters: {
				name: string;
				type: "string" | "number" | "boolean";
				description: string;
				required: boolean;
			}[];
		}) => orpcClient.voiceagents.tools.create(input),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: toolsQueryKey }),
	});
}

export function useDeleteToolMutation() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (id: string) => orpcClient.voiceagents.tools.delete({ id }),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: toolsQueryKey }),
	});
}

export function useSetAgentToolsMutation(agentId: string) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (toolIds: string[]) =>
			orpcClient.voiceagents.agents.setTools({ id: agentId, toolIds }),
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: agentQueryKey(agentId) });
			void queryClient.invalidateQueries({ queryKey: voiceAgentsQueryKey });
		},
	});
}

export function useSaveFlowMutation(agentId: string) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (input: {
			flow: {
				entry: string;
				nodes: {
					id: string;
					name?: string;
					instructions: string;
					entryInstructions?: string;
					toolIds: string[];
					llm?: { model: string; temperature?: number; maxTokens?: number };
					exits: { name: string; description: string; target?: string }[];
					objectives?: {
						key: string;
						description: string;
						field?: string;
						options?: string[];
						required?: boolean;
						maxAttempts?: number;
						sensitivity?: number;
					}[];
				}[];
			};
			canvas: unknown;
			toolIds: string[];
			greeting?: string;
		}) => orpcClient.voiceagents.flow.save({ id: agentId, ...input }),
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: agentQueryKey(agentId) });
			void queryClient.invalidateQueries({ queryKey: voiceAgentsQueryKey });
		},
	});
}

export const agentDraftQueryKey = (id: string) => ["voiceagents", "agents", id, "draft"] as const;
export const agentVersionsQueryKey = (id: string) =>
	["voiceagents", "agents", id, "versions"] as const;

/** The staged flow-builder draft ({ config, updated_at }) or null when none. */
export function useAgentDraftQuery(agentId: string) {
	return useQuery({
		queryKey: agentDraftQueryKey(agentId),
		queryFn: () => orpcClient.voiceagents.draft.get({ id: agentId }),
	});
}

/** Draft body mirrors the flow save shape — flow + opaque canvas + toolIds union. */
type DraftBody = Parameters<typeof orpcClient.voiceagents.flow.save>[0] extends {
	id: string;
	flow: infer F;
	canvas: infer C;
	toolIds: infer T;
}
	? { flow: F; canvas: C; toolIds: T; greeting?: string; greetingGenerate?: boolean }
	: never;

export function useSaveDraftMutation(agentId: string) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (input: DraftBody) => orpcClient.voiceagents.draft.save({ id: agentId, ...input }),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: agentDraftQueryKey(agentId) }),
	});
}

export function useDiscardDraftMutation(agentId: string) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: () => orpcClient.voiceagents.draft.discard({ id: agentId }),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: agentDraftQueryKey(agentId) }),
	});
}

export function usePublishAgentMutation(agentId: string) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: () => orpcClient.voiceagents.draft.publish({ id: agentId }),
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: agentQueryKey(agentId) });
			void queryClient.invalidateQueries({ queryKey: voiceAgentsQueryKey });
			void queryClient.invalidateQueries({ queryKey: agentDraftQueryKey(agentId) });
			void queryClient.invalidateQueries({ queryKey: agentVersionsQueryKey(agentId) });
		},
	});
}

export function useAgentVersionsQuery(agentId: string, enabled: boolean) {
	return useQuery({
		queryKey: agentVersionsQueryKey(agentId),
		queryFn: () => orpcClient.voiceagents.versions.list({ id: agentId }),
		enabled,
	});
}

export function useRestoreVersionMutation(agentId: string) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (version: number) =>
			orpcClient.voiceagents.versions.restore({ id: agentId, version }),
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: agentQueryKey(agentId) });
			void queryClient.invalidateQueries({ queryKey: voiceAgentsQueryKey });
			void queryClient.invalidateQueries({ queryKey: agentDraftQueryKey(agentId) });
			void queryClient.invalidateQueries({ queryKey: agentVersionsQueryKey(agentId) });
		},
	});
}

/**
 * CRM "live tools" (update_contact, add_tag, move_stage, check_availability,
 * book_appointment) registered for this agent's sole attached Source.
 * Degrades to [] when the agent has zero or multiple attached Sources, so
 * the flow builder still works without one resolved.
 */
export function useAgentLiveToolsQuery(agentId: string) {
	return useQuery({
		queryKey: ["voiceagents", "agents", agentId, "liveTools"] as const,
		queryFn: () =>
			orpcClient.voiceagents
				.liveTools({ agentId })
				.catch(() => ({ tools: [] as { id: string; name: string; description: string }[] })),
	});
}

/** An agent's bookable calendars, resolved via its sole attached Source. */
export function useAgentCalendarsQuery(agentId: string, enabled: boolean) {
	return useQuery({
		queryKey: ["voiceagents", "agents", agentId, "calendars"] as const,
		queryFn: () => orpcClient.voiceagents.calendars({ agentId }),
		enabled,
	});
}

export const numbersQueryKey = ["voiceagents", "numbers"] as const;

export function useNumbersQuery() {
	return useQuery({
		queryKey: numbersQueryKey,
		queryFn: () => orpcClient.voiceagents.numbers.list(),
	});
}

export function useSetNumberAgentMutation() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (input: { id: string; agentId: string | null }) =>
			orpcClient.voiceagents.numbers.setAgent(input),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: numbersQueryKey }),
	});
}

/** Inbox view: all recent calls across agents, polled so new calls appear. */
export function useInboxCallsQuery() {
	return useQuery({
		queryKey: ["voiceagents", "calls", "inbox"] as const,
		queryFn: () => orpcClient.voiceagents.calls.list({ limit: 200 }),
		refetchInterval: 15_000,
	});
}

export function useTranscriptQuery(callId: string | null) {
	return useQuery({
		queryKey: transcriptQueryKey(callId ?? "none"),
		queryFn: () => orpcClient.voiceagents.calls.transcript({ id: callId! }),
		enabled: !!callId,
	});
}

export const callEventsQueryKey = (callId: string) =>
	["voiceagents", "call-events", callId] as const;

/** A call's raw engine events (flow.objective, tool calls, …) for the inbox trace. */
export function useCallEventsQuery(callId: string | null) {
	return useQuery({
		queryKey: callEventsQueryKey(callId ?? "none"),
		queryFn: () => orpcClient.voiceagents.calls.events({ id: callId! }),
		enabled: !!callId,
	});
}
