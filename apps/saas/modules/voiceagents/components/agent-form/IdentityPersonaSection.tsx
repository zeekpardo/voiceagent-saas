"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@repo/ui/components/form";
import { Input } from "@repo/ui/components/input";
import type { UseFormReturn } from "react-hook-form";

import type { AgentFormValues } from "../../lib/agent-form-mapping";
import { GreetingField, InstructionsField, ProhibitedWordsField } from "./shared-fields";

/**
 * "Identity & persona" card of the full (non-"job") form. Name and
 * description always render; the prompt-content fields render unless the
 * "settings" variant is active (they live on the separate Job Info tab).
 */
export function IdentityPersonaSection({
	form,
	variant,
	agentId,
}: {
	form: UseFormReturn<AgentFormValues>;
	variant?: "job" | "settings";
	agentId?: string;
}) {
	return (
		<Card>
			<CardHeader>
				<CardTitle>Identity & persona</CardTitle>
			</CardHeader>
			<CardContent className="gap-4 flex flex-col">
				<div className="gap-4 @xl:grid-cols-2 grid">
					<FormField
						control={form.control}
						name="name"
						render={({ field }) => (
							<FormItem>
								<FormLabel>Name</FormLabel>
								<FormControl>
									<Input placeholder="Front Desk Receptionist" {...field} />
								</FormControl>
								<FormMessage />
							</FormItem>
						)}
					/>
					<FormField
						control={form.control}
						name="description"
						render={({ field }) => (
							<FormItem>
								<FormLabel>Description</FormLabel>
								<FormControl>
									<Input placeholder="What this agent is for" {...field} />
								</FormControl>
							</FormItem>
						)}
					/>
				</div>
				{variant !== "settings" && (
					<>
						<InstructionsField form={form} agentId={agentId} />
						<ProhibitedWordsField form={form} />
						<GreetingField form={form} />
					</>
				)}
			</CardContent>
		</Card>
	);
}
