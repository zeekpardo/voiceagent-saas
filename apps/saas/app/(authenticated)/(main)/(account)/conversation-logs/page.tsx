import { ConversationLogsDebug } from "@voiceagents/components/inbox/ConversationLogsDebug";

/**
 * Debug surface for omnichannel text-conversation AI logs. Not linked in the
 * nav yet — a full omnichannel conversations inbox is a separate future piece;
 * this keeps the reusable logs drawer + gateway endpoint usable in the meantime.
 */
export default function ConversationLogsPage() {
	return <ConversationLogsDebug />;
}
