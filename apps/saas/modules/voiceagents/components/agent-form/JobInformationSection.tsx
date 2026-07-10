"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import type { UseFormReturn } from "react-hook-form";

import type { AgentFormValues } from "../../lib/agent-form-mapping";
import {
	GuardrailsField,
	InstructionsField,
	ProhibitedWordsField,
	UserInfoNote,
} from "./shared-fields";

/** The "job" variant's card: Goal, Guardrails, Prohibited words, plus a
 *  read-only note about auto-injected caller/CRM details. The connect-time
 *  greeting is owned by the flow's Greeter node (canvas), not this panel. */
export function JobInformationSection({ form }: { form: UseFormReturn<AgentFormValues> }) {
	return (
		<Card>
			<CardHeader>
				<CardTitle>Job information</CardTitle>
			</CardHeader>
			<CardContent className="gap-4 flex flex-col">
				<InstructionsField form={form} />
				<GuardrailsField form={form} />
				<ProhibitedWordsField form={form} />
				<UserInfoNote />
			</CardContent>
		</Card>
	);
}
