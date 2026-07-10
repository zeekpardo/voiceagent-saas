import { PageHeader } from "@shared/components/PageHeader";
import { AgentsTable } from "@voiceagents/components/AgentsTable";
import { PersonaGallery } from "@voiceagents/components/personas/PersonaGallery";

export default async function VoiceAgentsPage() {
	return (
		// The app shell's <main> has py-6 inside a 100dvh frame with md:py-2 +
		// 2px border (see AppWrapper), so the remaining viewport height on md is
		// 100dvh - 1rem - 2px - 3rem. flex + min-h-0 lets the table scroll
		// internally instead of growing the page.
		<div data-fullbleed className="md:h-[calc(100dvh-1rem-2px-3rem)] flex min-h-[520px] flex-col">
			<PageHeader
				title="Voice Agents"
				subtitle="Build AI voice agents — configure a persona, talk to it live, and wire it into your workflows"
			/>
			<PersonaGallery />
			<div className="min-h-0 flex-1">
				<AgentsTable />
			</div>
		</div>
	);
}
