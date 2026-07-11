"use client";

import { orpcClient } from "@shared/lib/orpc-client";
import { useCallback } from "react";

import {
	type AgentSessionChannel,
	type AgentSessionStatus,
	type AgentSessionTurn,
	useAgentRoomSession,
} from "./use-agent-room-session";

export type TestStatus = AgentSessionStatus;
export type TestTurn = AgentSessionTurn;
export type TestChannel = AgentSessionChannel;

export interface StartTestOptions {
	variables?: Record<string, string>;
	sourceId?: string;
	crmContactId?: string;
	contactPhone?: string;
}

/** Pull the {{variable}} names an agent's prompts reference. */
export function extractVariableNames(config: Record<string, unknown> | undefined): string[] {
	const text = `${(config?.instructions as string) ?? ""}\n${(config?.greeting as string) ?? ""}`;
	const names = new Set<string>();
	for (const m of text.matchAll(/\{\{\s*([\w.-]+)\s*\}\}/g)) {
		names.add(m[1]!);
	}
	return [...names];
}

/**
 * The authenticated test-portal flavor of an agent conversation: creates a
 * gateway session through the protected oRPC procedure (the gateway key stays
 * server-side), then hands the join info to the shared `useAgentRoomSession`
 * room core (connect, transcript, agent state, text send).
 */
export function useVoiceTestSession(agentId: string, channel: TestChannel = "voice") {
	const getSession = useCallback(
		async ({ variables, sourceId, crmContactId, contactPhone }: StartTestOptions = {}) => {
			const filled = Object.fromEntries(
				Object.entries(variables ?? {}).filter(([, value]) => value.trim() !== ""),
			);
			return await orpcClient.voiceagents.sessions.create({
				agentId,
				variables: filled,
				sourceId: sourceId || undefined,
				crmContactId: crmContactId?.trim() || undefined,
				contactPhone: contactPhone?.trim() || undefined,
				channel,
			});
		},
		[agentId, channel],
	);

	return useAgentRoomSession<StartTestOptions>({ channel, getSession });
}
