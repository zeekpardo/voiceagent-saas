"use client";

import { useConversationEventsQuery } from "../../lib/api";
import { LogsDrawer } from "./LogsDrawer";

/**
 * AI-logs side panel for a room-less omnichannel text conversation (the
 * gateway `/v1/conversations` records). Fetches conversation_events and hands
 * them to the shared {@link LogsDrawer} — the exact renderers, type filter and
 * results count the call drawer uses.
 *
 * Self-contained (keyed by conversation id) so it drops straight into an
 * omnichannel inbox once one exists; today it backs the debug surface.
 */
export function ConversationLogsDrawer({
	conversationId,
	onClose,
}: {
	conversationId: string;
	onClose: () => void;
}) {
	const { data: events, isLoading } = useConversationEventsQuery(conversationId);
	return (
		<LogsDrawer
			events={events}
			isLoading={isLoading}
			onClose={onClose}
			emptyLabel="No logs recorded for this conversation."
		/>
	);
}
