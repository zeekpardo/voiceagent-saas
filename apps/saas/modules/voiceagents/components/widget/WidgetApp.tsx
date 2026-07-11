"use client";

import { BarVisualizer, RoomContext, useVoiceAssistant } from "@livekit/components-react";
import { cn } from "@repo/ui";
import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import type { Room } from "livekit-client";
import { MessageSquareIcon, MicIcon, PhoneOffIcon, SendIcon, XIcon } from "lucide-react";
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
import type { WidgetStyle } from "../../lib/widget-snippet";

/**
 * The embeddable widget's UI — a restyled, anonymous cousin of TestPortal.
 * It runs inside the iframe injected by /widget.js on a third-party website,
 * starts sessions through the PUBLIC token-gated /api/widget/session route
 * (same-origin fetch — never the authenticated oRPC client), and reuses the
 * shared `useAgentRoomSession` room core for connect/transcript/text send.
 *
 * Talks to the loader over postMessage: announces "voice-widget:ready" on
 * mount and sends "voice-widget:close" from the header close button so the
 * loader can collapse its bubble/panel/bar chrome.
 */
export function WidgetApp({
	token,
	embedStyle,
	accent,
}: {
	token: string;
	embedStyle: WidgetStyle;
	accent: string;
}) {
	const [channel, setChannel] = useState<AgentSessionChannel>("voice");
	const [draft, setDraft] = useState("");
	const transcriptRef = useRef<HTMLDivElement>(null);

	const getSession = useCallback(async (): Promise<AgentSessionInfo> => {
		const res = await fetch("/api/widget/session", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ token, channel }),
		});
		if (!res.ok) {
			const body = (await res.json().catch(() => null)) as { error?: string } | null;
			throw new Error(body?.error ?? `Could not start the conversation (${res.status})`);
		}
		return (await res.json()) as AgentSessionInfo;
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

	return (
		<div
			className="flex h-dvh flex-col bg-background text-foreground"
			style={accentVariables(accent)}
		>
			<header className="h-12 gap-2.5 px-4 flex shrink-0 items-center border-b bg-primary text-primary-foreground">
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
				<span className="font-medium text-sm">Voice assistant</span>
				{isBusy && <span className="text-xs capitalize opacity-75">{status}</span>}
				{embedStyle !== "card" && (
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
				{channel === "voice" && isBusy && <WidgetVisualizer room={room} />}

				<div
					ref={transcriptRef}
					className={cn(
						"gap-2 flex flex-1 flex-col overflow-y-auto rounded-lg",
						turns.length === 0 && "items-center justify-center",
					)}
				>
					{turns.length === 0 ? (
						<p className="px-6 text-sm text-center text-muted-foreground">
							{isBusy
								? channel === "voice"
									? "You're connected — just start talking."
									: "You're connected — type a message below."
								: "Hi there! Start a voice or text conversation below."}
						</p>
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
							placeholder="Type a message…"
							value={draft}
							// eslint-disable-next-line jsx-a11y/no-autofocus
							autoFocus
							onChange={(e) => setDraft(e.target.value)}
						/>
						<Button
							type="submit"
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
						<Button type="button" onClick={() => pickMode("voice")}>
							<MicIcon className="size-4" /> Start voice chat
						</Button>
						<Button type="button" variant="outline" onClick={() => pickMode("text")}>
							<MessageSquareIcon className="size-4" /> Start text chat
						</Button>
					</div>
				)}
			</div>

			{/* Agent audio attaches here — always mounted so re-renders never kill the call. */}
			<div ref={audioContainerRef} className="hidden" />
		</div>
	);
}

/**
 * Retheme the design system's primary color to the embedder's accent. Only a
 * conservative character set is allowed since the value arrives via URL.
 */
function accentVariables(accent: string): CSSProperties {
	const safe = /^[#a-zA-Z0-9(),.%\s-]+$/.test(accent) ? accent : "#6366f1";
	return {
		"--primary": safe,
		"--primary-foreground": "#ffffff",
	} as CSSProperties;
}

/** Live LiveKit bars while connected, nothing before (widget shows CTA instead). */
function WidgetVisualizer({ room }: { room: Room | null }) {
	if (!room) return null;
	return (
		<RoomContext.Provider value={room}>
			<WidgetLiveBars />
		</RoomContext.Provider>
	);
}

function WidgetLiveBars() {
	const { state, audioTrack } = useVoiceAssistant();
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
