"use client";

import type { GatewayAgent } from "@repo/api/modules/voiceagents/lib/schema";

import { agentPersonaId, usePersonasQuery } from "../../lib/personas-api";
import { PersonaAvatar } from "./PersonaAvatar";

/**
 * Compact badge for the builder header showing the agent's attached persona
 * (avatar + name). Renders nothing when no persona is attached. Clicking it
 * opens the Personas aside via `onClick`.
 */
export function PersonaBadge({
	agent,
	onClick,
}: {
	agent: GatewayAgent;
	onClick?: () => void;
}) {
	const { data: personas } = usePersonasQuery();
	const attachedId = agentPersonaId(agent);
	const persona = personas?.find((p) => p.id === attachedId);

	if (!persona) {
		return null;
	}

	return (
		<button
			type="button"
			onClick={onClick}
			title={`Persona: ${persona.name}`}
			className="gap-1.5 py-0.5 pr-2.5 pl-0.5 flex items-center rounded-full border bg-card transition-colors hover:bg-accent"
		>
			<PersonaAvatar
				name={persona.name}
				avatarUrl={persona.avatarUrl}
				themeColor={persona.themeColor}
				sizeClass="size-6"
				textClass="text-[10px]"
			/>
			<span className="max-w-32 truncate text-xs font-medium">{persona.name}</span>
		</button>
	);
}
