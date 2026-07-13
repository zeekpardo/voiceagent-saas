"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import type { UseFormReturn } from "react-hook-form";

import type { AgentFormValues } from "../../lib/agent-form-mapping";
import { GuardrailsField, InstructionsField, UserInfoNote } from "./shared-fields";

/** The "job" variant's card: the per-agent Goal (the job) and Guardrails, plus a
 *  read-only note about auto-injected caller/CRM details. Tone/response style now
 *  lives on the attached persona (Personas panel); Guardrails are a per-agent
 *  config field authored here. Prohibited words moved to the Preferences panel
 *  (word rules). The connect-time greeting is owned by the flow's Greeter node
 *  (canvas), not this panel. */
export function JobInformationSection({
	form,
	agentId,
}: {
	form: UseFormReturn<AgentFormValues>;
	agentId?: string;
}) {
	return (
		<Card>
			<CardHeader>
				<CardTitle>Job information</CardTitle>
			</CardHeader>
			<CardContent className="gap-4 flex flex-col">
				<InstructionsField form={form} agentId={agentId} />
				<GuardrailsField form={form} />
				<UserInfoNote />
			</CardContent>
		</Card>
	);
}
