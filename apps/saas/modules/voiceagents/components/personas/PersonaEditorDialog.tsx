"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { cn } from "@repo/ui";
import { Button } from "@repo/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@repo/ui/components/dialog";
import {
	Form,
	FormControl,
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
import { Textarea } from "@repo/ui/components/textarea";
import { toastError, toastSuccess } from "@repo/ui/components/toast";
import { InfoHint } from "@voiceagents/components/shared/InfoHint";
import { CheckIcon, XIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import {
	type Persona,
	useCreatePersonaMutation,
	useUpdatePersonaMutation,
} from "../../lib/personas-api";
import { ALL_VOICES, CUSTOM_VOICE, MODEL_GROUPS, VOICE_GROUPS } from "../../lib/voice-catalog";
import {
	DEFAULT_PERSONA_THEME_COLOR,
	GUARDRAILS_MAX,
	GUARDRAILS_PLACEHOLDER,
	HOW_TO_RESPOND_MAX,
	HOW_TO_RESPOND_PLACEHOLDER,
	MAX_PERSONA_STYLES,
	NO_PREFERENCE_VALUE,
	PERSONA_STYLE_SUGGESTIONS,
	PERSONA_THEME_COLORS,
} from "./persona-constants";
import { PersonaAvatar } from "./PersonaAvatar";

const personaFormSchema = z.object({
	name: z.string().min(1, "Name is required").max(80),
	internalDescription: z.string().max(280).optional(),
	avatarUrl: z.string().url("Enter a valid image URL").or(z.literal("")).optional(),
	themeColor: z.string(),
	styles: z.array(z.string()).max(MAX_PERSONA_STYLES),
	howToRespond: z.string().max(HOW_TO_RESPOND_MAX),
	guardrails: z.string().max(GUARDRAILS_MAX).optional(),
	ttsVoice: z.string().optional(),
	llmModel: z.string().optional(),
});

type PersonaFormValues = z.infer<typeof personaFormSchema>;

function toDefaults(persona?: Persona): PersonaFormValues {
	return {
		name: persona?.name ?? "",
		internalDescription: persona?.internalDescription ?? "",
		avatarUrl: persona?.avatarUrl ?? "",
		themeColor: persona?.themeColor ?? DEFAULT_PERSONA_THEME_COLOR,
		styles: persona?.styles ?? [],
		howToRespond: persona?.howToRespond ?? "",
		guardrails: persona?.guardrails ?? "",
		ttsVoice: persona?.ttsVoice ?? "",
		llmModel: persona?.llmModel ?? "",
	};
}

/**
 * Create + edit dialog for a persona. Pass `persona` to edit; omit to create.
 * On save it calls the create/update mutation and closes; `onSaved` receives
 * the persisted persona (used to auto-attach after "New Persona" in the aside).
 */
export function PersonaEditorDialog({
	open,
	onOpenChange,
	persona,
	onSaved,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	persona?: Persona;
	onSaved?: (persona: Persona) => void;
}) {
	const createMutation = useCreatePersonaMutation();
	const updateMutation = useUpdatePersonaMutation();
	const isEditing = !!persona;

	const form = useForm<PersonaFormValues>({
		resolver: zodResolver(personaFormSchema),
		defaultValues: toDefaults(persona),
	});

	// Whether the "Voice" select is in free-entry mode (a voice id outside the
	// known catalog, or the user explicitly picked "Custom voice ID…").
	const [customVoice, setCustomVoice] = useState(false);

	// Re-seed when the target persona changes or the dialog re-opens.
	useEffect(() => {
		if (open) {
			form.reset(toDefaults(persona));
			setCustomVoice(false);
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [open, persona?.id]);

	const styles = form.watch("styles");
	const themeColor = form.watch("themeColor");
	const avatarUrl = form.watch("avatarUrl");
	const name = form.watch("name");
	const howToRespond = form.watch("howToRespond") ?? "";
	const guardrails = form.watch("guardrails") ?? "";

	const addStyle = (raw: string) => {
		const value = raw.trim().toLowerCase();
		if (!value || styles.includes(value) || styles.length >= MAX_PERSONA_STYLES) {
			return;
		}
		form.setValue("styles", [...styles, value], { shouldDirty: true });
	};

	const removeStyle = (value: string) => {
		form.setValue(
			"styles",
			styles.filter((s) => s !== value),
			{ shouldDirty: true },
		);
	};

	const onSubmit = form.handleSubmit(async (values) => {
		const payload = {
			name: values.name.trim(),
			internalDescription: values.internalDescription?.trim() || undefined,
			avatarUrl: values.avatarUrl?.trim() || undefined,
			themeColor: values.themeColor,
			styles: values.styles,
			howToRespond: values.howToRespond,
			guardrails: values.guardrails?.trim() || undefined,
			ttsVoice: values.ttsVoice?.trim() || undefined,
			llmModel: values.llmModel?.trim() || undefined,
		};
		try {
			const saved = isEditing
				? await updateMutation.mutateAsync({ id: persona.id, ...payload })
				: await createMutation.mutateAsync(payload);
			toastSuccess(isEditing ? "Persona updated" : "Persona created");
			onSaved?.(saved);
			onOpenChange(false);
		} catch (err) {
			toastError(err instanceof Error ? err.message : "Could not save the persona");
		}
	});

	const isSaving = createMutation.isPending || updateMutation.isPending;
	const availableSuggestions = PERSONA_STYLE_SUGGESTIONS.filter((s) => !styles.includes(s));

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
				<DialogHeader>
					<DialogTitle>{isEditing ? "Edit persona" : "New persona"}</DialogTitle>
					<DialogDescription>
						A reusable identity — name, look, and tone — you can attach to any agent.
					</DialogDescription>
				</DialogHeader>

				<Form {...form}>
					<form onSubmit={onSubmit} className="gap-5 flex flex-col">
						{/* Avatar preview + theme swatches */}
						<div className="gap-4 flex items-center">
							<PersonaAvatar
								name={name}
								avatarUrl={avatarUrl || undefined}
								themeColor={themeColor}
								sizeClass="size-14"
								textClass="text-lg"
							/>
							<FormField
								control={form.control}
								name="themeColor"
								render={({ field }) => (
									<FormItem className="min-w-0 space-y-1.5 flex-1">
										<FormLabel>Theme color</FormLabel>
										<div className="gap-2 flex flex-wrap">
											{PERSONA_THEME_COLORS.map((color) => (
												<button
													key={color}
													type="button"
													aria-label={`Theme color ${color}`}
													aria-pressed={field.value === color}
													onClick={() => field.onChange(color)}
													className={cn(
														"size-7 flex items-center justify-center rounded-full ring-offset-2 ring-offset-background transition-transform hover:scale-110",
														field.value === color && "ring-2 ring-ring",
													)}
													style={{ backgroundColor: color }}
												>
													{field.value === color && (
														<CheckIcon className="size-4 text-white drop-shadow" />
													)}
												</button>
											))}
										</div>
									</FormItem>
								)}
							/>
						</div>

						<FormField
							control={form.control}
							name="name"
							render={({ field }) => (
								<FormItem>
									<FormLabel className="gap-1.5 flex items-center">
										Name
										<InfoHint>The agent will use this as its name in conversation.</InfoHint>
									</FormLabel>
									<FormControl>
										<Input placeholder="e.g. Ava" {...field} />
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>

						<FormField
							control={form.control}
							name="internalDescription"
							render={({ field }) => (
								<FormItem>
									<FormLabel className="gap-1.5 flex items-center">
										Internal description
										<InfoHint>For your team only — never referenced by the agent.</InfoHint>
									</FormLabel>
									<FormControl>
										<Input placeholder="e.g. Friendly front-desk voice for clinics" {...field} />
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>

						<FormField
							control={form.control}
							name="avatarUrl"
							render={({ field }) => (
								<FormItem>
									<FormLabel className="gap-1.5 flex items-center">
										Avatar image URL
										<InfoHint>
											Optional. Falls back to initials on the theme color. Uploads coming later.
										</InfoHint>
									</FormLabel>
									<FormControl>
										<Input placeholder="https://…/avatar.png" {...field} />
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>

						{/* Tone styles */}
						<FormItem>
							<FormLabel className="gap-1.5 flex items-center">
								Tone styles{" "}
								<span className="font-normal text-muted-foreground">
									({styles.length}/{MAX_PERSONA_STYLES})
								</span>
								<InfoHint>Up to three tone words. Add your own or tap a suggestion.</InfoHint>
							</FormLabel>
							{styles.length > 0 && (
								<div className="gap-1.5 flex flex-wrap">
									{styles.map((style) => (
										<span
											key={style}
											className="gap-1 py-1 pr-1 pl-2.5 text-xs font-medium inline-flex items-center rounded-full border bg-muted"
										>
											{style}
											<button
												type="button"
												aria-label={`Remove ${style}`}
												onClick={() => removeStyle(style)}
												className="opacity-60 hover:opacity-100"
											>
												<XIcon className="size-3" />
											</button>
										</span>
									))}
								</div>
							)}
							<StyleEntryInput disabled={styles.length >= MAX_PERSONA_STYLES} onAdd={addStyle} />
							{availableSuggestions.length > 0 && styles.length < MAX_PERSONA_STYLES && (
								<div className="gap-1.5 mt-1 flex flex-wrap">
									{availableSuggestions.map((suggestion) => (
										<button
											key={suggestion}
											type="button"
											onClick={() => addStyle(suggestion)}
											className="px-2.5 py-1 text-xs inline-flex items-center rounded-full border border-dashed text-muted-foreground transition-colors hover:border-solid hover:bg-muted hover:text-foreground"
										>
											+ {suggestion}
										</button>
									))}
								</div>
							)}
						</FormItem>

						<FormField
							control={form.control}
							name="howToRespond"
							render={({ field }) => (
								<FormItem>
									<div className="flex items-center justify-between">
										<FormLabel className="gap-1.5 flex items-center">
											How to respond
											<InfoHint>
												The single source of tone for this persona — governs phrasing, variety, and
												pacing for every reply it gives, on voice and text alike.
											</InfoHint>
										</FormLabel>
										<span
											className={cn(
												"text-xs text-muted-foreground tabular-nums",
												howToRespond.length > HOW_TO_RESPOND_MAX && "text-destructive",
											)}
										>
											{howToRespond.length}/{HOW_TO_RESPOND_MAX}
										</span>
									</div>
									<FormControl>
										<Textarea
											rows={5}
											maxLength={HOW_TO_RESPOND_MAX}
											placeholder={HOW_TO_RESPOND_PLACEHOLDER}
											{...field}
										/>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>

						<FormField
							control={form.control}
							name="guardrails"
							render={({ field }) => (
								<FormItem>
									<div className="flex items-center justify-between">
										<FormLabel className="gap-1.5 flex items-center">
											Guardrails
											<InfoHint>
												Rules every agent using this persona must follow (compiles into ##
												GUARDRAILS).
											</InfoHint>
										</FormLabel>
										<span
											className={cn(
												"text-xs text-muted-foreground tabular-nums",
												guardrails.length > GUARDRAILS_MAX && "text-destructive",
											)}
										>
											{guardrails.length}/{GUARDRAILS_MAX}
										</span>
									</div>
									<FormControl>
										<Textarea
											rows={4}
											maxLength={GUARDRAILS_MAX}
											placeholder={GUARDRAILS_PLACEHOLDER}
											{...field}
										/>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>

						{/* Voice-only settings — never applied to text/SMS conversations. */}
						<div className="gap-3 p-4 flex flex-col rounded-lg border border-dashed bg-muted/30">
							<div className="gap-1 flex flex-col">
								<p className="gap-1.5 text-sm font-medium flex items-center">
									Voice channel settings
									<InfoHint>
										These map to the TTS voice and the voice-call respond model. They only take
										effect when this persona is used on a voice call — text and SMS conversations
										never read them.
									</InfoHint>
								</p>
								<p className="text-xs text-muted-foreground">
									Used on voice calls only — ignored for text/SMS.
								</p>
							</div>

							<div className="gap-4 sm:grid-cols-2 grid">
								<FormField
									control={form.control}
									name="ttsVoice"
									render={({ field }) => {
										const isKnown = ALL_VOICES.some((v) => v.id === field.value);
										const selectValue = customVoice
											? CUSTOM_VOICE
											: field.value
												? isKnown
													? field.value
													: CUSTOM_VOICE
												: NO_PREFERENCE_VALUE;
										return (
											<FormItem>
												<FormLabel>Voice</FormLabel>
												<Select
													onValueChange={(v) => {
														if (v === NO_PREFERENCE_VALUE) {
															setCustomVoice(false);
															field.onChange("");
															return;
														}
														if (v === CUSTOM_VOICE) {
															setCustomVoice(true);
															return;
														}
														setCustomVoice(false);
														field.onChange(v);
													}}
													value={selectValue}
												>
													<FormControl>
														<SelectTrigger>
															<SelectValue />
														</SelectTrigger>
													</FormControl>
													<SelectContent>
														<SelectGroup>
															<SelectItem value={NO_PREFERENCE_VALUE}>
																No preference (agent default)
															</SelectItem>
														</SelectGroup>
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
															<SelectItem value={CUSTOM_VOICE}>Custom voice ID…</SelectItem>
														</SelectGroup>
													</SelectContent>
												</Select>
												{selectValue === CUSTOM_VOICE && (
													<Input
														placeholder="voice id from the provider"
														className="font-mono text-xs"
														value={field.value ?? ""}
														onChange={(e) => field.onChange(e.target.value)}
													/>
												)}
											</FormItem>
										);
									}}
								/>

								<FormField
									control={form.control}
									name="llmModel"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Model (voice respond)</FormLabel>
											<Select
												onValueChange={(v) => field.onChange(v === NO_PREFERENCE_VALUE ? "" : v)}
												value={field.value || NO_PREFERENCE_VALUE}
											>
												<FormControl>
													<SelectTrigger>
														<SelectValue />
													</SelectTrigger>
												</FormControl>
												<SelectContent>
													<SelectGroup>
														<SelectItem value={NO_PREFERENCE_VALUE}>
															No preference (openai/gpt-4o default)
														</SelectItem>
													</SelectGroup>
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
							</div>
						</div>

						<DialogFooter>
							<Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
								Cancel
							</Button>
							<Button type="submit" variant="primary" loading={isSaving}>
								{isEditing ? "Save changes" : "Create persona"}
							</Button>
						</DialogFooter>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
}

/**
 * Local uncontrolled text field for adding a tone style. Kept out of
 * react-hook-form state so Enter/comma commit a chip without submitting the
 * outer form.
 */
function StyleEntryInput({
	disabled,
	onAdd,
}: {
	disabled: boolean;
	onAdd: (value: string) => void;
}) {
	return (
		<Input
			disabled={disabled}
			placeholder={disabled ? "Max 3 styles" : "Type a tone and press Enter"}
			onKeyDown={(e) => {
				if (e.key === "Enter" || e.key === ",") {
					e.preventDefault();
					const target = e.currentTarget;
					onAdd(target.value);
					target.value = "";
				}
			}}
		/>
	);
}
