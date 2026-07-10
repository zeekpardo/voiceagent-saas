"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import type { UseFormReturn } from "react-hook-form";

import type { AgentFormValues } from "../../lib/agent-form-mapping";
import {
	GreetingField,
	GuardrailsField,
	InstructionsField,
	ProhibitedWordsField,
	UserInfoNote,
} from "./shared-fields";

/** The "job" variant's card: Goal, Guardrails, Greeting, Prohibited words, plus
 *  a read-only note about auto-injected caller/CRM details. */
export function JobInformationSection({ form }: { form: UseFormReturn<AgentFormValues> }) {
	return (
		<Card>
			<CardHeader>
				<CardTitle>Job information</CardTitle>
			</CardHeader>
			<CardContent className="gap-4 flex flex-col">
				<InstructionsField
					form={form}
					label="Goal"
					description="The overarching objective for this job. Each node in the flow carries its own step-specific goal — keep this high level."
					hint="For example: Qualify inbound seller leads. You will: learn why they're selling and their timeline, capture the property details, and book a callback with the team."
				/>
				<GuardrailsField form={form} />
				<GreetingField form={form} />
				<ProhibitedWordsField form={form} />
				<UserInfoNote />
			</CardContent>
		</Card>
	);
}
