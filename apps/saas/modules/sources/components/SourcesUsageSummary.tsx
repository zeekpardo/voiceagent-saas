"use client";

import { useActiveOrganization } from "@organizations/hooks/use-active-organization";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";

import { useSourceUsageSummaryQuery } from "../lib/api";
import { ProjectLimitCard } from "./ProjectLimitCard";

/**
 * Org-wide per-source usage strip — org-admin only (the oRPC procedure also
 * enforces this server-side). Renders nothing for non-admins so it doesn't
 * show a loading flash before disappearing. `ProjectLimitCard` above it
 * self-gates separately on the platform-admin role, since the project-wide
 * concurrency limit spans every organization, not just the active one.
 */
export function SourcesUsageSummary() {
	const { isOrganizationAdmin } = useActiveOrganization();
	const { data, isLoading } = useSourceUsageSummaryQuery(30, isOrganizationAdmin);

	if (!isOrganizationAdmin) {
		return <ProjectLimitCard />;
	}

	return (
		<>
			<ProjectLimitCard />
			<Card className="mb-6">
				<CardHeader className="pb-2">
					<CardTitle className="text-base">Usage by source (last 30 days)</CardTitle>
				</CardHeader>
				<CardContent>
					{isLoading ? (
						<p className="text-sm text-muted-foreground">Loading…</p>
					) : !data || data.rows.length === 0 ? (
						<p className="text-sm text-muted-foreground">No usage yet.</p>
					) : (
						<div className="overflow-x-auto">
							<table className="text-sm w-full">
								<thead>
									<tr className="text-xs text-left text-muted-foreground">
										<th className="pb-2 pr-4 font-medium">Source</th>
										<th className="pb-2 pr-4 font-medium">Calls</th>
										<th className="pb-2 pr-4 font-medium">Minutes</th>
										<th className="pb-2 font-medium">Active now</th>
									</tr>
								</thead>
								<tbody>
									{data.rows.map((row) => (
										<tr key={row.sourceId ?? "unattributed"} className="border-t">
											<td className="py-1.5 pr-4 truncate">{row.sourceName}</td>
											<td className="py-1.5 pr-4">{row.calls}</td>
											<td className="py-1.5 pr-4">{row.totalMinutes}</td>
											<td className="py-1.5">{row.activeCalls}</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					)}
					{data?.unavailable ? (
						<p className="mt-2 text-xs text-muted-foreground">
							Usage data is temporarily unavailable — showing zeros.
						</p>
					) : null}
				</CardContent>
			</Card>
		</>
	);
}
