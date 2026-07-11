"use client";

import type { WidgetStyle } from "@repo/api/modules/voiceagents/lib/widget-config";
import { cn } from "@repo/ui";
import { Button } from "@repo/ui/components/button";
import { InfoIcon, MicIcon, RefreshCwIcon, WifiOffIcon } from "lucide-react";
import { useEffect, useState } from "react";

/**
 * Live, fully interactive test of a saved widget — the REAL /widget/embed
 * iframe running against the real /api/widget/session route, so a merchant
 * can hold an actual voice/text conversation without leaving the Studio.
 * (The session route recognizes same-origin authenticated owners, so the
 * Studio origin doesn't need to be on the widget's allowlist.)
 *
 * Always renders the OPEN state in a fixed frame sized after the real
 * widget.js chrome for the chosen style — the point is testing conversations,
 * not the launcher chrome. If the embed doesn't announce
 * "voice-widget:ready" within a few seconds (deleted/disabled widget, boot
 * failure), a friendly fallback replaces the frame.
 */
export function WidgetLiveTest({
	widgetId,
	style,
	isDirty,
}: {
	widgetId: string;
	style: WidgetStyle;
	isDirty: boolean;
}) {
	// Bumping the attempt remounts the iframe and restarts the ready timer.
	const [attempt, setAttempt] = useState(0);
	const [state, setState] = useState<"loading" | "ready" | "failed">("loading");

	useEffect(() => {
		setState("loading");
		const onMessage = (e: MessageEvent) => {
			if ((e.data as { type?: string } | null)?.type === "voice-widget:ready") {
				setState("ready");
			}
		};
		window.addEventListener("message", onMessage);
		const timer = window.setTimeout(() => {
			setState((s) => (s === "loading" ? "failed" : s));
		}, READY_TIMEOUT_MS);
		return () => {
			window.removeEventListener("message", onMessage);
			window.clearTimeout(timer);
		};
	}, [attempt]);

	const { width, height } = FRAME_SIZES[style] ?? FRAME_SIZES.bubble;

	return (
		<div className="gap-2 flex flex-col">
			{isDirty && (
				<p className="gap-1.5 text-xs text-amber-600 dark:text-amber-400 flex items-center">
					<InfoIcon className="size-3.5 shrink-0" />
					Testing the last saved version — save to test current edits.
				</p>
			)}

			<div className="p-4 relative flex min-h-[480px] items-center justify-center overflow-hidden rounded-xl border bg-[radial-gradient(circle_at_1px_1px,var(--border)_1px,transparent_0)] [background-size:16px_16px]">
				{state === "failed" ? (
					<div className="gap-3 px-6 max-w-sm flex flex-col items-center text-center">
						<WifiOffIcon className="size-6 text-muted-foreground" />
						<p className="text-sm text-muted-foreground">
							The widget didn't load. It may be disabled or deleted — check that it's enabled, then
							try again.
						</p>
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={() => setAttempt((n) => n + 1)}
						>
							<RefreshCwIcon className="size-4" /> Retry
						</Button>
					</div>
				) : (
					<iframe
						key={attempt}
						src={`/widget/embed?widgetId=${encodeURIComponent(widgetId)}`}
						title="Live widget test"
						allow="microphone; autoplay"
						className={cn(
							"shadow-xl max-w-full rounded-2xl border bg-background",
							state === "loading" && "opacity-60",
						)}
						style={{ width, height, maxHeight: "70vh" }}
					/>
				)}
			</div>

			<p className="gap-1.5 text-xs flex items-center text-muted-foreground">
				<MicIcon className="size-3.5 shrink-0" />
				This is the real widget — starting a voice chat will ask for microphone permission.
			</p>
		</div>
	);
}

const READY_TIMEOUT_MS = 6000;

/**
 * Open-state frame sizes lifted from the real chrome in public/widget.js
 * (bubble panel 380×600, panel drawer 400×full-height, bar sheet full×480,
 * inline card 380×520), clamped to something that fits the editor column.
 */
const FRAME_SIZES: Record<WidgetStyle, { width: number | string; height: number }> = {
	bubble: { width: 380, height: 600 },
	panel: { width: 400, height: 620 },
	bar: { width: "100%", height: 480 },
	card: { width: 380, height: 520 },
};
