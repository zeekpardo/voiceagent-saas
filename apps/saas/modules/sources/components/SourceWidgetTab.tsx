"use client";

import { Badge } from "@repo/ui/components/badge";
import { Label } from "@repo/ui/components/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@repo/ui/components/select";
import { Skeleton } from "@repo/ui/components/skeleton";
import { WidgetConfigurator } from "@voiceagents/components/widget/WidgetConfigurator";
import { useAgentsQuery } from "@voiceagents/lib/api";
import { useEffect, useState } from "react";

import { useSourceAgentIdsQuery } from "../lib/api";

/**
 * "Website Widget" tab on the Source detail page. The widget is installed on
 * the source's website, so it lives here — the agent is just what picks up
 * the conversation, chosen from this org's agents (agents already attached to
 * this source via the Sources tab are hinted with a badge and preselected).
 */
export function SourceWidgetTab({ sourceId }: { sourceId: string }) {
	const { data: agents, isLoading: agentsLoading } = useAgentsQuery();
	const { data: attachedAgentIds, isLoading: attachedLoading } = useSourceAgentIdsQuery(sourceId);
	const [agentId, setAgentId] = useState<string | null>(null);

	const attachedSet = new Set(attachedAgentIds ?? []);
	const isLoading = agentsLoading || attachedLoading;

	// Sensible default: preselect the first attached agent, if any, once both
	// queries have settled — never override a choice the user already made.
	useEffect(() => {
		if (agentId || isLoading) return;
		const firstAttached = (agents ?? []).find((agent) => attachedSet.has(agent.id));
		if (firstAttached) setAgentId(firstAttached.id);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [isLoading]);

	if (isLoading) {
		return (
			<div className="gap-4 flex flex-col">
				<Skeleton className="h-9 max-w-sm w-full" />
				<Skeleton className="h-64" />
			</div>
		);
	}

	return (
		<div className="gap-6 flex flex-col">
			<div className="gap-1.5 max-w-sm flex flex-col">
				<Label>Agent workflow</Label>
				<Select value={agentId ?? ""} onValueChange={setAgentId}>
					<SelectTrigger>
						<SelectValue placeholder="Select an agent workflow…" />
					</SelectTrigger>
					<SelectContent>
						{(agents ?? []).map((agent) => (
							<SelectItem key={agent.id} value={agent.id}>
								<span className="gap-2 flex items-center">
									{agent.name}
									{attachedSet.has(agent.id) && (
										<Badge status="info" className="text-[10px]">
											Attached to this source
										</Badge>
									)}
								</span>
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				<p className="text-xs text-muted-foreground">
					Select an agent workflow that will be used to answer conversations started from this
					widget.
				</p>
			</div>

			{agentId ? (
				<WidgetConfigurator agentId={agentId} />
			) : (
				<p className="p-6 text-sm rounded-lg border border-dashed text-center opacity-60">
					Choose an agent workflow above to configure the embed.
				</p>
			)}
		</div>
	);
}
