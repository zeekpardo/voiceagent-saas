"use client";

import { GUARDRAILS_MAX_CHARS } from "@repo/api/modules/voiceagents/lib/persona-prompt";
import { cn } from "@repo/ui";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@repo/ui/components/form";
import { Input } from "@repo/ui/components/input";
import { Textarea } from "@repo/ui/components/textarea";
import { InfoHint } from "@voiceagents/components/shared/InfoHint";
import { useContactFieldsQuery } from "@voiceagents/lib/contact-fields-api";
import { InfoIcon, XIcon } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import type { UseFormReturn } from "react-hook-form";

import type { AgentFormValues } from "../../lib/agent-form-mapping";
import { textToTiptapDoc, tiptapToText } from "../flow/compile";
import { buildVariableItems, createFlowMentionExtension } from "../flow/mentions";
import { SectionEditor } from "../flow/SectionEditor";

interface ChipsInputProps {
	value: string[];
	onChange: (next: string[]) => void;
	placeholder?: string;
}

/** Chips input: Enter/comma adds a pill, Backspace on empty input removes the last one. */
export function ChipsInput({ value, onChange, placeholder }: ChipsInputProps) {
	const [draft, setDraft] = useState("");

	function addChip(raw: string) {
		const word = raw.trim();
		if (word && !value.includes(word)) {
			onChange([...value, word]);
		}
		setDraft("");
	}

	return (
		<div className="gap-2 flex flex-col">
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
				<div className="gap-1.5 flex flex-wrap">
					{value.map((word) => (
						<span
							key={word}
							className="gap-1 px-2.5 py-0.5 text-xs inline-flex items-center rounded-full bg-primary/10 text-primary"
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
export function InstructionsEditor({
	value,
	onChange,
	hint,
	editorClassName = "min-h-44",
	fields = [],
	customVariables = [],
}: {
	value: string;
	onChange: (next: string) => void;
	hint?: string;
	editorClassName?: string;
	/** Unified contact-fields catalog to merge into the @ picker (useContactFieldsQuery). */
	fields?: { key: string }[];
	/** Agent-level Job Flow Variable definitions to merge into the @ picker. */
	customVariables?: { name: string; description?: string }[];
}) {
	// Hydrate once — the editor owns the text after mount.
	const [initialBody] = useState<unknown>(() => textToTiptapDoc(value));
	// Latest text/fields/custom variables via refs so the suggestion list stays
	// current without recreating the extension (and thus losing focus).
	const valueRef = useRef(value);
	valueRef.current = value;
	const fieldsRef = useRef(fields);
	fieldsRef.current = fields;
	const customVariablesRef = useRef(customVariables);
	customVariablesRef.current = customVariables;
	const mentionExtension = useMemo(
		() =>
			createFlowMentionExtension({
				getVariables: () => {
					const referenced = [...valueRef.current.matchAll(/\{\{\s*([\w.-]+)\s*\}\}/g)].map(
						(m) => m[1]!,
					);
					return buildVariableItems(referenced, fieldsRef.current, customVariablesRef.current);
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
			hint={hint ?? "Type @ to insert a variable — location and contact details fill in per call"}
			editorClassName={editorClassName}
		/>
	);
}

interface AgentFormFieldProps {
	form: UseFormReturn<AgentFormValues>;
}

/**
 * Prompt-content fields shared between the default (full) form and the
 * "job" variant. Each is a standalone component so both layouts can render
 * the same fields in their own order.
 */
interface InstructionsFieldProps extends AgentFormFieldProps {
	/** Label + helper override; defaults teach the LEAN Goal doctrine. */
	label?: string;
	/** Info-hint text next to the label (the "why" + what to avoid). */
	description?: string;
	/** Helper line under the editor (e.g. an example objective). */
	hint?: string;
	/** Existing agent id — fetches the unified contact-fields catalog for the @ picker. */
	agentId?: string;
}

export function InstructionsField({
	form,
	label = "Goal",
	description = "Sent with every message — keep it to who the agent works for, what the business is, and why this conversation is happening (2–4 sentences). Don't put booking steps, service catalogs, or stage-by-stage instructions here — the flow's nodes handle those.",
	hint = "For example: You work for Empire Cleaning in Austin TX — a family-run residential cleaning company known for move-out and pet-mess jobs. The contact reached out to learn more about our services.",
	agentId,
}: InstructionsFieldProps) {
	// Same @-variable source as the flow builder's node editors: contact-field
	// catalog + this agent's Job Flow Variables, merged into the picker.
	const { data: contactFields } = useContactFieldsQuery(agentId);
	const customVariables = form.watch("customVariables");
	return (
		<FormField
			control={form.control}
			name="goal"
			render={({ field }) => (
				<FormItem>
					<FormLabel className="gap-1.5 flex items-center">
						{label}
						<InfoHint>{description}</InfoHint>
					</FormLabel>
					<FormControl>
						<InstructionsEditor
							value={field.value ?? ""}
							onChange={field.onChange}
							hint={hint}
							fields={contactFields?.fields ?? []}
							customVariables={customVariables ?? []}
						/>
					</FormControl>
					<FormMessage />
				</FormItem>
			)}
		/>
	);
}

/**
 * Job-specific guardrails. Stored raw on the config (round-trips like personaId)
 * and compiled into the prompt's `## GUARDRAILS` block on top of an always-on
 * safety baseline — so this field is purely additive rules for THIS job.
 */
export function GuardrailsField({ form }: AgentFormFieldProps) {
	return (
		<FormField
			control={form.control}
			name="guardrails"
			render={({ field }) => (
				<FormItem>
					<div className="flex items-center justify-between">
						<FormLabel className="gap-1.5 flex items-center">
							Guardrails
							<InfoHint>
								Limits on what the agent will discuss or do. Baseline safety guardrails are always
								applied — add rules specific to this job.
							</InfoHint>
						</FormLabel>
						<span
							className={cn(
								"text-xs text-muted-foreground tabular-nums",
								(field.value?.length ?? 0) > GUARDRAILS_MAX_CHARS && "text-destructive",
							)}
						>
							{field.value?.length ?? 0}/{GUARDRAILS_MAX_CHARS}
						</span>
					</div>
					<FormControl>
						<Textarea
							rows={3}
							maxLength={GUARDRAILS_MAX_CHARS}
							className="max-h-72 field-sizing-content"
							placeholder="Never quote exact pricing — say the team will confirm. Don't discuss competitors."
							value={field.value ?? ""}
							onChange={field.onChange}
							onBlur={field.onBlur}
							name={field.name}
							ref={field.ref}
						/>
					</FormControl>
					<FormMessage />
				</FormItem>
			)}
		/>
	);
}

/** Read-only note: caller/CRM details are injected automatically per call. */
export function UserInfoNote() {
	return (
		<div className="gap-1.5 p-3 text-sm flex items-center rounded-md border bg-muted/40 text-muted-foreground">
			<InfoIcon className="size-4 shrink-0" />
			<span>Caller details from your CRM are added automatically.</span>
			<InfoHint>
				Name, custom fields, and tags are added to every call. Use variables like{" "}
				<code className="text-xs">{"{{contact_first_name}}"}</code> anywhere in your prompts and
				they fill in per caller.
			</InfoHint>
		</div>
	);
}

export function ProhibitedWordsField({ form }: AgentFormFieldProps) {
	return (
		<FormField
			control={form.control}
			name="prohibitedWords"
			render={({ field }) => (
				<FormItem>
					<FormLabel className="gap-1.5 flex items-center">
						Prohibited words
						<InfoHint>The agent will never use these words or phrases, in any form.</InfoHint>
					</FormLabel>
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
}

export function GreetingField({ form }: AgentFormFieldProps) {
	return (
		<FormField
			control={form.control}
			name="greeting"
			render={({ field }) => (
				<FormItem>
					<FormLabel className="gap-1.5 flex items-center">
						Greeting
						<InfoHint>
							Spoken first when the conversation starts. Leave empty to let the caller speak first.
						</InfoHint>
					</FormLabel>
					<FormControl>
						<Input placeholder="Hi {{caller_name}}! How can I help today?" {...field} />
					</FormControl>
				</FormItem>
			)}
		/>
	);
}
