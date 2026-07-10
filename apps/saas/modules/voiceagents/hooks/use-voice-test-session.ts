"use client";

import { orpcClient } from "@shared/lib/orpc-client";
import { Room, RoomEvent } from "livekit-client";
import { useCallback, useEffect, useRef, useState } from "react";

export type TestStatus =
	| "idle"
	| "connecting"
	| "listening"
	| "thinking"
	| "speaking"
	| "ended"
	| "error";

export interface TestTurn {
	id: string;
	role: "agent" | "user";
	text: string;
}

export type TestChannel = "voice" | "text";

export interface StartTestOptions {
	variables?: Record<string, string>;
	sourceId?: string;
	crmContactId?: string;
	contactPhone?: string;
}

/** Pull the {{variable}} names an agent's prompts reference. */
export function extractVariableNames(config: Record<string, unknown> | undefined): string[] {
	const text = `${(config?.instructions as string) ?? ""}\n${(config?.greeting as string) ?? ""}`;
	const names = new Set<string>();
	for (const m of text.matchAll(/\{\{\s*([\w.-]+)\s*\}\}/g)) {
		names.add(m[1]!);
	}
	return [...names];
}

/**
 * Owns a browser test call against an agent: creates a gateway session
 * (the gateway key stays server-side), connects a LiveKit room, and exposes
 * live status + transcript turns.
 *
 * Attach `audioContainerRef` to a div that stays mounted for the whole call —
 * subscribed agent audio elements are appended there.
 *
 * `channel` picks the transport: "voice" (default) publishes the mic and renders
 * STT/TTS transcription; "text" joins the same room audio-free and speaks over
 * LiveKit text streams on the `lk.chat` topic (outbound via `sendText`, inbound
 * via `registerTextStreamHandler`). Everything else — session create, call id,
 * flow trace, transcript-of-record at the gateway — is identical across channels.
 */
export function useVoiceTestSession(agentId: string, channel: TestChannel = "voice") {
	const [status, setStatus] = useState<TestStatus>("idle");
	const [turns, setTurns] = useState<TestTurn[]>([]);
	const [error, setError] = useState<string | null>(null);
	// The gateway call id for the current (or last) session — drives live flow tracing.
	const [callId, setCallId] = useState<string | null>(null);
	// The room is also React state so visualizer components re-render on connect.
	const [room, setRoom] = useState<Room | null>(null);
	const roomRef = useRef<Room | null>(null);
	const audioContainerRef = useRef<HTMLDivElement | null>(null);

	useEffect(() => () => void roomRef.current?.disconnect(), []);

	const stop = useCallback(async () => {
		await roomRef.current?.disconnect();
		roomRef.current = null;
		setRoom(null);
		setStatus("ended");
	}, []);

	const start = useCallback(
		async ({ variables, sourceId, crmContactId, contactPhone }: StartTestOptions = {}) => {
			setError(null);
			setTurns([]);
			// Clear immediately so the previous call's flow trace resets on Start.
			setCallId(null);
			setStatus("connecting");
			try {
				const filled = Object.fromEntries(
					Object.entries(variables ?? {}).filter(([, value]) => value.trim() !== ""),
				);
				const session = await orpcClient.voiceagents.sessions.create({
					agentId,
					variables: filled,
					sourceId: sourceId || undefined,
					crmContactId: crmContactId?.trim() || undefined,
					contactPhone: contactPhone?.trim() || undefined,
					channel,
				});
				setCallId(session.call_id);
				const newRoom = new Room();
				roomRef.current = newRoom;
				setRoom(newRoom);

				// Agent output stream. Voice mode reads STT/TTS transcription; text
				// mode reads the agent's replies on the shared `lk.chat` topic. Both
				// accumulate streamed chunks into a single bubble keyed by stream id.
				const inboundTopic = channel === "text" ? "lk.chat" : "lk.transcription";
				newRoom.registerTextStreamHandler(inboundTopic, async (reader, participantInfo) => {
					const id =
						(reader.info.attributes?.["lk.segment_id"] as string | undefined) ?? reader.info.id;
					const role: TestTurn["role"] =
						participantInfo.identity === newRoom.localParticipant.identity ? "user" : "agent";
					let text = "";
					for await (const chunk of reader) {
						text += chunk;
						setTurns((prev) => [...prev.filter((t) => t.id !== id), { id, role, text }]);
					}
				});
				newRoom.on(RoomEvent.ParticipantAttributesChanged, (_changed, participant) => {
					const s = participant.attributes["lk.agent.state"];
					if (s === "listening" || s === "thinking" || s === "speaking") setStatus(s);
				});
				newRoom.on(RoomEvent.TrackSubscribed, (track) => {
					if (track.kind === "audio") audioContainerRef.current?.appendChild(track.attach());
				});
				newRoom.on(RoomEvent.Disconnected, () => {
					roomRef.current = null;
					setRoom(null);
					setStatus("ended");
				});

				await newRoom.connect(session.room_url, session.token);
				// Voice mode publishes the mic; text mode stays audio-free (no track
				// published, no audio subscribed) and drives turns via sendMessage.
				if (channel === "voice") {
					await newRoom.localParticipant.setMicrophoneEnabled(true);
				}
				setStatus("listening");
			} catch (err) {
				setError(err instanceof Error ? err.message : String(err));
				setStatus("error");
				roomRef.current = null;
				setRoom(null);
			}
		},
		[agentId, channel],
	);

	/**
	 * Send a caller turn in text mode over the `lk.chat` topic. The message is
	 * echoed into the transcript immediately (the agent only publishes its own
	 * output on `lk.chat`, so inbound never mirrors it back).
	 */
	const sendMessage = useCallback(async (text: string) => {
		const room = roomRef.current;
		const trimmed = text.trim();
		if (!room || trimmed === "") return;
		setTurns((prev) => [
			...prev,
			{ id: `user-${Date.now()}-${prev.length}`, role: "user", text: trimmed },
		]);
		await room.localParticipant.sendText(trimmed, { topic: "lk.chat" });
	}, []);

	const isLive = status === "listening" || status === "thinking" || status === "speaking";

	return {
		status,
		turns,
		error,
		room,
		isLive,
		callId,
		start,
		stop,
		sendMessage,
		audioContainerRef,
	};
}
