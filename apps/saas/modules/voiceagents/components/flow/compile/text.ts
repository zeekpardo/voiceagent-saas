import type { ExitTagRules, FlowSectionDoc } from "../flow-types";

/**
 * Canvas document → engine flow payload. Pure functions only — no React,
 * no TipTap imports; the rich-text bodies are walked as plain JSON.
 */

/** Mention trigger characters — also stored on every chip (mentionSuggestionChar). */
export const MENTION_CHAR_VARIABLE = "@";
export const MENTION_CHAR_TOOL = "@@";
export const MENTION_CHAR_EXIT = "@@@";

interface TiptapNode {
	type?: string;
	text?: string;
	attrs?: Record<string, unknown>;
	content?: TiptapNode[];
}

/**
 * Normalize an exit's tag-gating rules for the engine (Phase 5b): trim tags,
 * drop empties, and collapse to `undefined` when nothing is left — so an exit
 * without real conditions compiles byte-identical to a pre-tagRules exit.
 */
export function compileExitTagRules(
	tagRules: ExitTagRules | undefined,
): { mustHave?: string[]; cantHave?: string[] } | undefined {
	if (!tagRules) return undefined;
	const clean = (arr: string[] | undefined) => {
		const out = (arr ?? []).map((t) => t.trim()).filter(Boolean);
		return out.length ? out : undefined;
	};
	const mustHave = clean(tagRules.mustHave);
	const cantHave = clean(tagRules.cantHave);
	if (!mustHave && !cantHave) return undefined;
	return { ...(mustHave ? { mustHave } : {}), ...(cantHave ? { cantHave } : {}) };
}

/** Exit names become engine tools `exit_<sanitized>`: lowercase, non-alnum runs → _. */
export function sanitizeExitName(name: string): string {
	return name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "_")
		.replace(/^_+|_+$/g, "");
}

function attrString(value: unknown, fallback = ""): string {
	return typeof value === "string" ? value : fallback;
}

function serializeMention(attrs: Record<string, unknown> | undefined): string {
	const id = attrString(attrs?.id);
	const char = attrString(attrs?.mentionSuggestionChar, MENTION_CHAR_VARIABLE);
	if (char === MENTION_CHAR_EXIT) {
		return `the exit tool "exit_${sanitizeExitName(id)}"`;
	}
	if (char === MENTION_CHAR_TOOL) {
		return id;
	}
	return `{{${id}}}`;
}

/** Walk a TipTap JSON document into plain text (chips → serialized text). */
export function tiptapToText(doc: unknown): string {
	if (!doc || typeof doc !== "object") {
		return "";
	}
	return nodeToText(doc as TiptapNode);
}

function nodeToText(node: TiptapNode): string {
	if (node.type === "text") {
		return node.text ?? "";
	}
	if (node.type === "mention") {
		return serializeMention(node.attrs);
	}
	if (node.type === "hardBreak") {
		return "\n";
	}
	const children = node.content ?? [];
	if (node.type === "doc" || node.type === "blockquote") {
		return children.map(nodeToText).join("\n");
	}
	if (node.type === "bulletList" || node.type === "orderedList") {
		return children
			.map((child, i) => `${node.type === "orderedList" ? `${i + 1}.` : "-"} ${nodeToText(child)}`)
			.join("\n");
	}
	if (node.type === "listItem") {
		return children.map(nodeToText).join("\n");
	}
	// paragraph, heading and unknown wrappers: concatenate inline content.
	return children.map(nodeToText).join("");
}

/** Sections → the node's plain-text prompt (`## Title` headers between sections). */
export function sectionsToInstructions(sections: FlowSectionDoc[] | undefined): string {
	return (sections ?? [])
		.map((section) => {
			const body = tiptapToText(section.body).trim();
			const title = section.title?.trim();
			return title ? `## ${title}\n${body}` : body;
		})
		.filter((part) => part.length > 0)
		.join("\n\n")
		.trim();
}

/**
 * Appends the calendar/appointment-title/failed-booking-tag prompt lines
 * shared by the Booking node and the Agent node's per-node booking settings.
 * Values are trimmed here so callers can pass raw (possibly undefined)
 * strings straight through; empty/undefined values append nothing.
 */
export function applyBookingPromptExtras(
	instructions: string,
	extras: { calendarName?: string; appointmentTitle?: string; failedBookingTag?: string },
): string {
	const calendarName = extras.calendarName?.trim();
	const appointmentTitle = extras.appointmentTitle?.trim();
	const failedBookingTag = extras.failedBookingTag?.trim();
	let result = instructions;
	if (calendarName) {
		result += `\n\nAlways pass calendar_name "${calendarName}" when using check_availability or book_appointment.`;
	}
	if (appointmentTitle) {
		result += `\n\nWhen booking, use the appointment title "${appointmentTitle}".`;
	}
	if (failedBookingTag) {
		result += `\n\nIf booking fails or no time works, use add_tag with tag "${failedBookingTag}".`;
	}
	return result;
}

let idCounter = 0;

export function makeId(prefix: string): string {
	idCounter += 1;
	return `${prefix}_${Date.now().toString(36)}${idCounter.toString(36)}`;
}

/** Plain text → a TipTap doc; `{{var}}` occurrences become variable chips. */
export function textToTiptapDoc(text: string): unknown {
	const lines = text.split("\n");
	const paragraphs = lines.map((line) => {
		const content: TiptapNode[] = [];
		let last = 0;
		const pattern = /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g;
		let match = pattern.exec(line);
		while (match) {
			if (match.index > last) {
				content.push({ type: "text", text: line.slice(last, match.index) });
			}
			content.push({
				type: "mention",
				attrs: {
					id: match[1],
					label: prettifyVariable(match[1]),
					mentionSuggestionChar: MENTION_CHAR_VARIABLE,
				},
			});
			last = match.index + match[0].length;
			match = pattern.exec(line);
		}
		if (last < line.length) {
			content.push({ type: "text", text: line.slice(last) });
		}
		return { type: "paragraph", ...(content.length > 0 ? { content } : {}) };
	});
	return { type: "doc", content: paragraphs };
}

/** contact_first_name → "Contact.First Name"-style chip label. */
export function prettifyVariable(name: string): string {
	const parts = name.split("_").filter(Boolean);
	if (parts.length === 0) {
		return name;
	}
	const [head, ...rest] = parts;
	const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
	if (rest.length === 0) {
		return cap(head);
	}
	return `${cap(head)}.${rest.map(cap).join(" ")}`;
}

/** Split a plain-text prompt on `## Title` headers into ordered sections. */
export function instructionsToSections(instructions: string): FlowSectionDoc[] {
	const sections: FlowSectionDoc[] = [];
	let currentTitle: string | undefined;
	let currentLines: string[] = [];

	const flush = () => {
		const body = currentLines.join("\n").trim();
		if (body || currentTitle) {
			sections.push({
				id: makeId("sec"),
				title: currentTitle,
				body: textToTiptapDoc(body),
			});
		}
		currentLines = [];
	};

	for (const line of instructions.split("\n")) {
		const header = /^##\s+(.+)$/.exec(line);
		if (header) {
			flush();
			currentTitle = header[1].trim();
		} else {
			currentLines.push(line);
		}
	}
	flush();

	if (sections.length === 0) {
		sections.push({ id: makeId("sec"), body: textToTiptapDoc("") });
	}
	return sections;
}

/** Extract `{{var}}` names from arbitrary config strings (instructions, greeting). */
export function extractVariableNames(...texts: (string | undefined)[]): string[] {
	const found = new Set<string>();
	for (const text of texts) {
		if (!text) {
			continue;
		}
		const pattern = /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g;
		let match = pattern.exec(text);
		while (match) {
			found.add(match[1]);
			match = pattern.exec(text);
		}
	}
	return [...found];
}
