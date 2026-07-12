"use client";

import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { ScrollTextIcon } from "lucide-react";
import { useState } from "react";

import { ConversationLogsDrawer } from "./ConversationLogsDrawer";

/**
 * Minimal debug surface for the AI logs of a room-less omnichannel text
 * conversation (a gateway `/v1/conversations` record). Paste a conversation id
 * and open the drawer.
 *
 * Intentionally scoped: a full omnichannel conversations inbox is a separate,
 * future piece. This exists so the reusable {@link ConversationLogsDrawer} +
 * gateway endpoint are usable and verifiable the moment omnichannel goes live.
 */
export function ConversationLogsDebug() {
	const [inputValue, setInputValue] = useState("");
	const [openId, setOpenId] = useState<string | null>(null);

	function open() {
		const id = inputValue.trim();
		if (id) setOpenId(id);
	}

	return (
		<div className="relative min-h-[calc(100dvh-8rem)]">
			<div className="max-w-xl gap-4 flex flex-col">
				<div className="gap-1 flex flex-col">
					<h1 className="font-semibold text-lg">Conversation logs</h1>
					<p className="text-sm text-muted-foreground">
						Inspect the per-turn AI, tool and HTTP logs for a room-less omnichannel text
						conversation. Enter the conversation id (the gateway <code>/v1/conversations</code>{" "}
						record) to open its AI logs.
					</p>
				</div>
				<form
					className="gap-2 flex items-center"
					onSubmit={(event) => {
						event.preventDefault();
						open();
					}}
				>
					<Input
						value={inputValue}
						onChange={(event) => setInputValue(event.target.value)}
						placeholder="conv_…"
						aria-label="Conversation id"
						className="font-mono"
					/>
					<Button type="submit" disabled={!inputValue.trim()}>
						<ScrollTextIcon className="size-4" />
						View logs
					</Button>
				</form>
			</div>

			{openId && <ConversationLogsDrawer conversationId={openId} onClose={() => setOpenId(null)} />}
		</div>
	);
}
