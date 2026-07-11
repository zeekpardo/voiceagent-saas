"use client";

import { Room, RoomEvent } from "livekit-client";
import { useCallback, useEffect, useRef, useState } from "react";

export type AgentSessionStatus =
	| "idle"
	| "connecting"
	| "listening"
	| "thinking"
	| "speaking"
	| "ended"
	| "error";

export interface AgentSessionTurn {
	id: string;
	role: "agent" | "user";
	text: string;
}

export type AgentSessionChannel = "voice" | "text";

/** LiveKit join info — the shape both session sources resolve to. */
export interface AgentSessionInfo {
	call_id: string;
	room_url: string;
	token: string;
}

/**
 * Owns a live browser conversation with an agent: fetches join info via the
 * injected `getSession`, connects a LiveKit room, and exposes live status +
 * transcript turns. The session SOURCE is pluggable — the authenticated test
 * portal passes the protected oRPC call, the public embeddable widget passes
 * a plain fetch to `/api/widget/session` — while everything room-side
 * (connect, transcript streams, agent state, text send) is shared here.
 *
 * Attach `audioContainerRef` to a div that stays mounted for the whole call —
 * subscribed agent audio elements are appended there.
 *
 * `channel` picks the transport: "voice" publishes the mic and renders
 * STT/TTS transcription; "text" joins the same room audio-free and speaks over
 * LiveKit text streams on the `lk.chat` topic (outbound via `sendText`, inbound
 * via `registerTextStreamHandler`).
 */
export function useAgentRoomSession<TStart = void>({
	channel,
	getSession,
}: {
	channel: AgentSessionChannel;
	getSession: (options: TStart) => Promise<AgentSessionInfo>;
}) {
	const [status, setStatus] = useState<AgentSessionStatus>("idle");
	const [turns, setTurns] = useState<AgentSessionTurn[]>([]);
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
		async (options: TStart) => {
			setError(null);
			setTurns([]);
			// Clear immediately so the previous call's flow trace resets on Start.
			setCallId(null);
			setStatus("connecting");
			try {
				const session = await getSession(options);
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
					const role: AgentSessionTurn["role"] =
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
		[channel, getSession],
	);

	/**
	 * Send a caller turn in text mode over the `lk.chat` topic. The message is
	 * echoed into the transcript immediately (the agent only publishes its own
	 * output on `lk.chat`, so inbound never mirrors it back).
	 */
	const sendMessage = useCallback(async (text: string) => {
		const activeRoom = roomRef.current;
		const trimmed = text.trim();
		if (!activeRoom || trimmed === "") return;
		setTurns((prev) => [
			...prev,
			{ id: `user-${Date.now()}-${prev.length}`, role: "user", text: trimmed },
		]);
		await activeRoom.localParticipant.sendText(trimmed, { topic: "lk.chat" });
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
