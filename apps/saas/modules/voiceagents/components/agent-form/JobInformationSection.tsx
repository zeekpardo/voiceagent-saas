"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import type { UseFormReturn } from "react-hook-form";

import type { AgentFormValues } from "../../lib/agent-form-mapping";
import { GreetingField, InstructionsField, ProhibitedWordsField } from "./shared-fields";

/** The "job" variant's only card: Instructions, Greeting, Prohibited words. */
export function JobInformationSection({ form }: { form: UseFormReturn<AgentFormValues> }) {
	return (
		<Card>
			<CardHeader>
				<CardTitle>Job information</CardTitle>
			</CardHeader>
			<CardContent className="gap-4 flex flex-col">
				<InstructionsField form={form} />
				<GreetingField form={form} />
				<ProhibitedWordsField form={form} />
			</CardContent>
		</Card>
	);
}
