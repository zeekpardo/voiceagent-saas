"use client";

import { BarVisualizer, RoomContext, useVoiceAssistant } from "@livekit/components-react";
import type { WidgetAppearance } from "@repo/api/modules/voiceagents/lib/widget-config";
import { cn } from "@repo/ui";
import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import type { Room } from "livekit-client";
import {
	HeadphonesIcon,
	HelpCircleIcon,
	type LucideIcon,
	MessageSquareIcon,
	MicIcon,
	PhoneOffIcon,
	SendIcon,
	SmileIcon,
	XIcon,
} from "lucide-react";
import {
	type CSSProperties,
	type FormEvent,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";

import {
	type AgentSessionChannel,
	type AgentSessionInfo,
	useAgentRoomSession,
} from "../../hooks/use-agent-room-session";
import { resolveWidgetChannels, type WidgetChannel } from "../../lib/widget-snippet";
import { IdleVisualizer } from "./IdleVisualizer";

/**
 * The embeddable widget's UI — a restyled, anonymous cousin of TestPortal.
 * It runs inside the iframe injected by /widget.js on a third-party website,
 * starts sessions through the PUBLIC token-gated /api/widget/session route
 * (same-origin fetch — never the authenticated oRPC client), and reuses the
 * shared `useAgentRoomSession` room core for connect/transcript/text send.
 *
 * Appearance is driven entirely by a resolved `WidgetAppearance` (from a saved
 * widget's config, or synthesized from legacy query params by the embed page),
 * so header title, welcome message, placeholder, theme, icon, visualizer, and
 * voice/chat gating all come from one object.
 *
 * Talks to the loader over postMessage: announces "voice-widget:ready" on
 * mount and sends "voice-widget:close" from the header close button so the
 * loader can collapse its bubble/panel/bar chrome.
 */
export function WidgetApp({ token, appearance }: { token: string; appearance: WidgetAppearance }) {
	const HeaderIcon = ICON_MAP[appearance.icon] ?? MessageSquareIcon;
	const isCard = appearance.style === "card";

	const [channel, setChannel] = useState<AgentSessionChannel>(appearance.voice ? "voice" : "text");
	const [draft, setDraft] = useState("");
	// The agent's server-allowed channels, learned from the first session
	// response's `modes`; null until then (we trust the widget's own config).
	const [serverModes, setServerModes] = useState<readonly WidgetChannel[] | null>(null);
	const transcriptRef = useRef<HTMLDivElement>(null);

	const dark = useResolvedDark(appearance.theme);

	const channels = resolveWidgetChannels(
		{ voice: appearance.voice, chat: appearance.chat },
		serverModes,
	);
	const canVoice = channels.includes("voice");
	const canText = channels.includes("text");

	const getSession = useCallback(async (): Promise<AgentSessionInfo> => {
		// The iframe is served from OUR origin, so the request's Origin header can
		// never identify the customer site embedding it. Report the parent page's
		// origin (ancestorOrigins on Chromium/WebKit, referrer on Firefox; empty
		// when opened top-level) for the route's allowlist check.
		const ancestors = window.location.ancestorOrigins;
		let parentOrigin = ancestors && ancestors.length > 0 ? ancestors[0] : "";
		if (!parentOrigin && document.referrer) {
			try {
				parentOrigin = new URL(document.referrer).origin;
			} catch {
				parentOrigin = "";
			}
		}
		const res = await fetch("/api/widget/session", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ token, channel, parentOrigin: parentOrigin || undefined }),
		});
		if (!res.ok) {
			const body = (await res.json().catch(() => null)) as {
				error?: string;
				modes?: WidgetChannel[];
			} | null;
			if (body?.modes) setServerModes(body.modes);
			throw new Error(body?.error ?? `Could not start the conversation (${res.status})`);
		}
		const data = (await res.json()) as AgentSessionInfo & { modes?: WidgetChannel[] };
		if (data.modes) setServerModes(data.modes);
		return data;
	}, [token, channel]);

	const { status, turns, error, room, isLive, start, stop, sendMessage, audioContainerRef } =
		useAgentRoomSession({ channel, getSession });
	const isBusy = isLive || status === "connecting";

	useEffect(() => {
		window.parent?.postMessage({ type: "voice-widget:ready" }, "*");
	}, []);

	useEffect(() => {
		transcriptRef.current?.scrollTo({
			top: transcriptRef.current.scrollHeight,
			behavior: "smooth",
		});
	}, [turns]);

	// Channel is React state feeding the hook, so after switching modes we must
	// wait for the hook to be re-created for the new channel before starting;
	// the ref + effect pair defers the start to that next render.
	const pendingStartRef = useRef(false);
	const pickMode = (next: AgentSessionChannel) => {
		if (next === channel) {
			void start();
			return;
		}
		pendingStartRef.current = true;
		setChannel(next);
	};
	useEffect(() => {
		if (pendingStartRef.current) {
			pendingStartRef.current = false;
			void start();
		}
	}, [start]);

	const close = () => {
		if (isBusy) void stop();
		window.parent?.postMessage({ type: "voice-widget:close" }, "*");
	};

	const showWelcome = turns.length === 0 && appearance.welcomeMessage.trim() !== "";

	return (
		<div
			className={cn("flex h-dvh flex-col bg-background text-foreground", dark && "dark")}
			style={accentVariables(appearance.accent)}
		>
			<header className="h-12 gap-2.5 px-4 flex shrink-0 items-center border-b bg-primary text-primary-foreground">
				{appearance.showOnlineDot ? (
					<span className="size-2.5 relative flex">
						{isLive && (
							<span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-current opacity-60" />
						)}
						<span
							className={cn(
								"size-2.5 relative inline-flex rounded-full",
								isLive ? "bg-emerald-300" : "bg-primary-foreground/50",
							)}
						/>
					</span>
				) : (
					<HeaderIcon className="size-4" />
				)}
				<span className="font-medium text-sm">{appearance.headerTitle}</span>
				{isBusy && <span className="text-xs capitalize opacity-75">{status}</span>}
				{!isCard && (
					<button
						type="button"
						aria-label="Close widget"
						onClick={close}
						className="p-1 ml-auto rounded-md opacity-80 transition-opacity hover:opacity-100"
					>
						<XIcon className="size-4" />
					</button>
				)}
			</header>

			<div className="min-h-0 gap-3 p-4 flex flex-1 flex-col">
				{channel === "voice" && isBusy && (
					<WidgetVisualizer room={room} variant={appearance.visualizer} />
				)}

				<div
					ref={transcriptRef}
					className={cn(
						"gap-2 flex flex-1 flex-col overflow-y-auto rounded-lg",
						turns.length === 0 && !showWelcome && "items-center justify-center",
					)}
				>
					{turns.length === 0 ? (
						showWelcome ? (
							<div className="px-3 py-2 text-sm max-w-[85%] self-start rounded-xl bg-muted">
								{appearance.welcomeMessage}
							</div>
						) : (
							<p className="px-6 text-sm text-center text-muted-foreground">
								{isBusy
									? channel === "voice"
										? "You're connected — just start talking."
										: "You're connected — type a message below."
									: "Hi there! Start a conversation below."}
							</p>
						)
					) : (
						turns.map((t) => (
							<div
								key={t.id}
								className={cn(
									"px-3 py-2 text-sm max-w-[85%] rounded-xl",
									t.role === "agent"
										? "self-start bg-muted"
										: "self-end bg-primary text-primary-foreground",
								)}
							>
								{t.text}
							</div>
						))
					)}
				</div>

				{error && <p className="text-sm text-destructive">{error}</p>}

				{channel === "text" && isBusy && (
					<form
						className="gap-2 flex items-center"
						onSubmit={(e: FormEvent) => {
							e.preventDefault();
							const text = draft;
							setDraft("");
							void sendMessage(text);
						}}
					>
						<Input
							className="h-9 text-sm flex-1"
							placeholder={appearance.placeholder}
							value={draft}
							// eslint-disable-next-line jsx-a11y/no-autofocus
							autoFocus
							onChange={(e) => setDraft(e.target.value)}
						/>
						<Button
							type="submit"
							variant="primary"
							size="icon"
							className="size-9 shrink-0"
							aria-label="Send message"
							disabled={draft.trim() === ""}
						>
							<SendIcon className="size-4" />
						</Button>
					</form>
				)}

				{isBusy ? (
					<Button type="button" variant="outline" onClick={() => void stop()}>
						<PhoneOffIcon className="size-4" /> End conversation
					</Button>
				) : (
					<div className="gap-2 flex flex-col">
						{/* Explicit primary variants — the Button default is "secondary",
						    which would render the CTAs gray instead of the widget's accent. */}
						{canVoice && (
							<Button type="button" variant="primary" onClick={() => pickMode("voice")}>
								<MicIcon className="size-4" /> Start voice chat
							</Button>
						)}
						{canText && (
							<Button
								type="button"
								variant={canVoice ? "outline" : "primary"}
								// The outline variant's text-secondary is unreadable on the
								// widget's plain background — use the foreground color instead.
								className={cn(canVoice && "text-foreground")}
								onClick={() => pickMode("text")}
							>
								<MessageSquareIcon className="size-4" /> Start text chat
							</Button>
						)}
						{!canVoice && !canText && (
							<p className="text-sm text-center text-muted-foreground">
								This assistant is not accepting conversations right now.
							</p>
						)}
					</div>
				)}
			</div>

			{/* Agent audio attaches here — always mounted so re-renders never kill the call. */}
			<div ref={audioContainerRef} className="hidden" />
		</div>
	);
}

const ICON_MAP: Record<WidgetAppearance["icon"], LucideIcon> = {
	chat: MessageSquareIcon,
	help: HelpCircleIcon,
	smile: SmileIcon,
	headset: HeadphonesIcon,
	mic: MicIcon,
};

/**
 * Resolve the widget's theme choice to a boolean "is dark". "system" tracks the
 * viewer's OS preference live; light/dark are fixed. Applied as the `dark`
 * class on the widget root so the design system's tokens flip.
 */
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

/**
 * Retheme the design system's primary color to the embedder's accent. Only a
 * conservative character set is allowed since the value arrives via URL/config.
 */
function accentVariables(accent: string): CSSProperties {
	const safe = /^[#a-zA-Z0-9(),.%\s-]+$/.test(accent) ? accent : "#6366f1";
	return {
		"--primary": safe,
		"--primary-foreground": "#ffffff",
	} as CSSProperties;
}

/** Live voice visualizer, gated on a connected room (widget shows a CTA before). */
function WidgetVisualizer({
	room,
	variant,
}: {
	room: Room | null;
	variant: WidgetAppearance["visualizer"];
}) {
	if (!room) return null;
	return (
		<RoomContext.Provider value={room}>
			<WidgetVisualizerInner variant={variant} />
		</RoomContext.Provider>
	);
}

function WidgetVisualizerInner({ variant }: { variant: WidgetAppearance["visualizer"] }) {
	const { state, audioTrack } = useVoiceAssistant();
	// "bars" uses LiveKit's audio-reactive bars; the other variants animate off
	// the agent state (idle vs. active) with CSS so they stay dependency-light.
	if (variant === "bars") {
		return (
			<BarVisualizer
				state={state}
				track={audioTrack}
				barCount={5}
				options={{ minHeight: 24 }}
				className="h-16 gap-1.5 py-3 flex shrink-0 items-center justify-center rounded-lg bg-muted/50"
			>
				<span className="w-2 rounded-full bg-primary/25 transition-colors duration-150 data-[lk-highlighted=true]:bg-primary" />
			</BarVisualizer>
		);
	}
	const active = state === "speaking" || state === "listening" || state === "thinking";
	return <IdleVisualizer variant={variant} active={active} />;
}
