import { AgentDetail } from "@voiceagents/components/AgentDetail";

export default async function VoiceAgentPage({
	params,
}: {
	params: Promise<{ agentId: string }>;
}) {
	const { agentId } = await params;
	return <AgentDetail agentId={agentId} />;
}
