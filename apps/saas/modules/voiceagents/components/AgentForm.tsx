"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
	type AgentConfigInput,
	agentConfigInput,
	type GatewayAgent,
} from "@repo/api/modules/voiceagents/lib/schema";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import {
	Form,
	FormControl,
	FormDescription,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@repo/ui/components/form";
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
import { Switch } from "@repo/ui/components/switch";
import { toastError, toastSuccess } from "@repo/ui/components/toast";
import { PlusIcon, Trash2Icon, XIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";

import { useCreateAgentMutation, useUpdateAgentMutation } from "../lib/api";
import { textToTiptapDoc, tiptapToText } from "./flow/compile";
import { buildVariableItems, createFlowMentionExtension } from "./flow/mentions";
import { SectionEditor } from "./flow/SectionEditor";

/** Which TTS providers accept a speaking-speed option through LiveKit Inference. */
const PROVIDER_SUPPORTS_SPEED: Record<string, boolean> = {
	xai: false,
	deepgram: false,
	cartesia: true,
	elevenlabs: true,
	rime: true,
	inworld: true,
};

const TTS_PROVIDERS = [
	{ id: "xai", label: "xAI" },
	{ id: "cartesia", label: "Cartesia" },
	{ id: "elevenlabs", label: "ElevenLabs" },
	{ id: "deepgram", label: "Deepgram" },
	{ id: "rime", label: "Rime" },
	{ id: "inworld", label: "Inworld" },
];

interface VoiceOption {
	id: string;
	label: string;
	provider: string;
}

const CUSTOM_VOICE = "__custom__";

export const VOICE_GROUPS: { provider: string; label: string; voices: VoiceOption[] }[] = [
	{
		provider: "xai",
		label: "xAI",
		voices: [
			{ id: "ara", label: "Ara — warm, friendly (f)", provider: "xai" },
			{ id: "eve", label: "Eve — energetic, upbeat (f)", provider: "xai" },
			{ id: "leo", label: "Leo — authoritative, strong (m)", provider: "xai" },
			{ id: "rex", label: "Rex — confident, clear (m)", provider: "xai" },
			{ id: "sal", label: "Sal — neutral (m)", provider: "xai" },
		],
	},
	{
		provider: "cartesia",
		label: "Cartesia (Sonic 3)",
		voices: [
			{
				id: "9626c31c-bec5-4cca-baa8-f8ba9e84c8bc",
				label: "Nova — natural (f)",
				provider: "cartesia",
			},
		],
	},
	{
		provider: "elevenlabs",
		label: "ElevenLabs",
		voices: [
			{ id: "21m00Tcm4TlvDq8ikWAM", label: "Rachel — calm, clear (f)", provider: "elevenlabs" },
			{ id: "pNInz6obpgDQGcFmaJgB", label: "Adam — deep, confident (m)", provider: "elevenlabs" },
			{ id: "ErXwobaYiN019PkySvjV", label: "Antoni — warm (m)", provider: "elevenlabs" },
			{ id: "EXAVITQu4vr4xnSDxMaL", label: "Sarah — soft, friendly (f)", provider: "elevenlabs" },
		],
	},
	{
		provider: "deepgram",
		label: "Deepgram (Aura 2)",
		voices: [
			{ id: "aura-2-thalia-en", label: "Thalia — clear, confident (f)", provider: "deepgram" },
			{ id: "aura-2-apollo-en", label: "Apollo — casual, comfortable (m)", provider: "deepgram" },
		],
	},
];

const ALL_VOICES: VoiceOption[] = VOICE_GROUPS.flatMap((g) => g.voices);

const LANGUAGES = [
	{ id: "en", label: "English" },
	{ id: "es", label: "Español" },
	{ id: "fr", label: "Français" },
	{ id: "de", label: "Deutsch" },
	{ id: "pt", label: "Português" },
	{ id: "hi", label: "हिन्दी" },
	{ id: "ja", label: "日本語" },
	{ id: "zh", label: "中文" },
];

export const MODEL_GROUPS: { label: string; models: { id: string; label: string }[] }[] = [
	{
		label: "xAI",
		models: [
			{ id: "grok-4-fast", label: "Grok 4 Fast (recommended for voice)" },
			{ id: "grok-4-1-fast-reasoning", label: "Grok 4.1 Fast — reasoning (slower)" },
		],
	},
	{
		label: "OpenAI",
		models: [
			{ id: "openai/gpt-4o-mini", label: "GPT-4o mini — fast, cheap workhorse" },
			{ id: "openai/gpt-4.1-mini", label: "GPT-4.1 mini" },
			{ id: "openai/gpt-4o", label: "GPT-4o" },
			{ id: "openai/gpt-4.1", label: "GPT-4.1" },
			{ id: "openai/gpt-5-mini", label: "GPT-5 mini" },
			{ id: "openai/gpt-5", label: "GPT-5 — smartest, slower" },
		],
	},
	{
		label: "Google",
		models: [
			{ id: "google/gemini-2.5-flash-lite", label: "Gemini 2.5 Flash Lite — fastest" },
			{ id: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash" },
			{ id: "google/gemini-3-flash", label: "Gemini 3 Flash" },
			{ id: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro" },
			{ id: "google/gemini-3.1-pro", label: "Gemini 3.1 Pro" },
		],
	},
	{
		label: "Others",
		models: [
			{ id: "deepseek-ai/deepseek-v3.2", label: "DeepSeek V3.2 — cost play" },
			{ id: "moonshotai/kimi-k2.6", label: "Kimi K2.6" },
			{ id: "zai/glm-5.1", label: "GLM 5.1" },
		],
	},
];

const STT_GROUPS: { label: string; models: { id: string; label: string }[] }[] = [
	{
		label: "xAI",
		models: [{ id: "default", label: "xAI STT (engine default)" }],
	},
	{
		label: "Deepgram",
		models: [
			{ id: "deepgram/nova-3", label: "Nova 3 — community standard, multilingual" },
			{ id: "deepgram/nova-3-medical", label: "Nova 3 Medical" },
			{ id: "deepgram/nova-2-phonecall", label: "Nova 2 Phonecall — tuned for telephony" },
		],
	},
	{
		label: "AssemblyAI",
		models: [
			{ id: "assemblyai/universal-streaming", label: "Universal Streaming" },
			{
				id: "assemblyai/universal-streaming-multilingual",
				label: "Universal Streaming — multilingual",
			},
		],
	},
	{
		label: "Others",
		models: [
			{ id: "cartesia/ink-whisper", label: "Cartesia Ink Whisper" },
			{ id: "elevenlabs/scribe_v2_realtime", label: "ElevenLabs Scribe v2" },
		],
	},
];

interface ChipsInputProps {
	value: string[];
	onChange: (next: string[]) => void;
	placeholder?: string;
}

/** Chips input: Enter/comma adds a pill, Backspace on empty input removes the last one. */
function ChipsInput({ value, onChange, placeholder }: ChipsInputProps) {
	const [draft, setDraft] = useState("");

	function addChip(raw: string) {
		const word = raw.trim();
		if (word && !value.includes(word)) {
			onChange([...value, word]);
		}
		setDraft("");
	}

	return (
		<div className="flex flex-col gap-2">
			<Input
				value={draft}
				placeholder={placeholder}
				onChange={(e) => setDraft(e.target.value)}
				onKeyDown={(e) => {
					if (e.key === "Enter" || e.key === ",") {
						e.preventDefault();
						addChip(draft);
					} else if (e.key === "Backspace" && draft === "" && value.length > 0) {
						onChange(value.slice(0, -1));
					}
				}}
				onBlur={() => {
					if (draft.trim()) addChip(draft);
				}}
			/>
			{value.length > 0 && (
				<div className="flex flex-wrap gap-1.5">
					{value.map((word) => (
						<span
							key={word}
							className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-primary text-xs"
						>
							{word}
							<button
								type="button"
								aria-label={`Remove ${word}`}
								className="hover:opacity-70"
								onClick={() => onChange(value.filter((w) => w !== word))}
							>
								<XIcon className="size-3" />
							</button>
						</span>
					))}
				</div>
			)}
		</div>
	);
}

/**
 * Instructions with @-variable chips (CloseBot-style): the same TipTap
 * mention editor the flow nodes use, hydrated from the stored plain-text
 * prompt and serialized back to it — chips are just {{variable}} in the
 * saved config, so the engine contract is unchanged.
 */
function InstructionsEditor({
	value,
	onChange,
}: {
	value: string;
	onChange: (next: string) => void;
}) {
	// Hydrate once — the editor owns the text after mount.
	const [initialBody] = useState<unknown>(() => textToTiptapDoc(value));
	// Latest text via ref so the suggestion list can include {{vars}} the
	// prompt already references without recreating the extension.
	const valueRef = useRef(value);
	valueRef.current = value;
	const mentionExtension = useMemo(
		() =>
			createFlowMentionExtension({
				getVariables: () => {
					const referenced = [...valueRef.current.matchAll(/\{\{\s*([\w.-]+)\s*\}\}/g)].map(
						(m) => m[1]!,
					);
					return buildVariableItems(referenced);
				},
				getTools: () => [],
				getExits: () => [],
			}),
		[],
	);
	return (
		<SectionEditor
			initialBody={initialBody}
			mentionExtension={mentionExtension}
			onBodyChange={(doc) => onChange(tiptapToText(doc))}
			hint="Type @ to insert a variable — location and contact details fill in per call"
			editorClassName="min-h-44"
		/>
	);
}

/** Map a stored gateway config document back onto the form's shape. */
function toFormValues(agent?: GatewayAgent): AgentConfigInput {
	const c = (agent?.config ?? {}) as Record<string, any>;
	// Blank name/instructions fail min(1) on the CREATE page — parse with
	// placeholders so zod still applies every default, then blank the two
	// fields (validation runs on submit via the zodResolver).
	const values = agentConfigInput.parse({
		name: c.name || "placeholder",
		description: c.description ?? "",
		instructions: c.instructions || "placeholder",
		prohibitedWords: Array.isArray(c.prohibitedWords) ? c.prohibitedWords.map(String) : [],
		greeting: c.greeting ?? "",
		language: c.language ?? "en",
		llm: c.llm,
		tts: c.tts ? { provider: c.tts.provider, voice: c.tts.voice, speed: c.tts.speed } : undefined,
		stt: c.stt?.model ? { model: c.stt.model } : undefined,
		turnDetection: c.turnDetection,
		timeouts: c.timeouts
			? {
					maxCallSeconds: c.timeouts.maxCallSeconds,
					silenceHangupSeconds: c.timeouts.silenceHangupSeconds,
				}
			: undefined,
		compliance: c.compliance
			? { aiDisclosure: c.compliance.aiDisclosure, disclosureText: c.compliance.disclosureText }
			: undefined,
		postCall: {
			summarize: c.postCall?.summarize ?? true,
			extract: Object.entries(c.postCall?.extract ?? {}).map(([field, instructions]) => ({
				field,
				instructions: String(instructions),
			})),
		},
	});
	if (!agent) {
		values.name = "";
		values.instructions = "";
	}
	return values;
}

interface AgentFormProps {
	agent?: GatewayAgent;
	/**
	 * Which slice of the form to render. The form always hydrates and submits
	 * the FULL config regardless of variant, so saving one slice never loses
	 * the other's fields.
	 * - "job": only Instructions, Greeting and Prohibited words.
	 * - "settings": everything except those three fields.
	 * - undefined: the whole form (e.g. the create page).
	 */
	variant?: "job" | "settings";
}

export function AgentForm({ agent, variant }: AgentFormProps) {
	const router = useRouter();
	const createMutation = useCreateAgentMutation();
	const updateMutation = useUpdateAgentMutation(agent?.id ?? "");

	const form = useForm({
		resolver: zodResolver(agentConfigInput),
		defaultValues: toFormValues(agent),
	});
	const extractFields = useFieldArray({ control: form.control, name: "postCall.extract" });

	const onSubmit = form.handleSubmit(async (values) => {
		try {
			if (agent) {
				await updateMutation.mutateAsync(values);
				toastSuccess(`Saved — now v${agent.version + 1}`);
			} else {
				const created = await createMutation.mutateAsync(values);
				toastSuccess("Agent created");
				router.push(`/voice-agents/${created.id}`);
			}
		} catch (err) {
			toastError(err instanceof Error ? err.message : "Something went wrong");
		}
	});

	// Prompt-content fields shared between the default (full) form and the
	// "job" variant. Defined once so both layouts render the same fields.
	const instructionsField = (
		<FormField
			control={form.control}
			name="instructions"
			render={({ field }) => (
				<FormItem>
					<FormLabel>Instructions</FormLabel>
					<FormDescription>
						The agent's identity, business information, style, and hard rules. For flow
						agents this is the Job Information — every node inherits it, so write it once
						here and keep node prompts focused on their stage.
					</FormDescription>
					<FormControl>
						<InstructionsEditor value={field.value} onChange={field.onChange} />
					</FormControl>
					<FormMessage />
				</FormItem>
			)}
		/>
	);
	const prohibitedWordsField = (
		<FormField
			control={form.control}
			name="prohibitedWords"
			render={({ field }) => (
				<FormItem>
					<FormLabel>Prohibited words</FormLabel>
					<FormDescription>
						The agent will never use these words or phrases, in any form.
					</FormDescription>
					<FormControl>
						<ChipsInput
							value={field.value ?? []}
							onChange={field.onChange}
							placeholder="Type a word or phrase and press Enter"
						/>
					</FormControl>
					<FormMessage />
				</FormItem>
			)}
		/>
	);
	const greetingField = (
		<FormField
			control={form.control}
			name="greeting"
			render={({ field }) => (
				<FormItem>
					<FormLabel>Greeting</FormLabel>
					<FormDescription>
						Spoken first when the conversation starts. Leave empty to let the caller speak
						first.
					</FormDescription>
					<FormControl>
						<Input placeholder="Hi {{caller_name}}! How can I help today?" {...field} />
					</FormControl>
				</FormItem>
			)}
		/>
	);

	if (variant === "job") {
		return (
			<Form {...form}>
				<form onSubmit={onSubmit} className="flex flex-col gap-6">
					<Card>
						<CardHeader>
							<CardTitle>Job information</CardTitle>
						</CardHeader>
						<CardContent className="flex flex-col gap-4">
							{instructionsField}
							{greetingField}
							{prohibitedWordsField}
						</CardContent>
					</Card>

					<div className="flex justify-end gap-3">
						<Button
							type="submit"
							loading={createMutation.isPending || updateMutation.isPending}
						>
							{agent ? "Save changes" : "Create agent"}
						</Button>
					</div>
				</form>
			</Form>
		);
	}

	return (
		<Form {...form}>
			{/* @container: grids below split into two columns only when the FORM
			    itself is wide enough — one column in the 440px builder aside, two
			    on the full-width create page. */}
			<form onSubmit={onSubmit} className="@container flex flex-col gap-6">
				<Card>
					<CardHeader>
						<CardTitle>Identity & persona</CardTitle>
					</CardHeader>
					<CardContent className="flex flex-col gap-4">
						<div className="grid gap-4 @xl:grid-cols-2">
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
								{instructionsField}
								{prohibitedWordsField}
								{greetingField}
							</>
						)}
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>Voice & model</CardTitle>
					</CardHeader>
					<CardContent className="grid gap-4 @xl:grid-cols-2">
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
											<div className="mt-2 grid grid-cols-2 gap-2">
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
								const sttAutoDetects = !sttModel || sttModel === "default" || sttModel.startsWith("xai");
								return (
									<FormItem>
										<FormLabel className={sttAutoDetects ? "opacity-50" : ""}>Language</FormLabel>
										<FormDescription>
											{sttAutoDetects
												? "xAI STT auto-detects the spoken language, including mid-call switches"
												: "Pins speech recognition to this language"}
										</FormDescription>
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
										<FormLabel className={supportsSpeed ? "" : "opacity-50"}>
											Speaking speed ({field.value}×)
										</FormLabel>
										<FormDescription>
											{supportsSpeed
												? "0.7× slower — 1.5× faster"
												: `${providerLabel} voices don't support speed — Cartesia, ElevenLabs, Rime & Inworld do`}
										</FormDescription>
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
									<FormLabel>Max reply tokens</FormLabel>
									<FormDescription>Lower keeps spoken turns short</FormDescription>
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

				<div className="flex justify-end gap-3">
					<Button
						type="submit"
						loading={createMutation.isPending || updateMutation.isPending}
					>
						{agent ? "Save changes" : "Create agent"}
					</Button>
				</div>
			</form>
		</Form>
	);
}
