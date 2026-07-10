"use client";

import type { AgentFormValues } from "../../lib/agent-form-mapping";
import {
	FormControl,
	FormDescription,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@repo/ui/components/form";
import { Input } from "@repo/ui/components/input";
import { XIcon } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import type { UseFormReturn } from "react-hook-form";

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

interface AgentFormFieldProps {
	form: UseFormReturn<AgentFormValues>;
}

/**
 * Prompt-content fields shared between the default (full) form and the
 * "job" variant. Each is a standalone component so both layouts can render
 * the same fields in their own order.
 */
export function InstructionsField({ form }: AgentFormFieldProps) {
	return (
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
}

export function ProhibitedWordsField({ form }: AgentFormFieldProps) {
	return (
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
}

export function GreetingField({ form }: AgentFormFieldProps) {
	return (
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
}
