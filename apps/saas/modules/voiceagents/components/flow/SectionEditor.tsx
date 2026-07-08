"use client";

import type { AnyExtension, JSONContent } from "@tiptap/core";
import { EditorContent, useEditor } from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";

/**
 * One section body: a TipTap rich-text editor with mention chips.
 * Type `@` for variables, `@@` for tools, `@@@` for this node's exits.
 */
export function SectionEditor({
	initialBody,
	mentionExtension,
	onBodyChange,
}: {
	initialBody: unknown;
	/** Created once by the panel (holds the suggestion sources). */
	mentionExtension: AnyExtension;
	onBodyChange: (body: unknown) => void;
}) {
	const editor = useEditor({
		extensions: [
			StarterKit.configure({
				heading: false,
				codeBlock: false,
				blockquote: false,
				horizontalRule: false,
				link: false,
			}),
			mentionExtension,
		],
		content: (initialBody as JSONContent) ?? { type: "doc", content: [{ type: "paragraph" }] },
		// Next.js App Router: render on the client only to avoid hydration mismatches.
		immediatelyRender: false,
		editorProps: {
			attributes: {
				class:
					"min-h-24 w-full rounded-md border bg-background px-3 py-2 text-sm leading-relaxed focus:outline-none focus:ring-1 focus:ring-ring [&_p]:my-0.5",
			},
		},
		onUpdate: ({ editor: instance }) => onBodyChange(instance.getJSON()),
	});

	return (
		<div className="flex flex-col gap-1">
			<EditorContent editor={editor} />
			<p className="text-xs opacity-40">@ variables · @@ tools · @@@ exits</p>
		</div>
	);
}
