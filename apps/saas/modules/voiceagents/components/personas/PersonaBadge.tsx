"use client";

import type { GatewayAgent } from "@repo/api/modules/voiceagents/lib/schema";
import { SparklesIcon } from "lucide-react";

import { agentPersonaId, usePersonasQuery } from "../../lib/personas-api";
import { PersonaAvatar } from "./PersonaAvatar";

/**
 * Compact badge for the builder header showing the agent's attached persona
 * (avatar + name). Clicking it opens the Personas aside via `onClick`.
 *
 * Persona v2 makes a persona REQUIRED to publish, so when none is attached this
 * renders a clear "Attach a persona" prompt (rather than nothing) to keep the
 * affordance prominent and guide the user to the Personas panel.
 */
export function PersonaBadge({ agent, onClick }: { agent: GatewayAgent; onClick?: () => void }) {
	const { data: personas } = usePersonasQuery();
	const attachedId = agentPersonaId(agent);
	const persona = personas?.find((p) => p.id === attachedId);

	if (!persona) {
		return (
			<button
				type="button"
				onClick={onClick}
				title="Attach a persona — required to publish"
				className="gap-1.5 py-1 pr-3 pl-2.5 text-xs font-medium flex items-center rounded-full border border-dashed text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
			>
				<SparklesIcon className="size-3.5" />
				Attach a persona
			</button>
		);
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
			<span className="max-w-32 text-xs font-medium truncate">{persona.name}</span>
		</button>
	);
}
