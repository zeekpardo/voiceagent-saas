"use client";

import type { GatewayAgent } from "@repo/api/modules/voiceagents/lib/schema";
import { createContext, type PropsWithChildren, useContext } from "react";

import { agentPersonaId, type Persona, usePersonasQuery } from "../../lib/personas-api";

/**
 * Makes the agent's attached persona available to components rendered deep
 * inside the flow canvas (React Flow nodes receive no agent props), so the
 * Start node can show who takes the call.
 */
const AttachedPersonaContext = createContext<Persona | null>(null);

export function AttachedPersonaProvider({
	agent,
	children,
}: PropsWithChildren<{ agent: GatewayAgent }>) {
	const { data: personas } = usePersonasQuery();
	const attachedId = agentPersonaId(agent);
	const persona = personas?.find((p) => p.id === attachedId) ?? null;

	return (
		<AttachedPersonaContext.Provider value={persona}>{children}</AttachedPersonaContext.Provider>
	);
}

export function useAttachedPersona(): Persona | null {
	return useContext(AttachedPersonaContext);
}
