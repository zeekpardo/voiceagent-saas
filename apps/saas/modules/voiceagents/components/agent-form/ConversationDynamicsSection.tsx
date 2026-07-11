"use client";

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
import { InfoHint } from "@voiceagents/components/shared/InfoHint";
import type { UseFormReturn } from "react-hook-form";

import type { AgentFormValues } from "../../lib/agent-form-mapping";
import { GreetingField } from "./shared-fields";

/** "Conversation dynamics" card: greeting, turn-taking, timeouts, and
 *  AI-disclosure compliance. The greeting lives here for single (non-flow)
 *  agents; flow agents set it on the Greeter node instead. */
export function ConversationDynamicsSection({ form }: { form: UseFormReturn<AgentFormValues> }) {
	return (
		<Card>
			<CardHeader>
				<CardTitle>Conversation dynamics</CardTitle>
			</CardHeader>
			<CardContent className="gap-4 @xl:grid-cols-2 grid">
				<div className="@xl:col-span-2">
					<GreetingField form={form} />
				</div>
				<FormField
					control={form.control}
					name="turnDetection.preemptiveGeneration"
					render={({ field }) => (
						<FormItem className="p-3 flex items-center justify-between rounded-lg border">
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
						<FormItem className="p-3 flex items-center justify-between rounded-lg border">
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
							<FormLabel className="gap-1.5 flex items-center">
								Endpointing delay (ms)
								<InfoHint>
									How long to wait after the caller stops before replying. Lower = snappier, higher
									= fewer cut-offs.
								</InfoHint>
							</FormLabel>
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
							<FormLabel className="gap-1.5 flex items-center">
								Silence hang-up (seconds)
								<InfoHint>Ends the call after this much dead air from the caller.</InfoHint>
							</FormLabel>
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
							<FormLabel className="gap-1.5 flex items-center">
								Turn detection
								<InfoHint>How the agent decides the caller has finished speaking.</InfoHint>
							</FormLabel>
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
						<FormItem className="p-3 @xl:col-span-2 flex items-center justify-between rounded-lg border">
							<div>
								<FormLabel className="gap-1.5 flex items-center">
									AI disclosure
									<InfoHint>
										Engine-enforced: the agent identifies itself as an AI at the start of the call.
									</InfoHint>
								</FormLabel>
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
