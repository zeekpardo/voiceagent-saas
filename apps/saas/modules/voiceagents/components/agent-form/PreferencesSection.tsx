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
import { ProhibitedWordsField } from "./shared-fields";

/**
 * The "preferences" variant: per-agent operational controls that used to be
 * scattered across the Job panel (Prohibited words) and the source tab (Call
 * notes) plus the old After-the-call card (Summarize + Save summary to field).
 * Consolidated here with plain-English descriptions so it's obvious what each
 * one does and how they relate — Summarize is the master switch that produces
 * the summary the other two outputs consume.
 */
export function PreferencesSection({
	form,
	agentId,
}: {
	form: UseFormReturn<AgentFormValues>;
	/** Scopes the summary-field picker's custom fields to this agent's Source. */
	agentId?: string;
}) {
	const summarize = form.watch("postCall.summarize");

	return (
		<div className="gap-6 flex flex-col">
			<Card>
				<CardHeader>
					<CardTitle>After the call → CRM</CardTitle>
				</CardHeader>
				<CardContent className="gap-4 flex flex-col">
					{/* Master switch: whether a summary is produced at all. */}
					<FormField
						control={form.control}
						name="postCall.summarize"
						render={({ field }) => (
							<FormItem className="p-3 flex items-center justify-between rounded-lg border">
								<div className="pr-3">
									<FormLabel>Summarize the call</FormLabel>
									<FormDescription>
										Generate a short AI summary of the conversation and attach it to the transcript.
										This is the source of the summary used by the two options below.
									</FormDescription>
								</div>
								<FormControl>
									<Switch checked={field.value} onCheckedChange={field.onChange} />
								</FormControl>
							</FormItem>
						)}
					/>

					{/* Destination 1: a single structured contact field (overwritten each call). */}
					<FormField
						control={form.control}
						name="postCall.summaryField"
						render={({ field }) => (
							<FormItem className={summarize ? "" : "opacity-50"}>
								<FormLabel>Save summary to a field</FormLabel>
								<FormControl>
									<ContactWriteFieldCombobox
										agentId={agentId}
										value={field.value ?? null}
										onChange={(key) => field.onChange(key)}
										allowEmpty
										emptyLabel="Don't save"
										allowCustomKey
										placeholder="Don't save"
										disabled={!summarize}
									/>
								</FormControl>
								<FormDescription>
									Write the latest summary into one CRM contact field (e.g. a “Call Summary” field).
									Overwrites that field every call — good for automations that read a single value.
									Needs Summarize on.
								</FormDescription>
							</FormItem>
						)}
					/>

					{/* Destination 2: an append-only timeline note (history entry). */}
					<FormField
						control={form.control}
						name="postCall.writeNote"
						render={({ field }) => (
							<FormItem className="p-3 flex items-center justify-between rounded-lg border">
								<div className="pr-3">
									<FormLabel>Add a call note to the contact</FormLabel>
									<FormDescription>
										Post a timeline note on the contact after each call — the summary plus any
										values captured during the call (name, email, etc.), duration and call ID.
										Append-only history, one per call. Posts whenever there’s a summary or captured
										values.
									</FormDescription>
								</div>
								<FormControl>
									<Switch checked={field.value} onCheckedChange={field.onChange} />
								</FormControl>
							</FormItem>
						)}
					/>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Word rules</CardTitle>
				</CardHeader>
				<CardContent className="gap-4 flex flex-col">
					<ProhibitedWordsField form={form} />
				</CardContent>
			</Card>
		</div>
	);
}
