"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import {
	FormControl,
	FormDescription,
	FormField,
	FormItem,
	FormLabel,
} from "@repo/ui/components/form";
import { Switch } from "@repo/ui/components/switch";
import type { UseFormReturn } from "react-hook-form";

import type { AgentFormValues } from "../../lib/agent-form-mapping";
import { ContactWriteFieldCombobox } from "../flow/ContactWriteFieldCombobox";

/**
 * "After the call" card: the summarize toggle plus an optional CRM contact
 * field to write the summary to. The old per-field extract editor was removed —
 * objective nodes now capture + write fields live during the call, so post-call
 * re-extraction is redundant.
 */
export function AfterCallSection({
	form,
	agentId,
}: {
	form: UseFormReturn<AgentFormValues>;
	/** Scopes the summary-field picker's custom fields to this agent's Source. */
	agentId?: string;
}) {
	const summarize = form.watch("postCall.summarize");

	return (
		<Card>
			<CardHeader>
				<CardTitle>After the call</CardTitle>
			</CardHeader>
			<CardContent className="gap-4 flex flex-col">
				<FormField
					control={form.control}
					name="postCall.summarize"
					render={({ field }) => (
						<FormItem className="p-3 flex items-center justify-between rounded-lg border">
							<div>
								<FormLabel>Summarize</FormLabel>
								<FormDescription>Attach an AI summary to every transcript</FormDescription>
							</div>
							<FormControl>
								<Switch checked={field.value} onCheckedChange={field.onChange} />
							</FormControl>
						</FormItem>
					)}
				/>
				{summarize && (
					<FormField
						control={form.control}
						name="postCall.summaryField"
						render={({ field }) => (
							<FormItem>
								<FormLabel>Save summary to</FormLabel>
								<FormControl>
									<ContactWriteFieldCombobox
										agentId={agentId}
										value={field.value ?? null}
										onChange={(key) => field.onChange(key)}
										allowEmpty
										emptyLabel="Don't save"
										allowCustomKey
										placeholder="Don't save"
									/>
								</FormControl>
								<FormDescription>
									Optionally write the call summary to a CRM field (e.g. a Call Summary custom
									field).
								</FormDescription>
							</FormItem>
						)}
					/>
				)}
			</CardContent>
		</Card>
	);
}
