"use client";

import { ContactFieldCombobox } from "@voiceagents/components/shared/ContactFieldCombobox";

/**
 * A WRITE-TARGET field picker for the objective / set_field editors: the shared
 * ContactFieldCombobox scoped to CONTACT fields only (you write values to the
 * contact record, never to the location). Thin delegate so there's ONE combobox
 * implementation — scroll behavior, grouping, and CloseBot-style rows stay in
 * sync with every other field picker.
 */
export interface ContactWriteFieldComboboxProps {
	/** Selected field key, e.g. "contact.email". null/undefined = nothing picked. */
	value?: string | null;
	/** Fired with the picked key, a bespoke typed value, or null for "Leave Empty". */
	onChange: (key: string | null) => void;
	/** Scope custom fields to this agent's Source. */
	agentId?: string;
	/** Render a "Leave Empty" row (→ null) pinned to the top. */
	allowEmpty?: boolean;
	/** Trigger text when nothing is selected. */
	placeholder?: string;
	/** Accept a free-typed value as a bespoke key. */
	allowCustomKey?: boolean;
	disabled?: boolean;
	className?: string;
}

export function ContactWriteFieldCombobox(props: ContactWriteFieldComboboxProps) {
	return <ContactFieldCombobox {...props} contactOnly />;
}
