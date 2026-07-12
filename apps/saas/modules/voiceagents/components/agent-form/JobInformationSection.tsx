"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import type { UseFormReturn } from "react-hook-form";

import type { AgentFormValues } from "../../lib/agent-form-mapping";
import { InstructionsField, UserInfoNote } from "./shared-fields";

/** The "job" variant's card: the per-agent Goal (the job) plus a read-only note
 *  about auto-injected caller/CRM details. Tone and guardrails now live on the
 *  attached persona (Personas panel) — the per-agent Response Style and Guardrails
 *  fields were retired in Persona v2. Prohibited words moved to the Preferences
 *  panel (word rules). The connect-time greeting is owned by the flow's Greeter
 *  node (canvas), not this panel. */
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
				<UserInfoNote />
			</CardContent>
		</Card>
	);
}
