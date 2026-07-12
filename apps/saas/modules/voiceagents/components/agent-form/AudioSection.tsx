"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import {
	FormControl,
	FormDescription,
	FormField,
	FormItem,
	FormLabel,
} from "@repo/ui/components/form";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@repo/ui/components/select";
import { Slider } from "@repo/ui/components/slider";
import { Switch } from "@repo/ui/components/switch";
import { InfoHint } from "@voiceagents/components/shared/InfoHint";
import type { UseFormReturn } from "react-hook-form";

import type { AgentFormValues } from "../../lib/agent-form-mapping";

/** Background-audio clip options — shared by the thinking-sound and ambient
 *  pickers. Values match the engine's audio clip enum exactly. */
const CLIP_OPTIONS = [
	{ value: "keyboard_typing", label: "Keyboard typing" },
	{ value: "keyboard_typing2", label: "Keyboard typing (variant)" },
	{ value: "office_ambience", label: "Office ambience" },
	{ value: "hold_music", label: "Hold music" },
] as const;

/** "Background audio" card: thinking sound, ambient background bed, and
 *  incoming-audio noise cancellation for the on-call soundscape. */
export function AudioSection({ form }: { form: UseFormReturn<AgentFormValues> }) {
	return (
		<Card>
			<CardHeader>
				<CardTitle>Background audio</CardTitle>
				<FormDescription>Ambient sound the caller hears during the call.</FormDescription>
			</CardHeader>
			<CardContent className="gap-4 @xl:grid-cols-2 grid">
				<FormField
					control={form.control}
					name="audio.thinkingSound"
					render={({ field }) => (
						<FormItem className="p-3 @xl:col-span-2 flex items-center justify-between rounded-lg border">
							<div>
								<FormLabel className="gap-1.5 flex items-center">
									Thinking sound
									<InfoHint>
										Subtle sound played while the agent is preparing a reply, so slow turns aren't
										dead air.
									</InfoHint>
								</FormLabel>
							</div>
							<FormControl>
								<Switch checked={field.value} onCheckedChange={field.onChange} />
							</FormControl>
						</FormItem>
					)}
				/>
				{form.watch("audio.thinkingSound") && (
					<>
						<FormField
							control={form.control}
							name="audio.thinkingSoundClip"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Clip</FormLabel>
									<Select onValueChange={field.onChange} value={field.value}>
										<FormControl>
											<SelectTrigger>
												<SelectValue />
											</SelectTrigger>
										</FormControl>
										<SelectContent>
											{CLIP_OPTIONS.map((c) => (
												<SelectItem key={c.value} value={c.value}>
													{c.label}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</FormItem>
							)}
						/>
						<FormField
							control={form.control}
							name="audio.thinkingSoundVolume"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Volume ({Math.round((field.value ?? 0) * 100)}%)</FormLabel>
									<FormControl>
										<Slider
											min={0}
											max={1}
											step={0.05}
											value={[field.value ?? 0]}
											onValueChange={(v) => field.onChange(v[0])}
										/>
									</FormControl>
								</FormItem>
							)}
						/>
					</>
				)}
				<FormField
					control={form.control}
					name="audio.ambientSound.enabled"
					render={({ field }) => (
						<FormItem className="p-3 @xl:col-span-2 flex items-center justify-between rounded-lg border">
							<div>
								<FormLabel className="gap-1.5 flex items-center">
									Ambient background
									<InfoHint>
										A continuous background bed (e.g. office ambience) played for the whole call.
									</InfoHint>
								</FormLabel>
							</div>
							<FormControl>
								<Switch checked={field.value} onCheckedChange={field.onChange} />
							</FormControl>
						</FormItem>
					)}
				/>
				{form.watch("audio.ambientSound.enabled") && (
					<>
						<FormField
							control={form.control}
							name="audio.ambientSound.clip"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Clip</FormLabel>
									<Select onValueChange={field.onChange} value={field.value}>
										<FormControl>
											<SelectTrigger>
												<SelectValue />
											</SelectTrigger>
										</FormControl>
										<SelectContent>
											{CLIP_OPTIONS.map((c) => (
												<SelectItem key={c.value} value={c.value}>
													{c.label}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</FormItem>
							)}
						/>
						<FormField
							control={form.control}
							name="audio.ambientSound.volume"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Volume ({Math.round((field.value ?? 0) * 100)}%)</FormLabel>
									<FormControl>
										<Slider
											min={0}
											max={1}
											step={0.05}
											value={[field.value ?? 0]}
											onValueChange={(v) => field.onChange(v[0])}
										/>
									</FormControl>
								</FormItem>
							)}
						/>
					</>
				)}
				<FormField
					control={form.control}
					name="audio.noiseCancellation"
					render={({ field }) => (
						<FormItem className="p-3 @xl:col-span-2 flex items-center justify-between rounded-lg border">
							<div>
								<FormLabel className="gap-1.5 flex items-center">
									Noise cancellation
									<InfoHint>Filter background noise on the caller's incoming audio.</InfoHint>
								</FormLabel>
							</div>
							<FormControl>
								<Switch checked={field.value} onCheckedChange={field.onChange} />
							</FormControl>
						</FormItem>
					)}
				/>
			</CardContent>
		</Card>
	);
}
