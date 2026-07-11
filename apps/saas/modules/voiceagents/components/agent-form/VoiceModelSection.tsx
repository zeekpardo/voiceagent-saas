"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import { FormControl, FormField, FormItem, FormLabel } from "@repo/ui/components/form";
import { Input } from "@repo/ui/components/input";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectLabel,
	SelectTrigger,
	SelectValue,
} from "@repo/ui/components/select";
import { InfoHint } from "@voiceagents/components/shared/InfoHint";
import type { UseFormReturn } from "react-hook-form";

import type { AgentFormValues } from "../../lib/agent-form-mapping";
import {
	ALL_VOICES,
	CUSTOM_VOICE,
	LANGUAGES,
	MODEL_GROUPS,
	PROVIDER_SUPPORTS_SPEED,
	STT_GROUPS,
	TTS_PROVIDERS,
	VOICE_GROUPS,
} from "../../lib/voice-catalog";

/** "Voice & model" card: TTS voice/provider, language, LLM model, STT model, and their knobs. */
export function VoiceModelSection({ form }: { form: UseFormReturn<AgentFormValues> }) {
	return (
		<Card>
			<CardHeader>
				<CardTitle>Voice & model</CardTitle>
			</CardHeader>
			<CardContent className="gap-4 @xl:grid-cols-2 grid">
				<FormField
					control={form.control}
					name="tts.voice"
					render={({ field }) => {
						const isKnown = ALL_VOICES.some((v) => v.id === field.value);
						return (
							<FormItem>
								<FormLabel>Voice</FormLabel>
								<Select
									onValueChange={(v) => {
										if (v === CUSTOM_VOICE) {
											field.onChange("");
											return;
										}
										field.onChange(v);
										const voice = ALL_VOICES.find((x) => x.id === v);
										if (voice) form.setValue("tts.provider", voice.provider);
									}}
									value={isKnown ? field.value : CUSTOM_VOICE}
								>
									<FormControl>
										<SelectTrigger>
											<SelectValue />
										</SelectTrigger>
									</FormControl>
									<SelectContent>
										{VOICE_GROUPS.map((group) => (
											<SelectGroup key={group.provider}>
												<SelectLabel>{group.label}</SelectLabel>
												{group.voices.map((v) => (
													<SelectItem key={v.id} value={v.id}>
														{v.label}
													</SelectItem>
												))}
											</SelectGroup>
										))}
										<SelectGroup>
											<SelectLabel>Bring your own</SelectLabel>
											<SelectItem value={CUSTOM_VOICE}>
												Custom voice ID… (any provider, incl. cloned voices)
											</SelectItem>
										</SelectGroup>
									</SelectContent>
								</Select>
								{!isKnown && (
									<div className="mt-2 gap-2 grid grid-cols-2">
										<FormField
											control={form.control}
											name="tts.provider"
											render={({ field: providerField }) => (
												<Select onValueChange={providerField.onChange} value={providerField.value}>
													<SelectTrigger>
														<SelectValue placeholder="Provider" />
													</SelectTrigger>
													<SelectContent>
														{TTS_PROVIDERS.map((p) => (
															<SelectItem key={p.id} value={p.id}>
																{p.label}
															</SelectItem>
														))}
													</SelectContent>
												</Select>
											)}
										/>
										<Input
											placeholder="voice id from the provider"
											className="font-mono text-xs"
											value={field.value}
											onChange={(e) => field.onChange(e.target.value)}
										/>
									</div>
								)}
							</FormItem>
						);
					}}
				/>
				<FormField
					control={form.control}
					name="language"
					render={({ field }) => {
						// Language only pins the ears: xAI STT auto-detects (and
						// code-switches) languages, so the picker is meaningless there.
						const sttModel = form.watch("stt.model");
						const sttAutoDetects =
							!sttModel || sttModel === "default" || sttModel.startsWith("xai");
						return (
							<FormItem>
								<FormLabel
									className={`gap-1.5 flex items-center ${sttAutoDetects ? "opacity-50" : ""}`}
								>
									Language
									<InfoHint>
										{sttAutoDetects
											? "xAI STT auto-detects the spoken language, including mid-call switches."
											: "Pins speech recognition to this language."}
									</InfoHint>
								</FormLabel>
								<Select onValueChange={field.onChange} value={field.value}>
									<FormControl>
										<SelectTrigger disabled={sttAutoDetects}>
											<SelectValue placeholder={sttAutoDetects ? "Auto-detect" : undefined} />
										</SelectTrigger>
									</FormControl>
									<SelectContent>
										{LANGUAGES.map((l) => (
											<SelectItem key={l.id} value={l.id}>
												{l.label}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</FormItem>
						);
					}}
				/>
				<FormField
					control={form.control}
					name="llm.model"
					render={({ field }) => (
						<FormItem>
							<FormLabel>Model (the agent's brain)</FormLabel>
							<Select onValueChange={field.onChange} value={field.value}>
								<FormControl>
									<SelectTrigger>
										<SelectValue />
									</SelectTrigger>
								</FormControl>
								<SelectContent>
									{MODEL_GROUPS.map((group) => (
										<SelectGroup key={group.label}>
											<SelectLabel>{group.label}</SelectLabel>
											{group.models.map((m) => (
												<SelectItem key={m.id} value={m.id}>
													{m.label}
												</SelectItem>
											))}
										</SelectGroup>
									))}
								</SelectContent>
							</Select>
						</FormItem>
					)}
				/>
				<FormField
					control={form.control}
					name="llm.temperature"
					render={({ field }) => (
						<FormItem>
							<FormLabel>Temperature ({field.value})</FormLabel>
							<FormControl>
								<Input
									type="number"
									step={0.1}
									min={0}
									max={2}
									{...field}
									onChange={(e) => field.onChange(Number(e.target.value))}
								/>
							</FormControl>
						</FormItem>
					)}
				/>
				<FormField
					control={form.control}
					name="tts.speed"
					render={({ field }) => {
						const provider = form.watch("tts.provider") ?? "xai";
						const supportsSpeed = PROVIDER_SUPPORTS_SPEED[provider] ?? false;
						const providerLabel = TTS_PROVIDERS.find((p) => p.id === provider)?.label ?? provider;
						return (
							<FormItem>
								<FormLabel
									className={`gap-1.5 flex items-center ${supportsSpeed ? "" : "opacity-50"}`}
								>
									Speaking speed ({field.value}×)
									<InfoHint>
										{supportsSpeed
											? "0.7× slower — 1.5× faster."
											: `${providerLabel} voices don't support speed — Cartesia, ElevenLabs, Rime & Inworld do.`}
									</InfoHint>
								</FormLabel>
								<FormControl>
									<Input
										type="number"
										step={0.1}
										min={0.7}
										max={1.5}
										disabled={!supportsSpeed}
										{...field}
										onChange={(e) => field.onChange(Number(e.target.value))}
									/>
								</FormControl>
							</FormItem>
						);
					}}
				/>
				<FormField
					control={form.control}
					name="llm.maxTokens"
					render={({ field }) => (
						<FormItem>
							<FormLabel className="gap-1.5 flex items-center">
								Max reply tokens
								<InfoHint>
									Caps how long a single reply can be. Lower keeps spoken turns short.
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
					name="stt.model"
					render={({ field }) => (
						<FormItem>
							<FormLabel>Speech recognition (the agent's ears)</FormLabel>
							<Select
								onValueChange={(v) => field.onChange(v === "default" ? undefined : v)}
								value={field.value ?? "default"}
							>
								<FormControl>
									<SelectTrigger>
										<SelectValue />
									</SelectTrigger>
								</FormControl>
								<SelectContent>
									{STT_GROUPS.map((group) => (
										<SelectGroup key={group.label}>
											<SelectLabel>{group.label}</SelectLabel>
											{group.models.map((m) => (
												<SelectItem key={m.id} value={m.id}>
													{m.label}
												</SelectItem>
											))}
										</SelectGroup>
									))}
								</SelectContent>
							</Select>
						</FormItem>
					)}
				/>
			</CardContent>
		</Card>
	);
}
