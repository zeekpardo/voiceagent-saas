"use client";

import type { GatewayAgent } from "@repo/api/modules/voiceagents/lib/schema";
import { orpcClient } from "@shared/lib/orpc-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { toFormValues } from "./agent-form-mapping";
import { agentQueryKey, voiceAgentsQueryKey } from "./api";

/**
 * A persona is a reusable identity (name, look, tone, response style) that can
 * be attached to any agent. Mirrors the backend CONTRACT under
 * `voiceagents.personas.*`. When the backend types land in
 * `@repo/api/modules/voiceagents/lib/schema`, swap the local `Persona` /
 * `PersonaInput` types for the imported ones and drop the `personasClient`
 * cast below — the hook surface stays identical.
 */
export interface Persona {
	id: string;
	name: string;
	internalDescription: string | null;
	avatarUrl: string | null;
	themeColor: string | null;
	/** Free-entry tone words, max 3 (e.g. "warm", "curious"). */
	styles: string[];
	howToRespond: string;
	/** Reusable safety/behavior rules — compiles into `## GUARDRAILS` for every agent using this persona. */
	guardrails: string | null;
	/** TTS voice id — voice channels only, ignored for text/SMS. */
	ttsVoice: string | null;
	/** Voice respond model id — voice channels only, ignored for text/SMS. */
	llmModel: string | null;
	createdAt: Date | string;
	updatedAt: Date | string;
}

export interface PersonaInput {
	name: string;
	internalDescription?: string | null;
	avatarUrl?: string | null;
	themeColor?: string | null;
	styles: string[];
	howToRespond: string;
}

function personasClient() {
	return orpcClient.voiceagents.personas;
}

export const personasQueryKey = ["voiceagents", "personas"] as const;

export function usePersonasQuery() {
	return useQuery({
		queryKey: personasQueryKey,
		queryFn: () => personasClient().list(),
	});
}

export function useCreatePersonaMutation() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (input: PersonaInput) => personasClient().create(input),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: personasQueryKey }),
	});
}

export function useUpdatePersonaMutation() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ id, ...data }: { id: string } & PersonaInput) =>
			personasClient().update({ id, data }),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: personasQueryKey }),
	});
}

export function useDeletePersonaMutation() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (id: string) => personasClient().delete({ id }),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: personasQueryKey }),
	});
}

/**
 * Attach (or clear, with `personaId: null`) a persona on an agent. Rides the
 * existing agent update path — `agents.update` re-parses the full config and
 * publishes a NEW agent version immediately (exactly like the Agent settings
 * aside's "Save changes"), so no separate publish step is required.
 *
 * SEAM — `personaId` isn't on `agentConfigInput` yet (backend adds it). We
 * rebuild the current config with `toFormValues` and merge `personaId`, casting
 * past the schema type until the backend widens it. Drop the cast once
 * `agentConfigInput` carries `personaId`.
 */
export function useAttachPersonaMutation() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ agent, personaId }: { agent: GatewayAgent; personaId: string | null }) => {
			const config = { ...toFormValues(agent), personaId };
			return orpcClient.voiceagents.agents.update({ id: agent.id, config });
		},
		onSuccess: (_data, { agent }) => {
			void queryClient.invalidateQueries({ queryKey: voiceAgentsQueryKey });
			void queryClient.invalidateQueries({ queryKey: agentQueryKey(agent.id) });
		},
	});
}

/** Read the attached persona id off an agent config (undefined when none). */
export function agentPersonaId(
	agent: Pick<GatewayAgent, "config"> | undefined,
): string | undefined {
	const raw = (agent?.config as Record<string, unknown> | undefined)?.personaId;
	return typeof raw === "string" ? raw : undefined;
}
