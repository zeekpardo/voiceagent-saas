"use client";

import type { WidgetAppearance } from "@repo/api/modules/voiceagents/lib/widget-config";
import { cn } from "@repo/ui";
import {
	HeadphonesIcon,
	HelpCircleIcon,
	type LucideIcon,
	MessageSquareIcon,
	MicIcon,
	SendIcon,
	SmileIcon,
	XIcon,
} from "lucide-react";
import { type CSSProperties, useEffect, useState } from "react";

import { IdleVisualizer } from "./IdleVisualizer";

const ICON_MAP: Record<WidgetAppearance["icon"], LucideIcon> = {
	chat: MessageSquareIcon,
	help: HelpCircleIcon,
	smile: SmileIcon,
	headset: HeadphonesIcon,
	mic: MicIcon,
};

/**
 * Pure, non-interactive live preview of a widget's appearance — the RIGHT
 * column of the Studio editor. It mirrors WidgetApp's chrome but renders the
 * "opened" state with placeholder content (welcome bubble + skeleton lines +
 * an idle visualizer) so the merchant sees their choices instantly. It never
 * connects to anything; `pointer-events-none` keeps it inert.
 */
export function WidgetPreview({ appearance }: { appearance: WidgetAppearance }) {
	const dark = useResolvedDark(appearance.theme);
	const HeaderIcon = ICON_MAP[appearance.icon] ?? MessageSquareIcon;

	const panel = (
		<div
			className={cn(
				"shadow-xl pointer-events-none flex flex-col overflow-hidden rounded-2xl border bg-background text-foreground",
				dark && "dark",
			)}
			style={{ ...accentVars(appearance.accent), width: 300, height: 420 }}
		>
			<header className="h-11 gap-2.5 px-3.5 flex shrink-0 items-center bg-primary text-primary-foreground">
				{appearance.showOnlineDot ? (
					<span className="size-2.5 relative flex">
						<span className="animate-ping bg-emerald-300 absolute inline-flex h-full w-full rounded-full opacity-60" />
						<span className="size-2.5 bg-emerald-300 relative inline-flex rounded-full" />
					</span>
				) : (
					<HeaderIcon className="size-4" />
				)}
				<span className="font-medium text-sm truncate">
					{appearance.headerTitle || "Assistant"}
				</span>
				<XIcon className="size-4 ml-auto opacity-80" />
			</header>

			<div className="min-h-0 gap-3 p-3.5 flex flex-1 flex-col">
				{appearance.voice && <IdleVisualizer variant={visualizerVariant(appearance)} active />}

				<div className="gap-2 flex flex-1 flex-col">
					{appearance.welcomeMessage.trim() ? (
						<div className="px-3 py-2 text-xs max-w-[85%] self-start rounded-xl bg-muted">
							{appearance.welcomeMessage}
						</div>
					) : (
						<div className="px-3 py-2 max-w-[85%] self-start rounded-xl bg-muted">
							<div className="gap-1.5 flex flex-col">
								<div className="h-2 w-28 rounded bg-foreground/15" />
								<div className="h-2 w-20 rounded bg-foreground/15" />
							</div>
						</div>
					)}
					<div className="px-3 py-2 max-w-[70%] self-end rounded-xl bg-primary/90">
						<div className="h-2 w-16 rounded bg-primary-foreground/40" />
					</div>
				</div>

				<div className="gap-2 flex items-center">
					{appearance.chat ? (
						<div className="h-8 px-3 text-xs flex flex-1 items-center rounded-md border text-muted-foreground">
							{appearance.placeholder || "Type a message…"}
						</div>
					) : (
						<div className="flex-1" />
					)}
					<div className="size-8 flex shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
						{appearance.voice && !appearance.chat ? (
							<MicIcon className="size-4" />
						) : (
							<SendIcon className="size-4" />
						)}
					</div>
				</div>
			</div>
		</div>
	);

	return (
		<div className="p-4 relative flex min-h-[480px] overflow-hidden rounded-xl border bg-[radial-gradient(circle_at_1px_1px,var(--color-border)_1px,transparent_0)] [background-size:16px_16px]">
			<div className={cn("flex flex-1", positionClass(appearance))}>{panel}</div>
			{/* Corner launcher hint for bubble/panel/bar styles. */}
			{appearance.style === "bubble" && (
				<div
					className={cn(
						"size-12 bottom-4 text-white shadow-lg absolute flex items-center justify-center rounded-full",
						appearance.position === "left" ? "left-4" : "right-4",
					)}
					style={{ background: safeAccent(appearance.accent) }}
				>
					<HeaderIcon className="size-5" />
				</div>
			)}
		</div>
	);
}

function positionClass(appearance: WidgetAppearance): string {
	if (appearance.style === "card") return "items-center justify-center";
	if (appearance.style === "bar") return "items-end justify-center";
	// bubble + panel honor the left/right position.
	return cn("items-center", appearance.position === "left" ? "justify-start" : "justify-end");
}

function visualizerVariant(appearance: WidgetAppearance): "pulse" | "waveform" | "dots" {
	return appearance.visualizer === "bars" ? "waveform" : appearance.visualizer;
}

function safeAccent(accent: string): string {
	return /^[#a-zA-Z0-9(),.%\s-]+$/.test(accent) ? accent : "#6366f1";
}

function accentVars(accent: string): CSSProperties {
	return {
		"--primary": safeAccent(accent),
		"--primary-foreground": "#ffffff",
	} as CSSProperties;
}

function useResolvedDark(theme: WidgetAppearance["theme"]): boolean {
	const [systemDark, setSystemDark] = useState(false);
	useEffect(() => {
		if (theme !== "system" || typeof window.matchMedia !== "function") return;
		const mq = window.matchMedia("(prefers-color-scheme: dark)");
		setSystemDark(mq.matches);
		const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
		mq.addEventListener("change", onChange);
		return () => mq.removeEventListener("change", onChange);
	}, [theme]);
	if (theme === "dark") return true;
	if (theme === "light") return false;
	return systemDark;
}
