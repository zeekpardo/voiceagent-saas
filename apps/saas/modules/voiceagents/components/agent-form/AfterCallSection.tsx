"use client";

import type { AgentFormValues } from "../../lib/agent-form-mapping";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import {
	FormControl,
	FormDescription,
	FormField,
	FormItem,
	FormLabel,
} from "@repo/ui/components/form";
import { Input } from "@repo/ui/components/input";
import { Switch } from "@repo/ui/components/switch";
import { PlusIcon, Trash2Icon } from "lucide-react";
import type { UseFieldArrayReturn, UseFormReturn } from "react-hook-form";

/** "After the call" card: call summarization toggle and structured extract fields. */
export function AfterCallSection({
	form,
	extractFields,
}: {
	form: UseFormReturn<AgentFormValues>;
	extractFields: UseFieldArrayReturn<AgentFormValues, "postCall.extract">;
}) {
	return (
		<Card>
			<CardHeader>
				<CardTitle>After the call</CardTitle>
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				<FormField
					control={form.control}
					name="postCall.summarize"
					render={({ field }) => (
						<FormItem className="flex items-center justify-between rounded-lg border p-3">
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
				<div>
					<FormLabel>Extracted fields</FormLabel>
					<FormDescription className="mb-3">
						Structured outcomes pulled from every call — delivered in the call.completed
						webhook (e.g. appointment_scheduled: "true/false/unknown").
					</FormDescription>
					<div className="flex flex-col gap-2">
						{extractFields.fields.map((f, i) => (
							<div key={f.id} className="flex gap-2">
								<Input
									placeholder="field_name"
									className="max-w-56 font-mono text-sm"
									{...form.register(`postCall.extract.${i}.field`)}
								/>
								<Input
									placeholder="Extraction instructions, e.g. true/false — did they book?"
									{...form.register(`postCall.extract.${i}.instructions`)}
								/>
								<Button
									type="button"
									variant="ghost"
									size="icon"
									onClick={() => extractFields.remove(i)}
								>
									<Trash2Icon className="size-4" />
								</Button>
							</div>
						))}
						<Button
							type="button"
							variant="outline"
							size="sm"
							className="self-start"
							onClick={() => extractFields.append({ field: "", instructions: "" })}
						>
							<PlusIcon className="size-4" /> Add field
						</Button>
					</div>
				</div>
			</CardContent>
		</Card>
	);
}
