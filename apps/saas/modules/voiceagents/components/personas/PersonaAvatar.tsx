"use client";

import { cn } from "@repo/ui";
import { initials } from "@shared/lib/avatar";

import { contrastText } from "./persona-constants";

/**
 * A persona's avatar: the image at `avatarUrl` when present, otherwise the
 * name's initials drawn on the persona's `themeColor` backdrop (with a
 * luminance-picked text color so it reads on any color). Mirrors the shared
 * initials util used elsewhere in the app.
 */
export function PersonaAvatar({
	name,
	avatarUrl,
	themeColor,
	className,
	sizeClass = "size-10",
	textClass = "text-sm",
}: {
	name: string;
	avatarUrl?: string | null;
	themeColor?: string | null;
	className?: string;
	sizeClass?: string;
	textClass?: string;
}) {
	const label = (name.trim() || "New persona").trim();
	const backdrop = themeColor ?? undefined;
	if (avatarUrl) {
		return (
			// biome-ignore lint/a11y/useAltText: decorative, name shown alongside
			<img
				src={avatarUrl}
				alt=""
				className={cn("shrink-0 rounded-full border object-cover", sizeClass, className)}
				style={{ backgroundColor: backdrop }}
			/>
		);
	}
	return (
		<span
			aria-hidden
			className={cn(
				"shrink-0 inline-flex items-center justify-center rounded-full font-semibold",
				sizeClass,
				textClass,
				className,
			)}
			style={{ backgroundColor: backdrop, color: contrastText(backdrop ?? "#e2e8f0") }}
		>
			{initials(label)}
		</span>
	);
}
