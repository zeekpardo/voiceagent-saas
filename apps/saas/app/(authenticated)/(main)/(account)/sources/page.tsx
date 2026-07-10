import { PageHeader } from "@shared/components/PageHeader";
import { SourcesStatsCards } from "@sources/components/SourcesStatsCards";
import { SourcesTable } from "@sources/components/SourcesTable";

export default async function SourcesPage() {
	return (
		// See voice-agents/page.tsx for the flex/min-h-0 viewport-height rationale.
		<div data-fullbleed className="md:h-[calc(100dvh-1rem-2px-3rem)] flex min-h-[520px] flex-col">
			<PageHeader title="Sources" subtitle="Connect and sync your lead data with AI agents" />
			<div className="mb-6">
				<SourcesStatsCards />
			</div>
			<div className="min-h-0 flex-1">
				<SourcesTable />
			</div>
		</div>
	);
}
