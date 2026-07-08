import { PageHeader } from "@shared/components/PageHeader";
import { AgentForm } from "@voiceagents/components/AgentForm";

export default async function NewVoiceAgentPage() {
	return (
		<>
			<PageHeader
				title="New voice agent"
				subtitle="Everything below is configuration — no code, no deploys. You can talk to it the moment you save."
			/>
			<AgentForm />
		</>
	);
}
