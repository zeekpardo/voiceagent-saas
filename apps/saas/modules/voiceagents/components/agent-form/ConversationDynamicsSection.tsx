"use client";

import type { AgentFormValues } from "../../lib/agent-form-mapping";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import {
	FormControl,
	FormDescription,
	FormField,
	FormItem,
	FormLabel,
} from "@repo/ui/components/form";
import { Input } from "@repo/ui/components/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@repo/ui/components/select";
import { Switch } from "@repo/ui/components/switch";
import type { UseFormReturn } from "react-hook-form";

/** "Conversation dynamics" card: turn-taking, timeouts, and AI-disclosure compliance. */
export function ConversationDynamicsSection({ form }: { form: UseFormReturn<AgentFormValues> }) {
	return (
		<Card>
			<CardHeader>
				<CardTitle>Conversation dynamics</CardTitle>
			</CardHeader>
			<CardContent className="grid gap-4 @xl:grid-cols-2">
				<FormField
					control={form.control}
					name="turnDetection.preemptiveGeneration"
					render={({ field }) => (
						<FormItem className="flex items-center justify-between rounded-lg border p-3">
							<div>
								<FormLabel>Preemptive replies</FormLabel>
								<FormDescription>Start thinking before the caller finishes</FormDescription>
							</div>
							<FormControl>
								<Switch checked={field.value} onCheckedChange={field.onChange} />
							</FormControl>
						</FormItem>
					)}
				/>
				<FormField
					control={form.control}
					name="turnDetection.allowInterruptions"
					render={({ field }) => (
						<FormItem className="flex items-center justify-between rounded-lg border p-3">
							<div>
								<FormLabel>Allow interruptions</FormLabel>
								<FormDescription>Caller can talk over the agent</FormDescription>
							</div>
							<FormControl>
								<Switch checked={field.value} onCheckedChange={field.onChange} />
							</FormControl>
						</FormItem>
					)}
				/>
				<FormField
					control={form.control}
					name="turnDetection.endpointingMs"
					render={({ field }) => (
						<FormItem>
							<FormLabel>Endpointing delay (ms)</FormLabel>
							<FormDescription>Lower = snappier, higher = fewer cut-offs</FormDescription>
							<FormControl>
								<Input
									type="number"
									step={50}
									{...field}
									onChange={(e) => field.onChange(Number(e.target.value))}
								/>
							</FormControl>
						</FormItem>
					)}
				/>
				<FormField
					control={form.control}
					name="timeouts.maxCallSeconds"
					render={({ field }) => (
						<FormItem>
							<FormLabel>Max call length (seconds)</FormLabel>
							<FormControl>
								<Input
									type="number"
									{...field}
									onChange={(e) => field.onChange(Number(e.target.value))}
								/>
							</FormControl>
						</FormItem>
					)}
				/>
				<FormField
					control={form.control}
					name="timeouts.silenceHangupSeconds"
					render={({ field }) => (
						<FormItem>
							<FormLabel>Silence hang-up (seconds)</FormLabel>
							<FormDescription>End the call after this much dead air</FormDescription>
							<FormControl>
								<Input
									type="number"
									{...field}
									onChange={(e) => field.onChange(Number(e.target.value))}
								/>
							</FormControl>
						</FormItem>
					)}
				/>
				<FormField
					control={form.control}
					name="turnDetection.mode"
					render={({ field }) => (
						<FormItem>
							<FormLabel>Turn detection</FormLabel>
							<FormDescription>How the agent decides the caller is done</FormDescription>
							<Select onValueChange={field.onChange} value={field.value}>
								<FormControl>
									<SelectTrigger>
										<SelectValue />
									</SelectTrigger>
								</FormControl>
								<SelectContent>
									<SelectItem value="semantic">
										Semantic — AI end-of-turn model (recommended)
									</SelectItem>
									<SelectItem value="vad">Voice activity — silence-based</SelectItem>
								</SelectContent>
							</Select>
						</FormItem>
					)}
				/>
				<FormField
					control={form.control}
					name="compliance.aiDisclosure"
					render={({ field }) => (
						<FormItem className="flex items-center justify-between rounded-lg border p-3 @xl:col-span-2">
							<div>
								<FormLabel>AI disclosure</FormLabel>
								<FormDescription>
									Engine-enforced: the agent identifies itself as an AI at the start
								</FormDescription>
							</div>
							<FormControl>
								<Switch checked={field.value} onCheckedChange={field.onChange} />
							</FormControl>
						</FormItem>
					)}
				/>
				{form.watch("compliance.aiDisclosure") && (
					<FormField
						control={form.control}
						name="compliance.disclosureText"
						render={({ field }) => (
							<FormItem className="@xl:col-span-2">
								<FormLabel>Disclosure wording (optional)</FormLabel>
								<FormControl>
									<Input
										placeholder="Just so you know, you're speaking with an A.I. assistant."
										{...field}
									/>
								</FormControl>
							</FormItem>
						)}
					/>
				)}
			</CardContent>
		</Card>
	);
}
