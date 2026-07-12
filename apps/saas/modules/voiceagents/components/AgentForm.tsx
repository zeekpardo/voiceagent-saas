"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { agentConfigInput, type GatewayAgent } from "@repo/api/modules/voiceagents/lib/schema";
import { Button } from "@repo/ui/components/button";
import { Form } from "@repo/ui/components/form";
import { toastError, toastSuccess } from "@repo/ui/components/toast";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";

import { toFormValues } from "../lib/agent-form-mapping";
import { useCreateAgentMutation, useUpdateAgentMutation } from "../lib/api";
import { AudioSection } from "./agent-form/AudioSection";
import { ConversationDynamicsSection } from "./agent-form/ConversationDynamicsSection";
import { IdentityPersonaSection } from "./agent-form/IdentityPersonaSection";
import { JobInformationSection } from "./agent-form/JobInformationSection";
import { PreferencesSection } from "./agent-form/PreferencesSection";
import { VoiceModelSection } from "./agent-form/VoiceModelSection";

// Re-exported for flow/NodeEditorPanel.tsx, which shares these catalogs when
// picking per-node voice/model overrides.
export { MODEL_GROUPS, VOICE_GROUPS } from "../lib/voice-catalog";

interface AgentFormProps {
	agent?: GatewayAgent;
	/**
	 * Which slice of the form to render. The form always hydrates and submits
	 * the FULL config regardless of variant, so saving one slice never loses
	 * the other's fields.
	 * - "job": Instructions, Guardrails (Greeting is owned by the Greeter node).
	 * - "settings": Identity/Persona, Voice/Model, Conversation dynamics.
	 * - "preferences": post-call CRM outputs (summarize, summary field, call note)
	 *   and word rules (prohibited words).
	 * - undefined: the whole form (e.g. the create page).
	 */
	variant?: "job" | "settings" | "preferences";
}

export function AgentForm({ agent, variant }: AgentFormProps) {
	const router = useRouter();
	const createMutation = useCreateAgentMutation();
	const updateMutation = useUpdateAgentMutation(agent?.id ?? "");

	const form = useForm({
		resolver: zodResolver(agentConfigInput),
		defaultValues: toFormValues(agent),
	});
	const onSubmit = form.handleSubmit(async (values) => {
		// For flow agents the Greeter node owns config.greeting, so the Job panel
		// must not submit greeting — dropping it keeps it out of the PATCH body so
		// the gateway preserves whatever the flow last wrote.
		const payload = variant === "job" ? { ...values, greeting: undefined } : values;
		try {
			if (agent) {
				await updateMutation.mutateAsync(payload);
				toastSuccess(`Saved — now v${agent.version + 1}`);
			} else {
				const created = await createMutation.mutateAsync(payload);
				toastSuccess("Agent created");
				router.push(`/voice-agents/${created.id}`);
			}
		} catch (err) {
			toastError(err instanceof Error ? err.message : "Something went wrong");
		}
	});

	if (variant === "job") {
		return (
			<Form {...form}>
				<form onSubmit={onSubmit} className="gap-6 flex flex-col">
					<JobInformationSection form={form} agentId={agent?.id} />

					<div className="gap-3 flex justify-end">
						<Button type="submit" loading={createMutation.isPending || updateMutation.isPending}>
							{agent ? "Save changes" : "Create agent"}
						</Button>
					</div>
				</form>
			</Form>
		);
	}

	if (variant === "preferences") {
		return (
			<Form {...form}>
				<form onSubmit={onSubmit} className="gap-6 flex flex-col">
					<PreferencesSection form={form} agentId={agent?.id} />

					<div className="gap-3 flex justify-end">
						<Button type="submit" loading={createMutation.isPending || updateMutation.isPending}>
							{agent ? "Save changes" : "Create agent"}
						</Button>
					</div>
				</form>
			</Form>
		);
	}

	return (
		<Form {...form}>
			{/* @container: grids below split into two columns only when the FORM
			    itself is wide enough — one column in the 440px builder aside, two
			    on the full-width create page. */}
			<form onSubmit={onSubmit} className="gap-6 @container flex flex-col">
				<IdentityPersonaSection form={form} variant={variant} agentId={agent?.id} />
				<VoiceModelSection form={form} />
				<ConversationDynamicsSection form={form} />
				<AudioSection form={form} />

				<div className="gap-3 flex justify-end">
					<Button type="submit" loading={createMutation.isPending || updateMutation.isPending}>
						{agent ? "Save changes" : "Create agent"}
					</Button>
				</div>
			</form>
		</Form>
	);
}
